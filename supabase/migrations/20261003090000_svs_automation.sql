-- SvS automation: stored WOSOracle draw data per state, automatically
-- created SvS plans/battles, and a daily WOSOracle request counter.

alter table public.states
  add column if not exists svs_season integer,
  add column if not exists svs_opponent integer,
  add column if not exists svs_battle_at timestamptz,
  add column if not exists svs_draw_expected_at timestamptz,
  add column if not exists svs_next_battle_at timestamptz,
  add column if not exists oracle_checked_at timestamptz;

alter table public.battle_plans
  add column if not exists auto_created boolean not null default false;

-- Last time automation asked WOSOracle for this battle's SvS result.
alter table public.battles
  add column if not exists result_checked_at timestamptz;

-- One automatic plan per state and battle time.
create unique index if not exists battle_plans_auto_svs_unique
  on public.battle_plans (state_id, scheduled_at)
  where auto_created;

-- WOSOracle requests per UTC day, so automation stays inside the plan quota.
create table if not exists public.oracle_usage (
  day date primary key,
  requests integer not null default 0
);
alter table public.oracle_usage enable row level security;
revoke all on table public.oracle_usage from anon, authenticated;

create or replace function public.count_oracle_request()
returns integer
language sql
security definer
set search_path to 'public'
as $$
  insert into public.oracle_usage (day, requests)
  values ((now() at time zone 'utc')::date, 1)
  on conflict (day) do update set requests = public.oracle_usage.requests + 1
  returning requests;
$$;

-- Creates (or updates) the automatic SvS plan for a drawn battle and its
-- scheduled battle row, and tells every member about the draw once.
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
        ' UTC.',
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

-- Starts scheduled battles whose time has come and ends active ones after
-- the 5-hour SvS battle window. Returns how many battles changed.
create or replace function public.automation_advance_battles(
  battle_duration interval default interval '5 hours'
) returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  changed integer := 0;
  due record;
begin
  for due in
    select b.id, b.state_id, b.name
    from public.battles b
    where b.status = 'scheduled'
      and b.scheduled_at <= now()
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
      'Battle started',
      due.name || ' is live. Open Garrison for your send times.',
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

create or replace function public.automation_set_battle_result(
  target_battle_id uuid,
  battle_result text
) returns void
language sql
security definer
set search_path to 'public'
as $$
  update public.battles
  set result = battle_result
  where id = target_battle_id
    and status = 'completed'
    and battle_result in ('win', 'loss');
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.count_oracle_request()',
    'public.automation_ensure_svs_plan(uuid, integer, timestamptz)',
    'public.automation_advance_battles(interval)',
    'public.automation_set_battle_result(uuid, text)'
  ] loop
    execute format('alter function %s owner to postgres', fn);
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
