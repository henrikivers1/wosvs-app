-- A state could not be deleted: its Rally Lead system tag refused the
-- cascade. System tags still cannot be deleted on their own, only together
-- with their state.
create or replace function public.protect_state_system_tag()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and old.system_key is not null
     and exists (select 1 from public.states where id = old.state_id) then
    raise exception 'System tags are permanent and cannot be deleted.';
  end if;

  if tg_op = 'UPDATE' and old.system_key is not null and (
    new.state_id is distinct from old.state_id
    or new.system_key is distinct from old.system_key
    or new.name is distinct from old.name
  ) then
    raise exception 'The Rally Lead system tag cannot be renamed or converted.';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
