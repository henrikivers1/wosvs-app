-- Every member gets the Garrison role by default, so everyone sees Live
-- Battle and their own send countdown. Admins can still take it away.
-- Granted silently: joining already sends its own notification.

create or replace function public.grant_default_garrison()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  previous text := current_setting('wosoverwatch.mute_member_notifications', true);
begin
  perform set_config('wosoverwatch.mute_member_notifications', 'on', true);
  insert into public.state_member_capabilities (state_id, wos_account_id, capability)
  values (new.state_id, new.wos_account_id, 'garrison')
  on conflict do nothing;
  perform set_config('wosoverwatch.mute_member_notifications', coalesce(previous, 'off'), true);
  return new;
end;
$$;

alter function public.grant_default_garrison() owner to postgres;
revoke all on function public.grant_default_garrison() from public, anon, authenticated;

drop trigger if exists state_member_default_garrison on public.state_members;
create trigger state_member_default_garrison
  after insert on public.state_members
  for each row execute function public.grant_default_garrison();

-- Current members.
do $$
begin
  perform set_config('wosoverwatch.mute_member_notifications', 'on', true);
  insert into public.state_member_capabilities (state_id, wos_account_id, capability)
  select member.state_id, member.wos_account_id, 'garrison'
  from public.state_members member
  on conflict do nothing;
  perform set_config('wosoverwatch.mute_member_notifications', 'off', true);
end;
$$;
