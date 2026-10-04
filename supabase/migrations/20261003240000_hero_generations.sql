-- Hero tags remember their hero generation, and each state records the
-- newest hero generation it has unlocked so later heroes stay hidden.
alter table public.state_tags
  add column if not exists hero_generation smallint
  check (hero_generation is null or hero_generation between 1 and 99);

alter table public.states
  add column if not exists hero_generation_max smallint
  check (hero_generation_max is null or hero_generation_max between 1 and 99);

create or replace function public.set_state_hero_generation(
  target_state_id uuid,
  max_generation integer
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_state_admin(target_state_id) then
    raise exception 'Only state owners and admins can change this.';
  end if;
  if max_generation is not null and max_generation not between 1 and 99 then
    raise exception 'Choose a hero generation between 1 and 99.';
  end if;
  update public.states
  set hero_generation_max = max_generation
  where id = target_state_id;
end;
$$;

alter function public.set_state_hero_generation(uuid, integer) owner to postgres;
revoke all on function public.set_state_hero_generation(uuid, integer)
  from public, anon;
grant execute on function public.set_state_hero_generation(uuid, integer)
  to authenticated, service_role;

-- Existing tags named after a hero become hero tags with their generation.
update public.state_tags tag
set kind = 'hero',
    hero_generation = hero.generation
from (values
  ('Jeronimo', 1),
  ('Natalia', 1),
  ('Molly', 1),
  ('Zinman', 1),
  ('Flint', 2),
  ('Philly', 2),
  ('Alonso', 2),
  ('Logan', 3),
  ('Mia', 3),
  ('Greg', 3),
  ('Ahmose', 4),
  ('Reina', 4),
  ('Lynn', 4),
  ('Hector', 5),
  ('Norah', 5),
  ('Gwen', 5),
  ('Wu Ming', 6),
  ('Renee', 6),
  ('Wayne', 6),
  ('Edith', 7),
  ('Gordon', 7),
  ('Bradley', 7),
  ('Gatot', 8),
  ('Sonya', 8),
  ('Hendrik', 8),
  ('Magnus', 9),
  ('Fred', 9),
  ('Xura', 9),
  ('Gregory', 10),
  ('Freya', 10),
  ('Blanchette', 10),
  ('Eleonora', 11),
  ('Lloyd', 11),
  ('Rufus', 11),
  ('Hervor', 12),
  ('Karol', 12),
  ('Ligeia', 12),
  ('Gisela', 13),
  ('Flora', 13),
  ('Vulcanus', 13),
  ('Elif', 14),
  ('Dominic', 14),
  ('Cara', 14),
  ('Hank', 15),
  ('Estrella', 15),
  ('Viveca', 15),
  ('Seigel', 16),
  ('Ursar', 16),
  ('Aisling', 16),
  ('Aiden', 17),
  ('Bertha', 17),
  ('Eleanor', 17),
  ('Jessie', 1),
  ('Jasser', 1),
  ('Seo-yoon', 1),
  ('Sergey', 1),
  ('Patrick', 1),
  ('Ling Xue', 1),
  ('Lumak Bokan', 1),
  ('Bahiti', 1),
  ('Gina', 1),
  ('Smith', 1),
  ('Eugene', 1),
  ('Charlie', 1),
  ('Cloris', 1)
) as hero (name, generation)
where lower(tag.name) = lower(hero.name)
  and tag.system_key is null
  and tag.kind <> 'rally';
