-- Automatic join requests.
--
-- When a WOS account is first synced from WOSOracle, or its in-game state
-- changes (a transfer), and its state number matches a state in the app (states.game_state_number), a join request is
-- created for that state. It uses the existing invite flow at the
-- "pending_owner" step, so owners and admins approve or reject it in State
-- management exactly like an accepted invitation. Nobody joins without
-- approval, because anyone can type any WOS ID.

create or replace function public.request_state_join_for_account(
  target_wos_account_id uuid
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  account public.wos_accounts%rowtype;
  target_state public.states%rowtype;
  open_invite public.state_invites%rowtype;
  request_id uuid;
  player_name text;
begin
  select * into account from public.wos_accounts where id = target_wos_account_id;
  if account.id is null or account.state_number is null then
    return jsonb_build_object('status', 'no_state');
  end if;

  -- The oldest app state for this in-game state number.
  select * into target_state
  from public.states
  where game_state_number = account.state_number
  order by created_at
  limit 1;
  if target_state.id is null then
    return jsonb_build_object('status', 'no_app_state', 'state_number', account.state_number);
  end if;

  if exists (
    select 1 from public.state_members
    where state_id = target_state.id and wos_account_id = account.id
  ) then
    return jsonb_build_object(
      'status', 'member', 'state_id', target_state.id, 'state_name', target_state.name
    );
  end if;

  -- An open invite or request already exists: nothing new to send. A
  -- rejected request is not repeated; an admin can still invite the player.
  select * into open_invite
  from public.state_invites
  where state_id = target_state.id
    and invited_wos_account_id = account.id
    and (
      (status in ('pending_recipient', 'pending_owner') and expires_at > now())
      or status = 'rejected'
    )
  order by created_at desc
  limit 1;
  if open_invite.id is not null then
    return jsonb_build_object(
      'status', case open_invite.status
        when 'rejected' then 'rejected'
        when 'pending_recipient' then 'invited'
        else 'pending' end,
      'state_id', target_state.id,
      'state_name', target_state.name
    );
  end if;

  insert into public.state_invites (
    state_id, created_by, invited_wos_account_id, status,
    recipient_responded_at, expires_at
  ) values (
    target_state.id, account.user_id, account.id, 'pending_owner',
    now(), now() + interval '14 days'
  )
  returning id into request_id;

  player_name := coalesce(nullif(btrim(account.nickname), ''), 'WOS ID ' || account.wos_id);

  -- Every owner/admin user once, even with several admin accounts.
  insert into public.notifications (user_id, state_id, type, title, body, data)
  select distinct on (admin_account.user_id)
    admin_account.user_id,
    target_state.id,
    'state_join_request',
    'Join request: ' || player_name,
    player_name || ' (WOS ID ' || account.wos_id || ', state ' ||
      account.state_number || ') wants to join ' || target_state.name ||
      '. Review the request in State management.',
    jsonb_build_object(
      'invite_id', request_id,
      'state_id', target_state.id,
      'state_name', target_state.name,
      'player', player_name,
      'wos_id', account.wos_id,
      'requester_wos_account_id', account.id
    )
  from public.state_members admin_member
  join public.wos_accounts admin_account on admin_account.id = admin_member.wos_account_id
  where admin_member.state_id = target_state.id
    and admin_member.role in ('owner', 'admin')
    and admin_account.user_id <> account.user_id;

  perform public.queue_account_notification(
    account.id,
    'state_join_requested',
    'Join request sent',
    player_name || ' is in state ' || account.state_number || ', so a request to join ' ||
      target_state.name || ' was sent. An owner or admin will review it.',
    jsonb_build_object(
      'invite_id', request_id,
      'state_name', target_state.name,
      'state_number', account.state_number,
      'player', player_name
    ),
    'notice',
    target_state.id
  );

  return jsonb_build_object(
    'status', 'requested',
    'state_id', target_state.id,
    'state_name', target_state.name
  );
end;
$$;

alter function public.request_state_join_for_account(uuid) owner to postgres;
revoke all on function public.request_state_join_for_account(uuid)
  from public, anon, authenticated;
grant execute on function public.request_state_join_for_account(uuid) to service_role;

-- Owners and admins (not only owners) can see who is asking to join.
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
        and public.is_state_admin(invitation.state_id)
    );
$$;

-- Categories for the two new notification types.
create or replace function public.notification_category_for(
  notification_type text,
  notification_data jsonb default '{}'::jsonb
) returns text
language sql
immutable
set search_path to 'public'
as $$
  select case
    when notification_type = 'battle_result' then
      case when notification_data ->> 'result' = 'win' then 'victory' else 'defeat' end
    when notification_type in (
      'battle_started', 'battle_completed', 'battle_cancelled', 'svs_drawn'
    ) then 'battle'
    when notification_type in (
      'battle_plan_assignment', 'battle_plan_published', 'battle_plan_assignment_changed'
    ) then 'assignment'
    when notification_type = 'member_role_changed' then 'role'
    when notification_type = 'capability_granted' then 'role'
    when notification_type = 'state_tag_awarded' then 'tag'
    when notification_type = 'state_alliance_assigned' then 'alliance'
    when notification_type in (
      'state_invite', 'state_invite_accepted', 'state_invite_approved',
      'state_join_request', 'state_join_requested'
    ) then 'membership'
    when notification_type in (
      'battle_plan_assignment_removed', 'capability_revoked', 'state_tag_removed',
      'state_alliance_removed', 'member_removed', 'wos_account_released',
      'state_invite_rejected'
    ) then 'removal'
    when notification_type in (
      'battle_plan_comment', 'battle_plan_comment_mention'
    ) then 'comment'
    when notification_type = 'state_poll_created' then 'vote'
    when notification_type = 'state_announcement' then 'notice'
    else null
  end;
$$;
