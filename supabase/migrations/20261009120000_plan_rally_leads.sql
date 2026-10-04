-- Rally Leads are picked per SvS: not every Rally Lead can play every
-- battle, and Labyrinth scores can be inflated. Null until an admin picks;
-- the automation then uses the state's Rally Leads.
alter table public.battle_plans
  add column if not exists rally_lead_ids uuid[];

create or replace function public.set_plan_rally_leads(
  target_plan_id uuid,
  lead_ids uuid[]
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

  if exists (
    select 1 from unnest(coalesce(lead_ids, '{}')) as picked(id)
    where not exists (
      select 1 from public.state_members member
      where member.state_id = plan_state_id
        and member.wos_account_id = picked.id
    )
  ) then
    raise exception 'Every Rally Lead must be a member of the state.';
  end if;

  update public.battle_plans
  set rally_lead_ids = (select array_agg(distinct id) from unnest(lead_ids) as picked(id)),
      updated_at = now()
  where id = target_plan_id;
end;
$$;

alter function public.set_plan_rally_leads(uuid, uuid[]) owner to postgres;
revoke all on function public.set_plan_rally_leads(uuid, uuid[]) from public, anon;
grant execute on function public.set_plan_rally_leads(uuid, uuid[])
  to authenticated, service_role;

-- Leads never join: once this SvS's leads are picked, only the picked Rally
-- Leads (and Castle Holders) are kept out; the others join like anyone else.
create or replace function public.prevent_lead_as_joiner()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  target_group public.battle_plan_groups%rowtype;
  picked uuid[];
begin
  select * into target_group from public.battle_plan_groups where id = new.group_id;
  if new.wos_account_id = target_group.leader_wos_account_id
     or new.wos_account_id = any(target_group.lead_rotation) then
    return new;
  end if;
  select rally_lead_ids into picked from public.battle_plans where id = new.plan_id;
  if new.wos_account_id = any(picked) or exists (
    select 1
    from public.state_member_tags member_tag
    join public.state_tags tag on tag.id = member_tag.tag_id
    where member_tag.wos_account_id = new.wos_account_id
      and tag.state_id = new.state_id
      and (
        tag.system_key = 'castle_holder'
        or (tag.system_key = 'rally_lead' and picked is null)
      )
  ) then
    raise exception 'Rally Leads and Castle Holders only lead or hold; they cannot join %.', target_group.name;
  end if;
  return new;
end;
$$;

-- The "pick your Rally Leads" notice is a battle notice.
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
      'attendance_conflict', 'pet_swap_reminder', 'pick_rally_leads'
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
