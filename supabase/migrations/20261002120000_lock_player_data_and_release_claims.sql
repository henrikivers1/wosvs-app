-- 1. Player data from WOSOracle can no longer be edited by players.
--    Only the manual combat-profile fields stay writable; everything else on
--    wos_accounts is written by the server (service role) during sync.
revoke insert, update on table public.wos_accounts from anon, authenticated;

grant insert (user_id, wos_id, is_configured)
  on table public.wos_accounts to authenticated;

grant update (
  infantry_tier,
  lancer_tier,
  marksman_tier,
  infantry_fc_level,
  lancer_fc_level,
  marksman_fc_level,
  infantry_t12_skill,
  lancer_t12_skill,
  marksman_t12_skill
) on table public.wos_accounts to authenticated;

-- 2. Profile pictures now come from the highest-power WOS account.
alter table public.profiles drop column if exists avatar_path;

-- 3. Let state admins release a WOS ID that was claimed by the wrong user.
--    Authorization (admin role, same in-game state verified via WOSOracle)
--    is enforced by the /api/accounts/release-claim route, which is the only
--    caller: the function is executable by service_role only.
create or replace function public.release_wos_account_claim(
  target_wos_account_id uuid,
  actor_state_id uuid
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  released_account public.wos_accounts%rowtype;
  actor_state_name text;
begin
  select *
  into released_account
  from public.wos_accounts
  where id = target_wos_account_id
  for update;

  if not found then
    raise exception 'WOS account not found.';
  end if;

  if exists (
    select 1
    from public.state_members
    where wos_account_id = target_wos_account_id
      and role = 'owner'
  ) then
    raise exception 'The owner of a state cannot be released.';
  end if;

  select name into actor_state_name
  from public.states
  where id = actor_state_id;

  -- Removing memberships cascades to tags, capabilities, alliance and plan
  -- assignments; deleting the account cascades to invites, votes and
  -- notifications.
  delete from public.state_members
  where wos_account_id = target_wos_account_id;

  delete from public.wos_accounts
  where id = target_wos_account_id;

  insert into public.notifications (
    user_id, type, title, body, data, state_id, category
  ) values (
    released_account.user_id,
    'wos_account_released',
    'WOS ID removed from your account',
    format(
      'An admin of %s removed WOS ID %s from your account because it was claimed by the wrong user.',
      coalesce(actor_state_name, 'a state'),
      released_account.wos_id
    ),
    jsonb_build_object('wos_id', released_account.wos_id),
    actor_state_id,
    'state'
  );
end;
$$;

alter function public.release_wos_account_claim(uuid, uuid) owner to postgres;
revoke all on function public.release_wos_account_claim(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.release_wos_account_claim(uuid, uuid)
  to service_role;
