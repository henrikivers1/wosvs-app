-- A minimum Furnace level to join a state with its join link, against spy
-- accounts. Stored as WOSOracle's raw furnace number (30 = Furnace 30,
-- 35 = FC1, 80 = FC10); null means anyone in the state can join.
alter table public.states
  add column if not exists min_furnace_level smallint
  check (min_furnace_level is null or min_furnace_level between 1 and 80);

create or replace function public.set_state_min_furnace(target_state_id uuid, level smallint)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_state_admin(target_state_id) then
    raise exception 'Only state owners and admins can change who can join.';
  end if;
  if level is not null and (level < 1 or level > 80) then
    raise exception 'Choose a Furnace level between Furnace 1 and FC10.';
  end if;
  update public.states set min_furnace_level = level where id = target_state_id;
end;
$$;

alter function public.set_state_min_furnace(uuid, smallint) owner to postgres;
revoke all on function public.set_state_min_furnace(uuid, smallint) from public, anon;
grant execute on function public.set_state_min_furnace(uuid, smallint)
  to authenticated, service_role;
