-- Opponent intel stored by the automation job, and the SvS attendance vote.

create table if not exists public.battle_intel (
  plan_id uuid primary key references public.battle_plans (id) on delete cascade,
  state_id uuid not null references public.states (id) on delete cascade,
  opponent_state integer not null,
  opponent jsonb not null default '{}'::jsonb,
  opponent_svs jsonb not null default '{}'::jsonb,
  own jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now()
);
alter table public.battle_intel enable row level security;
revoke all on table public.battle_intel from anon, authenticated;
grant select on table public.battle_intel to authenticated;
drop policy if exists "members read battle intel" on public.battle_intel;
create policy "members read battle intel" on public.battle_intel
  for select to authenticated using (public.is_state_member(state_id));

create table if not exists public.battle_attendance (
  plan_id uuid not null references public.battle_plans (id) on delete cascade,
  state_id uuid not null references public.states (id) on delete cascade,
  wos_account_id uuid not null references public.wos_accounts (id) on delete cascade,
  availability text not null
    check (availability in ('whole', 'first_half', 'second_half', 'unavailable')),
  voice_call boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (plan_id, wos_account_id)
);
create index if not exists battle_attendance_state_idx
  on public.battle_attendance (state_id);
alter table public.battle_attendance enable row level security;
revoke all on table public.battle_attendance from anon, authenticated;
grant select on table public.battle_attendance to authenticated;
drop policy if exists "members read attendance" on public.battle_attendance;
create policy "members read attendance" on public.battle_attendance
  for select to authenticated using (public.is_state_member(state_id));

-- A member answers for one of their own WOS accounts until the battle ends.
create or replace function public.set_battle_attendance(
  target_plan_id uuid,
  target_wos_account_id uuid,
  selected_availability text,
  joins_voice boolean
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  plan_state_id uuid;
  plan_starts_at timestamptz;
begin
  select state_id, scheduled_at into plan_state_id, plan_starts_at
  from public.battle_plans
  where id = target_plan_id;

  if plan_state_id is null then
    raise exception 'Battle plan not found.';
  end if;
  if not public.owns_wos_account(target_wos_account_id) then
    raise exception 'You can only answer for your own WOS account.';
  end if;
  if not exists (
    select 1 from public.state_members
    where state_id = plan_state_id and wos_account_id = target_wos_account_id
  ) then
    raise exception 'This WOS account is not in this state.';
  end if;
  if plan_starts_at + interval '5 hours' <= now() then
    raise exception 'This battle is over.';
  end if;
  if selected_availability not in ('whole', 'first_half', 'second_half', 'unavailable') then
    raise exception 'Choose when you can play.';
  end if;

  insert into public.battle_attendance (
    plan_id, state_id, wos_account_id, availability, voice_call, updated_at
  ) values (
    target_plan_id, plan_state_id, target_wos_account_id,
    selected_availability, coalesce(joins_voice, false), now()
  )
  on conflict (plan_id, wos_account_id) do update set
    availability = excluded.availability,
    voice_call = excluded.voice_call,
    updated_at = now();
end;
$$;

alter function public.set_battle_attendance(uuid, uuid, text, boolean) owner to postgres;
revoke all on function public.set_battle_attendance(uuid, uuid, text, boolean)
  from public, anon;
grant execute on function public.set_battle_attendance(uuid, uuid, text, boolean)
  to authenticated, service_role;

-- The draw notification now asks members to vote their availability.
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
        ' UTC. Open Overwatch to vote when you can play.',
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

-- The upcoming (or live) SvS plan for members, who cannot read draft plans.
create or replace function public.get_upcoming_svs(target_state_id uuid)
returns table (plan_id uuid, opponent_state integer, battle_at timestamptz)
language sql
stable
security definer
set search_path to 'public'
as $$
  select plan.id, plan.opponent_state_number, plan.scheduled_at
  from public.battle_plans plan
  where plan.state_id = target_state_id
    and plan.battle_type = 'svs'
    and plan.scheduled_at + interval '5 hours' > now()
    and public.is_state_member(target_state_id)
  order by plan.scheduled_at
  limit 1;
$$;

alter function public.get_upcoming_svs(uuid) owner to postgres;
revoke all on function public.get_upcoming_svs(uuid) from public, anon;
grant execute on function public.get_upcoming_svs(uuid)
  to authenticated, service_role;
