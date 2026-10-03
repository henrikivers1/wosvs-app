-- Tag kinds: regular tags, automatic "<leader> rally" tags and hero tags
-- ("join with Jessie").
alter table public.state_tags
  add column if not exists kind text not null default 'custom';
alter table public.state_tags
  drop constraint if exists state_tags_kind_check;
alter table public.state_tags
  add constraint state_tags_kind_check
  check (kind in ('custom', 'rally', 'hero'));

-- Every rally group gets a "<leader> rally" tag unless an admin picked a
-- tag. Publishing the plan puts the tag on the group's members, so
-- announcements can target one rally. Changing the leader switches an
-- automatic tag to the new leader's.
create or replace function public.assign_group_rally_tag()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  leader_name text;
  rally_tag_name text;
  rally_tag_id uuid;
begin
  if new.assignment_tag_id is not null and not (
    tg_op = 'UPDATE'
    and new.leader_wos_account_id is distinct from old.leader_wos_account_id
    and new.assignment_tag_id is not distinct from old.assignment_tag_id
    and exists (
      select 1 from public.state_tags
      where id = old.assignment_tag_id and kind = 'rally'
    )
  ) then
    return new;
  end if;

  select coalesce(nullif(btrim(nickname), ''), 'WOS ' || wos_id)
  into leader_name
  from public.wos_accounts
  where id = new.leader_wos_account_id;

  rally_tag_name := left(coalesce(leader_name, 'Group'), 26) || ' rally';

  select id into rally_tag_id
  from public.state_tags
  where state_id = new.state_id
    and lower(name) = lower(rally_tag_name);

  if rally_tag_id is null then
    insert into public.state_tags (state_id, name, color, created_by, kind)
    values (new.state_id, rally_tag_name, '#4f8fba', auth.uid(), 'rally')
    returning id into rally_tag_id;
  end if;

  new.assignment_tag_id := rally_tag_id;
  return new;
end;
$$;

alter function public.assign_group_rally_tag() owner to postgres;
revoke all on function public.assign_group_rally_tag() from public, anon, authenticated;

drop trigger if exists battle_plan_groups_rally_tag on public.battle_plan_groups;
create trigger battle_plan_groups_rally_tag
  before insert or update on public.battle_plan_groups
  for each row execute function public.assign_group_rally_tag();

-- Existing groups without a tag get their rally tag now.
update public.battle_plan_groups
set name = name
where assignment_tag_id is null;
