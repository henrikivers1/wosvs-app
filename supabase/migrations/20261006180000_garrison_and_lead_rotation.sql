-- How a castle battle is really played:
--
-- * The battle runs in three pet blocks: 12–14, 14–16 and 16–17 UTC.
-- * Rally leads swap when their pets run out. A rally keeps its joiners and
--   has one lead per block (lead_rotation, positional, nulls for gaps).
-- * One garrison squad holds the castle all battle: the strongest defenders.
--   Up to three Castle Holders take turns as garrison leader, one per block;
--   they bring no joiners.
-- * Rally Leads and Castle Holders only lead or hold. They can never be put
--   in a rally or the garrison as a joiner.
--
-- leader_wos_account_id stays the first lead of the rotation, so everything
-- that reads it keeps working.

alter table public.battle_plan_groups
  add column if not exists kind text not null default 'rally',
  add column if not exists lead_rotation uuid[] not null default '{}';

alter table public.battle_plan_groups
  drop constraint if exists battle_plan_groups_kind_check;
alter table public.battle_plan_groups
  add constraint battle_plan_groups_kind_check check (kind in ('rally', 'garrison'));
alter table public.battle_plan_groups
  drop constraint if exists battle_plan_groups_rotation_length;
alter table public.battle_plan_groups
  add constraint battle_plan_groups_rotation_length
  check (cardinality(lead_rotation) <= 3);

-- Existing rallies: their leader leads every block.
update public.battle_plan_groups
set lead_rotation = array[leader_wos_account_id, leader_wos_account_id, leader_wos_account_id]
where cardinality(lead_rotation) = 0;

-- A group created without a rotation (an admin adding a rally by hand) is
-- led by its leader in every block until the admin splits it up.
create or replace function public.default_lead_rotation()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if cardinality(new.lead_rotation) = 0 then
    new.lead_rotation := array[new.leader_wos_account_id, new.leader_wos_account_id, new.leader_wos_account_id];
  end if;
  return new;
end;
$$;

alter function public.default_lead_rotation() owner to postgres;
revoke all on function public.default_lead_rotation() from public, anon, authenticated;

drop trigger if exists battle_plan_groups_default_rotation on public.battle_plan_groups;
create trigger battle_plan_groups_default_rotation
  before insert on public.battle_plan_groups
  for each row execute function public.default_lead_rotation();

create unique index if not exists battle_plan_groups_one_garrison
  on public.battle_plan_groups (plan_id)
  where kind = 'garrison';

alter table public.states
  add column if not exists garrison_size smallint not null default 15;
alter table public.states
  drop constraint if exists states_garrison_size_check;
alter table public.states
  add constraint states_garrison_size_check check (garrison_size between 1 and 100);

-- 'HH24:MI–HH24:MI' for pet block 0, 1 or 2 of a battle.
create or replace function public.svs_block_label(battle_start timestamptz, block integer)
returns text
language sql
stable
set search_path to 'public'
as $$
  select to_char((battle_start + make_interval(hours => block * 2)) at time zone 'UTC', 'HH24:MI')
    || '–' ||
    to_char((battle_start + make_interval(hours => least(block * 2 + 2, 5))) at time zone 'UTC', 'HH24:MI');
$$;

-- Is this account a lead (any block) of a group in the plan?
create or replace function public.leads_in_plan(target_plan_id uuid, target_wos_account_id uuid)
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select plan_group.id
  from public.battle_plan_groups plan_group
  where plan_group.plan_id = target_plan_id
    and (
      plan_group.leader_wos_account_id = target_wos_account_id
      or target_wos_account_id = any(plan_group.lead_rotation)
    )
  order by plan_group.sort_order
  limit 1;
$$;

-- Seats a group uses: its joiners plus one for whoever leads right now.
create or replace function public.group_seat_count(target_group_id uuid)
returns integer
language sql
stable
security definer
set search_path to 'public'
as $$
  select count(*)::integer + 1
  from public.battle_plan_assignments assignment
  join public.battle_plan_groups plan_group on plan_group.id = assignment.group_id
  where assignment.group_id = target_group_id
    and assignment.wos_account_id <> plan_group.leader_wos_account_id
    and not (assignment.wos_account_id = any(plan_group.lead_rotation));
$$;

-- Castle Holder system tag, next to Rally Lead ------------------------------------------
create or replace function public.create_state_system_tags()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.state_tags (state_id, name, color, system_key)
  values
    (new.id, 'Rally Lead', '#d49a43', 'rally_lead'),
    (new.id, 'Castle Holder', '#5fe0c0', 'castle_holder')
  on conflict do nothing;
  return new;
end;
$$;

insert into public.state_tags (state_id, name, color, system_key)
select state.id, 'Castle Holder', '#5fe0c0', 'castle_holder'
from public.states state
where not exists (
  select 1 from public.state_tags tag
  where tag.state_id = state.id and tag.system_key = 'castle_holder'
);

create or replace function public.set_state_castle_holder(
  target_state_id uuid,
  target_wos_account_id uuid,
  enabled boolean
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  holder_tag_id uuid;
begin
  if not public.is_state_admin(target_state_id) then
    raise exception 'Only state owners and admins can manage castle holders.';
  end if;
  if not exists (
    select 1 from public.state_members
    where state_id = target_state_id and wos_account_id = target_wos_account_id
  ) then
    raise exception 'That WOS account is not a member of this state.';
  end if;
  select id into holder_tag_id from public.state_tags
  where state_id = target_state_id and system_key = 'castle_holder';
  if holder_tag_id is null then
    raise exception 'The Castle Holder system tag is missing.';
  end if;

  if enabled then
    insert into public.state_member_tags (tag_id, wos_account_id, source, assigned_by, assigned_at)
    values (holder_tag_id, target_wos_account_id, 'manual', auth.uid(), now())
    on conflict (tag_id, wos_account_id)
    do update set source = 'manual', assigned_by = auth.uid(), assigned_at = now();
  else
    if exists (
      select 1
      from public.battle_plan_groups plan_group
      join public.battle_plans plan on plan.id = plan_group.plan_id
      where plan_group.state_id = target_state_id
        and plan_group.kind = 'garrison'
        and target_wos_account_id = any(plan_group.lead_rotation)
        and plan.status = 'draft'
    ) then
      raise exception 'This account holds the castle in a draft plan. Change the holders first.';
    end if;
    delete from public.state_member_tags
    where tag_id = holder_tag_id and wos_account_id = target_wos_account_id;
  end if;
end;
$$;

-- Removing a Rally Lead also checks the rotation, not only the first lead.
create or replace function public.set_state_rally_lead(
  target_state_id uuid,
  target_wos_account_id uuid,
  enabled boolean
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  rally_lead_tag_id uuid;
begin
  if not public.is_state_admin(target_state_id) then
    raise exception 'Only state owners and admins can manage rally leaders.';
  end if;
  if not exists (
    select 1 from public.state_members
    where state_id = target_state_id and wos_account_id = target_wos_account_id
  ) then
    raise exception 'That WOS account is not a member of this state.';
  end if;
  select id into rally_lead_tag_id from public.state_tags
  where state_id = target_state_id and system_key = 'rally_lead';
  if rally_lead_tag_id is null then
    raise exception 'The Rally Lead system tag is missing.';
  end if;

  if enabled then
    insert into public.state_member_tags (tag_id, wos_account_id, source, assigned_by, assigned_at)
    values (rally_lead_tag_id, target_wos_account_id, 'manual', auth.uid(), now())
    on conflict (tag_id, wos_account_id)
    do update set source = 'manual', assigned_by = auth.uid(), assigned_at = now();
  else
    if exists (
      select 1
      from public.battle_plan_groups plan_group
      join public.battle_plans plan on plan.id = plan_group.plan_id
      where plan_group.state_id = target_state_id
        and plan_group.kind = 'rally'
        and (
          plan_group.leader_wos_account_id = target_wos_account_id
          or target_wos_account_id = any(plan_group.lead_rotation)
        )
        and plan.status = 'draft'
    ) then
      raise exception 'This account leads a rally in a draft plan. Change that rally''s leads first.';
    end if;
    delete from public.state_member_tags
    where tag_id = rally_lead_tag_id and wos_account_id = target_wos_account_id;
  end if;
end;
$$;

-- Leads and holders never join -----------------------------------------------------------
create or replace function public.prevent_lead_as_joiner()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  target_group public.battle_plan_groups%rowtype;
begin
  select * into target_group from public.battle_plan_groups where id = new.group_id;
  if new.wos_account_id = target_group.leader_wos_account_id
     or new.wos_account_id = any(target_group.lead_rotation) then
    return new;
  end if;
  if exists (
    select 1
    from public.state_member_tags member_tag
    join public.state_tags tag on tag.id = member_tag.tag_id
    where member_tag.wos_account_id = new.wos_account_id
      and tag.state_id = new.state_id
      and tag.system_key in ('rally_lead', 'castle_holder')
  ) then
    raise exception 'Rally Leads and Castle Holders only lead or hold; they cannot join %.', target_group.name;
  end if;
  return new;
end;
$$;

alter function public.prevent_lead_as_joiner() owner to postgres;
revoke all on function public.prevent_lead_as_joiner() from public, anon, authenticated;

drop trigger if exists battle_plan_assignments_no_lead_joiners on public.battle_plan_assignments;
create trigger battle_plan_assignments_no_lead_joiners
  before insert or update of group_id on public.battle_plan_assignments
  for each row execute function public.prevent_lead_as_joiner();

-- The lead (or holder) of each pet block ------------------------------------------------
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

-- The garrison's publish tag is called Garrison, not after its first holder.
create or replace function public.assign_group_rally_tag()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
declare
  leader_name text;
  rally_tag_name text;
  rally_tag_id uuid;
begin
  if new.assignment_tag_id is not null and not (
    tg_op = 'UPDATE'
    and new.leader_wos_account_id is distinct from old.leader_wos_account_id
    and new.assignment_tag_id is not distinct from old.assignment_tag_id
    and exists (
      select 1 from public.state_tags
      where id = old.assignment_tag_id and kind = 'rally'
    )
  ) then
    return new;
  end if;

  select coalesce(nullif(btrim(nickname), ''), 'WOS ' || wos_id)
  into leader_name
  from public.wos_accounts
  where id = new.leader_wos_account_id;

  rally_tag_name := case when new.kind = 'garrison' then 'Garrison'
    else left(coalesce(leader_name, 'Group'), 26) || ' rally' end;

  select id into rally_tag_id
  from public.state_tags
  where state_id = new.state_id
    and lower(name) = lower(rally_tag_name);

  if rally_tag_id is null then
    insert into public.state_tags (state_id, name, color, created_by, kind)
    values (new.state_id, rally_tag_name, '#4f8fba', auth.uid(), 'rally')
    returning id into rally_tag_id;
  end if;

  new.assignment_tag_id := rally_tag_id;
  return new;
end;
$$;

-- An admin adds the garrison by hand when the automation did not.
create or replace function public.create_garrison_group(
  target_plan_id uuid,
  holders uuid[],
  destination_alliance_id uuid
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  plan_state_id uuid;
  first_holder uuid;
  new_group_id uuid;
  size integer;
begin
  select state_id into plan_state_id from public.battle_plans where id = target_plan_id;
  if plan_state_id is null or not public.is_state_admin(plan_state_id) then
    raise exception 'Only state owners and admins can add the garrison.';
  end if;
  if exists (
    select 1 from public.battle_plan_groups
    where plan_id = target_plan_id and kind = 'garrison'
  ) then
    raise exception 'This plan already has a garrison.';
  end if;
  select holder into first_holder from unnest(holders) as holder where holder is not null limit 1;
  if first_holder is null then
    raise exception 'Choose at least one Castle Holder.';
  end if;
  select garrison_size into size from public.states where id = plan_state_id;

  insert into public.battle_plan_groups (
    plan_id, state_id, name, kind, leader_wos_account_id, lead_rotation,
    alliance_id, max_members, sort_order
  ) values (
    target_plan_id, plan_state_id, 'Garrison', 'garrison', first_holder, holders,
    destination_alliance_id, coalesce(size, 15) + 1, -1
  ) returning id into new_group_id;

  perform public.set_battle_plan_group_rotation(new_group_id, holders);
  return new_group_id;
end;
$$;

-- Manual moves: leads stay in their group, and seats count once per lead slot.
create or replace function public.set_battle_plan_assignment(
  target_plan_id uuid,
  target_wos_account_id uuid,
  target_group_id uuid default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  target_state_id uuid;
  group_state_id uuid;
  group_capacity integer;
  led_group_id uuid;
begin
  select state_id into target_state_id from public.battle_plans where id = target_plan_id;
  if target_state_id is null then
    raise exception 'Battle plan not found.';
  end if;
  if not public.is_state_admin(target_state_id) then
    raise exception 'Only state owners and admins can assign battle groups.';
  end if;
  if not exists (
    select 1 from public.state_members
    where state_id = target_state_id and wos_account_id = target_wos_account_id
  ) then
    raise exception 'That WOS account is not a member of this state.';
  end if;

  led_group_id := public.leads_in_plan(target_plan_id, target_wos_account_id);
  if led_group_id is not null
     and (target_group_id is null or target_group_id <> led_group_id) then
    raise exception 'Leads and holders stay with their group. Change its leads first.';
  end if;

  if target_group_id is null then
    delete from public.battle_plan_assignments
    where plan_id = target_plan_id and wos_account_id = target_wos_account_id;
    update public.battle_plans set updated_at = now() where id = target_plan_id;
    return;
  end if;

  select state_id, max_members into group_state_id, group_capacity
  from public.battle_plan_groups
  where id = target_group_id and plan_id = target_plan_id;
  if group_state_id is null or group_state_id <> target_state_id then
    raise exception 'Choose a rally group from this battle plan.';
  end if;
  if not exists (
    select 1 from public.battle_plan_assignments
    where group_id = target_group_id and wos_account_id = target_wos_account_id
  ) and public.group_seat_count(target_group_id) >= group_capacity then
    raise exception 'That rally group is already full.';
  end if;

  insert into public.battle_plan_assignments (plan_id, group_id, state_id, wos_account_id, assigned_by)
  values (target_plan_id, target_group_id, target_state_id, target_wos_account_id, auth.uid())
  on conflict (plan_id, wos_account_id) do update set
    group_id = excluded.group_id,
    state_id = excluded.state_id,
    assigned_by = auth.uid(),
    assigned_at = now();
  update public.battle_plans set updated_at = now() where id = target_plan_id;
end;
$$;

-- Auto-fill keeps every lead and holder in place and counts seats the same way.
create or replace function public.apply_battle_plan_autofill(
  target_plan_id uuid,
  new_assignments jsonb,
  replace_existing boolean
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  plan_state_id uuid;
  item jsonb;
  applied integer := 0;
  over_capacity text;
begin
  select state_id into plan_state_id from public.battle_plans where id = target_plan_id;
  if plan_state_id is null or not public.is_state_admin(plan_state_id) then
    raise exception 'Only state owners and admins can auto-fill rally groups.';
  end if;

  if replace_existing then
    delete from public.battle_plan_assignments assignment
    where assignment.plan_id = target_plan_id
      and public.leads_in_plan(target_plan_id, assignment.wos_account_id) is null;
  end if;

  for item in select * from jsonb_array_elements(coalesce(new_assignments, '[]'))
  loop
    continue when public.leads_in_plan(target_plan_id, (item ->> 'wos_account_id')::uuid) is not null;
    continue when not exists (
      select 1 from public.battle_plan_groups
      where id = (item ->> 'group_id')::uuid and plan_id = target_plan_id
    );
    continue when not exists (
      select 1 from public.state_members
      where state_id = plan_state_id and wos_account_id = (item ->> 'wos_account_id')::uuid
    );

    insert into public.battle_plan_assignments (plan_id, group_id, state_id, wos_account_id, assigned_by, hero)
    values (
      target_plan_id,
      (item ->> 'group_id')::uuid,
      plan_state_id,
      (item ->> 'wos_account_id')::uuid,
      auth.uid(),
      nullif(item ->> 'hero', '')
    )
    on conflict (plan_id, wos_account_id) do update set
      group_id = excluded.group_id,
      hero = excluded.hero,
      assigned_by = excluded.assigned_by,
      assigned_at = now();
    applied := applied + 1;
  end loop;

  select plan_group.name into over_capacity
  from public.battle_plan_groups plan_group
  where plan_group.plan_id = target_plan_id
    and public.group_seat_count(plan_group.id) > plan_group.max_members
  limit 1;
  if over_capacity is not null then
    raise exception 'Rally group % would be over capacity.', over_capacity;
  end if;

  update public.battle_plans set updated_at = now() where id = target_plan_id;
  return applied;
end;
$$;

-- Editing a group: seats as above, and a garrison keeps a Castle Holder.
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

-- Garrison size is an automation setting.
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
      else autofill_priorities end
  where id = target_state_id;
end;
$$;

-- The garrison is led by a Castle Holder, not a Rally Lead.
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

-- Publishing: every lead learns their blocks, every joiner the lead order,
-- holders their turn and the garrison that it stays all battle. -------------------------
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
               || ' ' || public.svs_block_label(target_scheduled_at, (slot.position - 1)::integer),
             ', ' order by slot.position)
    into rotation_text
    from unnest(recipient.lead_rotation) with ordinality as slot(lead_id, position)
    join public.wos_accounts lead_account on lead_account.id = slot.lead_id;

    select string_agg(public.svs_block_label(target_scheduled_at, (slot.position - 1)::integer), ' and ' order by slot.position)
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

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.set_state_castle_holder(uuid, uuid, boolean)',
    'public.set_state_rally_lead(uuid, uuid, boolean)',
    'public.set_battle_plan_group_rotation(uuid, uuid[])',
    'public.create_garrison_group(uuid, uuid[], uuid)',
    'public.set_battle_plan_assignment(uuid, uuid, uuid)',
    'public.update_battle_plan_group(uuid, text, uuid, uuid, uuid, integer, text)',
    'public.apply_battle_plan_autofill(uuid, jsonb, boolean)',
    'public.set_state_automation(uuid, jsonb)',
    'public.publish_battle_plan_with_notifications(uuid, uuid)'
  ] loop
    execute format('alter function %s owner to postgres', fn);
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated, service_role', fn);
  end loop;
  foreach fn in array array[
    'public.leads_in_plan(uuid, uuid)',
    'public.group_seat_count(uuid)'
  ] loop
    execute format('alter function %s owner to postgres', fn);
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated, service_role', fn);
  end loop;
end;
$$;

-- Only reached through publish_battle_plan_with_notifications.
alter function public.publish_battle_plan(uuid) owner to postgres;
revoke all on function public.publish_battle_plan(uuid) from public, anon, authenticated;
grant execute on function public.publish_battle_plan(uuid) to service_role;
