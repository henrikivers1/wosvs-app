-- The SvS plan the automation creates from the draw is reset, not deleted.
-- Deleting it also deleted the opponent intel and the attendance votes, and
-- the next draw check created it again and told every member about the draw
-- a second time.

-- Takes the plan back to before its rallies were generated. The intel, the
-- attendance votes, the picked Rally Leads, the comments and the scheduled
-- battle stay. Alliance moves made by an earlier publish stay as well.
create or replace function public.reset_svs_plan(target_plan_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  target_state_id uuid;
  is_auto_created boolean;
  previous text := current_setting('wosoverwatch.mute_member_notifications', true);
begin
  select state_id, auto_created into target_state_id, is_auto_created
  from public.battle_plans
  where id = target_plan_id;

  if target_state_id is null then
    raise exception 'Battle plan not found.';
  end if;

  if not public.is_state_admin(target_state_id) then
    raise exception 'Only state owners and admins can reset battle plans.';
  end if;

  if not is_auto_created then
    raise exception 'Only the SvS plan created from the draw can be reset.';
  end if;

  if exists (
    select 1 from public.battles
    where plan_id = target_plan_id and status in ('active', 'completed')
  ) then
    raise exception 'This battle has started. A started plan cannot be reset.';
  end if;

  -- Removing the rallies must not tell every member they were unassigned.
  perform set_config('wosoverwatch.mute_member_notifications', 'on', true);
  delete from public.battle_plan_assignments where plan_id = target_plan_id;
  delete from public.battle_plan_groups where plan_id = target_plan_id;
  perform set_config('wosoverwatch.mute_member_notifications', coalesce(previous, 'off'), true);

  delete from public.battle_plan_reminders where plan_id = target_plan_id;

  delete from public.state_member_tags
  where source = 'battle_plan' and source_plan_id = target_plan_id;

  delete from public.notifications
  where type in (
    'battle_plan_assignment', 'battle_plan_published',
    'battle_plan_assignment_changed', 'battle_plan_assignment_removed',
    'rallies_generated'
  )
    and data ->> 'plan_id' = target_plan_id::text;

  update public.battle_plans
  set status = 'draft',
      published_at = null,
      auto_planned_at = null,
      updated_at = now()
  where id = target_plan_id;
end;
$$;

alter function public.reset_svs_plan(uuid) owner to postgres;
revoke all on function public.reset_svs_plan(uuid) from public, anon;
grant execute on function public.reset_svs_plan(uuid)
  to authenticated, service_role;

-- Deleting stays for plans made by hand; the SvS plan from the draw is reset.
create or replace function public.delete_battle_plan(target_plan_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  target_state_id uuid;
  is_auto_created boolean;
begin
  select state_id, auto_created into target_state_id, is_auto_created
  from public.battle_plans
  where id = target_plan_id;

  if target_state_id is null then
    raise exception 'Battle plan not found.';
  end if;

  if not public.is_state_admin(target_state_id) then
    raise exception 'Only state owners and admins can delete battle plans.';
  end if;

  if is_auto_created then
    raise exception 'The SvS plan from the draw cannot be deleted. Reset it instead.';
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
