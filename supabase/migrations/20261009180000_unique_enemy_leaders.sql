-- Each enemy player is on a battle's leader list once. Names were already
-- unique per battle (case-insensitive); WOS IDs are now too.

-- Existing doubles: keep the first, move its rallies over.
with ranked as (
  select id, first_value(id) over (partition by battle_id, wos_id order by id) as keep
  from public.enemy_leaders
  where battle_id is not null and wos_id is not null
)
update public.rallies rally
set enemy_leader_id = ranked.keep
from ranked
where rally.enemy_leader_id = ranked.id and ranked.id <> ranked.keep;

with ranked as (
  select id, first_value(id) over (partition by battle_id, wos_id order by id) as keep
  from public.enemy_leaders
  where battle_id is not null and wos_id is not null
)
delete from public.enemy_leaders leader
using ranked
where leader.id = ranked.id and ranked.id <> ranked.keep;

create unique index if not exists enemy_leaders_battle_wos_id_unique
  on public.enemy_leaders (battle_id, wos_id)
  where battle_id is not null and wos_id is not null;

-- Battle start pre-adds known leaders; it never fails on a double.
create or replace function public.seed_enemy_leaders_on_start()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.status <> 'active' or old.status = 'active' or new.plan_id is null then
    return new;
  end if;

  insert into public.enemy_leaders (state_id, battle_id, name, x, y, wos_id, power, alliance_abbr, labyrinth_score)
  select distinct on (player ->> 'wosId')
    new.state_id,
    new.id,
    left(coalesce(nullif(player ->> 'name', ''), known.name), 60),
    known.x,
    known.y,
    player ->> 'wosId',
    nullif(player ->> 'power', '')::bigint,
    nullif(player ->> 'allianceAbbr', ''),
    coalesce(nullif(player ->> 'labyrinthScore', '')::bigint, known.labyrinth_score)
  from public.battle_intel intel
  cross join lateral jsonb_array_elements(coalesce(intel.opponent -> 'topPlayers', '[]'::jsonb)) player
  join lateral (
    select previous.name, previous.x, previous.y, previous.labyrinth_score
    from public.enemy_leaders previous
    where previous.state_id = new.state_id
      and previous.wos_id = player ->> 'wosId'
    order by previous.created_at desc
    limit 1
  ) known on true
  where intel.plan_id = new.plan_id
    and player ->> 'wosId' is not null
    and not exists (
      select 1 from public.enemy_leaders existing
      where existing.battle_id = new.id and existing.wos_id = player ->> 'wosId'
    )
  order by player ->> 'wosId'
  -- A name already on the list (two players can share one) is skipped.
  on conflict do nothing;

  return new;
end;
$$;
