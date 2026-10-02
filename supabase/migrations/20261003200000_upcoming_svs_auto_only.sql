-- The attendance vote and Intel page only follow the plan the automation
-- creates from the WOSOracle draw, never older manually created plans.
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
    and plan.auto_created
    and plan.scheduled_at + interval '5 hours' > now()
    and public.is_state_member(target_state_id)
  order by plan.scheduled_at
  limit 1;
$$;
