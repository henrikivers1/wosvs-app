-- V1 fixes: Labyrinth on enemy leaders, late "can't join" alerts, pet block
-- swap reminders, members who left the in-game state, ownership handover,
-- results set by hand, and a paid-until date per state.

-- Enemy leaders keep their Labyrinth score ----------------------------------

alter table public.enemy_leaders
  add column if not exists labyrinth_score bigint;

-- Known leaders come back at 11:00 with their coordinates and Labyrinth score.
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

  insert into public.enemy_leaders (state_id, battle_id, name, x, y, wos_id, power, alliance_abbr, labyrinth_score)
  select distinct on (player ->> 'wosId')
    new.state_id,
    new.id,
    left(coalesce(nullif(player ->> 'name', ''), known.name), 60),
    known.x,
    known.y,
    player ->> 'wosId',
    nullif(player ->> 'power', '')::bigint,
    nullif(player ->> 'allianceAbbr', ''),
    coalesce(nullif(player ->> 'labyrinthScore', '')::bigint, known.labyrinth_score)
  from public.battle_intel intel
  cross join lateral jsonb_array_elements(coalesce(intel.opponent -> 'topPlayers', '[]'::jsonb)) player
  join lateral (
    select previous.name, previous.x, previous.y, previous.labyrinth_score
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

-- A late "can't join" on a published plan ------------------------------------

-- Same rules as canPlayShift (lib/autofill.ts) and blockFits (lib/castle.ts).
create or replace function public.availability_fits_group(availability text, group_kind text, group_shift text)
returns boolean
language sql
immutable
set search_path to 'public'
as $$
  select case
    when availability is null or availability = 'unavailable' then false
    when group_kind = 'garrison' then availability = 'whole'
    when availability = 'whole' then true
    when group_shift = 'first_half' then availability = 'first_half'
    when group_shift = 'second_half' then availability = 'second_half'
    else availability in ('first_half', 'second_half')
  end;
$$;

create or replace function public.availability_fits_blocks(availability text, rotation uuid[], member uuid)
returns boolean
language sql
immutable
set search_path to 'public'
as $$
  select coalesce(bool_and(
    case
      when availability = 'whole' then true
      when availability = 'first_half' then block = 1
      when availability = 'second_half' then block > 1
      else false
    end
  ), true)
  from unnest(rotation) with ordinality as slot(lead, block)
  where slot.lead = member;
$$;

-- When someone in a published plan changes to an answer their spot no longer
-- fits (a joiner, the garrison, or a lead or holder for a pet block), owners
-- and admins are told so they can move them or fill the seat.
create or replace function public.notify_late_attendance_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  plan record;
  spot record;
  fits_now boolean;
  fit_before boolean;
  spot_role text;
  player text;
begin
  if tg_op = 'UPDATE' and old.availability is not distinct from new.availability then
    return new;
  end if;
  select id, state_id, name, status, scheduled_at into plan
  from public.battle_plans where id = new.plan_id;
  if plan.status <> 'published' or plan.scheduled_at + interval '5 hours' <= now() then
    return new;
  end if;

  select g.name, g.kind, g.shift into spot
  from public.battle_plan_assignments a
  join public.battle_plan_groups g on g.id = a.group_id
  where a.plan_id = new.plan_id and a.wos_account_id = new.wos_account_id;
  if found then
    spot_role := case when spot.kind = 'garrison' then 'garrison' else 'joiner' end;
    fits_now := public.availability_fits_group(new.availability, spot.kind, spot.shift);
    fit_before := tg_op = 'UPDATE' and public.availability_fits_group(old.availability, spot.kind, spot.shift);
  else
    select g.name, g.kind, g.lead_rotation into spot
    from public.battle_plan_groups g
    where g.plan_id = new.plan_id
      and (new.wos_account_id = any(g.lead_rotation) or g.leader_wos_account_id = new.wos_account_id)
    order by g.sort_order
    limit 1;
    if not found then
      return new;
    end if;
    spot_role := case when spot.kind = 'garrison' then 'castle_holder' else 'rally_lead' end;
    fits_now := new.availability <> 'unavailable'
      and public.availability_fits_blocks(new.availability, spot.lead_rotation, new.wos_account_id);
    fit_before := tg_op = 'UPDATE' and old.availability <> 'unavailable'
      and public.availability_fits_blocks(old.availability, spot.lead_rotation, new.wos_account_id);
  end if;

  -- Only when the answer stops fitting, not on every later change.
  if fits_now or (tg_op = 'UPDATE' and not fit_before) then
    return new;
  end if;

  player := public.account_display_name(new.wos_account_id);
  perform public.queue_account_notification(
    admin_member.wos_account_id,
    'attendance_conflict',
    player || ' can''t play their spot anymore',
    player || ' changed their vote to ' || replace(new.availability, '_', ' ') || ' but is in ' || spot.name ||
      '. Open Planning to move them or fill the seat.',
    jsonb_build_object(
      'plan_id', plan.id,
      'player', player,
      'group_name', spot.name,
      'availability', new.availability,
      'role', spot_role
    ),
    'battle',
    plan.state_id
  )
  from public.state_members admin_member
  where admin_member.state_id = plan.state_id
    and admin_member.role in ('owner', 'admin')
    and admin_member.wos_account_id <> new.wos_account_id;
  return new;
end;
$$;

drop trigger if exists battle_attendance_late_change on public.battle_attendance;
create trigger battle_attendance_late_change
  after insert or update of availability on public.battle_attendance
  for each row execute function public.notify_late_attendance_change();

-- Pet block swap reminders ----------------------------------------------------

-- Which block reminders went out, so each goes once.
create table if not exists public.battle_plan_reminders (
  plan_id uuid not null references public.battle_plans(id) on delete cascade,
  block smallint not null,
  sent_at timestamptz not null default now(),
  primary key (plan_id, block)
);
alter table public.battle_plan_reminders enable row level security;
revoke all on public.battle_plan_reminders from anon, authenticated;

-- Five minutes before each pet block (12:00, 14:00, 16:00 UTC), the Rally
-- Lead or Castle Holder who takes over that block is reminded. A lead who
-- keeps the next block too is not reminded again.
create or replace function public.automation_pet_swap_reminders(
  lead_time interval default '00:05:00'::interval
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  due record;
  grp record;
  incoming uuid;
  outgoing uuid;
  block_start timestamptz;
  sent integer := 0;
begin
  for due in
    select p.id, p.state_id, p.scheduled_at, block.n
    from public.battle_plans p
    cross join (values (0), (1), (2)) as block(n)
    where p.status = 'published'
      and p.scheduled_at + make_interval(hours => block.n * 2) - lead_time <= now()
      and p.scheduled_at + make_interval(hours => block.n * 2) > now()
      and not exists (
        select 1 from public.battle_plan_reminders r
        where r.plan_id = p.id and r.block = block.n
      )
  loop
    insert into public.battle_plan_reminders (plan_id, block) values (due.id, due.n)
    on conflict do nothing;
    if not found then
      continue;
    end if;
    block_start := due.scheduled_at + make_interval(hours => due.n * 2);

    for grp in
      select g.id, g.name, g.kind, g.lead_rotation, g.leader_wos_account_id
      from public.battle_plan_groups g
      where g.plan_id = due.id
    loop
      incoming := coalesce(grp.lead_rotation[due.n + 1], case when due.n = 0 then grp.leader_wos_account_id end);
      outgoing := case when due.n = 0 then null else coalesce(grp.lead_rotation[due.n], grp.leader_wos_account_id) end;
      continue when incoming is null or incoming is not distinct from outgoing;

      perform public.queue_account_notification(
        incoming,
        'pet_swap_reminder',
        case when grp.kind = 'garrison'
          then 'Your turn to hold the castle at ' || to_char(block_start at time zone 'utc', 'HH24:MI') || ' UTC'
          else 'Your turn to lead ' || grp.name || ' at ' || to_char(block_start at time zone 'utc', 'HH24:MI') || ' UTC'
        end,
        case when grp.kind = 'garrison'
          then 'Swap to the alliance holding the castle and take over the garrison for ' || public.svs_block_label(due.scheduled_at, due.n) || ' UTC.'
          else 'Get your pets ready: you lead ' || grp.name || ' for ' || public.svs_block_label(due.scheduled_at, due.n) || ' UTC.'
        end,
        jsonb_build_object(
          'plan_id', due.id,
          'group_name', grp.name,
          'role', case when grp.kind = 'garrison' then 'castle_holder' else 'rally_lead' end,
          'blocks', public.svs_block_label(due.scheduled_at, due.n),
          'battle_start', block_start
        ),
        'battle',
        due.state_id
      );
      sent := sent + 1;
    end loop;
  end loop;
  return sent;
end;
$$;

alter function public.automation_pet_swap_reminders(interval) owner to postgres;
revoke all on function public.automation_pet_swap_reminders(interval) from public, anon, authenticated;
grant execute on function public.automation_pet_swap_reminders(interval) to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'wos-pet-swaps';
    perform cron.schedule('wos-pet-swaps', '* * * * *',
      'select public.automation_pet_swap_reminders()');
  else
    raise notice 'pg_cron is not enabled: enable it and re-run this block for pet block swap reminders.';
  end if;
end;
$$;

-- Members who left the in-game state ------------------------------------------

-- The Monday sync updates each WOS ID's state. When a member's moves away from
-- an app state's in-game number, its owners and admins are told; the member
-- list marks them too (State management).
create or replace function public.notify_member_left_state()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  home record;
  player text;
begin
  if old.state_number is null or new.state_number is null
     or old.state_number = new.state_number then
    return new;
  end if;
  player := public.account_display_name(new.id);
  for home in
    select s.id, s.name, s.game_state_number
    from public.state_members m
    join public.states s on s.id = m.state_id
    where m.wos_account_id = new.id
      and s.game_state_number is not null
      and s.game_state_number <> new.state_number
  loop
    perform public.queue_account_notification(
      admin_member.wos_account_id,
      'member_left_state',
      player || ' moved to state ' || new.state_number,
      player || ' is no longer in state ' || home.game_state_number ||
        ' in the game. Remove them under State management if they are not coming back.',
      jsonb_build_object(
        'player', player,
        'state_name', home.name,
        'state_number', new.state_number
      ),
      'notice',
      home.id
    )
    from public.state_members admin_member
    where admin_member.state_id = home.id
      and admin_member.role in ('owner', 'admin')
      and admin_member.wos_account_id <> new.id;
  end loop;
  return new;
end;
$$;

drop trigger if exists wos_account_left_state on public.wos_accounts;
create trigger wos_account_left_state
  after update of state_number on public.wos_accounts
  for each row execute function public.notify_member_left_state();

-- Handing over ownership ------------------------------------------------------

-- The owner makes an admin the new owner and becomes an admin.
create or replace function public.transfer_state_ownership(
  target_state_id uuid,
  target_wos_account_id uuid
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_state_owner(target_state_id) then
    raise exception 'Only the owner can hand over the state.';
  end if;
  if not exists (
    select 1 from public.state_members
    where state_id = target_state_id
      and wos_account_id = target_wos_account_id
      and role = 'admin'
  ) then
    raise exception 'Make them an admin first; only an admin can become the owner.';
  end if;

  update public.state_members
  set role = 'admin'
  where state_id = target_state_id and role = 'owner';

  update public.state_members
  set role = 'owner'
  where state_id = target_state_id and wos_account_id = target_wos_account_id;
end;
$$;

revoke all on function public.transfer_state_ownership(uuid, uuid) from public, anon;
grant execute on function public.transfer_state_ownership(uuid, uuid) to authenticated;

-- Results set by hand -----------------------------------------------------------

-- When WOSOracle never reports the result, owners and admins set it. Every
-- member gets Victory or Defeat as usual (battle_status_notification).
create or replace function public.set_battle_result(
  target_battle_id uuid,
  battle_result text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  battle_state uuid;
begin
  select state_id into battle_state
  from public.battles
  where id = target_battle_id and status = 'completed';
  if battle_state is null then
    raise exception 'Only a finished battle can get a result.';
  end if;
  if not public.is_state_admin(battle_state) then
    raise exception 'Only state owners and admins can set the result.';
  end if;
  if battle_result not in ('win', 'loss') then
    raise exception 'Choose Victory or Defeat.';
  end if;
  update public.battles set result = battle_result where id = target_battle_id;
end;
$$;

revoke all on function public.set_battle_result(uuid, text) from public, anon;
grant execute on function public.set_battle_result(uuid, text) to authenticated;

-- Paid until ----------------------------------------------------------------------

-- Set by an operator on /operator. Null: not billed (pilot, your own state).
-- After this date the hourly automation skips the state (no draw checks,
-- planning or publishing) and the app shows a renewal banner.
alter table public.states
  add column if not exists paid_until timestamptz,
  add column if not exists billing_reminded_for timestamptz;

-- Five days before paid_until, the owner is reminded once per period.
create or replace function public.automation_billing_reminders()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  due record;
  sent integer := 0;
begin
  for due in
    update public.states
    set billing_reminded_for = paid_until
    where paid_until is not null
      and paid_until > now()
      and paid_until <= now() + interval '5 days'
      and billing_reminded_for is distinct from paid_until
    returning id, name, paid_until
  loop
    perform public.queue_account_notification(
      owner_member.wos_account_id,
      'billing_reminder',
      'Overwatch for ' || due.name || ' runs until ' || to_char(due.paid_until at time zone 'utc', 'DD Mon') ,
      'Renew before then to keep the draw checks, planning and publishing running. Message us on Discord: wosoverwatch.',
      jsonb_build_object('state_name', due.name, 'paid_until', due.paid_until),
      'notice',
      due.id
    )
    from public.state_members owner_member
    where owner_member.state_id = due.id and owner_member.role = 'owner';
    sent := sent + 1;
  end loop;
  return sent;
end;
$$;

alter function public.automation_billing_reminders() owner to postgres;
revoke all on function public.automation_billing_reminders() from public, anon, authenticated;
grant execute on function public.automation_billing_reminders() to service_role;

-- Notification colours for the new kinds ---------------------------------------

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
      'attendance_reminder', 'rallies_generated', 'map_enemy_leaders',
      'attendance_conflict', 'pet_swap_reminder'
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
    when notification_type in ('state_announcement', 'member_left_state', 'billing_reminder') then 'notice'
    else null
  end;
$$;
