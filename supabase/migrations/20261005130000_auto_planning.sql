-- Pipeline overhaul, part 2: automatic SvS planning.
--
-- After the draw the automation job now takes the plan all the way to a
-- published battle, with admins only reviewing:
--   * T-30h  members who have not voted get a reminder;
--   * T-24h  rally groups are generated: Rally Leads (topped up from the
--            best Labyrinth players who can play), each rallying into the
--            leader's own alliance, with the state's default formation and
--            joiner heroes, then filled by the state's auto-fill priorities;
--   * hourly late voters are added to open rally slots;
--   * T-6h   the plan is published and everyone gets their assignment.
-- Every step can be done earlier by hand, and each one can be switched off
-- per state.

alter table public.states
  add column if not exists auto_plan boolean not null default true,
  add column if not exists auto_publish boolean not null default true,
  add column if not exists rally_count smallint not null default 6
    check (rally_count between 1 and 30),
  add column if not exists rally_size smallint not null default 10
    check (rally_size between 2 and 100),
  add column if not exists default_formation text
    check (default_formation is null or default_formation ~ '^[0-9]{1,3}/[0-9]{1,3}/[0-9]{1,3}$'),
  add column if not exists default_joiner_heroes text[] not null default '{}'
    check (cardinality(default_joiner_heroes) <= 4),
  add column if not exists autofill_priorities text[] not null
    default '{hero_match,equal_power,fc}';

alter table public.battle_plans
  add column if not exists attendance_reminder_sent_at timestamptz,
  add column if not exists auto_planned_at timestamptz;

-- Accounts WOSOracle could not sync are retried a day later instead of
-- blocking the weekly queue.
alter table public.wos_accounts
  add column if not exists player_data_sync_failed_at timestamptz;

-- Admin-only settings for the automation.
create or replace function public.set_state_automation(
  target_state_id uuid,
  settings jsonb
) returns void
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

alter function public.set_state_automation(uuid, jsonb) owner to postgres;
revoke all on function public.set_state_automation(uuid, jsonb) from public, anon;
grant execute on function public.set_state_automation(uuid, jsonb) to authenticated, service_role;

-- New notification types.
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
      'battle_started', 'battle_completed', 'battle_cancelled', 'svs_drawn',
      'attendance_reminder', 'rallies_generated'
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
    when notification_type = 'state_announcement' then 'notice'
    else null
  end;
$$;

-- Publishing: leaders get "you lead X" (they also have an assignment row),
-- and the automation may publish (no signed-in user).
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
  -- auth.uid() is null when the automation publishes on the state's behalf.
  if auth.uid() is not null
     and not public.is_state_admin_account(target_state_id, actor_wos_account_id) then
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
    if recipient.led_group_id is not null then
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
    elsif recipient.group_id is not null then
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

-- Enemy leaders at battle start ------------------------------------------------------
-- When a battle goes live, the opponent's strongest players from the stored
-- intel are added as enemy leaders when their city coordinates are known
-- from an earlier battle, so rally callers start with a ready list.
create or replace function public.seed_enemy_leaders_on_start()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.status <> 'active' or old.status = 'active' or new.plan_id is null then
    return new;
  end if;

  insert into public.enemy_leaders (state_id, battle_id, name, x, y, wos_id, power, alliance_abbr)
  select distinct on (player ->> 'wosId')
    new.state_id,
    new.id,
    left(coalesce(nullif(player ->> 'name', ''), known.name), 60),
    known.x,
    known.y,
    player ->> 'wosId',
    nullif(player ->> 'power', '')::bigint,
    nullif(player ->> 'allianceAbbr', '')
  from public.battle_intel intel
  cross join lateral jsonb_array_elements(coalesce(intel.opponent -> 'topPlayers', '[]'::jsonb)) player
  join lateral (
    select previous.name, previous.x, previous.y
    from public.enemy_leaders previous
    where previous.state_id = new.state_id
      and previous.wos_id = player ->> 'wosId'
    order by previous.created_at desc
    limit 1
  ) known on true
  where intel.plan_id = new.plan_id
    and player ->> 'wosId' is not null
    and not exists (
      select 1 from public.enemy_leaders existing
      where existing.battle_id = new.id and existing.wos_id = player ->> 'wosId'
    )
  order by player ->> 'wosId';

  return new;
end;
$$;

alter function public.seed_enemy_leaders_on_start() owner to postgres;
revoke all on function public.seed_enemy_leaders_on_start() from public, anon, authenticated;

drop trigger if exists battle_seed_enemy_leaders on public.battles;
create trigger battle_seed_enemy_leaders
  after update of status on public.battles
  for each row execute function public.seed_enemy_leaders_on_start();
