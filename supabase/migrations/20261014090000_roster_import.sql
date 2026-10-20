-- Roster import: a state's admins upload player data from another planning
-- tool (CSV). It is kept per WOS ID and fills in troop details and 4★ joiner
-- heroes for members who join now or later. What a player entered themselves
-- is never overwritten.

create table if not exists public.state_roster_imports (
  state_id uuid not null references public.states (id) on delete cascade,
  wos_id text not null check (wos_id ~ '^[0-9]{1,20}$'),
  infantry_tier smallint check (infantry_tier between 1 and 12),
  lancer_tier smallint check (lancer_tier between 1 and 12),
  marksman_tier smallint check (marksman_tier between 1 and 12),
  infantry_fc_level smallint check (infantry_fc_level between 0 and 10),
  lancer_fc_level smallint check (lancer_fc_level between 0 and 10),
  marksman_fc_level smallint check (marksman_fc_level between 0 and 10),
  infantry_t12_skill smallint check (infantry_t12_skill between 0 and 3),
  lancer_t12_skill smallint check (lancer_t12_skill between 0 and 3),
  marksman_t12_skill smallint check (marksman_t12_skill between 0 and 3),
  -- null: heroes unknown in the source; an array (even empty) is an answer.
  heroes text[],
  imported_at timestamptz not null default now(),
  primary key (state_id, wos_id)
);
alter table public.state_roster_imports enable row level security;
revoke all on table public.state_roster_imports from anon, authenticated;

-- Fills one account from its state's import, only where it is still empty.
create or replace function public.apply_roster_import(
  target_state_id uuid,
  target_wos_account_id uuid
) returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  account record;
  source record;
  imported_heroes text[];
begin
  select id, wos_id, heroes_updated_at into account
  from public.wos_accounts where id = target_wos_account_id;
  if account.id is null then return false; end if;

  select * into source from public.state_roster_imports
  where state_id = target_state_id and wos_id = account.wos_id;
  if not found then return false; end if;

  -- Each troop type as a whole: once a player entered anything for it
  -- (tier, troop FC or skill), the import leaves that troop alone.
  update public.wos_accounts set
    infantry_tier = case when infantry_tier is null and infantry_fc_level is null and infantry_t12_skill is null then source.infantry_tier else infantry_tier end,
    infantry_fc_level = case when infantry_tier is null and infantry_fc_level is null and infantry_t12_skill is null then source.infantry_fc_level else infantry_fc_level end,
    infantry_t12_skill = case when infantry_tier is null and infantry_fc_level is null and infantry_t12_skill is null then source.infantry_t12_skill else infantry_t12_skill end,
    lancer_tier = case when lancer_tier is null and lancer_fc_level is null and lancer_t12_skill is null then source.lancer_tier else lancer_tier end,
    lancer_fc_level = case when lancer_tier is null and lancer_fc_level is null and lancer_t12_skill is null then source.lancer_fc_level else lancer_fc_level end,
    lancer_t12_skill = case when lancer_tier is null and lancer_fc_level is null and lancer_t12_skill is null then source.lancer_t12_skill else lancer_t12_skill end,
    marksman_tier = case when marksman_tier is null and marksman_fc_level is null and marksman_t12_skill is null then source.marksman_tier else marksman_tier end,
    marksman_fc_level = case when marksman_tier is null and marksman_fc_level is null and marksman_t12_skill is null then source.marksman_fc_level else marksman_fc_level end,
    marksman_t12_skill = case when marksman_tier is null and marksman_fc_level is null and marksman_t12_skill is null then source.marksman_t12_skill else marksman_t12_skill end
  where id = account.id;

  -- Heroes only when the player has never answered themselves.
  imported_heroes := source.heroes;
  if account.heroes_updated_at is null and imported_heroes is not null then
    insert into public.player_heroes (wos_account_id, hero)
    select distinct account.id, btrim(hero)
    from unnest(imported_heroes) as hero
    where char_length(btrim(hero)) between 1 and 32
    on conflict do nothing;
    update public.wos_accounts set heroes_updated_at = now() where id = account.id;
  end if;
  return true;
end;
$$;
alter function public.apply_roster_import(uuid, uuid) owner to postgres;
revoke all on function public.apply_roster_import(uuid, uuid) from public, anon, authenticated;

-- Admins upload rows (parsed in the browser); existing members are filled
-- in straight away. Answers how many rows were saved and members filled.
create or replace function public.import_state_roster(target_state_id uuid, rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  saved integer;
  filled integer := 0;
  member record;
begin
  if not public.is_state_admin(target_state_id) then
    raise exception 'Only state owners and admins can import player data.';
  end if;
  if jsonb_typeof(rows) <> 'array' or jsonb_array_length(rows) > 5000 then
    raise exception 'The import must be a list of at most 5000 players.';
  end if;

  insert into public.state_roster_imports as existing (
    state_id, wos_id,
    infantry_tier, lancer_tier, marksman_tier,
    infantry_fc_level, lancer_fc_level, marksman_fc_level,
    infantry_t12_skill, lancer_t12_skill, marksman_t12_skill,
    heroes, imported_at
  )
  select
    target_state_id, row ->> 'wos_id',
    (row ->> 'infantry_tier')::smallint, (row ->> 'lancer_tier')::smallint, (row ->> 'marksman_tier')::smallint,
    (row ->> 'infantry_fc_level')::smallint, (row ->> 'lancer_fc_level')::smallint, (row ->> 'marksman_fc_level')::smallint,
    (row ->> 'infantry_t12_skill')::smallint, (row ->> 'lancer_t12_skill')::smallint, (row ->> 'marksman_t12_skill')::smallint,
    case when jsonb_typeof(row -> 'heroes') = 'array'
      then array(select jsonb_array_elements_text(row -> 'heroes')) end,
    now()
  from jsonb_array_elements(rows) as row
  where row ->> 'wos_id' ~ '^[0-9]{1,20}$'
  on conflict (state_id, wos_id) do update set
    infantry_tier = excluded.infantry_tier, lancer_tier = excluded.lancer_tier, marksman_tier = excluded.marksman_tier,
    infantry_fc_level = excluded.infantry_fc_level, lancer_fc_level = excluded.lancer_fc_level, marksman_fc_level = excluded.marksman_fc_level,
    infantry_t12_skill = excluded.infantry_t12_skill, lancer_t12_skill = excluded.lancer_t12_skill, marksman_t12_skill = excluded.marksman_t12_skill,
    heroes = excluded.heroes, imported_at = excluded.imported_at;
  get diagnostics saved = row_count;

  for member in
    select wos_account_id from public.state_members where state_id = target_state_id
  loop
    if public.apply_roster_import(target_state_id, member.wos_account_id) then
      filled := filled + 1;
    end if;
  end loop;

  return jsonb_build_object('saved', saved, 'filled', filled);
end;
$$;
alter function public.import_state_roster(uuid, jsonb) owner to postgres;
revoke all on function public.import_state_roster(uuid, jsonb) from public, anon;
grant execute on function public.import_state_roster(uuid, jsonb) to authenticated, service_role;

-- How many players a state has imported, for the State management card.
create or replace function public.state_roster_import_count(target_state_id uuid)
returns integer
language sql
stable
security definer
set search_path to 'public'
as $$
  select case when public.is_state_admin(target_state_id)
    then (select count(*)::integer from public.state_roster_imports where state_id = target_state_id)
  end;
$$;
alter function public.state_roster_import_count(uuid) owner to postgres;
revoke all on function public.state_roster_import_count(uuid) from public, anon;
grant execute on function public.state_roster_import_count(uuid) to authenticated, service_role;

-- New members are filled in as they join.
create or replace function public.apply_roster_import_on_join()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public.apply_roster_import(new.state_id, new.wos_account_id);
  return new;
end;
$$;
alter function public.apply_roster_import_on_join() owner to postgres;
revoke all on function public.apply_roster_import_on_join() from public, anon, authenticated;

drop trigger if exists state_members_roster_import on public.state_members;
create trigger state_members_roster_import
  after insert on public.state_members
  for each row execute function public.apply_roster_import_on_join();
