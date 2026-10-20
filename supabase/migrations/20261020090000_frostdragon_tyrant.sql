-- Frostdragon Tyrant (FDT) planning. FDT is fought per alliance (at most 60
-- combatants each), so it is planned apart from SvS: members vote whether
-- they can play, admins put players in an alliance and give them a target
-- (the Capital or the Spires), and each target carries a short rally note
-- ("these 4 heroes first"). There is no live battle mode for FDT.

create table if not exists public.fdt_events (
  id uuid primary key default gen_random_uuid(),
  state_id uuid not null references public.states (id) on delete cascade,
  name text not null
    check (char_length(btrim(name)) between 1 and 60),
  battle_at timestamptz not null,
  capital_note text check (capital_note is null or char_length(capital_note) <= 500),
  spires_note text check (spires_note is null or char_length(spires_note) <= 500),
  published_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists fdt_events_state_idx
  on public.fdt_events (state_id, battle_at);

create table if not exists public.fdt_votes (
  event_id uuid not null references public.fdt_events (id) on delete cascade,
  state_id uuid not null references public.states (id) on delete cascade,
  wos_account_id uuid not null references public.wos_accounts (id) on delete cascade,
  availability text not null check (availability in ('yes', 'maybe', 'no')),
  voice_call boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (event_id, wos_account_id)
);
create index if not exists fdt_votes_state_idx on public.fdt_votes (state_id);

create table if not exists public.fdt_assignments (
  event_id uuid not null references public.fdt_events (id) on delete cascade,
  state_id uuid not null references public.states (id) on delete cascade,
  wos_account_id uuid not null references public.wos_accounts (id) on delete cascade,
  alliance_id uuid not null references public.state_alliances (id) on delete cascade,
  target text check (target is null or target in ('capital', 'spires')),
  updated_at timestamptz not null default now(),
  primary key (event_id, wos_account_id)
);
create index if not exists fdt_assignments_state_idx
  on public.fdt_assignments (state_id);
create index if not exists fdt_assignments_alliance_idx
  on public.fdt_assignments (event_id, alliance_id);

alter table public.fdt_events enable row level security;
alter table public.fdt_votes enable row level security;
alter table public.fdt_assignments enable row level security;
revoke all on table public.fdt_events, public.fdt_votes, public.fdt_assignments
  from anon, authenticated;
grant select on table public.fdt_events, public.fdt_votes, public.fdt_assignments
  to authenticated;

drop policy if exists "members read fdt events" on public.fdt_events;
create policy "members read fdt events" on public.fdt_events
  for select to authenticated using (public.is_state_member(state_id));

drop policy if exists "members read fdt votes" on public.fdt_votes;
create policy "members read fdt votes" on public.fdt_votes
  for select to authenticated using (public.is_state_member(state_id));

-- Admins see the lineup while they build it; members once it is published.
drop policy if exists "read fdt assignments" on public.fdt_assignments;
create policy "read fdt assignments" on public.fdt_assignments
  for select to authenticated using (
    public.is_state_admin(state_id)
    or (
      public.is_state_member(state_id)
      and exists (
        select 1 from public.fdt_events event
        where event.id = fdt_assignments.event_id
          and event.published_at is not null
      )
    )
  );

-- An FDT battle is over 8 hours after it starts (the longest format).
create or replace function public.fdt_event_over(battle_at timestamptz)
returns boolean
language sql
stable
as $$
  select battle_at + interval '8 hours' <= now();
$$;

-- Admins create an FDT event; every member is asked to vote.
create or replace function public.create_fdt_event(
  target_state_id uuid,
  event_name text,
  event_battle_at timestamptz
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  new_event_id uuid;
  cleaned_name text := btrim(coalesce(event_name, ''));
begin
  if not public.is_state_admin(target_state_id) then
    raise exception 'Only state owners and admins can plan Frostdragon Tyrant.';
  end if;
  if char_length(cleaned_name) not between 1 and 60 then
    raise exception 'Give the event a name of at most 60 characters.';
  end if;
  if event_battle_at is null or public.fdt_event_over(event_battle_at) then
    raise exception 'Choose a battle time that has not passed.';
  end if;

  insert into public.fdt_events (state_id, name, battle_at)
  values (target_state_id, cleaned_name, event_battle_at)
  returning id into new_event_id;

  perform public.queue_account_notification(
    member.wos_account_id,
    'fdt_vote',
    'Can you play Frostdragon Tyrant?',
    cleaned_name || ' starts ' ||
      to_char(event_battle_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI') ||
      ' UTC. Open Overwatch to vote whether you can play.',
    jsonb_build_object(
      'event_id', new_event_id,
      'event_name', cleaned_name,
      'battle_start', event_battle_at
    ),
    'battle',
    target_state_id
  )
  from public.state_members member
  where member.state_id = target_state_id;

  return new_event_id;
end;
$$;

create or replace function public.update_fdt_event(
  target_event_id uuid,
  event_name text,
  event_battle_at timestamptz,
  capital_rally_note text,
  spires_rally_note text
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  event_state_id uuid;
  cleaned_name text := btrim(coalesce(event_name, ''));
begin
  select state_id into event_state_id
  from public.fdt_events where id = target_event_id;
  if event_state_id is null then
    raise exception 'Frostdragon Tyrant event not found.';
  end if;
  if not public.is_state_admin(event_state_id) then
    raise exception 'Only state owners and admins can plan Frostdragon Tyrant.';
  end if;
  if char_length(cleaned_name) not between 1 and 60 then
    raise exception 'Give the event a name of at most 60 characters.';
  end if;
  if event_battle_at is null then
    raise exception 'Choose the battle time.';
  end if;

  update public.fdt_events
  set name = cleaned_name,
      battle_at = event_battle_at,
      capital_note = nullif(btrim(coalesce(capital_rally_note, '')), ''),
      spires_note = nullif(btrim(coalesce(spires_rally_note, '')), ''),
      updated_at = now()
  where id = target_event_id;
end;
$$;

create or replace function public.delete_fdt_event(target_event_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  event_state_id uuid;
begin
  select state_id into event_state_id
  from public.fdt_events where id = target_event_id;
  if event_state_id is null then
    raise exception 'Frostdragon Tyrant event not found.';
  end if;
  if not public.is_state_admin(event_state_id) then
    raise exception 'Only state owners and admins can plan Frostdragon Tyrant.';
  end if;

  delete from public.notifications
  where type in ('fdt_vote', 'fdt_assignment')
    and data ->> 'event_id' = target_event_id::text;
  delete from public.fdt_events where id = target_event_id;
end;
$$;

-- A member answers for their own WOS account until the battle is over.
create or replace function public.set_fdt_vote(
  target_event_id uuid,
  target_wos_account_id uuid,
  selected_availability text,
  joins_voice boolean
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  event_row public.fdt_events%rowtype;
begin
  select * into event_row from public.fdt_events where id = target_event_id;
  if event_row.id is null then
    raise exception 'Frostdragon Tyrant event not found.';
  end if;
  if not public.owns_wos_account(target_wos_account_id) then
    raise exception 'You can only answer for your own WOS account.';
  end if;
  if not exists (
    select 1 from public.state_members
    where state_id = event_row.state_id and wos_account_id = target_wos_account_id
  ) then
    raise exception 'This WOS account is not in this state.';
  end if;
  if public.fdt_event_over(event_row.battle_at) then
    raise exception 'This battle is over.';
  end if;
  if selected_availability not in ('yes', 'maybe', 'no') then
    raise exception 'Choose whether you can play.';
  end if;

  insert into public.fdt_votes (
    event_id, state_id, wos_account_id, availability, voice_call, updated_at
  ) values (
    target_event_id, event_row.state_id, target_wos_account_id,
    selected_availability, coalesce(joins_voice, false), now()
  )
  on conflict (event_id, wos_account_id) do update set
    availability = excluded.availability,
    voice_call = excluded.voice_call,
    updated_at = now();
end;
$$;

-- The message a player gets about their FDT spot (published events only).
create or replace function public.notify_fdt_assignment(
  target_event_id uuid,
  target_wos_account_id uuid,
  is_change boolean
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  event_row public.fdt_events%rowtype;
  spot public.fdt_assignments%rowtype;
  alliance_label text;
  player_label text := public.account_display_name(target_wos_account_id);
  target_label text;
  rally_note text;
begin
  select * into event_row from public.fdt_events where id = target_event_id;
  select * into spot from public.fdt_assignments
  where event_id = target_event_id and wos_account_id = target_wos_account_id;

  if spot.event_id is null then
    perform public.queue_account_notification(
      target_wos_account_id,
      'fdt_assignment',
      'Removed from the Frostdragon Tyrant lineup',
      'Hi ' || player_label || ', you are no longer in the lineup for ' ||
        event_row.name || '.',
      jsonb_build_object(
        'event_id', target_event_id,
        'event_name', event_row.name,
        'battle_start', event_row.battle_at,
        'player', player_label,
        'removed', true
      ),
      'removal',
      event_row.state_id
    );
    return;
  end if;

  select name into alliance_label
  from public.state_alliances where id = spot.alliance_id;
  target_label := case spot.target
    when 'capital' then 'the Capital'
    when 'spires' then 'the Spires'
    else null
  end;
  rally_note := case spot.target
    when 'capital' then event_row.capital_note
    when 'spires' then event_row.spires_note
    else null
  end;

  perform public.queue_account_notification(
    target_wos_account_id,
    'fdt_assignment',
    case when is_change
      then 'Your Frostdragon Tyrant spot changed'
      else 'Your Frostdragon Tyrant spot'
    end,
    'Hi ' || player_label || ', you play ' || event_row.name || ' in ' ||
      alliance_label ||
      coalesce(', target: ' || target_label, '') || '.' ||
      coalesce(' ' || rally_note, '') ||
      ' Battle starts ' ||
      to_char(event_row.battle_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI') ||
      ' UTC.',
    jsonb_build_object(
      'event_id', target_event_id,
      'event_name', event_row.name,
      'battle_start', event_row.battle_at,
      'player', player_label,
      'alliance_name', alliance_label,
      'target', spot.target,
      'note', rally_note,
      'changed', is_change
    ),
    'assignment',
    event_row.state_id
  );
end;
$$;

-- Put a player in an FDT alliance with a target, or take them out of the
-- lineup (null alliance). At most 60 players per alliance.
create or replace function public.set_fdt_assignment(
  target_event_id uuid,
  target_wos_account_id uuid,
  target_alliance_id uuid,
  selected_target text
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  event_row public.fdt_events%rowtype;
  previous public.fdt_assignments%rowtype;
  cleaned_target text := nullif(btrim(coalesce(selected_target, '')), '');
  alliance_count integer;
begin
  -- Locks the event so two admins can't both take the 60th seat.
  select * into event_row from public.fdt_events
  where id = target_event_id
  for update;
  if event_row.id is null then
    raise exception 'Frostdragon Tyrant event not found.';
  end if;
  if not public.is_state_admin(event_row.state_id) then
    raise exception 'Only state owners and admins can plan Frostdragon Tyrant.';
  end if;
  if not exists (
    select 1 from public.state_members
    where state_id = event_row.state_id and wos_account_id = target_wos_account_id
  ) then
    raise exception 'This WOS account is not in this state.';
  end if;

  select * into previous from public.fdt_assignments
  where event_id = target_event_id and wos_account_id = target_wos_account_id;

  if target_alliance_id is null then
    if previous.event_id is null then
      return;
    end if;
    delete from public.fdt_assignments
    where event_id = target_event_id and wos_account_id = target_wos_account_id;
    if event_row.published_at is not null then
      perform public.notify_fdt_assignment(target_event_id, target_wos_account_id, true);
    end if;
    return;
  end if;

  if not exists (
    select 1 from public.state_alliances
    where id = target_alliance_id and state_id = event_row.state_id
  ) then
    raise exception 'Choose one of your state''s alliances.';
  end if;
  if cleaned_target is not null and cleaned_target not in ('capital', 'spires') then
    raise exception 'Choose the Capital or the Spires.';
  end if;

  select count(*) into alliance_count
  from public.fdt_assignments
  where event_id = target_event_id
    and alliance_id = target_alliance_id
    and wos_account_id <> target_wos_account_id;
  if alliance_count >= 60 then
    raise exception 'This alliance already has 60 players for Frostdragon Tyrant.';
  end if;

  if previous.event_id is not null
    and previous.alliance_id = target_alliance_id
    and previous.target is not distinct from cleaned_target then
    return;
  end if;

  insert into public.fdt_assignments (
    event_id, state_id, wos_account_id, alliance_id, target, updated_at
  ) values (
    target_event_id, event_row.state_id, target_wos_account_id,
    target_alliance_id, cleaned_target, now()
  )
  on conflict (event_id, wos_account_id) do update set
    alliance_id = excluded.alliance_id,
    target = excluded.target,
    updated_at = now();

  if event_row.published_at is not null then
    perform public.notify_fdt_assignment(
      target_event_id, target_wos_account_id, previous.event_id is not null
    );
  end if;
end;
$$;

-- Publishing shows the lineup to members and tells each player their spot.
-- Publishing again sends everyone their (updated) spot once more.
create or replace function public.publish_fdt_event(target_event_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  event_row public.fdt_events%rowtype;
  spot record;
  notified integer := 0;
begin
  select * into event_row from public.fdt_events
  where id = target_event_id
  for update;
  if event_row.id is null then
    raise exception 'Frostdragon Tyrant event not found.';
  end if;
  if not public.is_state_admin(event_row.state_id) then
    raise exception 'Only state owners and admins can plan Frostdragon Tyrant.';
  end if;
  if public.fdt_event_over(event_row.battle_at) then
    raise exception 'This battle is over.';
  end if;

  update public.fdt_events
  set published_at = now(), updated_at = now()
  where id = target_event_id;

  for spot in
    select wos_account_id from public.fdt_assignments
    where event_id = target_event_id
  loop
    perform public.notify_fdt_assignment(
      target_event_id, spot.wos_account_id, event_row.published_at is not null
    );
    notified := notified + 1;
  end loop;

  return notified;
end;
$$;

alter function public.fdt_event_over(timestamptz) owner to postgres;
alter function public.create_fdt_event(uuid, text, timestamptz) owner to postgres;
alter function public.update_fdt_event(uuid, text, timestamptz, text, text) owner to postgres;
alter function public.delete_fdt_event(uuid) owner to postgres;
alter function public.set_fdt_vote(uuid, uuid, text, boolean) owner to postgres;
alter function public.notify_fdt_assignment(uuid, uuid, boolean) owner to postgres;
alter function public.set_fdt_assignment(uuid, uuid, uuid, text) owner to postgres;
alter function public.publish_fdt_event(uuid) owner to postgres;

revoke all on function public.fdt_event_over(timestamptz) from public, anon;
revoke all on function public.create_fdt_event(uuid, text, timestamptz) from public, anon;
revoke all on function public.update_fdt_event(uuid, text, timestamptz, text, text) from public, anon;
revoke all on function public.delete_fdt_event(uuid) from public, anon;
revoke all on function public.set_fdt_vote(uuid, uuid, text, boolean) from public, anon;
revoke all on function public.notify_fdt_assignment(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.set_fdt_assignment(uuid, uuid, uuid, text) from public, anon;
revoke all on function public.publish_fdt_event(uuid) from public, anon;

grant execute on function public.fdt_event_over(timestamptz) to authenticated, service_role;
grant execute on function public.create_fdt_event(uuid, text, timestamptz) to authenticated, service_role;
grant execute on function public.update_fdt_event(uuid, text, timestamptz, text, text) to authenticated, service_role;
grant execute on function public.delete_fdt_event(uuid) to authenticated, service_role;
grant execute on function public.set_fdt_vote(uuid, uuid, text, boolean) to authenticated, service_role;
grant execute on function public.notify_fdt_assignment(uuid, uuid, boolean) to service_role;
grant execute on function public.set_fdt_assignment(uuid, uuid, uuid, text) to authenticated, service_role;
grant execute on function public.publish_fdt_event(uuid) to authenticated, service_role;
