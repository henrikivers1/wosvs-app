-- In-game state number of each app state, used to look up the SvS draw.
alter table public.states
  add column if not exists game_state_number integer
  check (game_state_number is null or game_state_number > 0);

-- Default it from the owner's WOSOracle-synchronized account.
update public.states state
set game_state_number = owner_account.state_number
from (
  select distinct on (member.state_id)
    member.state_id,
    account.state_number
  from public.state_members member
  join public.wos_accounts account on account.id = member.wos_account_id
  where member.role = 'owner'
    and account.state_number is not null
  order by member.state_id, member.joined_at
) owner_account
where state.id = owner_account.state_id
  and state.game_state_number is null;

-- The opposing in-game state of a battle plan.
alter table public.battle_plans
  add column if not exists opponent_state_number integer
  check (opponent_state_number is null or opponent_state_number > 0);

-- Enemy leaders picked from a WOSOracle alliance roster.
alter table public.enemy_leaders
  add column if not exists wos_id text,
  add column if not exists power bigint,
  add column if not exists alliance_abbr text;

create or replace function public.set_battle_plan_opponent(
  target_plan_id uuid,
  opponent_number integer
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  plan_state_id uuid;
begin
  select state_id into plan_state_id
  from public.battle_plans
  where id = target_plan_id;

  if plan_state_id is null then
    raise exception 'Battle plan not found.';
  end if;

  if not public.is_state_admin(plan_state_id) then
    raise exception 'Only state owners and admins can change battle plans.';
  end if;

  if opponent_number is not null and opponent_number <= 0 then
    raise exception 'Enter a valid opponent state number.';
  end if;

  update public.battle_plans
  set opponent_state_number = opponent_number,
      updated_at = now()
  where id = target_plan_id;
end;
$$;

alter function public.set_battle_plan_opponent(uuid, integer) owner to postgres;
revoke all on function public.set_battle_plan_opponent(uuid, integer)
  from public, anon;
grant execute on function public.set_battle_plan_opponent(uuid, integer)
  to authenticated, service_role;
