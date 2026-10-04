-- Live Battle opens an hour before the 12:00 UTC start, so garrison players
-- can enter their city and coordinators their enemy leaders' coordinates in
-- time. The battle itself (timing, end at 17:00, result) still counts from
-- scheduled_at.

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

-- The old one-argument version would stay callable next to the new one.
drop function if exists public.automation_advance_battles(interval);

alter function public.automation_advance_battles(interval, interval) owner to postgres;
revoke all on function public.automation_advance_battles(interval, interval) from public, anon, authenticated;
grant execute on function public.automation_advance_battles(interval, interval) to service_role;
