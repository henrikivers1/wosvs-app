-- Pipeline overhaul, part 1: remove dead code, close loose permissions,
-- add missing indexes, stop duplicate notifications, share WOSOracle
-- responses between server instances and run time-critical jobs in the
-- database itself.

-- 1. Dead functions --------------------------------------------------------
-- The manual "battle period", poll/vote and state-creation flows were
-- replaced by the SvS automation. None of these is called by the app.
drop function if exists public.publish_battle_plan_with_notifications(uuid);
drop function if exists public.delete_battle_plan_comment(uuid);
drop function if exists public.get_state_battle_history(uuid);
drop function if exists public.start_state_battle(uuid, text);
drop function if exists public.end_state_battle(uuid, text);
drop function if exists public.complete_active_battle(uuid, uuid, text);
drop function if exists public.activate_scheduled_battle(uuid, uuid);
drop function if exists public.create_battle_plan(uuid, text, text, timestamptz, text);
drop function if exists public.set_state_alliance_member(uuid, uuid, uuid);
drop function if exists public.assign_tagged_members_to_alliance(uuid, uuid);
drop function if exists public.bulk_assign_battle_plan_members(uuid, uuid, uuid[]);
drop function if exists public.redeem_state_creation_invite(uuid, text, uuid);
drop function if exists public.create_state_poll(uuid, uuid, text, text, text[], uuid[], timestamptz);
drop function if exists public.submit_state_poll_vote(uuid, uuid, uuid);
drop function if exists public.delete_state_poll(uuid);
drop function if exists public.get_state_poll_counts(uuid);
drop function if exists public.get_state_poll_admin_responses(uuid);
drop function if exists public.cleanup_expired_state_polls();
drop function if exists public.refresh_vote_generated_tags(uuid, uuid);
-- Join links: players now join by WOS ID (invite in the inbox, or the
-- automatic join request), so the token link is gone.
drop function if exists public.accept_state_invite(uuid);

-- 2. Dead tables and columns -------------------------------------------------
drop trigger if exists state_poll_creator_notification on public.state_polls;
drop function if exists public.notify_state_poll_creator();
drop table if exists public.state_poll_votes;
drop table if exists public.state_poll_options;
drop table if exists public.state_polls;
drop table if exists public.state_creation_invites;

delete from public.notifications where type = 'state_poll_created';
delete from public.state_member_tags where source = 'vote';
alter table public.state_member_tags drop constraint if exists state_member_tags_source_check;
alter table public.state_member_tags add constraint state_member_tags_source_check
  check (source in ('manual', 'battle_plan'));

alter table public.battles alter column status set default 'scheduled';

-- bulk_move_limit was only used by the removed bulk-move function.
drop function if exists public.create_state_tag(uuid, text, text, integer);
drop function if exists public.update_state_tag(uuid, text, text, integer);
alter table public.state_tags drop column if exists bulk_move_limit;

create or replace function public.create_state_tag(
  target_state_id uuid,
  tag_name text,
  tag_color text
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  new_tag_id uuid;
  cleaned_name text := btrim(coalesce(tag_name, ''));
  cleaned_color text := lower(btrim(coalesce(tag_color, '')));
begin
  if not public.is_state_admin(target_state_id) then
    raise exception 'Only state owners and admins can create tags.';
  end if;
  if char_length(cleaned_name) not between 1 and 32 then
    raise exception 'Tag names must contain between 1 and 32 characters.';
  end if;
  if cleaned_color !~ '^#[0-9a-f]{6}$' then
    raise exception 'Tag colors must use a six-digit hex code.';
  end if;

  insert into public.state_tags (state_id, name, color, created_by)
  values (target_state_id, cleaned_name, cleaned_color, auth.uid())
  returning id into new_tag_id;
  return new_tag_id;
exception
  when unique_violation then
    raise exception 'A tag with that name already exists in this state.';
end;
$$;

create or replace function public.update_state_tag(
  target_tag_id uuid,
  tag_name text,
  tag_color text
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  target_state_id uuid;
  target_system_key text;
  cleaned_name text := btrim(coalesce(tag_name, ''));
  cleaned_color text := lower(btrim(coalesce(tag_color, '')));
begin
  select state_id, system_key into target_state_id, target_system_key
  from public.state_tags where id = target_tag_id;

  if target_state_id is null then raise exception 'Tag not found.'; end if;
  if not public.is_state_admin(target_state_id) then
    raise exception 'Only state owners and admins can edit tags.';
  end if;
  if target_system_key is not null then
    raise exception 'The Rally Lead tag is managed from Planning.';
  end if;
  if char_length(cleaned_name) not between 1 and 32 then
    raise exception 'Tag names must contain between 1 and 32 characters.';
  end if;
  if cleaned_color !~ '^#[0-9a-f]{6}$' then
    raise exception 'Tag colors must use a six-digit hex code.';
  end if;

  update public.state_tags set name = cleaned_name, color = cleaned_color
  where id = target_tag_id;
exception
  when unique_violation then
    raise exception 'A tag with that name already exists in this state.';
end;
$$;

-- 3. Permissions ---------------------------------------------------------------
-- Battles are written only by the automation; owners setting a result by
-- hand would notify every member.
drop policy if exists "owners create battles" on public.battles;
drop policy if exists "owners update battles" on public.battles;
drop policy if exists "owners delete battles" on public.battles;
-- Subset of "state members read permitted plan comments".
drop policy if exists "members read public plan comments" on public.battle_plan_comments;

-- 4. Indexes -----------------------------------------------------------------------
create index if not exists rallies_battle_id_idx on public.rallies (battle_id);
create index if not exists notifications_user_unread_idx
  on public.notifications (user_id) where read_at is null;
create index if not exists notifications_plan_id_idx
  on public.notifications ((data ->> 'plan_id'));
create index if not exists notifications_battle_id_idx
  on public.notifications ((data ->> 'battle_id'));
create index if not exists notifications_comment_id_idx
  on public.notifications ((data ->> 'comment_id'));
create index if not exists notifications_announcement_id_idx
  on public.notifications ((data ->> 'announcement_id'));
create index if not exists battle_plan_assignments_member_idx
  on public.battle_plan_assignments (state_id, wos_account_id);
create index if not exists battle_plan_groups_leader_idx
  on public.battle_plan_groups (state_id, leader_wos_account_id);
create index if not exists state_member_tags_account_idx
  on public.state_member_tags (wos_account_id);
create index if not exists enemy_leaders_wos_id_idx
  on public.enemy_leaders (state_id, wos_id);

-- 5. No duplicate notifications ------------------------------------------------------
-- Removing a member: one "Removed from state" message, not one per tag too.
create or replace function public.remove_state_member(
  target_state_id uuid,
  target_wos_account_id uuid
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  actor_is_owner boolean := public.is_state_owner(target_state_id);
begin
  if not public.is_state_admin(target_state_id) then
    raise exception 'Only state owners and admins can remove members.';
  end if;

  delete from public.state_members
  where state_id = target_state_id
    and wos_account_id = target_wos_account_id
    and role <> 'owner'
    and (actor_is_owner or role = 'member');
  if not found then
    raise exception 'Member not found or you cannot remove that account.';
  end if;

  -- Tags have no foreign key to the membership.
  delete from public.state_member_tags assignment
  using public.state_tags tag
  where assignment.tag_id = tag.id
    and tag.state_id = target_state_id
    and assignment.wos_account_id = target_wos_account_id;
end;
$$;

-- Switching between Coordinator and Garrison: one "New permission" message.
create or replace function public.set_state_member_capability(
  target_state_id uuid,
  target_wos_account_id uuid,
  target_capability text,
  capability_enabled boolean
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_state_admin(target_state_id) then
    raise exception 'Only state owners and admins can assign battle roles.';
  end if;
  if target_capability not in ('rally_caller', 'garrison') then
    raise exception 'Invalid battle role.';
  end if;
  if not exists (
    select 1 from public.state_members
    where state_id = target_state_id and wos_account_id = target_wos_account_id
  ) then
    raise exception 'That WOS account is not a state member.';
  end if;

  if capability_enabled then
    perform set_config('wosoverwatch.mute_member_notifications', 'on', true);
    delete from public.state_member_capabilities
    where state_id = target_state_id
      and wos_account_id = target_wos_account_id
      and capability <> target_capability;
    perform set_config('wosoverwatch.mute_member_notifications', 'off', true);

    insert into public.state_member_capabilities (state_id, wos_account_id, capability)
    values (target_state_id, target_wos_account_id, target_capability)
    on conflict do nothing;
  else
    delete from public.state_member_capabilities
    where state_id = target_state_id
      and wos_account_id = target_wos_account_id
      and capability = target_capability;
  end if;
end;
$$;

-- The capability trigger now honours the mute as well.
create or replace function public.notify_state_capability_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  row_state_id uuid := coalesce(new.state_id, old.state_id);
  row_account_id uuid := coalesce(new.wos_account_id, old.wos_account_id);
  row_capability text := coalesce(new.capability, old.capability);
  capability_label text;
  state_name text;
begin
  if public.member_notifications_muted() or (
    tg_op = 'DELETE' and not exists (
      select 1 from public.state_members
      where state_id = row_state_id and wos_account_id = row_account_id
    )
  ) then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  select name into state_name from public.states where id = row_state_id;
  capability_label := case row_capability
    when 'rally_caller' then 'Coordinator'
    when 'garrison' then 'Garrison'
    else row_capability end;

  perform public.notify_member_action(
    row_account_id,
    case when tg_op = 'INSERT' then 'capability_granted' else 'capability_revoked' end,
    case when tg_op = 'INSERT'
      then 'New permission: ' || capability_label
      else 'Permission removed: ' || capability_label end,
    case when tg_op = 'INSERT'
      then public.account_display_name(row_account_id) || ' can now use ' ||
        capability_label || ' in ' || coalesce(state_name, 'the state') || '.'
      else public.account_display_name(row_account_id) || ' can no longer use ' ||
        capability_label || ' in ' || coalesce(state_name, 'the state') || '.' end,
    jsonb_build_object(
      'capability', row_capability,
      'state_name', state_name,
      'player', public.account_display_name(row_account_id)
    ),
    row_state_id
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

-- Publishing: the wrapper sends the per-member messages, so the inner
-- function no longer writes (and the wrapper no longer deletes) a second
-- set. Only the wrapper and the automation may call it.
create or replace function public.publish_battle_plan(target_plan_id uuid) returns integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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
      and tag.system_key = 'rally_lead'
    left join public.state_member_tags assignment
      on assignment.tag_id = tag.id
      and assignment.wos_account_id = plan_group.leader_wos_account_id
    where plan_group.plan_id = target_plan_id
      and assignment.wos_account_id is null
  ) then raise exception 'Every group leader must still have the Rally Lead tag.'; end if;

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
revoke all on function public.publish_battle_plan(uuid) from public, anon, authenticated;
grant execute on function public.publish_battle_plan(uuid) to service_role;

-- 6. WOSOracle: shared cache and per-minute budget -------------------------------------
-- Responses are cached in the database so every server instance shares them
-- and only real upstream requests count against the quota. 402/404 answers
-- are cached too, so a missing Premium board is not paid for every day.
create table if not exists public.oracle_cache (
  path text primary key,
  status integer not null,
  body jsonb,
  fetched_at timestamptz not null default now()
);
alter table public.oracle_cache enable row level security;
revoke all on table public.oracle_cache from anon, authenticated;

create table if not exists public.oracle_usage_minute (
  minute timestamptz primary key,
  requests integer not null default 0
);
alter table public.oracle_usage_minute enable row level security;
revoke all on table public.oracle_usage_minute from anon, authenticated;

-- Counts one upstream request for today and for the current minute.
create or replace function public.reserve_oracle_request()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  day_count integer;
  minute_count integer;
begin
  insert into public.oracle_usage (day, requests)
  values ((now() at time zone 'utc')::date, 1)
  on conflict (day) do update set requests = public.oracle_usage.requests + 1
  returning requests into day_count;

  insert into public.oracle_usage_minute (minute, requests)
  values (date_trunc('minute', clock_timestamp()), 1)
  on conflict (minute) do update set requests = public.oracle_usage_minute.requests + 1
  returning requests into minute_count;

  return jsonb_build_object('day', day_count, 'minute', minute_count);
end;
$$;

-- 7. Battles start and end on the minute -----------------------------------------------
-- automation_advance_battles needs no WOSOracle data, so it runs inside the
-- database every minute instead of waiting for the hourly HTTP job (which
-- started 12:00 battles at 12:07). Needs pg_cron (Database > Extensions).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'wos-advance-battles';
    perform cron.schedule('wos-advance-battles', '* * * * *',
      'select public.automation_advance_battles()');
  else
    raise notice 'pg_cron is not enabled: enable it and re-run this block for on-the-minute battle starts.';
  end if;
end;
$$;

-- 8. Signup and state number -----------------------------------------------------------
-- Signing up with a WOS ID someone already claimed no longer fails the whole
-- signup; the player can ask an admin to release it.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  signup_username text := nullif(trim(new.raw_user_meta_data ->> 'username'), '');
  signup_wos_id text := nullif(trim(new.raw_user_meta_data ->> 'wos_id'), '');
begin
  insert into public.profiles (id, username, display_name)
  values (new.id, signup_username, coalesce(signup_username, split_part(new.email, '@', 1)))
  on conflict (id) do update
  set username = coalesce(public.profiles.username, excluded.username),
      display_name = coalesce(public.profiles.display_name, excluded.display_name);

  if signup_wos_id ~ '^[0-9]+$' then
    insert into public.wos_accounts (user_id, wos_id, is_configured)
    values (new.id, signup_wos_id, true)
    on conflict (wos_id) do nothing;
  end if;
  return new;
end;
$$;

-- The state's in-game number follows its owner's synced account, so nobody
-- has to type it in.
create or replace function public.fill_state_number_from_owner()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.state_number is not null then
    update public.states s
    set game_state_number = new.state_number
    from public.state_members m
    where m.state_id = s.id
      and m.wos_account_id = new.id
      and m.role = 'owner'
      and s.game_state_number is null;
  end if;
  return new;
end;
$$;

drop trigger if exists wos_account_state_number on public.wos_accounts;
create trigger wos_account_state_number
  after insert or update of state_number on public.wos_accounts
  for each row execute function public.fill_state_number_from_owner();

update public.states s
set game_state_number = a.state_number
from public.state_members m
join public.wos_accounts a on a.id = m.wos_account_id
where m.state_id = s.id and m.role = 'owner'
  and s.game_state_number is null and a.state_number is not null;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.reserve_oracle_request()',
    'public.fill_state_number_from_owner()'
  ] loop
    execute format('alter function %s owner to postgres', fn);
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
  foreach fn in array array[
    'public.create_state_tag(uuid, text, text)',
    'public.update_state_tag(uuid, text, text)',
    'public.remove_state_member(uuid, uuid)',
    'public.set_state_member_capability(uuid, uuid, text, boolean)'
  ] loop
    execute format('alter function %s owner to postgres', fn);
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated, service_role', fn);
  end loop;
end;
$$;
