-- Pet block times can be changed. A pet lasts two hours and the battle five,
-- so states split the three blocks differently (a one-hour first block, for
-- example). block_swaps holds when blocks 2 and 3 start, in minutes after
-- the battle start: '{120,240}' is 12–14, 14–16 and 16–17 UTC. The state
-- sets the default; each rally and the garrison can change it in Planning.

create or replace function public.valid_block_swaps(swaps smallint[])
returns boolean
language sql
immutable
set search_path to 'public'
as $$
  select cardinality(swaps) = 2 and swaps[1] > 0 and swaps[1] < swaps[2] and swaps[2] < 300;
$$;

alter table public.states
  add column if not exists block_swaps smallint[] not null default '{120,240}';
alter table public.states drop constraint if exists states_block_swaps_check;
alter table public.states
  add constraint states_block_swaps_check check (public.valid_block_swaps(block_swaps));

alter table public.battle_plan_groups
  add column if not exists block_swaps smallint[];
update public.battle_plan_groups set block_swaps = '{120,240}' where block_swaps is null;

-- New groups start with their state's block times.
create or replace function public.default_block_swaps()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.block_swaps is null then
    select block_swaps into new.block_swaps from public.states where id = new.state_id;
    new.block_swaps := coalesce(new.block_swaps, '{120,240}');
  end if;
  return new;
end;
$$;
alter function public.default_block_swaps() owner to postgres;
revoke all on function public.default_block_swaps() from public, anon, authenticated;
drop trigger if exists battle_plan_groups_default_block_swaps on public.battle_plan_groups;
create trigger battle_plan_groups_default_block_swaps
  before insert on public.battle_plan_groups
  for each row execute function public.default_block_swaps();

alter table public.battle_plan_groups alter column block_swaps set not null;
alter table public.battle_plan_groups drop constraint if exists battle_plan_groups_block_swaps_check;
alter table public.battle_plan_groups
  add constraint battle_plan_groups_block_swaps_check check (public.valid_block_swaps(block_swaps));

-- Start and end of block 0, 1 or 2, in minutes after the battle start.
create or replace function public.svs_block_start(block integer, swaps smallint[])
returns integer
language sql
immutable
set search_path to 'public'
as $$
  select case when block <= 0 then 0 else swaps[block] end;
$$;
create or replace function public.svs_block_end(block integer, swaps smallint[])
returns integer
language sql
immutable
set search_path to 'public'
as $$
  select case when block >= 2 then 300 else swaps[block + 1] end;
$$;

-- 'HH24:MI–HH24:MI' for pet block 0, 1 or 2 with these block times.
create or replace function public.svs_block_label(battle_start timestamptz, block integer, swaps smallint[])
returns text
language sql
stable
set search_path to 'public'
as $$
  select to_char((battle_start + make_interval(mins => public.svs_block_start(block, swaps))) at time zone 'UTC', 'HH24:MI')
    || '–' ||
    to_char((battle_start + make_interval(mins => public.svs_block_end(block, swaps))) at time zone 'UTC', 'HH24:MI');
$$;
create or replace function public.svs_block_label(battle_start timestamptz, block integer)
returns text
language sql
stable
set search_path to 'public'
as $$
  select public.svs_block_label(battle_start, block, '{120,240}'::smallint[]);
$$;

-- A half voter fits a block when most of it is in their half (12:00–14:30
-- or 14:30–17:00).
create or replace function public.availability_fits_blocks(
  availability text, rotation uuid[], member uuid, swaps smallint[]
)
returns boolean
language sql
immutable
set search_path to 'public'
as $$
  select coalesce(bool_and(
    case
      when availability = 'whole' then true
      when availability = 'first_half' then
        public.svs_block_start((block - 1)::integer, swaps) + public.svs_block_end((block - 1)::integer, swaps) < 300
      when availability = 'second_half' then
        public.svs_block_start((block - 1)::integer, swaps) + public.svs_block_end((block - 1)::integer, swaps) >= 300
      else false
    end
  ), true)
  from unnest(rotation) with ordinality as slot(lead, block)
  where slot.lead = member;
$$;
create or replace function public.availability_fits_blocks(availability text, rotation uuid[], member uuid)
returns boolean
language sql
immutable
set search_path to 'public'
as $$
  select public.availability_fits_blocks(availability, rotation, member, '{120,240}'::smallint[]);
$$;

-- Planning: a rally's or the garrison's block times.
create or replace function public.set_battle_plan_group_block_swaps(
  target_group_id uuid,
  swaps smallint[]
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  group_state_id uuid;
begin
  select state_id into group_state_id from public.battle_plan_groups where id = target_group_id;
  if group_state_id is null then
    raise exception 'Rally group not found.';
  end if;
  if not public.is_state_admin(group_state_id) then
    raise exception 'Only state owners and admins can change the pet blocks.';
  end if;
  if not public.valid_block_swaps(swaps) then
    raise exception 'Pet blocks must follow each other between 12:00 and 17:00.';
  end if;
  update public.battle_plan_groups
  set block_swaps = swaps, updated_at = now()
  where id = target_group_id;
end;
$$;
alter function public.set_battle_plan_group_block_swaps(uuid, smallint[]) owner to postgres;
revoke all on function public.set_battle_plan_group_block_swaps(uuid, smallint[]) from public, anon;
grant execute on function public.set_battle_plan_group_block_swaps(uuid, smallint[])
  to authenticated, service_role;

-- The state's default block times, with the rest of its automation settings.
create or replace function public.set_state_automation(target_state_id uuid, settings jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_state_admin(target_state_id) then
    raise exception 'Only state owners and admins can change the automation.';
  end if;
  update public.states set
    auto_plan = coalesce((settings ->> 'auto_plan')::boolean, auto_plan),
    auto_publish = coalesce((settings ->> 'auto_publish')::boolean, auto_publish),
    rally_count = coalesce((settings ->> 'rally_count')::smallint, rally_count),
    rally_size = coalesce((settings ->> 'rally_size')::smallint, rally_size),
    garrison_size = coalesce((settings ->> 'garrison_size')::smallint, garrison_size),
    default_formation = case when settings ? 'default_formation'
      then nullif(settings ->> 'default_formation', '') else default_formation end,
    default_joiner_heroes = case when settings ? 'default_joiner_heroes'
      then array(select jsonb_array_elements_text(settings -> 'default_joiner_heroes'))
      else default_joiner_heroes end,
    autofill_priorities = case when settings ? 'autofill_priorities'
      then array(select jsonb_array_elements_text(settings -> 'autofill_priorities'))
      else autofill_priorities end,
    block_swaps = case when settings ? 'block_swaps'
      then array(select (jsonb_array_elements_text(settings -> 'block_swaps'))::smallint)
      else block_swaps end
  where id = target_state_id;
end;
$$;

-- Publishing names each lead's own block times.
create or replace function public.publish_battle_plan_with_notifications(
  target_plan_id uuid,
  actor_wos_account_id uuid
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  target_state_id uuid;
  target_plan_name text;
  target_scheduled_at timestamptz;
  target_battle_type text;
  target_battle_id uuid;
  recipient record;
  hero_tag_id uuid;
  notification_count integer := 0;
  battle_start text;
  lead_blocks text;
  rotation_text text;
begin
  select plan.state_id, plan.name, plan.scheduled_at, plan.battle_type
  into target_state_id, target_plan_name, target_scheduled_at, target_battle_type
  from public.battle_plans plan
  where plan.id = target_plan_id;

  if target_state_id is null then
    raise exception 'Battle plan not found.';
  end if;
  -- auth.uid() is null when the automation publishes on the state's behalf.
  if auth.uid() is not null
     and not public.is_state_admin_account(target_state_id, actor_wos_account_id) then
    raise exception 'The selected WOS account cannot publish battle plans.';
  end if;

  perform set_config('wosoverwatch.mute_member_notifications', 'on', true);
  perform public.publish_battle_plan(target_plan_id);

  insert into public.battles (state_id, name, status, battle_type, scheduled_at, plan_id)
  values (target_state_id, target_plan_name, 'scheduled', target_battle_type, target_scheduled_at, target_plan_id)
  on conflict (plan_id) where plan_id is not null
  do update set
    name = excluded.name,
    battle_type = excluded.battle_type,
    scheduled_at = excluded.scheduled_at
  returning id into target_battle_id;

  battle_start := to_char(target_scheduled_at at time zone 'UTC', 'Mon DD, HH24:MI') || ' UTC';

  delete from public.notifications
  where type in (
    'battle_plan_assignment', 'battle_plan_published',
    'battle_plan_assignment_changed', 'battle_plan_assignment_removed'
  )
    and data ->> 'plan_id' = target_plan_id::text;

  for recipient in
    select
      member.wos_account_id,
      coalesce(nullif(btrim(account.nickname), ''), 'WOS ID ' || account.wos_id) as player_name,
      plan_group.id as group_id,
      plan_group.name as group_name,
      plan_group.kind as group_kind,
      plan_group.lead_rotation,
      plan_group.block_swaps,
      coalesce(assignment.formation, plan_group.formation) as formation,
      assignment.hero,
      alliance.id as alliance_id,
      alliance.name as alliance_name,
      (
        member.wos_account_id = plan_group.leader_wos_account_id
        or member.wos_account_id = any(plan_group.lead_rotation)
      ) as is_lead
    from public.state_members member
    join public.wos_accounts account on account.id = member.wos_account_id
    left join public.battle_plan_assignments assignment
      on assignment.plan_id = target_plan_id
      and assignment.wos_account_id = member.wos_account_id
    left join public.battle_plan_groups plan_group on plan_group.id = assignment.group_id
    left join public.state_alliances alliance on alliance.id = plan_group.alliance_id
    where member.state_id = target_state_id
  loop
    if recipient.group_id is null then
      perform public.queue_account_notification(
        recipient.wos_account_id,
        'battle_plan_published',
        'Battle plan published',
        target_plan_name || ' was published for ' || battle_start ||
          '. This account is not assigned to a rally.',
        jsonb_build_object(
          'plan_id', target_plan_id,
          'battle_id', target_battle_id,
          'plan_name', target_plan_name,
          'battle_start', target_scheduled_at
        ),
        'battle',
        target_state_id
      );
      notification_count := notification_count + 1;
      continue;
    end if;

    -- "Ted 12:00–14:00, Ice 14:00–16:00, Ted 16:00–17:00"
    select string_agg(
             coalesce(nullif(btrim(lead_account.nickname), ''), 'WOS ID ' || lead_account.wos_id)
               || ' ' || public.svs_block_label(target_scheduled_at, (slot.position - 1)::integer, recipient.block_swaps),
             ', ' order by slot.position)
    into rotation_text
    from unnest(recipient.lead_rotation) with ordinality as slot(lead_id, position)
    join public.wos_accounts lead_account on lead_account.id = slot.lead_id;

    select string_agg(public.svs_block_label(target_scheduled_at, (slot.position - 1)::integer, recipient.block_swaps), ' and ' order by slot.position)
    into lead_blocks
    from unnest(recipient.lead_rotation) with ordinality as slot(lead_id, position)
    where slot.lead_id = recipient.wos_account_id;

    if recipient.group_kind = 'garrison' and recipient.is_lead then
      perform public.queue_account_notification(
        recipient.wos_account_id,
        'battle_plan_assignment',
        'You hold the castle',
        'Hi ' || recipient.player_name || ', you''re a castle holder ' ||
          coalesce(lead_blocks, 'during the battle') ||
          ' UTC. When it''s your turn, swap to the alliance holding the castle and take over the garrison. Holders: ' ||
          coalesce(rotation_text, '') || '.',
        jsonb_build_object(
          'plan_id', target_plan_id, 'battle_id', target_battle_id,
          'group_id', recipient.group_id, 'group_name', recipient.group_name,
          'role', 'castle_holder', 'blocks', lead_blocks,
          'battle_start', target_scheduled_at, 'player', recipient.player_name,
          'leads', rotation_text
        ),
        'battle',
        target_state_id
      );
    elsif recipient.group_kind = 'garrison' then
      perform public.queue_account_notification(
        recipient.wos_account_id,
        'battle_plan_assignment',
        'You''re in the garrison',
        'Hi ' || recipient.player_name || ', you''re in the garrison holding the castle in ' ||
          coalesce(recipient.alliance_name, 'an alliance not yet selected') ||
          '. Stay in the castle the whole battle. Holders: ' || coalesce(rotation_text, '') ||
          '. Please be there by battle start (' || battle_start || ').',
        jsonb_build_object(
          'plan_id', target_plan_id, 'battle_id', target_battle_id,
          'group_id', recipient.group_id, 'group_name', recipient.group_name,
          'alliance_id', recipient.alliance_id, 'alliance_name', recipient.alliance_name,
          'role', 'garrison', 'battle_start', target_scheduled_at, 'player', recipient.player_name,
          'leads', rotation_text
        ),
        'battle',
        target_state_id
      );
    elsif recipient.is_lead then
      perform public.queue_account_notification(
        recipient.wos_account_id,
        'battle_plan_assignment',
        'You lead a rally',
        'Hi ' || recipient.player_name || ', you lead ' || recipient.group_name || ' ' ||
          coalesce(lead_blocks, 'during the battle') || ' UTC in ' ||
          coalesce(recipient.alliance_name, 'an alliance not yet selected') ||
          '. Leads: ' || coalesce(rotation_text, '') || '.',
        jsonb_build_object(
          'plan_id', target_plan_id, 'battle_id', target_battle_id,
          'group_id', recipient.group_id, 'group_name', recipient.group_name,
          'alliance_name', recipient.alliance_name, 'leader', true, 'role', 'rally_lead',
          'blocks', lead_blocks, 'battle_start', target_scheduled_at, 'player', recipient.player_name,
          'leads', rotation_text
        ),
        'battle',
        target_state_id
      );
    else
      perform public.queue_account_notification(
        recipient.wos_account_id,
        'battle_plan_assignment',
        'Your rally assignment',
        'Hi ' || recipient.player_name || ', you''ve been assigned to ' ||
          recipient.group_name || ' in ' ||
          coalesce(recipient.alliance_name, 'an alliance not yet selected') || '.' ||
          case
            when recipient.hero is not null and recipient.formation is not null then
              ' You''re joining with ' || recipient.hero || ' and ' || recipient.formation || ' formation.'
            when recipient.hero is not null then
              ' You''re joining with ' || recipient.hero || '.'
            when recipient.formation is not null then
              ' Use ' || recipient.formation || ' formation.'
            else ''
          end ||
          coalesce(' Leads: ' || rotation_text || '.', '') ||
          ' Please be there by battle start (' || battle_start || ').',
        jsonb_build_object(
          'plan_id', target_plan_id, 'battle_id', target_battle_id,
          'group_id', recipient.group_id, 'group_name', recipient.group_name,
          'alliance_id', recipient.alliance_id, 'alliance_name', recipient.alliance_name,
          'hero', recipient.hero, 'formation', recipient.formation, 'role', 'joiner',
          'battle_start', target_scheduled_at, 'player', recipient.player_name,
          'leads', rotation_text
        ),
        'battle',
        target_state_id
      );

      if recipient.hero is not null then
        select id into hero_tag_id
        from public.state_tags
        where state_id = target_state_id and lower(name) = lower(recipient.hero);
        if hero_tag_id is null then
          insert into public.state_tags (state_id, name, color, kind)
          values (target_state_id, recipient.hero, '#9b6bd6', 'hero')
          returning id into hero_tag_id;
        end if;
        insert into public.state_member_tags (tag_id, wos_account_id, source, source_plan_id, assigned_by)
        values (hero_tag_id, recipient.wos_account_id, 'battle_plan', target_plan_id, auth.uid())
        on conflict (tag_id, wos_account_id) do nothing;
      end if;
    end if;
    notification_count := notification_count + 1;
  end loop;

  perform set_config('wosoverwatch.mute_member_notifications', 'off', true);
  return notification_count;
end;
$$;

-- Late "can't play my spot" checks use the group's block times.
create or replace function public.notify_late_attendance_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  plan record;
  spot record;
  fits_now boolean;
  fit_before boolean;
  spot_role text;
  player text;
begin
  if tg_op = 'UPDATE' and old.availability is not distinct from new.availability then
    return new;
  end if;
  select id, state_id, name, status, scheduled_at into plan
  from public.battle_plans where id = new.plan_id;
  if plan.status <> 'published' or plan.scheduled_at + interval '5 hours' <= now() then
    return new;
  end if;

  select g.name, g.kind, g.shift into spot
  from public.battle_plan_assignments a
  join public.battle_plan_groups g on g.id = a.group_id
  where a.plan_id = new.plan_id and a.wos_account_id = new.wos_account_id;
  if found then
    spot_role := case when spot.kind = 'garrison' then 'garrison' else 'joiner' end;
    fits_now := public.availability_fits_group(new.availability, spot.kind, spot.shift);
    fit_before := tg_op = 'UPDATE' and public.availability_fits_group(old.availability, spot.kind, spot.shift);
  else
    select g.name, g.kind, g.lead_rotation, g.block_swaps into spot
    from public.battle_plan_groups g
    where g.plan_id = new.plan_id
      and (new.wos_account_id = any(g.lead_rotation) or g.leader_wos_account_id = new.wos_account_id)
    order by g.sort_order
    limit 1;
    if not found then
      return new;
    end if;
    spot_role := case when spot.kind = 'garrison' then 'castle_holder' else 'rally_lead' end;
    fits_now := new.availability <> 'unavailable'
      and public.availability_fits_blocks(new.availability, spot.lead_rotation, new.wos_account_id, spot.block_swaps);
    fit_before := tg_op = 'UPDATE' and old.availability <> 'unavailable'
      and public.availability_fits_blocks(old.availability, spot.lead_rotation, new.wos_account_id, spot.block_swaps);
  end if;

  -- Only when the answer stops fitting, not on every later change.
  if fits_now or (tg_op = 'UPDATE' and not fit_before) then
    return new;
  end if;

  player := public.account_display_name(new.wos_account_id);
  perform public.queue_account_notification(
    admin_member.wos_account_id,
    'attendance_conflict',
    player || ' can''t play their spot anymore',
    player || ' changed their vote to ' || replace(new.availability, '_', ' ') || ' but is in ' || spot.name ||
      '. Open Planning to move them or fill the seat.',
    jsonb_build_object(
      'plan_id', plan.id,
      'player', player,
      'group_name', spot.name,
      'availability', new.availability,
      'role', spot_role
    ),
    'battle',
    plan.state_id
  )
  from public.state_members admin_member
  where admin_member.state_id = plan.state_id
    and admin_member.role in ('owner', 'admin')
    and admin_member.wos_account_id <> new.wos_account_id;
  return new;
end;
$$;

-- Pet swap reminders go 5 minutes before each group's own block start.
create table if not exists public.battle_group_reminders (
  group_id uuid not null references public.battle_plan_groups(id) on delete cascade,
  block smallint not null,
  sent_at timestamptz not null default now(),
  primary key (group_id, block)
);
alter table public.battle_group_reminders enable row level security;
revoke all on public.battle_group_reminders from anon, authenticated;

create or replace function public.automation_pet_swap_reminders(
  lead_time interval default '00:05:00'::interval
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  due record;
  incoming uuid;
  outgoing uuid;
  block_start timestamptz;
  block_label text;
  sent integer := 0;
begin
  for due in
    select p.id as plan_id, p.state_id, p.scheduled_at, g.id, g.name, g.kind,
           g.lead_rotation, g.leader_wos_account_id, g.block_swaps, block.n
    from public.battle_plans p
    join public.battle_plan_groups g on g.plan_id = p.id
    cross join (values (0), (1), (2)) as block(n)
    where p.status = 'published'
      and p.scheduled_at between now() - interval '6 hours' and now() + interval '1 hour'
      and p.scheduled_at + make_interval(mins => public.svs_block_start(block.n, g.block_swaps)) - lead_time <= now()
      and p.scheduled_at + make_interval(mins => public.svs_block_start(block.n, g.block_swaps)) > now()
      and not exists (
        select 1 from public.battle_group_reminders r
        where r.group_id = g.id and r.block = block.n
      )
  loop
    insert into public.battle_group_reminders (group_id, block) values (due.id, due.n)
    on conflict do nothing;
    if not found then
      continue;
    end if;
    incoming := coalesce(due.lead_rotation[due.n + 1], case when due.n = 0 then due.leader_wos_account_id end);
    outgoing := case when due.n = 0 then null else coalesce(due.lead_rotation[due.n], due.leader_wos_account_id) end;
    continue when incoming is null or incoming is not distinct from outgoing;

    block_start := due.scheduled_at + make_interval(mins => public.svs_block_start(due.n, due.block_swaps));
    block_label := public.svs_block_label(due.scheduled_at, due.n, due.block_swaps);
    perform public.queue_account_notification(
      incoming,
      'pet_swap_reminder',
      case when due.kind = 'garrison'
        then 'Your turn to hold the castle at ' || to_char(block_start at time zone 'utc', 'HH24:MI') || ' UTC'
        else 'Your turn to lead ' || due.name || ' at ' || to_char(block_start at time zone 'utc', 'HH24:MI') || ' UTC'
      end,
      case when due.kind = 'garrison'
        then 'Swap to the alliance holding the castle and take over the garrison for ' || block_label || ' UTC.'
        else 'Get your pets ready: you lead ' || due.name || ' for ' || block_label || ' UTC.'
      end,
      jsonb_build_object(
        'plan_id', due.plan_id,
        'group_name', due.name,
        'role', case when due.kind = 'garrison' then 'castle_holder' else 'rally_lead' end,
        'blocks', block_label,
        'battle_start', block_start
      ),
      'battle',
      due.state_id
    );
    sent := sent + 1;
  end loop;
  return sent;
end;
$$;

-- Leads picked for an SvS (battle_plans.rally_lead_ids) count as Rally Leads
-- when leads are set, groups edited and the plan published, even without
-- the Rally Lead tag.
create or replace function public.set_battle_plan_group_rotation(
  target_group_id uuid,
  leads uuid[]
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  target_group public.battle_plan_groups%rowtype;
  required_key text;
  lead_id uuid;
  first_lead uuid;
  previous uuid[];
begin
  select * into target_group from public.battle_plan_groups where id = target_group_id;
  if target_group.id is null then
    raise exception 'Rally group not found.';
  end if;
  if not public.is_state_admin(target_group.state_id) then
    raise exception 'Only state owners and admins can set the leads.';
  end if;
  if cardinality(coalesce(leads, '{}')) > 3 then
    raise exception 'There are three pet blocks.';
  end if;
  select lead into first_lead from unnest(leads) as lead where lead is not null limit 1;
  if first_lead is null then
    raise exception 'Choose at least one lead.';
  end if;
  required_key := case when target_group.kind = 'garrison' then 'castle_holder' else 'rally_lead' end;

  foreach lead_id in array leads loop
    continue when lead_id is null;
    if not exists (
      select 1
      from public.state_member_tags member_tag
      join public.state_tags tag on tag.id = member_tag.tag_id
      where member_tag.wos_account_id = lead_id
        and tag.state_id = target_group.state_id
        and tag.system_key = required_key
    ) and not (
      -- Leads picked for this SvS count as Rally Leads.
      required_key = 'rally_lead' and lead_id = any(coalesce(
        (select picked.rally_lead_ids from public.battle_plans picked where picked.id = target_group.plan_id),
        '{}'
      ))
    ) then
      raise exception '%', case when required_key = 'castle_holder'
        then 'Only Castle Holders can hold the castle.'
        else 'Only Rally Leads can lead a rally.' end;
    end if;
    if exists (
      select 1 from public.battle_plan_groups other
      where other.plan_id = target_group.plan_id
        and other.id <> target_group.id
        and (other.leader_wos_account_id = lead_id or lead_id = any(other.lead_rotation))
    ) then
      raise exception 'That player already leads another group in this plan.';
    end if;
  end loop;

  previous := target_group.lead_rotation || target_group.leader_wos_account_id;
  update public.battle_plan_groups
  set lead_rotation = leads,
      leader_wos_account_id = first_lead,
      updated_at = now()
  where id = target_group_id;

  -- Leads who left the rotation go back to the waiting list.
  delete from public.battle_plan_assignments
  where group_id = target_group_id
    and wos_account_id = any(previous)
    and not (wos_account_id = any(leads));

  insert into public.battle_plan_assignments (plan_id, group_id, state_id, wos_account_id, assigned_by)
  select distinct target_group.plan_id, target_group_id, target_group.state_id, lead, auth.uid()
  from unnest(leads) as lead
  where lead is not null
  on conflict (plan_id, wos_account_id) do update set
    group_id = excluded.group_id,
    hero = null,
    assigned_by = excluded.assigned_by,
    assigned_at = now();

  update public.battle_plans set updated_at = now() where id = target_group.plan_id;
end;
$$;

create or replace function public.update_battle_plan_group(target_group_id uuid, group_name text, leader_account_id uuid, destination_alliance_id uuid, publish_tag_id uuid DEFAULT NULL::uuid, group_max_members integer DEFAULT 10, group_notes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
declare
  target_plan_id uuid;
  target_state_id uuid;
  rally_lead_tag_id uuid;
  current_member_count integer;
  leader_already_in_group boolean;
  cleaned_name text := btrim(coalesce(group_name, ''));
  cleaned_notes text := nullif(btrim(coalesce(group_notes, '')), '');
begin
  select plan_id, state_id into target_plan_id, target_state_id
  from public.battle_plan_groups where id = target_group_id;

  if target_state_id is null then raise exception 'Rally group not found.'; end if;
  if not public.is_state_admin(target_state_id) then
    raise exception 'Only state owners and admins can edit rally groups.';
  end if;
  if char_length(cleaned_name) not between 1 and 60 then
    raise exception 'Rally group names must contain between 1 and 60 characters.';
  end if;
  if group_max_members not between 1 and 100 then
    raise exception 'Rally group capacity must be between 1 and 100.';
  end if;
  if cleaned_notes is not null and char_length(cleaned_notes) > 1000 then
    raise exception 'Rally group notes cannot exceed 1000 characters.';
  end if;

  current_member_count := public.group_seat_count(target_group_id);
  if group_max_members < current_member_count then
    raise exception 'Capacity cannot be lower than the current group size.';
  end if;

  select exists (
    select 1 from public.battle_plan_assignments
    where group_id = target_group_id
      and wos_account_id = leader_account_id
  ) into leader_already_in_group;
  if not leader_already_in_group and group_max_members <= current_member_count then
    raise exception 'Increase the group capacity before assigning that leader.';
  end if;

  -- A garrison is held by a Castle Holder, a rally led by a Rally Lead.
  select tag.id into rally_lead_tag_id
  from public.state_tags tag
  join public.battle_plan_groups plan_group on plan_group.id = target_group_id
  where tag.state_id = target_state_id
    and tag.system_key = case when plan_group.kind = 'garrison' then 'castle_holder' else 'rally_lead' end;
  if not exists (
    select 1 from public.state_member_tags
    where tag_id = rally_lead_tag_id
      and wos_account_id = leader_account_id
  ) and not exists (
    -- Leads picked for this SvS count as Rally Leads.
    select 1
    from public.battle_plan_groups plan_group
    join public.battle_plans picked on picked.id = plan_group.plan_id
    where plan_group.id = target_group_id
      and plan_group.kind <> 'garrison'
      and leader_account_id = any(coalesce(picked.rally_lead_ids, '{}'))
  ) then
    raise exception 'Only Rally Leads can lead a rally, and only Castle Holders hold the castle.';
  end if;
  if not exists (
    select 1 from public.state_alliances
    where id = destination_alliance_id and state_id = target_state_id
  ) then
    raise exception 'Choose a destination alliance from this state.';
  end if;
  if publish_tag_id is not null and not exists (
    select 1 from public.state_tags
    where id = publish_tag_id
      and state_id = target_state_id
      and system_key is null
  ) then
    raise exception 'Choose a regular state tag for the published group.';
  end if;

  update public.battle_plan_groups set
    name = cleaned_name,
    leader_wos_account_id = leader_account_id,
    alliance_id = destination_alliance_id,
    assignment_tag_id = publish_tag_id,
    max_members = group_max_members,
    notes = cleaned_notes,
    updated_at = now()
  where id = target_group_id;

  insert into public.battle_plan_assignments (
    plan_id, group_id, state_id, wos_account_id, assigned_by
  ) values (
    target_plan_id, target_group_id, target_state_id, leader_account_id, auth.uid()
  )
  on conflict (plan_id, wos_account_id) do update set
    group_id = excluded.group_id,
    state_id = excluded.state_id,
    assigned_by = auth.uid(),
    assigned_at = now();

  update public.battle_plans set updated_at = now() where id = target_plan_id;
exception
  when unique_violation then
    raise exception 'That player already leads another rally group in this plan.';
end;
$$;

create or replace function public.publish_battle_plan(target_plan_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
declare
  target_state_id uuid;
  target_plan_name text;
  target_scheduled_at timestamptz;
  target_state_name text;
  alliance_check record;
begin
  select plan.state_id, plan.name, plan.scheduled_at, state_row.name
  into target_state_id, target_plan_name, target_scheduled_at, target_state_name
  from public.battle_plans plan
  join public.states state_row on state_row.id = plan.state_id
  where plan.id = target_plan_id;

  if target_state_id is null then raise exception 'Battle plan not found.'; end if;
  -- auth.uid() is null for the automation (service role).
  if auth.uid() is not null and not public.is_state_admin(target_state_id) then
    raise exception 'Only state owners and admins can publish battle plans.';
  end if;
  if not exists (
    select 1 from public.battle_plan_groups where plan_id = target_plan_id
  ) then raise exception 'Add at least one rally group before publishing.'; end if;
  if exists (
    select 1 from public.battle_plan_groups
    where plan_id = target_plan_id and alliance_id is null
  ) then raise exception 'Every rally group needs a destination alliance before publishing.'; end if;
  if exists (
    select 1
    from public.battle_plan_groups plan_group
    left join public.state_tags tag
      on tag.state_id = plan_group.state_id
      and tag.system_key = case when plan_group.kind = 'garrison' then 'castle_holder' else 'rally_lead' end
    left join public.state_member_tags assignment
      on assignment.tag_id = tag.id
      and assignment.wos_account_id = plan_group.leader_wos_account_id
    where plan_group.plan_id = target_plan_id
      and assignment.wos_account_id is null
      -- Leads picked for this SvS count as Rally Leads.
      and not (
        plan_group.kind <> 'garrison'
        and plan_group.leader_wos_account_id = any(coalesce(
          (select picked.rally_lead_ids from public.battle_plans picked where picked.id = target_plan_id),
          '{}'
        ))
      )
  ) then raise exception 'Every rally lead must still be a Rally Lead, and every garrison holder a Castle Holder.'; end if;

  for alliance_check in
    select
      alliance.id,
      alliance.name,
      alliance.max_members,
      (
        select count(distinct existing.wos_account_id)
        from public.state_alliance_members existing
        where existing.alliance_id = alliance.id
          and not exists (
            select 1 from public.battle_plan_assignments planned
            where planned.plan_id = target_plan_id
              and planned.wos_account_id = existing.wos_account_id
          )
      ) + (
        select count(distinct planned.wos_account_id)
        from public.battle_plan_assignments planned
        join public.battle_plan_groups plan_group
          on plan_group.id = planned.group_id
        where planned.plan_id = target_plan_id
          and plan_group.alliance_id = alliance.id
      ) as final_count
    from public.state_alliances alliance
    where alliance.id in (
      select plan_group.alliance_id
      from public.battle_plan_groups plan_group
      where plan_group.plan_id = target_plan_id
    )
  loop
    if alliance_check.final_count > alliance_check.max_members then
      raise exception 'Alliance % would contain % members, above its limit of %.',
        alliance_check.name, alliance_check.final_count, alliance_check.max_members;
    end if;
  end loop;

  insert into public.state_alliance_members (
    state_id, wos_account_id, alliance_id, assigned_by, assigned_at
  )
  select
    assignment.state_id,
    assignment.wos_account_id,
    plan_group.alliance_id,
    auth.uid(),
    now()
  from public.battle_plan_assignments assignment
  join public.battle_plan_groups plan_group on plan_group.id = assignment.group_id
  where assignment.plan_id = target_plan_id
  on conflict (state_id, wos_account_id) do update set
    alliance_id = excluded.alliance_id,
    assigned_by = auth.uid(),
    assigned_at = now();

  -- Plan tags (rally and hero) only describe the current plan: clear the
  -- ones from this state's earlier plans as well, so they do not pile up.
  delete from public.state_member_tags member_tag
  using public.state_tags tag
  where member_tag.tag_id = tag.id
    and tag.state_id = target_state_id
    and member_tag.source = 'battle_plan';

  insert into public.state_member_tags (
    tag_id, wos_account_id, source, source_plan_id, assigned_by, assigned_at
  )
  select
    plan_group.assignment_tag_id,
    assignment.wos_account_id,
    'battle_plan',
    target_plan_id,
    auth.uid(),
    now()
  from public.battle_plan_assignments assignment
  join public.battle_plan_groups plan_group on plan_group.id = assignment.group_id
  where assignment.plan_id = target_plan_id
    and plan_group.assignment_tag_id is not null
  on conflict (tag_id, wos_account_id) do update set
    source = 'battle_plan',
    source_plan_id = target_plan_id,
    assigned_by = auth.uid(),
    assigned_at = now()
  where public.state_member_tags.source = 'battle_plan';

  update public.battle_plans set
    status = 'published', published_at = now(), updated_at = now()
  where id = target_plan_id;

  return 0;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."create_battle_plan_group"("target_plan_id" "uuid", "group_name" "text", "leader_account_id" "uuid", "destination_alliance_id" "uuid", "publish_tag_id" "uuid" DEFAULT NULL::"uuid", "group_max_members" integer DEFAULT 10, "group_notes" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  target_state_id uuid;
  rally_lead_tag_id uuid;
  new_group_id uuid;
  next_sort_order smallint;
  cleaned_name text := btrim(coalesce(group_name, ''));
  cleaned_notes text := nullif(btrim(coalesce(group_notes, '')), '');
begin
  select state_id into target_state_id
  from public.battle_plans where id = target_plan_id;

  if target_state_id is null then raise exception 'Battle plan not found.'; end if;
  if not public.is_state_admin(target_state_id) then
    raise exception 'Only state owners and admins can create rally groups.';
  end if;
  if char_length(cleaned_name) not between 1 and 60 then
    raise exception 'Rally group names must contain between 1 and 60 characters.';
  end if;
  if group_max_members not between 1 and 100 then
    raise exception 'Rally group capacity must be between 1 and 100.';
  end if;
  if cleaned_notes is not null and char_length(cleaned_notes) > 1000 then
    raise exception 'Rally group notes cannot exceed 1000 characters.';
  end if;

  select id into rally_lead_tag_id from public.state_tags
  where state_id = target_state_id and system_key = 'rally_lead';

  if not exists (
    select 1 from public.state_member_tags
    where tag_id = rally_lead_tag_id
      and wos_account_id = leader_account_id
  ) and not exists (
    -- Leads picked for this SvS count as Rally Leads.
    select 1 from public.battle_plans picked
    where picked.id = target_plan_id
      and leader_account_id = any(coalesce(picked.rally_lead_ids, '{}'))
  ) then
    raise exception 'Only accounts with the Rally Lead tag can lead a group.';
  end if;
  if not exists (
    select 1 from public.state_alliances
    where id = destination_alliance_id and state_id = target_state_id
  ) then
    raise exception 'Choose a destination alliance from this state.';
  end if;
  if publish_tag_id is not null and not exists (
    select 1 from public.state_tags
    where id = publish_tag_id
      and state_id = target_state_id
      and system_key is null
  ) then
    raise exception 'Choose a regular state tag for the published group.';
  end if;

  select coalesce(max(sort_order), -1) + 1 into next_sort_order
  from public.battle_plan_groups where plan_id = target_plan_id;

  insert into public.battle_plan_groups (
    plan_id, state_id, name, leader_wos_account_id,
    alliance_id, assignment_tag_id, max_members, notes, sort_order
  ) values (
    target_plan_id, target_state_id, cleaned_name, leader_account_id,
    destination_alliance_id, publish_tag_id, group_max_members,
    cleaned_notes, next_sort_order
  ) returning id into new_group_id;

  insert into public.battle_plan_assignments (
    plan_id, group_id, state_id, wos_account_id, assigned_by
  ) values (
    target_plan_id, new_group_id, target_state_id, leader_account_id, auth.uid()
  )
  on conflict (plan_id, wos_account_id) do update set
    group_id = excluded.group_id,
    state_id = excluded.state_id,
    assigned_by = auth.uid(),
    assigned_at = now();

  update public.battle_plans set updated_at = now() where id = target_plan_id;
  return new_group_id;
exception
  when unique_violation then
    raise exception 'That player already leads a rally group in this plan.';
end;
$$;
