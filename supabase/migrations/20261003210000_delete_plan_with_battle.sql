-- Deleting a plan also removes its battle when that battle has not been
-- fought, so the automation cannot start an orphaned battle. Live battles
-- cannot be deleted; finished battles stay in the history.
create or replace function public.delete_battle_plan(target_plan_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  target_state_id uuid;
begin
  select state_id into target_state_id
  from public.battle_plans
  where id = target_plan_id;

  if target_state_id is null then
    raise exception 'Battle plan not found.';
  end if;

  if not public.is_state_admin(target_state_id) then
    raise exception 'Only state owners and admins can delete battle plans.';
  end if;

  if exists (
    select 1 from public.battles
    where plan_id = target_plan_id and status = 'active'
  ) then
    raise exception 'This battle is live. It ends automatically after the battle window.';
  end if;

  delete from public.battles
  where plan_id = target_plan_id
    and status in ('scheduled', 'cancelled')
    and not exists (
      select 1 from public.rallies rally where rally.battle_id = battles.id
    );

  delete from public.notifications
  where type in ('battle_plan_assignment', 'battle_plan_published', 'svs_drawn')
    and data ->> 'plan_id' = target_plan_id::text;

  delete from public.battle_plans
  where id = target_plan_id;
end;
$$;
