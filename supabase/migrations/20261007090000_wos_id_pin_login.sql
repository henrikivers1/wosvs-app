-- Sign-in with WOS ID and PIN, and joining a state with a link.
--
-- * One WOS ID per login. Logins are created by the server (/api/auth/join
--   and /api/operator/states); players never add WOS accounts themselves.
-- * A state has one join link with a first-time PIN that owners and admins
--   share in their chats. It stays valid until they make a new one.
-- * The old invite, join request and claim-release flow is removed.

-- One WOS ID per login --------------------------------------------------------

create or replace function public.limit_wos_accounts_per_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform pg_advisory_xact_lock(hashtext('wos_accounts:' || new.user_id::text));
  if exists (select 1 from public.wos_accounts where user_id = new.user_id) then
    raise exception 'A login has one WOS ID.';
  end if;
  return new;
end;
$$;

-- Logins created before this migration may hold several WOS IDs. They keep
-- working; the index is added once they are cleaned up (rerun this block).
do $$
begin
  if not exists (
    select 1 from public.wos_accounts group by user_id having count(*) > 1
  ) then
    create unique index if not exists wos_accounts_one_per_user
      on public.wos_accounts (user_id);
  else
    raise notice 'Some logins hold several WOS IDs; wos_accounts_one_per_user was not created.';
  end if;
end;
$$;

-- Accounts are created by the server only.
drop policy if exists "users add own WOS accounts" on public.wos_accounts;
drop policy if exists "users remove own unused WOS accounts" on public.wos_accounts;
revoke insert, delete on public.wos_accounts from authenticated, anon;

-- Set when an operator or admin hands out a one-time PIN; the player picks
-- their own PIN on the next sign-in. Only the server changes it.
alter table public.profiles
  add column if not exists must_change_pin boolean not null default false;

revoke update on public.profiles from authenticated, anon;
grant update (username, display_name, preferred_language)
  on public.profiles to authenticated;

-- Join links ------------------------------------------------------------------

create table if not exists public.state_join_links (
  state_id uuid primary key references public.states(id) on delete cascade,
  token text not null unique,
  -- Shared in the state's chats, so admins can show it again.
  pin text not null check (pin ~ '^[0-9]{6}$'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.state_join_links enable row level security;
revoke all on public.state_join_links from anon, authenticated;

-- Makes a new link and PIN for a state; the old ones stop working.
create or replace function public.create_state_join_link(target_state_id uuid)
returns table (token text, pin text, created_at timestamptz)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  new_token text :=
    translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/', '-_');
  new_pin text := lpad(
    (('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint
      % 1000000)::text,
    6,
    '0'
  );
begin
  if not public.is_state_admin(target_state_id) then
    raise exception 'Only state owners and admins can make join links.';
  end if;

  insert into public.state_join_links as link
    (state_id, token, pin, created_by, created_at)
  values (target_state_id, new_token, new_pin, auth.uid(), now())
  on conflict (state_id) do update
  set token = excluded.token,
      pin = excluded.pin,
      created_by = excluded.created_by,
      created_at = excluded.created_at;

  return query select new_token, new_pin, now();
end;
$$;

-- The current link for owners and admins (nothing when none was made yet).
create or replace function public.get_state_join_link(target_state_id uuid)
returns table (token text, pin text, created_at timestamptz)
language sql
stable
security definer
set search_path to 'public'
as $$
  select link.token, link.pin, link.created_at
  from public.state_join_links link
  where link.state_id = target_state_id
    and public.is_state_admin(target_state_id);
$$;

revoke all on function public.create_state_join_link(uuid) from public, anon;
revoke all on function public.get_state_join_link(uuid) from public, anon;
grant execute on function public.create_state_join_link(uuid) to authenticated;
grant execute on function public.get_state_join_link(uuid) to authenticated;

-- PIN lockout ---------------------------------------------------------------------

-- Wrong PINs per key: 'wos:<WOS ID>' for sign-in, 'link:<token>' for the
-- first-time PIN of a join link, each also per address ('<key>@<address>').
-- Server only.
create table if not exists public.auth_pin_attempts (
  key text primary key,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.auth_pin_attempts enable row level security;
revoke all on public.auth_pin_attempts from anon, authenticated;

-- When the key is locked, until when; otherwise null.
create or replace function public.pin_locked_until(p_key text)
returns timestamptz
language sql
stable
security definer
set search_path to 'public'
as $$
  select locked_until from public.auth_pin_attempts
  where key = p_key and locked_until > now();
$$;

-- Counts a wrong PIN. After p_max failures the key is locked for
-- p_lock_minutes and the count starts over. Returns the lock, if any.
create or replace function public.record_pin_failure(
  p_key text,
  p_max integer,
  p_lock_minutes integer
)
returns timestamptz
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  result timestamptz;
begin
  insert into public.auth_pin_attempts as attempt (key, failed_attempts, updated_at)
  values (p_key, 1, now())
  on conflict (key) do update
  set failed_attempts = case
        when attempt.locked_until is not null and attempt.locked_until <= now()
          then 1
        else attempt.failed_attempts + 1
      end,
      locked_until = case
        when attempt.locked_until <= now() then null
        else attempt.locked_until
      end,
      updated_at = now();

  update public.auth_pin_attempts
  set locked_until = now() + make_interval(mins => p_lock_minutes),
      failed_attempts = 0
  where key = p_key and failed_attempts >= p_max
  returning locked_until into result;
  return result;
end;
$$;

-- Forgets the wrong PINs for a key, from every address ('<key>@<address>').
create or replace function public.clear_pin_failures(p_key text)
returns void
language sql
security definer
set search_path to 'public'
as $$
  delete from public.auth_pin_attempts
  where key = p_key or starts_with(key, p_key || '@');
$$;

-- Signs a login out everywhere (after a PIN reset). Access tokens already
-- handed out stay valid until they expire (one hour by default).
create or replace function public.end_user_sessions(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if to_regclass('auth.sessions') is not null then
    execute 'delete from auth.sessions where user_id = $1' using p_user_id;
  end if;
end;
$$;

revoke all on function public.pin_locked_until(text) from public, anon, authenticated;
revoke all on function public.record_pin_failure(text, integer, integer) from public, anon, authenticated;
revoke all on function public.clear_pin_failures(text) from public, anon, authenticated;
revoke all on function public.end_user_sessions(uuid) from public, anon, authenticated;
grant execute on function public.pin_locked_until(text) to service_role;
grant execute on function public.record_pin_failure(text, integer, integer) to service_role;
grant execute on function public.clear_pin_failures(text) to service_role;
grant execute on function public.end_user_sessions(uuid) to service_role;

-- PIN resets ----------------------------------------------------------------------

-- Returns the login of a member whose PIN the caller may reset: owners reset
-- anyone but themselves, admins reset members. The server then sets the
-- one-time PIN with the auth admin API.
create or replace function public.authorize_pin_reset(
  target_state_id uuid,
  target_wos_account_id uuid
)
returns uuid
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  target_role text;
  target_user uuid;
begin
  select member.role, account.user_id
  into target_role, target_user
  from public.state_members member
  join public.wos_accounts account on account.id = member.wos_account_id
  where member.state_id = target_state_id
    and member.wos_account_id = target_wos_account_id;

  if target_user is null
    or target_user = auth.uid()
    or target_role = 'owner'
    or not public.is_state_admin(target_state_id)
    or (target_role = 'admin' and not public.is_state_owner(target_state_id))
  then
    raise exception 'You cannot reset that player''s PIN.';
  end if;
  return target_user;
end;
$$;

revoke all on function public.authorize_pin_reset(uuid, uuid) from public, anon;
grant execute on function public.authorize_pin_reset(uuid, uuid) to authenticated;

-- Remove invites, join requests and claim releases --------------------------------

drop function if exists public.create_state_join_invite(uuid, text, integer);
drop function if exists public.respond_to_state_invite(uuid, boolean);
drop function if exists public.review_state_invite(uuid, boolean);
drop function if exists public.request_state_join_for_account(uuid);
drop function if exists public.release_wos_account_claim(uuid, uuid);
drop function if exists public.complete_account_setup(text, text, text);

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
    );
$$;

create or replace function public.automation_housekeeping()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  removed_notifications integer;
  removed_tags integer;
begin
  perform public.cleanup_expired_state_announcements();

  delete from public.notifications
  where (read_at is not null and created_at < now() - interval '30 days')
     or created_at < now() - interval '90 days';
  get diagnostics removed_notifications = row_count;

  delete from public.oracle_cache where fetched_at < now() - interval '7 days';
  delete from public.oracle_usage_minute where minute < now() - interval '1 day';
  delete from public.oracle_usage_user where hour < now() - interval '1 day';
  delete from public.auth_pin_attempts
  where updated_at < now() - interval '1 day'
    and (locked_until is null or locked_until < now());

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
    'rally_tags_removed', removed_tags
  );
end;
$$;

drop table if exists public.state_invites;
