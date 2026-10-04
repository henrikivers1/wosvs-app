-- Lets an admin (re)create the state's SvS plan, e.g. after it was deleted.
-- A state can only have one upcoming or live plan at a time.
create or replace function public.create_svs_plan(
  target_state_id uuid,
  opponent_number integer,
  battle_date date
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  battle_at timestamptz;
begin
  if not public.is_state_admin(target_state_id) then
    raise exception 'Only state owners and admins can create the SvS plan.';
  end if;
  if opponent_number is null or opponent_number <= 0 then
    raise exception 'Enter the opponent state number.';
  end if;
  if battle_date is null then
    raise exception 'Choose the battle date.';
  end if;

  -- SvS castle battles always start at 12:00 UTC.
  battle_at := (battle_date + time '12:00') at time zone 'UTC';
  if battle_at + interval '5 hours' <= now() then
    raise exception 'That battle is already over. Choose a future date.';
  end if;

  if exists (
    select 1 from public.battle_plans
    where state_id = target_state_id
      and scheduled_at + interval '5 hours' > now()
  ) then
    raise exception 'This state already has an upcoming battle plan.';
  end if;

  return public.automation_ensure_svs_plan(
    target_state_id, opponent_number, battle_at
  );
end;
$$;

alter function public.create_svs_plan(uuid, integer, date) owner to postgres;
revoke all on function public.create_svs_plan(uuid, integer, date) from public, anon;
grant execute on function public.create_svs_plan(uuid, integer, date)
  to authenticated, service_role;
