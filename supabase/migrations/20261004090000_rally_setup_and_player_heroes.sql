-- Rally setup: players record which joiner heroes they have at 4 stars or
-- more; each rally group has a formation, a battle half and four unique
-- joiner hero slots; each member brings one of those heroes.

-- 1. Player heroes (4★ or higher), answered by players on their account.
create table if not exists public.player_heroes (
  wos_account_id uuid not null references public.wos_accounts (id) on delete cascade,
  hero text not null check (char_length(btrim(hero)) between 1 and 32),
  updated_at timestamptz not null default now(),
  primary key (wos_account_id, hero)
);
alter table public.player_heroes enable row level security;
revoke all on table public.player_heroes from anon, authenticated;
grant select on table public.player_heroes to authenticated;
drop policy if exists "players and state members read heroes" on public.player_heroes;
create policy "players and state members read heroes" on public.player_heroes
  for select to authenticated using (public.can_read_wos_account(wos_account_id));

-- When the player last answered; null means "heroes unknown".
alter table public.wos_accounts
  add column if not exists heroes_updated_at timestamptz;

create or replace function public.set_player_heroes(
  target_wos_account_id uuid,
  owned_heroes text[]
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.owns_wos_account(target_wos_account_id) then
    raise exception 'You can only update heroes for your own WOS account.';
  end if;

  delete from public.player_heroes where wos_account_id = target_wos_account_id;
  insert into public.player_heroes (wos_account_id, hero)
  select distinct target_wos_account_id, btrim(hero)
  from unnest(coalesce(owned_heroes, '{}')) as hero
  where char_length(btrim(hero)) between 1 and 32;

  update public.wos_accounts
  set heroes_updated_at = now()
  where id = target_wos_account_id;
end;
$$;

-- 2. Group setup and per-member hero/formation.
alter table public.battle_plan_groups
  add column if not exists formation text,
  add column if not exists joiner_heroes text[] not null default '{}',
  add column if not exists shift text not null default 'whole';
alter table public.battle_plan_groups
  drop constraint if exists battle_plan_groups_formation_check,
  drop constraint if exists battle_plan_groups_joiner_heroes_check,
  drop constraint if exists battle_plan_groups_shift_check;
alter table public.battle_plan_groups
  add constraint battle_plan_groups_formation_check
    check (formation is null or formation ~ '^[0-9]{1,3}/[0-9]{1,3}/[0-9]{1,3}$'),
  add constraint battle_plan_groups_joiner_heroes_check
    check (cardinality(joiner_heroes) <= 4),
  add constraint battle_plan_groups_shift_check
    check (shift in ('whole', 'first_half', 'second_half'));

alter table public.battle_plan_assignments
  add column if not exists hero text,
  add column if not exists formation text;
alter table public.battle_plan_assignments
  drop constraint if exists battle_plan_assignments_formation_check;
alter table public.battle_plan_assignments
  add constraint battle_plan_assignments_formation_check
    check (formation is null or formation ~ '^[0-9]{1,3}/[0-9]{1,3}/[0-9]{1,3}$');

create or replace function public.set_battle_plan_group_setup(
  target_group_id uuid,
  group_formation text,
  group_joiner_heroes text[],
  group_shift text
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  group_state_id uuid;
  cleaned_heroes text[];
begin
  select state_id into group_state_id
  from public.battle_plan_groups where id = target_group_id;
  if group_state_id is null then
    raise exception 'Rally group not found.';
  end if;
  if not public.is_state_admin(group_state_id) then
    raise exception 'Only state owners and admins can set up rally groups.';
  end if;

  select coalesce(array_agg(hero order by position), '{}')
  into cleaned_heroes
  from (
    select distinct on (lower(btrim(hero))) btrim(hero) as hero, position
    from unnest(coalesce(group_joiner_heroes, '{}')) with ordinality as item(hero, position)
    where char_length(btrim(hero)) between 1 and 32
    order by lower(btrim(hero)), position
  ) unique_heroes;

  if cardinality(cleaned_heroes) > 4 then
    raise exception 'A rally can have at most four joiner heroes.';
  end if;

  update public.battle_plan_groups
  set formation = nullif(btrim(coalesce(group_formation, '')), ''),
      joiner_heroes = cleaned_heroes,
      shift = coalesce(group_shift, 'whole'),
      updated_at = now()
  where id = target_group_id;
end;
$$;

create or replace function public.set_assignment_details(
  target_plan_id uuid,
  target_wos_account_id uuid,
  assigned_hero text,
  assigned_formation text
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  plan_state_id uuid;
begin
  select state_id into plan_state_id
  from public.battle_plans where id = target_plan_id;
  if plan_state_id is null or not public.is_state_admin(plan_state_id) then
    raise exception 'Only state owners and admins can change assignments.';
  end if;

  update public.battle_plan_assignments
  set hero = nullif(btrim(coalesce(assigned_hero, '')), ''),
      formation = nullif(btrim(coalesce(assigned_formation, '')), '')
  where plan_id = target_plan_id
    and wos_account_id = target_wos_account_id;
end;
$$;

-- Applies an auto-fill draft computed in the app: a list of
-- {group_id, wos_account_id, hero}. Leaders always stay in their groups.
create or replace function public.apply_battle_plan_autofill(
  target_plan_id uuid,
  new_assignments jsonb,
  replace_existing boolean
) returns integer
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
  select state_id into plan_state_id
  from public.battle_plans where id = target_plan_id;
  if plan_state_id is null or not public.is_state_admin(plan_state_id) then
    raise exception 'Only state owners and admins can auto-fill rally groups.';
  end if;

  if replace_existing then
    delete from public.battle_plan_assignments assignment
    where assignment.plan_id = target_plan_id
      and not exists (
        select 1 from public.battle_plan_groups plan_group
        where plan_group.plan_id = target_plan_id
          and plan_group.leader_wos_account_id = assignment.wos_account_id
      );
  end if;

  for item in select * from jsonb_array_elements(coalesce(new_assignments, '[]'))
  loop
    -- Skip leaders and anything that does not belong to this plan/state.
    continue when exists (
      select 1 from public.battle_plan_groups
      where plan_id = target_plan_id
        and leader_wos_account_id = (item ->> 'wos_account_id')::uuid
    );
    continue when not exists (
      select 1 from public.battle_plan_groups
      where id = (item ->> 'group_id')::uuid and plan_id = target_plan_id
    );
    continue when not exists (
      select 1 from public.state_members
      where state_id = plan_state_id
        and wos_account_id = (item ->> 'wos_account_id')::uuid
    );

    insert into public.battle_plan_assignments (
      plan_id, group_id, state_id, wos_account_id, assigned_by, hero
    ) values (
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
    and (
      select count(*) from public.battle_plan_assignments assignment
      where assignment.group_id = plan_group.id
    ) > plan_group.max_members
  limit 1;
  if over_capacity is not null then
    raise exception 'Rally group % would be over capacity.', over_capacity;
  end if;

  update public.battle_plans set updated_at = now() where id = target_plan_id;
  return applied;
end;
$$;

-- 3. Publishing tells each player exactly what to do and tags them with
-- their joiner hero.
create or replace function public.publish_battle_plan_with_notifications(
  target_plan_id uuid,
  actor_wos_account_id uuid
) returns integer
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
begin
  select plan.state_id, plan.name, plan.scheduled_at, plan.battle_type
  into target_state_id, target_plan_name, target_scheduled_at, target_battle_type
  from public.battle_plans plan
  where plan.id = target_plan_id;

  if target_state_id is null then
    raise exception 'Battle plan not found.';
  end if;
  if not public.is_state_admin_account(target_state_id, actor_wos_account_id) then
    raise exception 'The selected WOS account cannot publish battle plans.';
  end if;

  perform public.publish_battle_plan(target_plan_id);

  insert into public.battles (
    state_id, name, status, battle_type, scheduled_at, plan_id
  ) values (
    target_state_id, target_plan_name, 'scheduled', target_battle_type,
    target_scheduled_at, target_plan_id
  )
  on conflict (plan_id) where plan_id is not null
  do update set
    name = excluded.name,
    battle_type = excluded.battle_type,
    scheduled_at = excluded.scheduled_at
  returning id into target_battle_id;

  battle_start := to_char(target_scheduled_at at time zone 'UTC', 'Mon DD, HH24:MI') || ' UTC';

  delete from public.notifications
  where type in ('battle_plan_assignment', 'battle_plan_published')
    and data ->> 'plan_id' = target_plan_id::text;

  for recipient in
    select
      member.wos_account_id,
      coalesce(nullif(btrim(account.nickname), ''), 'WOS ID ' || account.wos_id) as player_name,
      plan_group.id as group_id,
      plan_group.name as group_name,
      coalesce(assignment.formation, plan_group.formation) as formation,
      assignment.hero,
      alliance.id as alliance_id,
      alliance.name as alliance_name
    from public.state_members member
    join public.wos_accounts account on account.id = member.wos_account_id
    left join public.battle_plan_assignments assignment
      on assignment.plan_id = target_plan_id
      and assignment.wos_account_id = member.wos_account_id
    left join public.battle_plan_groups plan_group on plan_group.id = assignment.group_id
    left join public.state_alliances alliance on alliance.id = plan_group.alliance_id
    where member.state_id = target_state_id
  loop
    if recipient.group_id is not null then
      perform public.queue_account_notification(
        recipient.wos_account_id,
        'battle_plan_assignment',
        'Your rally assignment',
        'Hi ' || recipient.player_name || ', you''ve been assigned to ' ||
          recipient.group_name || ' in ' ||
          coalesce(recipient.alliance_name, 'an alliance not yet selected') || '.' ||
          case
            when recipient.hero is not null and recipient.formation is not null then
              ' You''re joining with ' || recipient.hero || ' and ' ||
              recipient.formation || ' formation.'
            when recipient.hero is not null then
              ' You''re joining with ' || recipient.hero || '.'
            when recipient.formation is not null then
              ' Use ' || recipient.formation || ' formation.'
            else ''
          end ||
          ' Please be there by battle start (' || battle_start || ').',
        jsonb_build_object(
          'plan_id', target_plan_id,
          'battle_id', target_battle_id,
          'group_id', recipient.group_id,
          'alliance_id', recipient.alliance_id
        ),
        'battle',
        target_state_id
      );

      if recipient.hero is not null then
        select id into hero_tag_id
        from public.state_tags
        where state_id = target_state_id
          and lower(name) = lower(recipient.hero);
        if hero_tag_id is null then
          insert into public.state_tags (state_id, name, color, kind)
          values (target_state_id, recipient.hero, '#9b6bd6', 'hero')
          returning id into hero_tag_id;
        end if;
        insert into public.state_member_tags (
          tag_id, wos_account_id, source, source_plan_id, assigned_by
        ) values (
          hero_tag_id, recipient.wos_account_id, 'battle_plan', target_plan_id, auth.uid()
        )
        on conflict (tag_id, wos_account_id) do nothing;
      end if;
    else
      perform public.queue_account_notification(
        recipient.wos_account_id,
        'battle_plan_published',
        'Battle plan published',
        target_plan_name || ' was published for ' || battle_start ||
          '. This account is not assigned to a rally.',
        jsonb_build_object('plan_id', target_plan_id, 'battle_id', target_battle_id),
        'battle',
        target_state_id
      );
    end if;
    notification_count := notification_count + 1;
  end loop;

  return notification_count;
end;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.set_player_heroes(uuid, text[])',
    'public.set_battle_plan_group_setup(uuid, text, text[], text)',
    'public.set_assignment_details(uuid, uuid, text, text)',
    'public.apply_battle_plan_autofill(uuid, jsonb, boolean)',
    'public.publish_battle_plan_with_notifications(uuid, uuid)'
  ] loop
    execute format('alter function %s owner to postgres', fn);
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated, service_role', fn);
  end loop;
end;
$$;

-- 4. The draw notification also reminds players to update their heroes.
create or replace function public.automation_ensure_svs_plan(
  target_state_id uuid,
  opponent_number integer,
  battle_at timestamptz
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  svs_plan_id uuid;
  created boolean := false;
  plan_name text := 'SvS vs ' || opponent_number;
begin
  select id into svs_plan_id
  from public.battle_plans
  where state_id = target_state_id
    and auto_created
    and scheduled_at = battle_at;

  if svs_plan_id is null then
    insert into public.battle_plans (
      state_id, name, battle_type, scheduled_at, status, created_by,
      opponent_state_number, auto_created
    ) values (
      target_state_id, plan_name, 'svs', battle_at, 'draft', null,
      opponent_number, true
    )
    returning id into svs_plan_id;
    created := true;
  else
    update public.battle_plans
    set opponent_state_number = opponent_number,
        name = case when name like 'SvS vs %' then plan_name else name end,
        updated_at = now()
    where id = svs_plan_id;
  end if;

  insert into public.battles (
    state_id, name, status, battle_type, scheduled_at, plan_id
  ) values (
    target_state_id, plan_name, 'scheduled', 'svs', battle_at, svs_plan_id
  )
  on conflict (plan_id) where plan_id is not null do nothing;

  if created then
    perform public.queue_account_notification(
      member.wos_account_id,
      'svs_drawn',
      'SvS opponent drawn',
      'Your state faces state ' || opponent_number || ' on ' ||
        to_char(battle_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI') ||
        ' UTC. Open Overwatch to vote when you can play, and check your 4★ joiner heroes on your account page.',
      jsonb_build_object('plan_id', svs_plan_id),
      'battle',
      target_state_id
    )
    from public.state_members member
    where member.state_id = target_state_id;
  end if;

  return svs_plan_id;
end;
$$;
