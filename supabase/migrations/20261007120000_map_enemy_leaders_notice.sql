-- At 11:00 UTC on battle day, when Live Battle opens, owners, admins and
-- Coordinators are told to map the enemy rally leaders (their likely rally
-- leads come first on Enemy leaders, sorted by Labyrinth score).

create or replace function public.notification_category_for(
  notification_type text,
  notification_data jsonb default '{}'::jsonb
)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select case
    when notification_type = 'battle_result' then
      case when notification_data ->> 'result' = 'win' then 'victory' else 'defeat' end
    when notification_type in (
      'battle_started', 'battle_completed', 'battle_cancelled', 'svs_drawn',
      'attendance_reminder', 'rallies_generated', 'map_enemy_leaders'
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

create or replace function public.automation_advance_battles(
  battle_duration interval default '05:00:00'::interval,
  open_before interval default '01:00:00'::interval
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  changed integer := 0;
  due record;
begin
  for due in
    select b.id, b.state_id, b.name, b.scheduled_at
    from public.battles b
    where b.status = 'scheduled'
      and b.scheduled_at - open_before <= now()
      and b.scheduled_at + battle_duration > now()
    order by b.scheduled_at
  loop
    -- Only one active battle per state.
    continue when exists (
      select 1 from public.battles running
      where running.state_id = due.state_id and running.status = 'active'
    );

    update public.battles
    set status = 'active', started_at = now()
    where id = due.id and status = 'scheduled';

    perform public.queue_account_notification(
      member.wos_account_id,
      'battle_started',
      case when due.scheduled_at > now() then 'Live Battle is open' else 'Battle started' end,
      case when due.scheduled_at > now()
        then due.name || ' starts at ' || to_char(due.scheduled_at at time zone 'utc', 'HH24:MI') || ' UTC. Open Live Battle now to enter your city and the enemy leaders'' coordinates.'
        else due.name || ' is live. Open Garrison for your send times.'
      end,
      jsonb_build_object('battle_id', due.id),
      'battle',
      due.state_id
    )
    from public.state_members member
    where member.state_id = due.state_id;

    -- Opened early (11:00): owners, admins and Coordinators map the enemy
    -- rally leads now, best Labyrinth score first.
    if due.scheduled_at > now() then
      perform public.queue_account_notification(
        mapper.wos_account_id,
        'map_enemy_leaders',
        'Map the enemy rally leaders',
        'Live Battle is open. Add their likely rally leads (best Labyrinth score first) and their city coordinates under Enemy leaders before ' ||
          to_char(due.scheduled_at at time zone 'utc', 'HH24:MI') || ' UTC.',
        jsonb_build_object(
          'battle_id', due.id,
          'battle_name', due.name,
          'battle_start', due.scheduled_at
        ),
        'battle',
        due.state_id
      )
      from (
        select member.wos_account_id
        from public.state_members member
        where member.state_id = due.state_id and member.role in ('owner', 'admin')
        union
        select capability.wos_account_id
        from public.state_member_capabilities capability
        where capability.state_id = due.state_id and capability.capability = 'rally_caller'
      ) mapper;
    end if;

    changed := changed + 1;
  end loop;

  update public.battles
  set status = 'completed', ended_at = now()
  where status = 'active'
    and coalesce(scheduled_at, started_at) + battle_duration <= now();

  -- Scheduled battles whose whole window passed without starting.
  update public.battles
  set status = 'cancelled', ended_at = now()
  where status = 'scheduled'
    and scheduled_at + battle_duration <= now();

  return changed;
end;
$$;

alter function public.automation_advance_battles(interval, interval) owner to postgres;
revoke all on function public.automation_advance_battles(interval, interval) from public, anon, authenticated;
grant execute on function public.automation_advance_battles(interval, interval) to service_role;
