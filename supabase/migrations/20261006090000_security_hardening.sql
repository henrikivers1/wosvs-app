-- Security hardening before launch, from the pre-deployment review.
--
-- 1. Creating a state works again (the Rally Lead tag still wrote a column
--    removed in 20261005120000).
-- 2. WOSOracle quota: per-person hourly limit, a share of the day kept for
--    the automation, and refused requests no longer count against the day.
-- 3. At most 10 WOS accounts per login.
-- 4. A state's in-game number must match its owner's synced WOS account and
--    is unique, so no state can take another state's join requests. Owners
--    can only edit the state's name and in-game number directly.
-- 5. Account setup no longer accepts a made-up in-game name.
-- 6. Admins read invited accounts only while the invitation is open.
-- 7. New profiles without a username no longer show the email's local part.
-- 8. Comments follow their plan's visibility.
-- 9. At most 100 heroes per account.

-- 1. State creation ---------------------------------------------------------------------
create or replace function public.create_state_system_tags()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.state_tags (state_id, name, color, system_key)
  values (new.id, 'Rally Lead', '#d49a43', 'rally_lead')
  on conflict do nothing;
  return new;
end;
$$;

-- 2. WOSOracle quota --------------------------------------------------------------------
alter table public.oracle_usage
  add column if not exists user_requests integer not null default 0;

create table if not exists public.oracle_usage_user (
  user_id uuid not null,
  hour timestamptz not null,
  requests integer not null default 0,
  primary key (user_id, hour)
);
alter table public.oracle_usage_user enable row level security;
revoke all on table public.oracle_usage_user from anon, authenticated;

drop function if exists public.reserve_oracle_request();

-- Reserves one upstream request. Checks the minute, then the person (when
-- the request is theirs), then the day; only a granted request counts
-- against the day. People share at most p_user_day_limit of the day, so the
-- automation always has the rest.
create or replace function public.reserve_oracle_request(
  p_minute_limit integer,
  p_day_limit integer,
  p_user_id uuid default null,
  p_user_hour_limit integer default null,
  p_user_day_limit integer default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  today date := (now() at time zone 'utc')::date;
  minute_count integer;
  user_count integer;
  day_count integer;
begin
  insert into public.oracle_usage_minute (minute, requests)
  values (date_trunc('minute', clock_timestamp()), 1)
  on conflict (minute) do update set requests = public.oracle_usage_minute.requests + 1
  returning requests into minute_count;
  if minute_count > p_minute_limit then
    return jsonb_build_object('ok', false, 'reason', 'minute');
  end if;

  if p_user_id is not null then
    insert into public.oracle_usage_user (user_id, hour, requests)
    values (p_user_id, date_trunc('hour', now()), 1)
    on conflict (user_id, hour) do update set requests = public.oracle_usage_user.requests + 1
    returning requests into user_count;
    if user_count > coalesce(p_user_hour_limit, user_count) then
      return jsonb_build_object('ok', false, 'reason', 'user');
    end if;
  end if;

  insert into public.oracle_usage (day, requests)
  values (today, 0)
  on conflict (day) do nothing;
  update public.oracle_usage
  set requests = requests + 1,
      user_requests = user_requests + case when p_user_id is null then 0 else 1 end
  where day = today
    and requests < p_day_limit
    and (p_user_id is null or user_requests < coalesce(p_user_day_limit, p_day_limit))
  returning requests into day_count;
  if day_count is null then
    return jsonb_build_object('ok', false, 'reason', 'day');
  end if;

  return jsonb_build_object('ok', true, 'day', day_count, 'minute', minute_count);
end;
$$;

alter function public.reserve_oracle_request(integer, integer, uuid, integer, integer) owner to postgres;
revoke all on function public.reserve_oracle_request(integer, integer, uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.reserve_oracle_request(integer, integer, uuid, integer, integer)
  to service_role;

-- 3. WOS accounts per login -------------------------------------------------------------
create or replace function public.limit_wos_accounts_per_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- Serialize inserts for one login so parallel requests cannot pass.
  perform pg_advisory_xact_lock(hashtext('wos_accounts:' || new.user_id::text));
  if (select count(*) from public.wos_accounts where user_id = new.user_id) >= 10 then
    raise exception 'You can add at most 10 WOS accounts.';
  end if;
  return new;
end;
$$;

alter function public.limit_wos_accounts_per_user() owner to postgres;
revoke all on function public.limit_wos_accounts_per_user() from public, anon, authenticated;

drop trigger if exists wos_accounts_per_user on public.wos_accounts;
create trigger wos_accounts_per_user
  before insert on public.wos_accounts
  for each row execute function public.limit_wos_accounts_per_user();

-- 4. The state's in-game number ---------------------------------------------------------
revoke update on table public.states from authenticated;
grant update (name, game_state_number) on table public.states to authenticated;

-- People (not the server) may only set the number of one of the owner's
-- synced WOS accounts, and only one app state per in-game state.
create or replace function public.check_game_state_number()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.game_state_number is null
     or new.game_state_number is not distinct from old.game_state_number then
    return new;
  end if;
  if exists (
    select 1 from public.states other
    where other.game_state_number = new.game_state_number
      and other.id <> new.id
  ) then
    raise exception 'Another state in Overwatch already uses state number %.', new.game_state_number;
  end if;
  if auth.uid() is not null and not exists (
    select 1
    from public.state_members owner_member
    join public.wos_accounts owner_account
      on owner_account.id = owner_member.wos_account_id
    where owner_member.state_id = new.id
      and owner_member.role = 'owner'
      and owner_account.state_number = new.game_state_number
  ) then
    raise exception 'The state number must match the owner''s WOS account. Sync it on Account first.';
  end if;
  return new;
end;
$$;

alter function public.check_game_state_number() owner to postgres;
revoke all on function public.check_game_state_number() from public, anon, authenticated;

drop trigger if exists states_game_state_number on public.states;
create trigger states_game_state_number
  before insert or update of game_state_number on public.states
  for each row execute function public.check_game_state_number();

-- Filling the number from the owner's account skips numbers already taken,
-- so a sync never fails on the unique index below.
create or replace function public.fill_state_number_from_owner()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.state_number is not null
     and not exists (
       select 1 from public.states taken
       where taken.game_state_number = new.state_number
     ) then
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

do $$
begin
  if exists (
    select game_state_number from public.states
    where game_state_number is not null
    group by game_state_number having count(*) > 1
  ) then
    raise notice 'Two app states share an in-game state number: clear one and re-run this block to add the unique index.';
  else
    create unique index if not exists states_game_state_number_unique
      on public.states (game_state_number)
      where game_state_number is not null;
  end if;
end;
$$;

-- 5. Account setup ----------------------------------------------------------------------
-- The in-game name comes only from the server's WOSOracle sync.
create or replace function public.complete_account_setup(
  chosen_username text,
  chosen_wos_id text,
  chosen_wos_nickname text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  normalized_username text := trim(chosen_username);
  normalized_wos_id text := trim(chosen_wos_id);
  configured_account_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must sign in first.';
  end if;
  if normalized_username !~ '^[A-Za-z0-9_]{3,24}$' then
    raise exception 'Username must be 3-24 characters using letters, numbers, or underscores.';
  end if;
  if normalized_wos_id !~ '^[0-9]+$' then
    raise exception 'WOS ID must contain numbers only.';
  end if;

  update public.profiles
  set username = normalized_username,
      display_name = normalized_username
  where id = auth.uid();

  select id into configured_account_id
  from public.wos_accounts
  where user_id = auth.uid()
    and is_configured = false
  order by created_at, id
  limit 1
  for update;

  if configured_account_id is null then
    insert into public.wos_accounts (user_id, wos_id, is_configured)
    values (auth.uid(), normalized_wos_id, true)
    returning id into configured_account_id;
  else
    update public.wos_accounts
    set wos_id = normalized_wos_id,
        nickname = null,
        is_configured = true
    where id = configured_account_id;
  end if;

  return configured_account_id;
end;
$$;

-- 6. Reading invited accounts -----------------------------------------------------------
create or replace function public.can_read_wos_account(check_wos_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    public.owns_wos_account(check_wos_account_id)
    or exists (
      select 1
      from public.state_members mine
      join public.wos_accounts mine_account
        on mine_account.id = mine.wos_account_id
      join public.state_members theirs
        on theirs.state_id = mine.state_id
      where mine_account.user_id = auth.uid()
        and theirs.wos_account_id = check_wos_account_id
    )
    or exists (
      select 1
      from public.state_invites invitation
      where invitation.invited_wos_account_id = check_wos_account_id
        and invitation.status in ('pending_recipient', 'pending_owner')
        and (invitation.expires_at is null or invitation.expires_at > now())
        and public.is_state_admin(invitation.state_id)
    );
$$;

-- 7. Profile names ----------------------------------------------------------------------
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
  values (new.id, signup_username, signup_username)
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

-- Earlier sign-ups: replace a display name that is the email's local part.
update public.profiles profile
set display_name = profile.username
from auth.users account
where account.id = profile.id
  and profile.display_name = split_part(account.email, '@', 1)
  and profile.display_name is distinct from profile.username;

-- 8. Comments follow their plan -------------------------------------------------------
create or replace function public.can_view_battle_plan_comment(target_comment_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.battle_plan_comments comment
    where comment.id = target_comment_id
      and public.is_state_member(comment.state_id)
      and public.can_view_battle_plan(comment.plan_id)
      and (
        comment.visibility = 'public'
        or public.is_state_admin(comment.state_id)
      )
  );
$$;

-- 9. Heroes ---------------------------------------------------------------------------
create or replace function public.set_player_heroes(
  target_wos_account_id uuid,
  owned_heroes text[]
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.owns_wos_account(target_wos_account_id) then
    raise exception 'You can only update heroes for your own WOS account.';
  end if;
  if coalesce(cardinality(owned_heroes), 0) > 100 then
    raise exception 'Too many heroes.';
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

-- Nightly housekeeping also clears the per-person counters ------------------------------
create or replace function public.automation_housekeeping()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  removed_notifications integer;
  revoked_invites integer;
  removed_tags integer;
begin
  perform public.cleanup_expired_state_announcements();

  delete from public.notifications
  where (read_at is not null and created_at < now() - interval '30 days')
     or created_at < now() - interval '90 days';
  get diagnostics removed_notifications = row_count;

  update public.state_invites
  set status = 'revoked'
  where status in ('pending_recipient', 'pending_owner')
    and expires_at <= now();
  get diagnostics revoked_invites = row_count;

  delete from public.oracle_cache where fetched_at < now() - interval '7 days';
  delete from public.oracle_usage_minute where minute < now() - interval '1 day';
  delete from public.oracle_usage_user where hour < now() - interval '1 day';

  delete from public.state_tags tag
  where tag.kind = 'rally'
    and tag.system_key is null
    and not exists (
      select 1 from public.battle_plan_groups plan_group
      where plan_group.assignment_tag_id = tag.id
    )
    and not exists (
      select 1 from public.state_member_tags member_tag
      where member_tag.tag_id = tag.id
    );
  get diagnostics removed_tags = row_count;

  return jsonb_build_object(
    'notifications_removed', removed_notifications,
    'invites_revoked', revoked_invites,
    'rally_tags_removed', removed_tags
  );
end;
$$;
