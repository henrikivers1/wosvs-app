-- Notifications overhaul.
--
-- * Every notification gets an action category, used by the inbox for its
--   colour and filters. The category is derived from the notification type by
--   a trigger, so older functions that insert notifications keep working.
-- * Every member gets a Victory / Defeat message when the battle result is
--   known (from WOSOracle or set by hand).
-- * Every admin action against a member notifies that member: role changes,
--   removal from the state, capabilities, tags, alliance moves and rally
--   assignment changes on a published plan. Nobody is notified about their
--   own actions, and publishing a plan sends one message per member instead
--   of one per alliance move and tag.

-- 1. Action categories -------------------------------------------------------

alter table public.notifications
  drop constraint if exists notifications_category_check;

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
      'state_invite', 'state_invite_accepted', 'state_invite_approved'
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

update public.notifications
set category = coalesce(
  public.notification_category_for(type, data),
  case when category in ('state', 'social') then 'notice' else category end
);

alter table public.notifications
  add constraint notifications_category_check check (
    category = any (array[
      'victory', 'defeat', 'battle', 'assignment', 'role', 'tag', 'alliance',
      'membership', 'removal', 'comment', 'vote', 'notice',
      -- Older categories, still accepted from callers that pass them.
      'state', 'social'
    ])
  );

create or replace function public.categorize_notification()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  new.category := coalesce(
    public.notification_category_for(new.type, new.data),
    case when new.category in ('state', 'social') then 'notice' else new.category end
  );
  return new;
end;
$$;

drop trigger if exists notifications_categorize on public.notifications;
create trigger notifications_categorize
  before insert or update of type, data on public.notifications
  for each row execute function public.categorize_notification();

-- 2. Helpers -----------------------------------------------------------------

-- Bulk operations (publishing a plan) send their own summary message and mute
-- the per-row action triggers for the rest of the transaction.
create or replace function public.member_notifications_muted()
returns boolean
language sql
stable
as $$
  select coalesce(current_setting('wosoverwatch.mute_member_notifications', true), '') = 'on';
$$;

create or replace function public.account_display_name(target_wos_account_id uuid)
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(nullif(btrim(nickname), ''), 'WOS ID ' || wos_id)
  from public.wos_accounts
  where id = target_wos_account_id;
$$;

-- Notify the owner of a WOS account about something done to it. Skips the
-- person who performed the action and accounts that no longer exist.
create or replace function public.notify_member_action(
  target_wos_account_id uuid,
  notification_type text,
  notification_title text,
  notification_body text,
  notification_data jsonb,
  target_state_id uuid
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  target_user_id uuid;
begin
  select user_id into target_user_id
  from public.wos_accounts
  where id = target_wos_account_id;

  if target_user_id is null or target_user_id = auth.uid() then
    return;
  end if;

  perform public.queue_account_notification(
    target_wos_account_id,
    notification_type,
    notification_title,
    notification_body,
    coalesce(notification_data, '{}'::jsonb) ||
      jsonb_build_object('actor_user_id', auth.uid()),
    'notice',
    target_state_id
  );
end;
$$;

-- 3. Battle end: Victory / Defeat for every member -----------------------------

create or replace function public.notify_battle_status_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  state_name text;
  opponent integer;
  versus text;
begin
  select s.name into state_name from public.states s where s.id = new.state_id;
  select plan.opponent_state_number into opponent
  from public.battle_plans plan
  where plan.id = new.plan_id;
  versus := case when opponent is not null then ' against State ' || opponent else '' end;

  -- The result is known: one Victory / Defeat message per member, replacing
  -- the "battle over" message they may already have.
  if new.status = 'completed'
     and new.result is not null
     and (old.status is distinct from 'completed' or old.result is distinct from new.result) then
    delete from public.notifications
    where type in ('battle_completed', 'battle_result')
      and data ->> 'battle_id' = new.id::text;

    perform public.queue_account_notification(
      member.wos_account_id,
      'battle_result',
      case when new.result = 'win'
        then 'Victory! We won' || versus
        else 'Defeat' || versus end,
      case when new.result = 'win'
        then 'Hi ' || public.account_display_name(member.wos_account_id) || ', ' ||
          coalesce(state_name, 'your state') || ' won ' || new.name ||
          '. Thank you for fighting!'
        else 'Hi ' || public.account_display_name(member.wos_account_id) || ', ' ||
          coalesce(state_name, 'your state') || ' lost ' || new.name ||
          '. Thank you for fighting, we regroup for the next SvS.' end,
      jsonb_build_object(
        'battle_id', new.id,
        'plan_id', new.plan_id,
        'result', new.result,
        'opponent_state', opponent,
        'battle_name', new.name,
        'state_name', state_name,
        'player', public.account_display_name(member.wos_account_id)
      ),
      'notice',
      new.state_id
    )
    from public.state_members member
    where member.state_id = new.state_id;
    return new;
  end if;

  if new.status = old.status or new.status not in ('completed', 'cancelled') then
    return new;
  end if;

  perform public.queue_account_notification(
    member.wos_account_id,
    case when new.status = 'completed' then 'battle_completed' else 'battle_cancelled' end,
    case when new.status = 'completed' then 'Battle over' else 'Battle cancelled' end,
    case when new.status = 'completed'
      then new.name || ' has ended. The win or loss follows as soon as the result is in.'
      else new.name || ' was cancelled.' end,
    jsonb_build_object(
      'battle_id', new.id,
      'plan_id', new.plan_id,
      'battle_name', new.name
    ),
    'notice',
    new.state_id
  )
  from public.state_members member
  where member.state_id = new.state_id;

  return new;
end;
$$;

drop trigger if exists battle_status_notification on public.battles;
create trigger battle_status_notification
  after update of status, result on public.battles
  for each row execute function public.notify_battle_status_change();

-- 4. Membership: role changes and removal --------------------------------------

create or replace function public.notify_state_member_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  state_name text;
  role_rank_old integer;
  role_rank_new integer;
begin
  if tg_op = 'UPDATE' then
    if new.role = old.role then
      return new;
    end if;
    select name into state_name from public.states where id = new.state_id;
    role_rank_old := array_position(array['member', 'admin', 'owner'], old.role);
    role_rank_new := array_position(array['member', 'admin', 'owner'], new.role);
    perform public.notify_member_action(
      new.wos_account_id,
      'member_role_changed',
      case when role_rank_new > role_rank_old
        then 'Promoted to ' || new.role
        else 'Role changed to ' || new.role end,
      public.account_display_name(new.wos_account_id) || ' is now ' ||
        case when new.role = 'admin' then 'an ' else 'a ' end || new.role ||
        ' of ' || coalesce(state_name, 'the state') || ' (was ' || old.role || ').',
      jsonb_build_object(
        'old_role', old.role,
        'new_role', new.role,
        'direction', case when role_rank_new > role_rank_old then 'up' else 'down' end,
        'state_name', state_name,
        'player', public.account_display_name(new.wos_account_id)
      ),
      new.state_id
    );
    return new;
  end if;

  -- DELETE. Releasing a WOS ID deletes the account too and sends its own
  -- message; deleting the state removes everybody at once.
  select name into state_name from public.states where id = old.state_id;
  if state_name is null
     or not exists (select 1 from public.wos_accounts where id = old.wos_account_id) then
    return old;
  end if;

  perform public.notify_member_action(
    old.wos_account_id,
    'member_removed',
    'Removed from ' || state_name,
    public.account_display_name(old.wos_account_id) ||
      ' was removed from ' || state_name || ' by an admin.',
    jsonb_build_object(
      'role', old.role,
      'state_name', state_name,
      'player', public.account_display_name(old.wos_account_id)
    ),
    old.state_id
  );
  return old;
end;
$$;

drop trigger if exists state_member_change_notification on public.state_members;
create trigger state_member_change_notification
  after update of role or delete on public.state_members
  for each row execute function public.notify_state_member_change();

-- 5. Capabilities (rally caller, garrison) -------------------------------------

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
  if tg_op = 'DELETE' and not exists (
    select 1 from public.state_members
    where state_id = row_state_id and wos_account_id = row_account_id
  ) then
    return old;
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

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists state_capability_notification on public.state_member_capabilities;
create trigger state_capability_notification
  after insert or delete on public.state_member_capabilities
  for each row execute function public.notify_state_capability_change();

-- 6. Tags ----------------------------------------------------------------------

create or replace function public.notify_state_tag_awarded()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  row_record public.state_member_tags%rowtype;
  tag_row public.state_tags%rowtype;
  state_name text;
begin
  if tg_op = 'DELETE' then
    row_record := old;
  else
    row_record := new;
  end if;

  -- Rally and hero tags from a published plan are covered by the plan message.
  if row_record.source = 'battle_plan' or public.member_notifications_muted() then
    return row_record;
  end if;

  select * into tag_row from public.state_tags where id = row_record.tag_id;
  if tag_row.id is null or not exists (
    select 1 from public.state_members
    where state_id = tag_row.state_id and wos_account_id = row_record.wos_account_id
  ) then
    return row_record;
  end if;
  select name into state_name from public.states where id = tag_row.state_id;

  perform public.notify_member_action(
    row_record.wos_account_id,
    case when tg_op = 'INSERT' then 'state_tag_awarded' else 'state_tag_removed' end,
    case
      when tg_op = 'INSERT' and tag_row.system_key = 'rally_lead'
        then 'You are a Rally Lead'
      when tg_op = 'INSERT' then 'New tag: ' || tag_row.name
      else 'Tag removed: ' || tag_row.name end,
    case when tg_op = 'INSERT'
      then public.account_display_name(row_record.wos_account_id) || ' gained the ' ||
        tag_row.name || ' tag in ' || coalesce(state_name, 'the state') || '.'
      else public.account_display_name(row_record.wos_account_id) || ' lost the ' ||
        tag_row.name || ' tag in ' || coalesce(state_name, 'the state') || '.' end,
    jsonb_build_object(
      'tag_id', tag_row.id,
      'tag_color', tag_row.color,
      'tag_name', tag_row.name,
      'rally_lead', tag_row.system_key = 'rally_lead',
      'source', row_record.source,
      'state_name', state_name,
      'player', public.account_display_name(row_record.wos_account_id)
    ),
    tag_row.state_id
  );
  return row_record;
end;
$$;

drop trigger if exists state_member_tag_awarded_notification on public.state_member_tags;
create trigger state_member_tag_awarded_notification
  after insert or delete on public.state_member_tags
  for each row execute function public.notify_state_tag_awarded();

-- 7. Alliance moves --------------------------------------------------------------

create or replace function public.notify_state_alliance_assignment()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  row_state_id uuid := coalesce(new.state_id, old.state_id);
  row_account_id uuid := coalesce(new.wos_account_id, old.wos_account_id);
  alliance_name text;
  state_name text;
begin
  if public.member_notifications_muted()
     or (tg_op = 'UPDATE' and new.alliance_id = old.alliance_id) then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  select name into state_name from public.states where id = row_state_id;

  if tg_op = 'DELETE' then
    select name into alliance_name from public.state_alliances where id = old.alliance_id;
    -- Removed together with the membership or the alliance itself.
    if alliance_name is null or not exists (
      select 1 from public.state_members
      where state_id = row_state_id and wos_account_id = row_account_id
    ) then
      return old;
    end if;
    perform public.notify_member_action(
      row_account_id,
      'state_alliance_removed',
      'Removed from ' || alliance_name,
      public.account_display_name(row_account_id) || ' is no longer assigned to ' ||
        alliance_name || ' in ' || coalesce(state_name, 'the state') || '.',
      jsonb_build_object(
        'alliance_id', old.alliance_id,
        'alliance_name', alliance_name,
        'state_name', state_name,
        'player', public.account_display_name(row_account_id)
      ),
      row_state_id
    );
    return old;
  end if;

  select name into alliance_name from public.state_alliances where id = new.alliance_id;
  perform public.notify_member_action(
    row_account_id,
    'state_alliance_assigned',
    case when tg_op = 'UPDATE' then 'Moved to ' else 'Assigned to ' end ||
      coalesce(alliance_name, 'an alliance'),
    public.account_display_name(row_account_id) || ' is now in ' ||
      coalesce(alliance_name, 'an alliance') || ' in ' ||
      coalesce(state_name, 'the state') || '.',
    jsonb_build_object(
      'alliance_id', new.alliance_id,
      'alliance_name', alliance_name,
      'moved', tg_op = 'UPDATE',
      'state_name', state_name,
      'player', public.account_display_name(row_account_id)
    ),
    row_state_id
  );
  return new;
end;
$$;

drop trigger if exists state_alliance_assignment_notification on public.state_alliance_members;
create trigger state_alliance_assignment_notification
  after insert or delete or update on public.state_alliance_members
  for each row execute function public.notify_state_alliance_assignment();

-- 8. Rally assignment changes after a plan is published -------------------------

create or replace function public.notify_battle_plan_assignment_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  row_record public.battle_plan_assignments%rowtype;
  plan_row public.battle_plans%rowtype;
  group_row public.battle_plan_groups%rowtype;
  alliance_name text;
  battle_start text;
  formation text;
begin
  if tg_op = 'DELETE' then
    row_record := old;
  else
    row_record := new;
  end if;

  if public.member_notifications_muted() then
    return row_record;
  end if;
  if tg_op = 'UPDATE'
     and new.group_id = old.group_id
     and new.hero is not distinct from old.hero
     and new.formation is not distinct from old.formation then
    return new;
  end if;

  -- Only published plans: drafts are announced once, when they are published.
  -- A deleted plan takes its assignments with it without a message.
  select * into plan_row from public.battle_plans where id = row_record.plan_id;
  if plan_row.id is null or plan_row.status <> 'published' then
    return row_record;
  end if;
  if tg_op = 'DELETE' and not exists (
    select 1 from public.state_members
    where state_id = row_record.state_id and wos_account_id = row_record.wos_account_id
  ) then
    return old;
  end if;

  -- Keep one change message per player and plan: the latest one.
  delete from public.notifications
  where type in ('battle_plan_assignment_changed', 'battle_plan_assignment_removed')
    and read_at is null
    and data ->> 'plan_id' = row_record.plan_id::text
    and wos_account_id = row_record.wos_account_id;

  select * into group_row from public.battle_plan_groups where id = row_record.group_id;
  battle_start := to_char(plan_row.scheduled_at at time zone 'UTC', 'Mon DD, HH24:MI') || ' UTC';

  if tg_op = 'DELETE' then
    if group_row.id is null then
      return old;
    end if;
    perform public.notify_member_action(
      old.wos_account_id,
      'battle_plan_assignment_removed',
      'Removed from ' || group_row.name,
      'Hi ' || public.account_display_name(old.wos_account_id) ||
        ', you are no longer in ' || group_row.name || ' for ' || plan_row.name ||
        ' (' || battle_start || ').',
      jsonb_build_object(
        'plan_id', plan_row.id,
        'plan_name', plan_row.name,
        'group_id', group_row.id,
        'group_name', group_row.name,
        'battle_start', plan_row.scheduled_at,
        'player', public.account_display_name(old.wos_account_id)
      ),
      plan_row.state_id
    );
    return old;
  end if;

  select name into alliance_name from public.state_alliances where id = group_row.alliance_id;
  formation := coalesce(new.formation, group_row.formation);

  perform public.notify_member_action(
    new.wos_account_id,
    'battle_plan_assignment_changed',
    case when tg_op = 'INSERT'
      then 'Your rally assignment'
      else 'Your rally assignment changed' end,
    'Hi ' || public.account_display_name(new.wos_account_id) ||
      ', you''ve been assigned to ' || group_row.name || ' in ' ||
      coalesce(alliance_name, 'an alliance not yet selected') || '.' ||
      case
        when new.hero is not null and formation is not null then
          ' You''re joining with ' || new.hero || ' and ' || formation || ' formation.'
        when new.hero is not null then ' You''re joining with ' || new.hero || '.'
        when formation is not null then ' Use ' || formation || ' formation.'
        else ''
      end ||
      ' Please be there by battle start (' || battle_start || ').',
    jsonb_build_object(
      'plan_id', plan_row.id,
      'group_id', group_row.id,
      'group_name', group_row.name,
      'alliance_id', group_row.alliance_id,
      'alliance_name', alliance_name,
      'hero', new.hero,
      'formation', formation,
      'changed', tg_op = 'UPDATE',
      'battle_start', plan_row.scheduled_at,
      'player', public.account_display_name(new.wos_account_id)
    ),
    plan_row.state_id
  );
  return new;
end;
$$;

drop trigger if exists battle_plan_assignment_notification on public.battle_plan_assignments;
create trigger battle_plan_assignment_notification
  after insert or update or delete on public.battle_plan_assignments
  for each row execute function public.notify_battle_plan_assignment_change();

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.categorize_notification()',
    'public.notify_battle_status_change()',
    'public.notify_state_member_change()',
    'public.notify_state_capability_change()',
    'public.notify_state_tag_awarded()',
    'public.notify_state_alliance_assignment()',
    'public.notify_battle_plan_assignment_change()',
    'public.notify_member_action(uuid, text, text, text, jsonb, uuid)',
    'public.account_display_name(uuid)'
  ] loop
    execute format('alter function %s owner to postgres', fn);
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;

-- 9. Publishing: one message per member ------------------------------------------

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

  -- Alliance moves and plan tags made while publishing are summed up in the
  -- one message below instead of a notification each.
  perform set_config('wosoverwatch.mute_member_notifications', 'on', true);
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
      coalesce(assignment.formation, plan_group.formation) as formation,
      assignment.hero,
      alliance.id as alliance_id,
      alliance.name as alliance_name,
      led_group.id as led_group_id,
      led_group.name as led_group_name,
      led_alliance.name as led_alliance_name
    from public.state_members member
    join public.wos_accounts account on account.id = member.wos_account_id
    left join public.battle_plan_assignments assignment
      on assignment.plan_id = target_plan_id
      and assignment.wos_account_id = member.wos_account_id
    left join public.battle_plan_groups plan_group on plan_group.id = assignment.group_id
    left join public.state_alliances alliance on alliance.id = plan_group.alliance_id
    left join lateral (
      select g.id, g.name, g.alliance_id
      from public.battle_plan_groups g
      where g.plan_id = target_plan_id
        and g.leader_wos_account_id = member.wos_account_id
      order by g.sort_order
      limit 1
    ) led_group on true
    left join public.state_alliances led_alliance on led_alliance.id = led_group.alliance_id
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
          'group_name', recipient.group_name,
          'alliance_id', recipient.alliance_id,
          'alliance_name', recipient.alliance_name,
          'hero', recipient.hero,
          'formation', recipient.formation,
          'battle_start', target_scheduled_at,
          'player', recipient.player_name
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
    elsif recipient.led_group_id is not null then
      perform public.queue_account_notification(
        recipient.wos_account_id,
        'battle_plan_assignment',
        'You lead a rally',
        'Hi ' || recipient.player_name || ', you''re leading ' ||
          recipient.led_group_name || ' in ' ||
          coalesce(recipient.led_alliance_name, 'an alliance not yet selected') ||
          '. Please be there by battle start (' || battle_start || ').',
        jsonb_build_object(
          'plan_id', target_plan_id,
          'battle_id', target_battle_id,
          'group_id', recipient.led_group_id,
          'group_name', recipient.led_group_name,
          'alliance_name', recipient.led_alliance_name,
          'leader', true,
          'battle_start', target_scheduled_at,
          'player', recipient.player_name
        ),
        'battle',
        target_state_id
      );
    else
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
    end if;
    notification_count := notification_count + 1;
  end loop;

  perform set_config('wosoverwatch.mute_member_notifications', 'off', true);
  return notification_count;
end;
$$;

alter function public.publish_battle_plan_with_notifications(uuid, uuid) owner to postgres;
revoke all on function public.publish_battle_plan_with_notifications(uuid, uuid) from public, anon;
grant execute on function public.publish_battle_plan_with_notifications(uuid, uuid)
  to authenticated, service_role;
