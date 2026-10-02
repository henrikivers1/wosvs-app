


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."accept_state_invite"("invite_token" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  target_invite_id uuid;
begin
  select id into target_invite_id
  from public.state_invites
  where token = invite_token;

  if target_invite_id is null then
    raise exception 'This invitation is invalid or expired.';
  end if;

  return public.respond_to_state_invite(target_invite_id, true);
end;
$$;


ALTER FUNCTION "public"."accept_state_invite"("invite_token" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."activate_scheduled_battle"("target_battle_id" "uuid", "actor_wos_account_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  target_state_id uuid;
  target_battle_name text;
  member_account_id uuid;
begin
  select battle.state_id, battle.name
  into target_state_id, target_battle_name
  from public.battles battle
  where battle.id = target_battle_id
    and battle.status = 'scheduled'
  for update;

  if target_state_id is null then
    raise exception 'This scheduled battle was not found.';
  end if;

  if not public.is_state_admin_account(
    target_state_id,
    actor_wos_account_id
  ) then
    raise exception 'The selected WOS account cannot start this battle.';
  end if;

  if exists (
    select 1
    from public.battles battle
    where battle.state_id = target_state_id
      and battle.status = 'active'
  ) then
    raise exception 'This state already has an active battle.';
  end if;

  update public.battles
  set status = 'active',
      started_at = now()
  where id = target_battle_id;

  for member_account_id in
    select member.wos_account_id
    from public.state_members member
    where member.state_id = target_state_id
  loop
    perform public.queue_account_notification(
      member_account_id,
      'battle_started',
      'Battle period active',
      target_battle_name || ' is now active. Live battle tools are available.',
      jsonb_build_object('battle_id', target_battle_id),
      'battle',
      target_state_id
    );
  end loop;

  return target_state_id;
end;
$$;


ALTER FUNCTION "public"."activate_scheduled_battle"("target_battle_id" "uuid", "actor_wos_account_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assign_tagged_members_to_alliance"("target_alliance_id" "uuid", "target_tag_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  target_state_id uuid;
  alliance_capacity integer;
  alliance_member_count integer;
  tag_bulk_limit integer;
  tagged_members_in_alliance integer;
  available_slots integer;
  assigned_count integer;
begin
  select state_id, max_members
  into target_state_id, alliance_capacity
  from public.state_alliances
  where id = target_alliance_id
  for update;

  if target_state_id is null then
    raise exception 'Alliance not found.';
  end if;

  if not public.is_state_admin(target_state_id) then
    raise exception 'Only state owners and admins can assign alliance members.';
  end if;

  select bulk_move_limit into tag_bulk_limit
    from public.state_tags tag
    where tag.id = target_tag_id
      and tag.state_id = target_state_id;

  if tag_bulk_limit is null then
    raise exception 'That tag does not belong to this state.';
  end if;

  select count(*) into alliance_member_count
  from public.state_alliance_members assignment
  where assignment.alliance_id = target_alliance_id;

  select count(*) into tagged_members_in_alliance
  from public.state_alliance_members alliance_assignment
  join public.state_member_tags tag_assignment
    on tag_assignment.wos_account_id = alliance_assignment.wos_account_id
    and tag_assignment.tag_id = target_tag_id
  where alliance_assignment.alliance_id = target_alliance_id;

  available_slots := least(
    alliance_capacity - alliance_member_count,
    tag_bulk_limit - tagged_members_in_alliance
  );

  if available_slots <= 0 then
    return 0;
  end if;

  insert into public.state_alliance_members (
    state_id,
    wos_account_id,
    alliance_id,
    assigned_by,
    assigned_at
  )
  select
    target_state_id,
    assignment.wos_account_id,
    target_alliance_id,
    auth.uid(),
    now()
  from public.state_member_tags assignment
  join public.state_members member
    on member.state_id = target_state_id
    and member.wos_account_id = assignment.wos_account_id
  where assignment.tag_id = target_tag_id
    and not exists (
      select 1
      from public.state_alliance_members current_assignment
      where current_assignment.state_id = target_state_id
        and current_assignment.wos_account_id = assignment.wos_account_id
        and current_assignment.alliance_id = target_alliance_id
    )
  order by assignment.assigned_at, assignment.wos_account_id
  limit available_slots
  on conflict (state_id, wos_account_id)
  do update set
    alliance_id = excluded.alliance_id,
    assigned_by = excluded.assigned_by,
    assigned_at = excluded.assigned_at;

  get diagnostics assigned_count = row_count;
  return assigned_count;
end;
$$;


ALTER FUNCTION "public"."assign_tagged_members_to_alliance"("target_alliance_id" "uuid", "target_tag_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bulk_assign_battle_plan_members"("target_plan_id" "uuid", "target_group_id" "uuid", "target_wos_account_ids" "uuid"[]) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  target_state_id uuid;
  group_state_id uuid;
  group_capacity integer;
  group_member_count integer;
  account_id uuid;
  led_group_id uuid;
  assigned_count integer := 0;
begin
  select state_id into target_state_id
  from public.battle_plans where id = target_plan_id;
  if target_state_id is null then raise exception 'Battle plan not found.'; end if;
  if not public.is_state_admin(target_state_id) then
    raise exception 'Only state owners and admins can assign battle groups.';
  end if;

  select state_id, max_members into group_state_id, group_capacity
  from public.battle_plan_groups
  where id = target_group_id and plan_id = target_plan_id
  for update;
  if group_state_id is null or group_state_id <> target_state_id then
    raise exception 'Choose a rally group from this battle plan.';
  end if;

  select count(*) into group_member_count
  from public.battle_plan_assignments where group_id = target_group_id;

  foreach account_id in array coalesce(target_wos_account_ids, array[]::uuid[])
  loop
    if group_member_count >= group_capacity then exit; end if;
    if not exists (
      select 1 from public.state_members
      where state_id = target_state_id and wos_account_id = account_id
    ) then continue; end if;
    if exists (
      select 1 from public.battle_plan_assignments
      where plan_id = target_plan_id
        and group_id = target_group_id
        and wos_account_id = account_id
    ) then continue; end if;

    select id into led_group_id
    from public.battle_plan_groups
    where plan_id = target_plan_id
      and leader_wos_account_id = account_id;
    if led_group_id is not null and led_group_id <> target_group_id then
      continue;
    end if;

    insert into public.battle_plan_assignments (
      plan_id, group_id, state_id, wos_account_id, assigned_by
    ) values (
      target_plan_id, target_group_id, target_state_id, account_id, auth.uid()
    )
    on conflict (plan_id, wos_account_id) do update set
      group_id = excluded.group_id,
      state_id = excluded.state_id,
      assigned_by = auth.uid(),
      assigned_at = now();

    group_member_count := group_member_count + 1;
    assigned_count := assigned_count + 1;
    led_group_id := null;
  end loop;

  update public.battle_plans set updated_at = now() where id = target_plan_id;
  return assigned_count;
end;
$$;


ALTER FUNCTION "public"."bulk_assign_battle_plan_members"("target_plan_id" "uuid", "target_group_id" "uuid", "target_wos_account_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_call_state_rallies"("check_state_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.state_members sm
    join public.wos_accounts wa on wa.id = sm.wos_account_id
    where sm.state_id = check_state_id
      and wa.user_id = auth.uid()
      and (
        sm.role in ('owner', 'admin')
        or exists (
          select 1
          from public.state_member_capabilities capability
          where capability.state_id = sm.state_id
            and capability.wos_account_id = sm.wos_account_id
            and capability.capability = 'rally_caller'
        )
      )
  );
$$;


ALTER FUNCTION "public"."can_call_state_rallies"("check_state_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_manage_battle"("check_battle_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.battles
    where id = check_battle_id
      and status = 'active'
      and public.can_call_state_rallies(state_id)
  );
$$;


ALTER FUNCTION "public"."can_manage_battle"("check_battle_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_read_wos_account"("check_wos_account_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    public.owns_wos_account(check_wos_account_id)
    or exists (
      select 1
      from public.state_members mine
      join public.wos_accounts mine_account
        on mine_account.id = mine.wos_account_id
      join public.state_members theirs
        on theirs.state_id = mine.state_id
      where mine_account.user_id = auth.uid()
        and theirs.wos_account_id = check_wos_account_id
    )
    or exists (
      select 1
      from public.state_invites invitation
      where invitation.invited_wos_account_id = check_wos_account_id
        and public.is_state_owner(invitation.state_id)
    );
$$;


ALTER FUNCTION "public"."can_read_wos_account"("check_wos_account_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_view_battle"("check_battle_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.battles
    where id = check_battle_id
      and public.can_view_state_operations(state_id)
  );
$$;


ALTER FUNCTION "public"."can_view_battle"("check_battle_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_view_battle_plan"("target_plan_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.battle_plans plan
    where plan.id = target_plan_id
      and public.is_state_member(plan.state_id)
      and (
        plan.status = 'published'
        or public.is_state_admin(plan.state_id)
      )
  );
$$;


ALTER FUNCTION "public"."can_view_battle_plan"("target_plan_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_view_battle_plan_comment"("target_comment_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.battle_plan_comments comment
    where comment.id = target_comment_id
      and public.is_state_member(comment.state_id)
      and (
        comment.visibility = 'public'
        or public.is_state_admin(comment.state_id)
      )
  );
$$;


ALTER FUNCTION "public"."can_view_battle_plan_comment"("target_comment_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_view_state_announcement"("target_announcement_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.state_announcements announcement
    where announcement.id = target_announcement_id
      and announcement.expires_at > now()
      and (
        public.is_state_admin(announcement.state_id)
        or exists (
          select 1
          from public.state_announcement_recipients recipient
          join public.wos_accounts account
            on account.id = recipient.wos_account_id
          where recipient.announcement_id = announcement.id
            and account.user_id = auth.uid()
        )
      )
  );
$$;


ALTER FUNCTION "public"."can_view_state_announcement"("target_announcement_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_view_state_operations"("check_state_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.state_members sm
    join public.wos_accounts wa on wa.id = sm.wos_account_id
    where sm.state_id = check_state_id
      and wa.user_id = auth.uid()
      and (
        sm.role in ('owner', 'admin')
        or exists (
          select 1
          from public.state_member_capabilities capability
          where capability.state_id = sm.state_id
            and capability.wos_account_id = sm.wos_account_id
            and capability.capability in ('rally_caller', 'garrison')
        )
      )
  );
$$;


ALTER FUNCTION "public"."can_view_state_operations"("check_state_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_deleted_battle_plan_notifications"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  delete from public.notifications
  where data ->> 'plan_id' = old.id::text;
  return old;
end;
$$;


ALTER FUNCTION "public"."cleanup_deleted_battle_plan_notifications"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_deleted_plan_comment_notifications"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  delete from public.notifications
  where data ->> 'comment_id' = old.id::text;
  return old;
end;
$$;


ALTER FUNCTION "public"."cleanup_deleted_plan_comment_notifications"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_expired_state_announcements"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  deleted_count integer;
begin
  delete from public.notifications notification
  using public.state_announcements announcement
  where announcement.expires_at <= now()
    and notification.type = 'state_announcement'
    and notification.data ->> 'announcement_id' = announcement.id::text;

  delete from public.state_announcements
  where expires_at <= now();

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;


ALTER FUNCTION "public"."cleanup_expired_state_announcements"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_expired_state_polls"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  deleted_count integer;
  expired_state_ids uuid[];
  expired_state_id uuid;
begin
  select array_agg(distinct state_id)
  into expired_state_ids
  from public.state_polls
  where delete_at <= now();

  delete from public.notifications notification
  using public.state_polls poll
  where poll.delete_at <= now()
    and notification.type = 'state_poll_created'
    and notification.data ->> 'poll_id' = poll.id::text;

  delete from public.state_polls
  where delete_at <= now();

  get diagnostics deleted_count = row_count;

  foreach expired_state_id in array coalesce(expired_state_ids, array[]::uuid[])
  loop
    perform public.refresh_vote_generated_tags(expired_state_id, null);
  end loop;

  return deleted_count;
end;
$$;


ALTER FUNCTION "public"."cleanup_expired_state_polls"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_account_setup"("chosen_username" "text", "chosen_wos_id" "text", "chosen_wos_nickname" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  normalized_username text := trim(chosen_username);
  normalized_wos_id text := trim(chosen_wos_id);
  configured_account_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must sign in first.';
  end if;

  if normalized_username !~ '^[A-Za-z0-9_]{3,24}$' then
    raise exception 'Username must be 3-24 characters using letters, numbers, or underscores.';
  end if;

  if normalized_wos_id !~ '^[0-9]+$' then
    raise exception 'WOS ID must contain numbers only.';
  end if;

  update public.profiles
  set username = normalized_username,
      display_name = normalized_username
  where id = auth.uid();

  select id into configured_account_id
  from public.wos_accounts
  where user_id = auth.uid()
    and is_configured = false
  order by created_at, id
  limit 1
  for update;

  if configured_account_id is null then
    insert into public.wos_accounts (
      user_id,
      wos_id,
      nickname,
      is_configured
    )
    values (
      auth.uid(),
      normalized_wos_id,
      nullif(trim(chosen_wos_nickname), ''),
      true
    )
    returning id into configured_account_id;
  else
    update public.wos_accounts
    set wos_id = normalized_wos_id,
        nickname = nullif(trim(chosen_wos_nickname), ''),
        is_configured = true
    where id = configured_account_id;
  end if;

  return configured_account_id;
end;
$_$;


ALTER FUNCTION "public"."complete_account_setup"("chosen_username" "text", "chosen_wos_id" "text", "chosen_wos_nickname" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_active_battle"("target_battle_id" "uuid", "actor_wos_account_id" "uuid", "selected_result" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  target_state_id uuid;
  cleaned_result text := lower(btrim(coalesce(selected_result, '')));
begin
  if cleaned_result not in ('win', 'loss') then
    raise exception 'Choose Win or Loss.';
  end if;

  select battle.state_id
  into target_state_id
  from public.battles battle
  where battle.id = target_battle_id
    and battle.status = 'active'
  for update;

  if target_state_id is null then
    raise exception 'This battle period is not active.';
  end if;

  if not public.is_state_admin_account(
    target_state_id,
    actor_wos_account_id
  ) then
    raise exception 'The selected WOS account cannot end this battle.';
  end if;

  if not exists (
    select 1
    from public.rallies rally
    where rally.battle_id = target_battle_id
  ) then
    delete from public.battles where id = target_battle_id;
    return target_state_id;
  end if;

  update public.battles
  set status = 'completed',
      result = cleaned_result,
      ended_at = now()
  where id = target_battle_id;

  return target_state_id;
end;
$$;


ALTER FUNCTION "public"."complete_active_battle"("target_battle_id" "uuid", "actor_wos_account_id" "uuid", "selected_result" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_battle_plan"("target_state_id" "uuid", "plan_name" "text", "selected_battle_type" "text", "plan_scheduled_at" timestamp with time zone, "plan_notes" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  new_plan_id uuid;
  cleaned_name text := btrim(coalesce(plan_name, ''));
  cleaned_type text := lower(btrim(coalesce(selected_battle_type, '')));
  cleaned_notes text := nullif(btrim(coalesce(plan_notes, '')), '');
begin
  if not public.is_state_admin(target_state_id) then
    raise exception 'Only state owners and admins can create battle plans.';
  end if;

  if char_length(cleaned_name) not between 3 and 100 then
    raise exception 'Plan names must contain between 3 and 100 characters.';
  end if;

  if cleaned_type not in ('svs', 'castle', 'test') then
    raise exception 'Choose SVS, Castle, or Test.';
  end if;

  if plan_scheduled_at <= now() then
    raise exception 'Choose a future battle time.';
  end if;

  if cleaned_notes is not null and char_length(cleaned_notes) > 2000 then
    raise exception 'Plan notes cannot exceed 2000 characters.';
  end if;

  insert into public.battle_plans (
    state_id,
    name,
    battle_type,
    scheduled_at,
    notes,
    created_by
  )
  values (
    target_state_id,
    cleaned_name,
    cleaned_type,
    plan_scheduled_at,
    cleaned_notes,
    auth.uid()
  )
  returning id into new_plan_id;

  return new_plan_id;
end;
$$;


ALTER FUNCTION "public"."create_battle_plan"("target_state_id" "uuid", "plan_name" "text", "selected_battle_type" "text", "plan_scheduled_at" timestamp with time zone, "plan_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_battle_plan_comment"("target_plan_id" "uuid", "commenter_wos_account_id" "uuid", "comment_body" "text", "comment_visibility" "text" DEFAULT 'public'::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  target_state_id uuid;
  target_plan_name text;
  cleaned_body text := btrim(coalesce(comment_body, ''));
  cleaned_visibility text := lower(btrim(coalesce(comment_visibility, 'public')));
  commenter_user_id uuid;
  commenter_name text;
  new_comment_id uuid;
  mentioned_user_id uuid;
  admin_user_id uuid;
begin
  select plan.state_id, plan.name
  into target_state_id, target_plan_name
  from public.battle_plans plan
  where plan.id = target_plan_id;

  if target_state_id is null then
    raise exception 'Battle plan not found.';
  end if;

  if char_length(cleaned_body) not between 1 and 2000 then
    raise exception 'Comments must contain between 1 and 2000 characters.';
  end if;

  if cleaned_visibility not in ('public', 'admins') then
    raise exception 'Choose Public or Admin-only visibility.';
  end if;

  if not public.owns_wos_account(commenter_wos_account_id)
     or not exists (
       select 1
       from public.state_members member
       where member.state_id = target_state_id
         and member.wos_account_id = commenter_wos_account_id
     ) then
    raise exception 'Choose one of your WOS accounts from this state.';
  end if;

  if cleaned_visibility = 'admins'
     and not public.is_state_admin(target_state_id) then
    raise exception 'Only Owners and Admins can post admin-only comments.';
  end if;

  select
    account.user_id,
    coalesce('@' || profile.username, account.nickname, 'WOS ID ' || account.wos_id)
  into commenter_user_id, commenter_name
  from public.wos_accounts account
  left join public.profiles profile on profile.id = account.user_id
  where account.id = commenter_wos_account_id;

  insert into public.battle_plan_comments (
    plan_id,
    state_id,
    author_user_id,
    author_wos_account_id,
    visibility,
    body
  )
  values (
    target_plan_id,
    target_state_id,
    commenter_user_id,
    commenter_wos_account_id,
    cleaned_visibility,
    cleaned_body
  )
  returning id into new_comment_id;

  -- @username mentions notify that user. Admin-only comments can only notify
  -- Owners and Admins so private text never leaks to regular members.
  for mentioned_user_id in
    select distinct profile.id
    from regexp_matches(
      cleaned_body,
      '@([[:alnum:]_.-]+)',
      'g'
    ) as mention(captures)
    join public.profiles profile
      on lower(profile.username) = lower((mention.captures)[1])
    where profile.id <> commenter_user_id
      and exists (
        select 1
        from public.state_members member
        join public.wos_accounts account
          on account.id = member.wos_account_id
        where member.state_id = target_state_id
          and account.user_id = profile.id
          and (
            cleaned_visibility = 'public'
            or member.role in ('owner', 'admin')
          )
      )
  loop
    insert into public.notifications (user_id, type, title, body, data)
    values (
      mentioned_user_id,
      'battle_plan_comment_mention',
      'Mentioned in a battle plan',
      commenter_name || ' mentioned you on ' || target_plan_name || ': ' ||
        left(cleaned_body, 240),
      jsonb_build_object(
        'comment_id', new_comment_id,
        'plan_id', target_plan_id,
        'state_id', target_state_id
      )
    );
  end loop;

  -- Notify every Owner/Admin. This also supports older plans whose created_by
  -- value is empty. A mentioned admin receives only the mention notification.
  for admin_user_id in
    select distinct account.user_id
    from public.state_members member
    join public.wos_accounts account
      on account.id = member.wos_account_id
    where member.state_id = target_state_id
      and member.role in ('owner', 'admin')
      and (
        account.user_id <> commenter_user_id
        or member.wos_account_id <> commenter_wos_account_id
      )
      and not exists (
        select 1
        from public.notifications notification
        where notification.user_id = account.user_id
          and notification.type = 'battle_plan_comment_mention'
          and notification.data ->> 'comment_id' = new_comment_id::text
      )
  loop
    insert into public.notifications (user_id, type, title, body, data)
    values (
      admin_user_id,
      'battle_plan_comment',
      'New battle plan comment',
      commenter_name || ' commented on ' || target_plan_name || ': ' ||
        left(cleaned_body, 240),
      jsonb_build_object(
        'comment_id', new_comment_id,
        'plan_id', target_plan_id,
        'state_id', target_state_id
      )
    );
  end loop;

  return new_comment_id;
end;
$$;


ALTER FUNCTION "public"."create_battle_plan_comment"("target_plan_id" "uuid", "commenter_wos_account_id" "uuid", "comment_body" "text", "comment_visibility" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_battle_plan_group"("target_plan_id" "uuid", "group_name" "text", "leader_account_id" "uuid", "destination_alliance_id" "uuid", "publish_tag_id" "uuid" DEFAULT NULL::"uuid", "group_max_members" integer DEFAULT 10, "group_notes" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  target_state_id uuid;
  rally_lead_tag_id uuid;
  new_group_id uuid;
  next_sort_order smallint;
  cleaned_name text := btrim(coalesce(group_name, ''));
  cleaned_notes text := nullif(btrim(coalesce(group_notes, '')), '');
begin
  select state_id into target_state_id
  from public.battle_plans where id = target_plan_id;

  if target_state_id is null then raise exception 'Battle plan not found.'; end if;
  if not public.is_state_admin(target_state_id) then
    raise exception 'Only state owners and admins can create rally groups.';
  end if;
  if char_length(cleaned_name) not between 1 and 60 then
    raise exception 'Rally group names must contain between 1 and 60 characters.';
  end if;
  if group_max_members not between 1 and 100 then
    raise exception 'Rally group capacity must be between 1 and 100.';
  end if;
  if cleaned_notes is not null and char_length(cleaned_notes) > 1000 then
    raise exception 'Rally group notes cannot exceed 1000 characters.';
  end if;

  select id into rally_lead_tag_id from public.state_tags
  where state_id = target_state_id and system_key = 'rally_lead';

  if not exists (
    select 1 from public.state_member_tags
    where tag_id = rally_lead_tag_id
      and wos_account_id = leader_account_id
  ) then
    raise exception 'Only accounts with the Rally Lead tag can lead a group.';
  end if;
  if not exists (
    select 1 from public.state_alliances
    where id = destination_alliance_id and state_id = target_state_id
  ) then
    raise exception 'Choose a destination alliance from this state.';
  end if;
  if publish_tag_id is not null and not exists (
    select 1 from public.state_tags
    where id = publish_tag_id
      and state_id = target_state_id
      and system_key is null
  ) then
    raise exception 'Choose a regular state tag for the published group.';
  end if;

  select coalesce(max(sort_order), -1) + 1 into next_sort_order
  from public.battle_plan_groups where plan_id = target_plan_id;

  insert into public.battle_plan_groups (
    plan_id, state_id, name, leader_wos_account_id,
    alliance_id, assignment_tag_id, max_members, notes, sort_order
  ) values (
    target_plan_id, target_state_id, cleaned_name, leader_account_id,
    destination_alliance_id, publish_tag_id, group_max_members,
    cleaned_notes, next_sort_order
  ) returning id into new_group_id;

  insert into public.battle_plan_assignments (
    plan_id, group_id, state_id, wos_account_id, assigned_by
  ) values (
    target_plan_id, new_group_id, target_state_id, leader_account_id, auth.uid()
  )
  on conflict (plan_id, wos_account_id) do update set
    group_id = excluded.group_id,
    state_id = excluded.state_id,
    assigned_by = auth.uid(),
    assigned_at = now();

  update public.battle_plans set updated_at = now() where id = target_plan_id;
  return new_group_id;
exception
  when unique_violation then
    raise exception 'That player already leads a rally group in this plan.';
end;
$$;


ALTER FUNCTION "public"."create_battle_plan_group"("target_plan_id" "uuid", "group_name" "text", "leader_account_id" "uuid", "destination_alliance_id" "uuid", "publish_tag_id" "uuid", "group_max_members" integer, "group_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_state_alliance"("target_state_id" "uuid", "alliance_name" "text", "alliance_color" "text", "alliance_max_members" integer) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  new_alliance_id uuid;
  cleaned_name text := btrim(coalesce(alliance_name, ''));
  cleaned_color text := lower(btrim(coalesce(alliance_color, '')));
begin
  if not public.is_state_admin(target_state_id) then
    raise exception 'Only state owners and admins can create alliances.';
  end if;

  if char_length(cleaned_name) not between 1 and 40 then
    raise exception 'Alliance names must contain between 1 and 40 characters.';
  end if;

  if cleaned_color !~ '^#[0-9a-f]{6}$' then
    raise exception 'Alliance colors must use a six-digit hex code.';
  end if;

  if alliance_max_members not between 1 and 100 then
    raise exception 'Alliance capacity must be between 1 and 100.';
  end if;

  insert into public.state_alliances (
    state_id,
    name,
    color,
    max_members,
    created_by
  )
  values (
    target_state_id,
    cleaned_name,
    cleaned_color,
    alliance_max_members,
    auth.uid()
  )
  returning id into new_alliance_id;

  return new_alliance_id;
exception
  when unique_violation then
    raise exception 'An alliance with that name already exists in this state.';
end;
$_$;


ALTER FUNCTION "public"."create_state_alliance"("target_state_id" "uuid", "alliance_name" "text", "alliance_color" "text", "alliance_max_members" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_state_announcement"("target_state_id" "uuid", "sender_wos_account_id" "uuid", "announcement_title" "text", "announcement_body" "text", "target_audience_type" "text", "target_audience_id" "uuid", "target_audience_value" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  new_announcement_id uuid;
  cleaned_title text := btrim(coalesce(announcement_title, ''));
  cleaned_body text := btrim(coalesce(announcement_body, ''));
  cleaned_audience_type text := lower(btrim(coalesce(target_audience_type, '')));
  cleaned_audience_value text := lower(btrim(coalesce(target_audience_value, '')));
  audience_label text;
  weekly_expiration timestamptz;
  recipient_account_id uuid;
begin
  if not public.is_state_admin_account(
    target_state_id,
    sender_wos_account_id
  ) then
    raise exception 'The selected WOS account cannot create announcements.';
  end if;

  if char_length(cleaned_title) not between 3 and 100 then
    raise exception 'Announcement titles must contain between 3 and 100 characters.';
  end if;
  if char_length(cleaned_body) not between 1 and 2000 then
    raise exception 'Announcement messages must contain between 1 and 2000 characters.';
  end if;

  weekly_expiration := (
    date_trunc('week', timezone('UTC', now()))
    + interval '6 days 23 hours 59 minutes 59 seconds'
  ) at time zone 'UTC';

  if cleaned_audience_type = 'all' then
    target_audience_id := null;
    cleaned_audience_value := '';
    audience_label := 'Entire state';
  elsif cleaned_audience_type = 'alliance' then
    select alliance.name into audience_label
    from public.state_alliances alliance
    where alliance.id = target_audience_id
      and alliance.state_id = target_state_id;
  elsif cleaned_audience_type = 'tag' then
    select tag.name into audience_label
    from public.state_tags tag
    where tag.id = target_audience_id
      and tag.state_id = target_state_id;
  elsif cleaned_audience_type = 'role' then
    target_audience_id := null;
    if cleaned_audience_value not in ('owner', 'admin', 'member') then
      raise exception 'Choose Owner, Admin, or Member.';
    end if;
    audience_label := initcap(cleaned_audience_value || 's');
  elsif cleaned_audience_type = 'capability' then
    target_audience_id := null;
    if cleaned_audience_value not in ('rally_caller', 'garrison') then
      raise exception 'Choose Coordinator or Garrison.';
    end if;
    audience_label := case cleaned_audience_value
      when 'rally_caller' then 'Coordinators'
      else 'Garrison'
    end;
  else
    raise exception 'Choose a valid announcement audience.';
  end if;

  if cleaned_audience_type in ('alliance', 'tag')
     and audience_label is null then
    raise exception 'Choose a valid audience from this state.';
  end if;

  insert into public.state_announcements (
    state_id,
    title,
    body,
    audience_type,
    audience_id,
    audience_value,
    created_by,
    expires_at
  )
  values (
    target_state_id,
    cleaned_title,
    cleaned_body,
    cleaned_audience_type,
    target_audience_id,
    nullif(cleaned_audience_value, ''),
    auth.uid(),
    weekly_expiration
  )
  returning id into new_announcement_id;

  if cleaned_audience_type = 'all' then
    insert into public.state_announcement_recipients (
      announcement_id, state_id, wos_account_id
    )
    select new_announcement_id, target_state_id, member.wos_account_id
    from public.state_members member
    where member.state_id = target_state_id;
  elsif cleaned_audience_type = 'alliance' then
    insert into public.state_announcement_recipients (
      announcement_id, state_id, wos_account_id
    )
    select new_announcement_id, target_state_id, assignment.wos_account_id
    from public.state_alliance_members assignment
    where assignment.state_id = target_state_id
      and assignment.alliance_id = target_audience_id;
  elsif cleaned_audience_type = 'tag' then
    insert into public.state_announcement_recipients (
      announcement_id, state_id, wos_account_id
    )
    select new_announcement_id, target_state_id, assignment.wos_account_id
    from public.state_member_tags assignment
    join public.state_members member
      on member.state_id = target_state_id
      and member.wos_account_id = assignment.wos_account_id
    where assignment.tag_id = target_audience_id;
  elsif cleaned_audience_type = 'role' then
    insert into public.state_announcement_recipients (
      announcement_id, state_id, wos_account_id
    )
    select new_announcement_id, target_state_id, member.wos_account_id
    from public.state_members member
    where member.state_id = target_state_id
      and member.role = cleaned_audience_value;
  else
    insert into public.state_announcement_recipients (
      announcement_id, state_id, wos_account_id
    )
    select distinct new_announcement_id, target_state_id, member.wos_account_id
    from public.state_members member
    left join public.state_member_capabilities capability
      on capability.state_id = member.state_id
      and capability.wos_account_id = member.wos_account_id
    where member.state_id = target_state_id
      and (
        member.role in ('owner', 'admin')
        or capability.capability = cleaned_audience_value
      );
  end if;

  if not exists (
    select 1
    from public.state_announcement_recipients recipient
    where recipient.announcement_id = new_announcement_id
  ) then
    raise exception 'The selected audience has no members.';
  end if;

  for recipient_account_id in
    select recipient.wos_account_id
    from public.state_announcement_recipients recipient
    where recipient.announcement_id = new_announcement_id
  loop
    perform public.queue_account_notification(
      recipient_account_id,
      'state_announcement',
      cleaned_title,
      audience_label || ': ' || cleaned_body,
      jsonb_build_object('announcement_id', new_announcement_id),
      'social',
      target_state_id
    );
  end loop;

  return new_announcement_id;
end;
$$;


ALTER FUNCTION "public"."create_state_announcement"("target_state_id" "uuid", "sender_wos_account_id" "uuid", "announcement_title" "text", "announcement_body" "text", "target_audience_type" "text", "target_audience_id" "uuid", "target_audience_value" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_state_join_invite"("target_state_id" "uuid", "target_wos_id" "text", "valid_for_hours" integer DEFAULT 72) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  invited_account_id uuid;
  invited_user_id uuid;
  invited_state_name text;
  new_invite_id uuid;
  new_token uuid;
begin
  if not public.is_state_admin(target_state_id) then
    raise exception 'Only state owners and admins can create invitations.';
  end if;

  if valid_for_hours < 1 or valid_for_hours > 720 then
    raise exception 'Invitation duration must be between 1 and 720 hours.';
  end if;

  select id, user_id into invited_account_id, invited_user_id
  from public.wos_accounts
  where wos_id = trim(target_wos_id) and is_configured = true;

  if invited_account_id is null then
    raise exception 'No registered account with that WOS ID was found.';
  end if;

  if exists (
    select 1 from public.state_members
    where state_id = target_state_id
      and wos_account_id = invited_account_id
  ) then
    raise exception 'That WOS account is already a state member.';
  end if;

  if exists (
    select 1 from public.state_invites
    where state_id = target_state_id
      and invited_wos_account_id = invited_account_id
      and status in ('pending_recipient', 'pending_owner')
      and expires_at > now()
  ) then
    raise exception 'That WOS account already has a pending invitation.';
  end if;

  select name into invited_state_name
  from public.states where id = target_state_id;

  insert into public.state_invites (
    state_id, invited_wos_account_id, created_by, expires_at, status
  ) values (
    target_state_id,
    invited_account_id,
    auth.uid(),
    now() + make_interval(hours => valid_for_hours),
    'pending_recipient'
  )
  returning id, token into new_invite_id, new_token;

  insert into public.notifications (user_id, type, title, body, data)
  values (
    invited_user_id,
    'state_invite',
    'State invitation',
    'You were invited to join ' || invited_state_name || '.',
    jsonb_build_object(
      'invite_id', new_invite_id,
      'state_id', target_state_id,
      'token', new_token
    )
  );

  return new_token;
end;
$$;


ALTER FUNCTION "public"."create_state_join_invite"("target_state_id" "uuid", "target_wos_id" "text", "valid_for_hours" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_state_poll"("target_state_id" "uuid", "creator_wos_account_id" "uuid", "poll_question" "text", "poll_description" "text", "option_labels" "text"[], "option_tag_ids" "uuid"[], "poll_closes_at" timestamp with time zone) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  new_poll_id uuid;
  cleaned_question text := btrim(coalesce(poll_question, ''));
  cleaned_description text := nullif(btrim(coalesce(poll_description, '')), '');
  cleaned_options text[];
  option_count integer;
  recipient_account_id uuid;
  target_state_name text;
begin
  perform public.cleanup_expired_state_polls();

  if not public.is_state_admin_account(
    target_state_id,
    creator_wos_account_id
  ) then
    raise exception 'The selected WOS account cannot create votes.';
  end if;

  if char_length(cleaned_question) not between 3 and 140 then
    raise exception 'The question must contain between 3 and 140 characters.';
  end if;
  if cleaned_description is not null
     and char_length(cleaned_description) > 1000 then
    raise exception 'The description cannot exceed 1000 characters.';
  end if;

  select array_agg(btrim(option_label) order by option_number)
  into cleaned_options
  from unnest(coalesce(option_labels, array[]::text[]))
    with ordinality as supplied_options(option_label, option_number)
  where btrim(option_label) <> '';

  option_count := coalesce(array_length(cleaned_options, 1), 0);
  if option_count not between 2 and 10 then
    raise exception 'A vote must have between 2 and 10 options.';
  end if;
  if option_count <> coalesce(array_length(option_labels, 1), 0) then
    raise exception 'Complete or remove every empty vote option.';
  end if;
  if coalesce(array_length(option_tag_ids, 1), 0) <> option_count then
    raise exception 'Every vote option must include a tag selection or no tag.';
  end if;
  if exists (
    select 1
    from unnest(cleaned_options) option_label
    group by lower(option_label)
    having count(*) > 1
  ) then
    raise exception 'Vote options must be unique.';
  end if;
  if exists (
    select 1
    from unnest(option_tag_ids) supplied_tag_id
    where supplied_tag_id is not null
      and not exists (
        select 1
        from public.state_tags tag
        where tag.id = supplied_tag_id
          and tag.state_id = target_state_id
      )
  ) then
    raise exception 'One selected tag does not belong to this state.';
  end if;
  if poll_closes_at <= now() + interval '1 minute' then
    raise exception 'The closing time must be at least one minute from now.';
  end if;
  if poll_closes_at > now() + interval '30 days' then
    raise exception 'Votes cannot remain open for longer than 30 days.';
  end if;

  insert into public.state_polls (
    state_id,
    question,
    description,
    created_by,
    closes_at,
    delete_at
  )
  values (
    target_state_id,
    cleaned_question,
    cleaned_description,
    auth.uid(),
    poll_closes_at,
    now() + interval '30 days'
  )
  returning id into new_poll_id;

  insert into public.state_poll_options (
    poll_id,
    label,
    sort_order,
    auto_tag_id
  )
  select
    new_poll_id,
    cleaned_options[option_number],
    (option_number - 1)::smallint,
    option_tag_ids[option_number]
  from generate_series(1, option_count) option_number;

  select state_row.name into target_state_name
  from public.states state_row
  where state_row.id = target_state_id;

  for recipient_account_id in
    select member.wos_account_id
    from public.state_members member
    where member.state_id = target_state_id
  loop
    perform public.queue_account_notification(
      recipient_account_id,
      'state_poll_created',
      'New state vote',
      target_state_name || ': ' || cleaned_question,
      jsonb_build_object('poll_id', new_poll_id),
      'state',
      target_state_id
    );
  end loop;

  return new_poll_id;
end;
$$;


ALTER FUNCTION "public"."create_state_poll"("target_state_id" "uuid", "creator_wos_account_id" "uuid", "poll_question" "text", "poll_description" "text", "option_labels" "text"[], "option_tag_ids" "uuid"[], "poll_closes_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_state_system_tags"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.state_tags (
    state_id,
    name,
    color,
    bulk_move_limit,
    system_key
  )
  values (
    new.id,
    'Rally Lead',
    '#d49a43',
    100,
    'rally_lead'
  )
  on conflict do nothing;

  return new;
end;
$$;


ALTER FUNCTION "public"."create_state_system_tags"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_state_tag"("target_state_id" "uuid", "tag_name" "text", "tag_color" "text", "tag_bulk_move_limit" integer) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  new_tag_id uuid;
  cleaned_name text := btrim(coalesce(tag_name, ''));
  cleaned_color text := lower(btrim(coalesce(tag_color, '')));
begin
  if not public.is_state_admin(target_state_id) then
    raise exception 'Only state owners and admins can create tags.';
  end if;

  if char_length(cleaned_name) not between 1 and 32 then
    raise exception 'Tag names must contain between 1 and 32 characters.';
  end if;

  if cleaned_color !~ '^#[0-9a-f]{6}$' then
    raise exception 'Tag colors must use a six-digit hex code.';
  end if;

  if tag_bulk_move_limit not between 1 and 100 then
    raise exception 'The tag bulk-move limit must be between 1 and 100.';
  end if;

  insert into public.state_tags (
    state_id,
    name,
    color,
    bulk_move_limit,
    created_by
  )
  values (
    target_state_id,
    cleaned_name,
    cleaned_color,
    tag_bulk_move_limit,
    auth.uid()
  )
  returning id into new_tag_id;

  return new_tag_id;
exception
  when unique_violation then
    raise exception 'A tag with that name already exists in this state.';
end;
$_$;


ALTER FUNCTION "public"."create_state_tag"("target_state_id" "uuid", "tag_name" "text", "tag_color" "text", "tag_bulk_move_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_battle_plan"("target_plan_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  target_state_id uuid;
begin
  select state_id into target_state_id
  from public.battle_plans
  where id = target_plan_id;

  if target_state_id is null then
    raise exception 'Battle plan not found.';
  end if;

  if not public.is_state_admin(target_state_id) then
    raise exception 'Only state owners and admins can delete battle plans.';
  end if;

  delete from public.notifications
  where type = 'battle_plan_assignment'
    and data ->> 'plan_id' = target_plan_id::text;

  delete from public.battle_plans
  where id = target_plan_id;
end;
$$;


ALTER FUNCTION "public"."delete_battle_plan"("target_plan_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_battle_plan_comment"("target_comment_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  target_state_id uuid;
  target_author_user_id uuid;
begin
  select comment.state_id, comment.author_user_id
  into target_state_id, target_author_user_id
  from public.battle_plan_comments comment
  where comment.id = target_comment_id;

  if target_state_id is null then
    raise exception 'Comment not found.';
  end if;

  if target_author_user_id is distinct from auth.uid()
     and not public.is_state_admin(target_state_id) then
    raise exception 'You cannot delete this comment.';
  end if;

  delete from public.notifications
  where data ->> 'comment_id' = target_comment_id::text;

  delete from public.battle_plan_comments
  where id = target_comment_id;
end;
$$;


ALTER FUNCTION "public"."delete_battle_plan_comment"("target_comment_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_battle_plan_comment"("target_comment_id" "uuid", "actor_wos_account_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  target_state_id uuid;
  target_author_account_id uuid;
begin
  select comment.state_id, comment.author_wos_account_id
  into target_state_id, target_author_account_id
  from public.battle_plan_comments comment
  where comment.id = target_comment_id;

  if target_state_id is null then
    raise exception 'Comment not found.';
  end if;

  if target_author_account_id is distinct from actor_wos_account_id
     and not public.is_state_admin_account(
       target_state_id,
       actor_wos_account_id
     ) then
    raise exception 'The selected WOS account cannot delete this comment.';
  end if;

  if not public.owns_wos_account(actor_wos_account_id) then
    raise exception 'Select one of your WOS accounts.';
  end if;

  delete from public.notifications
  where data ->> 'comment_id' = target_comment_id::text;

  delete from public.battle_plan_comments
  where id = target_comment_id;
end;
$$;


ALTER FUNCTION "public"."delete_battle_plan_comment"("target_comment_id" "uuid", "actor_wos_account_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_battle_plan_group"("target_group_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  target_plan_id uuid;
  target_state_id uuid;
begin
  select plan_id, state_id
  into target_plan_id, target_state_id
  from public.battle_plan_groups
  where id = target_group_id;

  if target_state_id is null then
    raise exception 'Rally group not found.';
  end if;

  if not public.is_state_admin(target_state_id) then
    raise exception 'Only state owners and admins can delete rally groups.';
  end if;

  delete from public.battle_plan_groups
  where id = target_group_id;

  update public.battle_plans
  set updated_at = now()
  where id = target_plan_id;
end;
$$;


ALTER FUNCTION "public"."delete_battle_plan_group"("target_group_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_state_alliance"("target_alliance_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  target_state_id uuid;
begin
  select state_id into target_state_id
  from public.state_alliances
  where id = target_alliance_id;

  if target_state_id is null then
    raise exception 'Alliance not found.';
  end if;

  if not public.is_state_admin(target_state_id) then
    raise exception 'Only state owners and admins can delete alliances.';
  end if;

  delete from public.state_alliances where id = target_alliance_id;
end;
$$;


ALTER FUNCTION "public"."delete_state_alliance"("target_alliance_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_state_announcement"("target_announcement_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  target_state_id uuid;
begin
  select state_id into target_state_id
  from public.state_announcements
  where id = target_announcement_id;

  if target_state_id is null then
    raise exception 'Announcement not found.';
  end if;

  if not public.is_state_admin(target_state_id) then
    raise exception 'Only state owners and admins can delete announcements.';
  end if;

  delete from public.notifications
  where type = 'state_announcement'
    and data ->> 'announcement_id' = target_announcement_id::text;

  delete from public.state_announcements
  where id = target_announcement_id;
end;
$$;


ALTER FUNCTION "public"."delete_state_announcement"("target_announcement_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_state_poll"("target_poll_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  target_state_id uuid;
begin
  select state_id into target_state_id
  from public.state_polls
  where id = target_poll_id;

  if target_state_id is null then
    raise exception 'Vote not found.';
  end if;

  if not public.is_state_admin(target_state_id) then
    raise exception 'Only state owners and admins can delete votes.';
  end if;

  delete from public.notifications
  where type = 'state_poll_created'
    and data ->> 'poll_id' = target_poll_id::text;

  delete from public.state_polls where id = target_poll_id;
  perform public.refresh_vote_generated_tags(target_state_id, null);
end;
$$;


ALTER FUNCTION "public"."delete_state_poll"("target_poll_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_state_tag"("target_tag_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  target_state_id uuid;
  target_system_key text;
begin
  select state_id, system_key
  into target_state_id, target_system_key
  from public.state_tags
  where id = target_tag_id;

  if target_state_id is null then raise exception 'Tag not found.'; end if;
  if not public.is_state_admin(target_state_id) then
    raise exception 'Only state owners and admins can delete tags.';
  end if;
  if target_system_key is not null then
    raise exception 'System tags are permanent and cannot be deleted.';
  end if;

  delete from public.state_tags where id = target_tag_id;
end;
$$;


ALTER FUNCTION "public"."delete_state_tag"("target_tag_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."end_state_battle"("target_battle_id" "uuid", "selected_battle_type" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  target_state_id uuid;
  normalized_battle_type text;
begin
  normalized_battle_type := lower(trim(selected_battle_type));
  if normalized_battle_type not in ('svs', 'castle', 'test') then
    raise exception 'Choose SVS, Castle, or Test.';
  end if;

  select state_id into target_state_id
  from public.battles
  where id = target_battle_id and status = 'active'
  for update;

  if target_state_id is null then
    raise exception 'This battle period is not active.';
  end if;

  if not public.is_state_admin(target_state_id) then
    raise exception 'Only state owners and admins can end a battle period.';
  end if;

  if not exists (
    select 1 from public.rallies where battle_id = target_battle_id
  ) then
    delete from public.battles where id = target_battle_id;
    return target_state_id;
  end if;

  update public.battles
  set status = 'completed',
      battle_type = normalized_battle_type,
      ended_at = now()
  where id = target_battle_id;

  return target_state_id;
end;
$$;


ALTER FUNCTION "public"."end_state_battle"("target_battle_id" "uuid", "selected_battle_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_battle_plan_comments"("target_state_id" "uuid", "viewer_wos_account_id" "uuid") RETURNS TABLE("id" "uuid", "plan_id" "uuid", "author_wos_account_id" "uuid", "visibility" "text", "body" "text", "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  viewer_is_admin boolean;
begin
  if not public.is_state_member_account(
    target_state_id,
    viewer_wos_account_id
  ) then
    raise exception 'The selected WOS account is not a member of this state.';
  end if;

  viewer_is_admin := public.is_state_admin_account(
    target_state_id,
    viewer_wos_account_id
  );

  return query
  select
    comment.id,
    comment.plan_id,
    comment.author_wos_account_id,
    comment.visibility,
    comment.body,
    comment.created_at
  from public.battle_plan_comments comment
  where comment.state_id = target_state_id
    and (comment.visibility = 'public' or viewer_is_admin)
  order by comment.created_at;
end;
$$;


ALTER FUNCTION "public"."get_battle_plan_comments"("target_state_id" "uuid", "viewer_wos_account_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_state_battle_history"("target_state_id" "uuid") RETURNS TABLE("battle_id" "uuid", "battle_name" "text", "battle_type" "text", "battle_status" "text", "started_at" timestamp with time zone, "ended_at" timestamp with time zone, "rally_count" bigint, "cancelled_rally_count" bigint, "leader_count" bigint)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.is_state_member(target_state_id) then
    raise exception 'You are not a member of this state.';
  end if;

  return query
  select
    battle.id,
    battle.name,
    battle.battle_type,
    battle.status,
    battle.created_at,
    battle.ended_at,
    (
      select count(*)
      from public.rallies as rally
      where rally.battle_id = battle.id
    ),
    (
      select count(*)
      from public.rallies as rally
      where rally.battle_id = battle.id
        and rally.cancelled_at is not null
    ),
    (
      select count(*)
      from public.enemy_leaders as leader
      where leader.battle_id = battle.id
    )
  from public.battles as battle
  where battle.state_id = target_state_id
  order by battle.created_at desc;
end;
$$;


ALTER FUNCTION "public"."get_state_battle_history"("target_state_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_state_battle_history_v2"("target_state_id" "uuid", "viewer_wos_account_id" "uuid") RETURNS TABLE("battle_id" "uuid", "battle_name" "text", "battle_type" "text", "battle_status" "text", "battle_result" "text", "scheduled_at" timestamp with time zone, "started_at" timestamp with time zone, "ended_at" timestamp with time zone, "plan_id" "uuid", "rally_count" bigint, "cancelled_rally_count" bigint, "leader_count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.is_state_member_account(
    target_state_id,
    viewer_wos_account_id
  ) then
    raise exception 'The selected WOS account cannot view this state history.';
  end if;

  return query
  select
    battle.id,
    battle.name,
    battle.battle_type,
    battle.status,
    battle.result,
    battle.scheduled_at,
    battle.started_at,
    battle.ended_at,
    battle.plan_id,
    (
      select count(*)
      from public.rallies rally
      where rally.battle_id = battle.id
    ),
    (
      select count(*)
      from public.rallies rally
      where rally.battle_id = battle.id
        and rally.cancelled_at is not null
    ),
    (
      select count(*)
      from public.enemy_leaders leader
      where leader.battle_id = battle.id
    )
  from public.battles battle
  where battle.state_id = target_state_id
  order by coalesce(
    battle.started_at,
    battle.scheduled_at,
    battle.created_at
  ) desc;
end;
$$;


ALTER FUNCTION "public"."get_state_battle_history_v2"("target_state_id" "uuid", "viewer_wos_account_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_state_overview"("target_state_id" "uuid") RETURNS TABLE("player_count" bigint, "wos_account_count" bigint)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.is_state_member(target_state_id) then
    raise exception 'You are not a member of this state.';
  end if;

  return query
  select
    count(distinct account.user_id),
    count(*)
  from public.state_members as member
  join public.wos_accounts as account
    on account.id = member.wos_account_id
  where member.state_id = target_state_id;
end;
$$;


ALTER FUNCTION "public"."get_state_overview"("target_state_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_state_poll_admin_responses"("target_state_id" "uuid") RETURNS TABLE("poll_id" "uuid", "option_id" "uuid", "wos_account_id" "uuid", "wos_id" "text", "nickname" "text", "username" "text", "voted_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.is_state_admin(target_state_id) then
    raise exception 'Only state owners and admins can review voter details.';
  end if;

  return query
  select
    vote.poll_id,
    vote.option_id,
    account.id,
    account.wos_id,
    account.nickname,
    profile.username,
    vote.voted_at
  from public.state_poll_votes vote
  join public.state_polls poll on poll.id = vote.poll_id
  join public.wos_accounts account on account.id = vote.wos_account_id
  left join public.profiles profile on profile.id = account.user_id
  where poll.state_id = target_state_id
    and poll.delete_at > now()
  order by vote.voted_at;
end;
$$;


ALTER FUNCTION "public"."get_state_poll_admin_responses"("target_state_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_state_poll_counts"("target_state_id" "uuid") RETURNS TABLE("poll_id" "uuid", "option_id" "uuid", "vote_count" bigint)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.is_state_member(target_state_id) then
    raise exception 'You are not a member of this state.';
  end if;

  return query
  select
    poll.id,
    poll_option.id,
    count(vote.wos_account_id)
  from public.state_polls poll
  join public.state_poll_options poll_option
    on poll_option.poll_id = poll.id
  left join public.state_poll_votes vote
    on vote.option_id = poll_option.id
  where poll.state_id = target_state_id
    and poll.delete_at > now()
  group by poll.id, poll_option.id;
end;
$$;


ALTER FUNCTION "public"."get_state_poll_counts"("target_state_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  signup_username text;
  signup_wos_id text;
  signup_wos_nickname text;
begin
  signup_username := nullif(trim(new.raw_user_meta_data ->> 'username'), '');
  signup_wos_id := nullif(trim(new.raw_user_meta_data ->> 'wos_id'), '');
  signup_wos_nickname := nullif(
    trim(new.raw_user_meta_data ->> 'wos_nickname'),
    ''
  );

  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    signup_username,
    coalesce(signup_username, split_part(new.email, '@', 1))
  )
  on conflict (id) do update
  set username = coalesce(public.profiles.username, excluded.username),
      display_name = coalesce(public.profiles.display_name, excluded.display_name);

  if signup_wos_id is not null then
    insert into public.wos_accounts (
      user_id,
      wos_id,
      nickname,
      is_configured
    )
    values (
      new.id,
      signup_wos_id,
      signup_wos_nickname,
      true
    );
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_state_admin"("check_state_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.state_members sm
    join public.wos_accounts wa on wa.id = sm.wos_account_id
    where sm.state_id = check_state_id
      and wa.user_id = auth.uid()
      and sm.role in ('owner', 'admin')
  );
$$;


ALTER FUNCTION "public"."is_state_admin"("check_state_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_state_admin_account"("target_state_id" "uuid", "target_wos_account_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.owns_wos_account(target_wos_account_id)
    and exists (
      select 1
      from public.state_members member
      where member.state_id = target_state_id
        and member.wos_account_id = target_wos_account_id
        and member.role in ('owner', 'admin')
    );
$$;


ALTER FUNCTION "public"."is_state_admin_account"("target_state_id" "uuid", "target_wos_account_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_state_member"("check_state_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.state_members sm
    join public.wos_accounts wa on wa.id = sm.wos_account_id
    where sm.state_id = check_state_id
      and wa.user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_state_member"("check_state_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_state_member_account"("target_state_id" "uuid", "target_wos_account_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.owns_wos_account(target_wos_account_id)
    and exists (
      select 1
      from public.state_members member
      where member.state_id = target_state_id
        and member.wos_account_id = target_wos_account_id
    );
$$;


ALTER FUNCTION "public"."is_state_member_account"("target_state_id" "uuid", "target_wos_account_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_state_owner"("check_state_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.state_members sm
    join public.wos_accounts wa on wa.id = sm.wos_account_id
    where sm.state_id = check_state_id
      and wa.user_id = auth.uid()
      and sm.role = 'owner'
  );
$$;


ALTER FUNCTION "public"."is_state_owner"("check_state_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_battle_status_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  recipient_account_id uuid;
begin
  if new.status = old.status
     or new.status not in ('completed', 'cancelled') then
    return new;
  end if;

  for recipient_account_id in
    select member.wos_account_id
    from public.state_members member
    where member.state_id = new.state_id
  loop
    perform public.queue_account_notification(
      recipient_account_id,
      case when new.status = 'completed' then 'battle_completed' else 'battle_cancelled' end,
      case when new.status = 'completed' then 'Battle completed' else 'Battle cancelled' end,
      new.name || case
        when new.status = 'completed' and new.result is not null
          then ' ended as a ' || upper(new.result) || '.'
        when new.status = 'completed' then ' has ended.'
        else ' was cancelled.'
      end,
      jsonb_build_object(
        'battle_id', new.id,
        'plan_id', new.plan_id,
        'result', new.result
      ),
      'battle',
      new.state_id
    );
  end loop;

  return new;
end;
$$;


ALTER FUNCTION "public"."notify_battle_status_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_state_alliance_assignment"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  target_account_id uuid;
  target_state_id uuid;
  target_alliance_id uuid;
  target_alliance_name text;
  target_state_name text;
  notification_title text;
begin
  target_account_id := case when tg_op = 'DELETE' then old.wos_account_id else new.wos_account_id end;
  target_state_id := case when tg_op = 'DELETE' then old.state_id else new.state_id end;
  target_alliance_id := case when tg_op = 'DELETE' then old.alliance_id else new.alliance_id end;

  select alliance.name, state_row.name
  into target_alliance_name, target_state_name
  from public.state_alliances alliance
  join public.states state_row on state_row.id = alliance.state_id
  where alliance.id = target_alliance_id;

  notification_title := case
    when tg_op = 'DELETE' then 'Alliance assignment removed'
    when tg_op = 'UPDATE' then 'Alliance assignment changed'
    else 'Alliance assigned'
  end;

  perform public.queue_account_notification(
    target_account_id,
    'state_alliance_assigned',
    notification_title,
    case
      when tg_op = 'DELETE' then
        'This account is no longer assigned to ' || coalesce(target_alliance_name, 'its previous alliance') ||
          ' in ' || coalesce(target_state_name, 'the state') || '.'
      else
        'This account is assigned to ' || coalesce(target_alliance_name, 'an alliance') ||
          ' in ' || coalesce(target_state_name, 'the state') || '.'
    end,
    jsonb_build_object('alliance_id', target_alliance_id),
    'alliance',
    target_state_id
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."notify_state_alliance_assignment"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_state_poll_creator"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  target_state_name text;
begin
  if new.created_by is null then
    return new;
  end if;

  select state_row.name
  into target_state_name
  from public.states state_row
  where state_row.id = new.state_id;

  if not exists (
    select 1
    from public.notifications notification
    where notification.user_id = new.created_by
      and notification.type = 'state_poll_created'
      and notification.data ->> 'poll_id' = new.id::text
  ) then
    insert into public.notifications (user_id, type, title, body, data)
    values (
      new.created_by,
      'state_poll_created',
      'New state vote',
      coalesce(target_state_name, 'Your state') || ': ' || new.question,
      jsonb_build_object(
        'poll_id', new.id,
        'state_id', new.state_id
      )
    );
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."notify_state_poll_creator"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_state_tag_awarded"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  target_user_id uuid;
  target_account_name text;
  target_tag_name text;
  target_tag_color text;
  target_state_id uuid;
  target_state_name text;
begin
  select
    account.user_id,
    coalesce(account.nickname, 'WOS ID ' || account.wos_id),
    tag.name,
    tag.color,
    tag.state_id,
    state_row.name
  into
    target_user_id,
    target_account_name,
    target_tag_name,
    target_tag_color,
    target_state_id,
    target_state_name
  from public.state_tags tag
  join public.states state_row on state_row.id = tag.state_id
  join public.wos_accounts account on account.id = new.wos_account_id
  where tag.id = new.tag_id;

  if target_user_id is not null then
    insert into public.notifications (user_id, type, title, body, data)
    values (
      target_user_id,
      'state_tag_awarded',
      'New tag: ' || target_tag_name,
      target_account_name || ' gained the ' || target_tag_name ||
        ' tag in ' || target_state_name || '.',
      jsonb_build_object(
        'tag_id', new.tag_id,
        'tag_color', target_tag_color,
        'state_id', target_state_id,
        'wos_account_id', new.wos_account_id,
        'source', new.source
      )
    );
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."notify_state_tag_awarded"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."owns_wos_account"("check_wos_account_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.wos_accounts
    where id = check_wos_account_id
      and user_id = auth.uid()
      and is_configured = true
  );
$$;


ALTER FUNCTION "public"."owns_wos_account"("check_wos_account_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_state_system_tag"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if tg_op = 'DELETE' and old.system_key is not null then
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


ALTER FUNCTION "public"."protect_state_system_tag"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."publish_battle_plan"("target_plan_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  target_state_id uuid;
  target_plan_name text;
  target_scheduled_at timestamptz;
  target_state_name text;
  notified_user_count integer;
  alliance_check record;
begin
  select plan.state_id, plan.name, plan.scheduled_at, state_row.name
  into target_state_id, target_plan_name, target_scheduled_at, target_state_name
  from public.battle_plans plan
  join public.states state_row on state_row.id = plan.state_id
  where plan.id = target_plan_id;

  if target_state_id is null then raise exception 'Battle plan not found.'; end if;
  if not public.is_state_admin(target_state_id) then
    raise exception 'Only state owners and admins can publish battle plans.';
  end if;
  if not exists (
    select 1 from public.battle_plan_groups where plan_id = target_plan_id
  ) then raise exception 'Add at least one rally group before publishing.'; end if;
  if exists (
    select 1 from public.battle_plan_groups
    where plan_id = target_plan_id and alliance_id is null
  ) then raise exception 'Every rally group needs a destination alliance before publishing.'; end if;
  if exists (
    select 1
    from public.battle_plan_groups plan_group
    left join public.state_tags tag
      on tag.state_id = plan_group.state_id
      and tag.system_key = 'rally_lead'
    left join public.state_member_tags assignment
      on assignment.tag_id = tag.id
      and assignment.wos_account_id = plan_group.leader_wos_account_id
    where plan_group.plan_id = target_plan_id
      and assignment.wos_account_id is null
  ) then raise exception 'Every group leader must still have the Rally Lead tag.'; end if;

  for alliance_check in
    select
      alliance.id,
      alliance.name,
      alliance.max_members,
      (
        select count(distinct existing.wos_account_id)
        from public.state_alliance_members existing
        where existing.alliance_id = alliance.id
          and not exists (
            select 1 from public.battle_plan_assignments planned
            where planned.plan_id = target_plan_id
              and planned.wos_account_id = existing.wos_account_id
          )
      ) + (
        select count(distinct planned.wos_account_id)
        from public.battle_plan_assignments planned
        join public.battle_plan_groups plan_group
          on plan_group.id = planned.group_id
        where planned.plan_id = target_plan_id
          and plan_group.alliance_id = alliance.id
      ) as final_count
    from public.state_alliances alliance
    where alliance.id in (
      select plan_group.alliance_id
      from public.battle_plan_groups plan_group
      where plan_group.plan_id = target_plan_id
    )
  loop
    if alliance_check.final_count > alliance_check.max_members then
      raise exception 'Alliance % would contain % members, above its limit of %.',
        alliance_check.name, alliance_check.final_count, alliance_check.max_members;
    end if;
  end loop;

  insert into public.state_alliance_members (
    state_id, wos_account_id, alliance_id, assigned_by, assigned_at
  )
  select
    assignment.state_id,
    assignment.wos_account_id,
    plan_group.alliance_id,
    auth.uid(),
    now()
  from public.battle_plan_assignments assignment
  join public.battle_plan_groups plan_group on plan_group.id = assignment.group_id
  where assignment.plan_id = target_plan_id
  on conflict (state_id, wos_account_id) do update set
    alliance_id = excluded.alliance_id,
    assigned_by = auth.uid(),
    assigned_at = now();

  delete from public.state_member_tags
  where source = 'battle_plan'
    and source_plan_id = target_plan_id;

  insert into public.state_member_tags (
    tag_id, wos_account_id, source, source_plan_id, assigned_by, assigned_at
  )
  select
    plan_group.assignment_tag_id,
    assignment.wos_account_id,
    'battle_plan',
    target_plan_id,
    auth.uid(),
    now()
  from public.battle_plan_assignments assignment
  join public.battle_plan_groups plan_group on plan_group.id = assignment.group_id
  where assignment.plan_id = target_plan_id
    and plan_group.assignment_tag_id is not null
  on conflict (tag_id, wos_account_id) do update set
    source = 'battle_plan',
    source_plan_id = target_plan_id,
    assigned_by = auth.uid(),
    assigned_at = now()
  where public.state_member_tags.source = 'battle_plan';

  update public.battle_plans set
    status = 'published', published_at = now(), updated_at = now()
  where id = target_plan_id;

  delete from public.notifications
  where type = 'battle_plan_assignment'
    and data ->> 'plan_id' = target_plan_id::text;

  insert into public.notifications (user_id, type, title, body, data)
  select distinct
    account.user_id,
    'battle_plan_assignment',
    'Battle assignment published',
    target_state_name || ': ' || target_plan_name ||
      ' is scheduled for ' ||
      to_char(target_scheduled_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI') ||
      ' UTC. Open the plan to view your rally group and alliance.',
    jsonb_build_object('plan_id', target_plan_id, 'state_id', target_state_id)
  from public.battle_plan_assignments assignment
  join public.wos_accounts account on account.id = assignment.wos_account_id
  where assignment.plan_id = target_plan_id
    and account.user_id <> auth.uid();

  get diagnostics notified_user_count = row_count;
  return notified_user_count;
end;
$$;


ALTER FUNCTION "public"."publish_battle_plan"("target_plan_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."publish_battle_plan_with_notifications"("target_plan_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  target_state_id uuid;
  target_plan_name text;
  target_scheduled_at timestamptz;
  notification_count integer := 0;
  inserted_count integer := 0;
begin
  select plan.state_id, plan.name, plan.scheduled_at
  into target_state_id, target_plan_name, target_scheduled_at
  from public.battle_plans plan
  where plan.id = target_plan_id;

  if target_state_id is null then
    raise exception 'Battle plan not found.';
  end if;

  if not public.is_state_admin(target_state_id) then
    raise exception 'Only state Owners and Admins can publish battle plans.';
  end if;

  -- Keep every existing publish behavior: alliance assignments, automatic
  -- tags, plan status, and any validation remain owned by the original RPC.
  perform public.publish_battle_plan(target_plan_id);

  -- Republishing replaces older plan alerts instead of stacking duplicates.
  delete from public.notifications
  where type in ('battle_plan_assignment', 'battle_plan_published')
    and data ->> 'plan_id' = target_plan_id::text;

  insert into public.notifications (user_id, type, title, body, data)
  select
    account.user_id,
    'battle_plan_assignment',
    'Battle assignment published',
    target_plan_name || ': ' ||
      coalesce(account.nickname, 'WOS ID ' || account.wos_id) ||
      ' is assigned to ' || plan_group.name ||
      ' in ' || coalesce(alliance.name, 'an alliance not yet selected') ||
      '. Starts ' ||
      to_char(target_scheduled_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI') ||
      ' UTC.',
    jsonb_build_object(
      'plan_id', target_plan_id,
      'state_id', target_state_id,
      'wos_account_id', account.id,
      'group_id', plan_group.id,
      'alliance_id', alliance.id
    )
  from public.battle_plan_assignments assignment
  join public.battle_plan_groups plan_group
    on plan_group.id = assignment.group_id
  left join public.state_alliances alliance
    on alliance.id = plan_group.alliance_id
  join public.wos_accounts account
    on account.id = assignment.wos_account_id
  where assignment.plan_id = target_plan_id;

  get diagnostics inserted_count = row_count;
  notification_count := notification_count + inserted_count;

  -- Everyone else still learns that the plan exists and that their account
  -- has not yet been assigned. This includes Owner/Admin accounts.
  insert into public.notifications (user_id, type, title, body, data)
  select
    account.user_id,
    'battle_plan_published',
    'Battle plan published',
    target_plan_name || ' was published for ' ||
      to_char(target_scheduled_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI') ||
      ' UTC. ' || coalesce(account.nickname, 'WOS ID ' || account.wos_id) ||
      ' is currently unassigned.',
    jsonb_build_object(
      'plan_id', target_plan_id,
      'state_id', target_state_id,
      'wos_account_id', account.id
    )
  from public.state_members member
  join public.wos_accounts account
    on account.id = member.wos_account_id
  where member.state_id = target_state_id
    and not exists (
      select 1
      from public.battle_plan_assignments assignment
      where assignment.plan_id = target_plan_id
        and assignment.wos_account_id = member.wos_account_id
    );

  get diagnostics inserted_count = row_count;
  notification_count := notification_count + inserted_count;

  return notification_count;
end;
$$;


ALTER FUNCTION "public"."publish_battle_plan_with_notifications"("target_plan_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."publish_battle_plan_with_notifications"("target_plan_id" "uuid", "actor_wos_account_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  target_state_id uuid;
  target_plan_name text;
  target_scheduled_at timestamptz;
  target_battle_type text;
  target_battle_id uuid;
  recipient record;
  notification_count integer := 0;
begin
  select plan.state_id, plan.name, plan.scheduled_at, plan.battle_type
  into target_state_id, target_plan_name, target_scheduled_at, target_battle_type
  from public.battle_plans plan
  where plan.id = target_plan_id;

  if target_state_id is null then
    raise exception 'Battle plan not found.';
  end if;

  if not public.is_state_admin_account(
    target_state_id,
    actor_wos_account_id
  ) then
    raise exception 'The selected WOS account cannot publish battle plans.';
  end if;

  perform public.publish_battle_plan(target_plan_id);

  insert into public.battles (
    state_id,
    name,
    status,
    battle_type,
    scheduled_at,
    plan_id
  )
  values (
    target_state_id,
    target_plan_name,
    'scheduled',
    target_battle_type,
    target_scheduled_at,
    target_plan_id
  )
  on conflict (plan_id) where plan_id is not null
  do update set
    name = excluded.name,
    battle_type = excluded.battle_type,
    scheduled_at = excluded.scheduled_at
  returning id into target_battle_id;

  delete from public.notifications
  where type in ('battle_plan_assignment', 'battle_plan_published')
    and data ->> 'plan_id' = target_plan_id::text;

  for recipient in
    select
      member.wos_account_id,
      account.nickname,
      account.wos_id,
      plan_group.id as group_id,
      plan_group.name as group_name,
      alliance.id as alliance_id,
      alliance.name as alliance_name
    from public.state_members member
    join public.wos_accounts account
      on account.id = member.wos_account_id
    left join public.battle_plan_assignments assignment
      on assignment.plan_id = target_plan_id
      and assignment.wos_account_id = member.wos_account_id
    left join public.battle_plan_groups plan_group
      on plan_group.id = assignment.group_id
    left join public.state_alliances alliance
      on alliance.id = plan_group.alliance_id
    where member.state_id = target_state_id
  loop
    if recipient.group_id is not null then
      perform public.queue_account_notification(
        recipient.wos_account_id,
        'battle_plan_assignment',
        'Battle assignment published',
        target_plan_name || ': ' ||
          coalesce(recipient.nickname, 'WOS ID ' || recipient.wos_id) ||
          ' is assigned to ' || recipient.group_name || ' in ' ||
          coalesce(recipient.alliance_name, 'an alliance not yet selected') ||
          '. Starts ' ||
          to_char(target_scheduled_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI') ||
          ' UTC.',
        jsonb_build_object(
          'plan_id', target_plan_id,
          'battle_id', target_battle_id,
          'group_id', recipient.group_id,
          'alliance_id', recipient.alliance_id
        ),
        'battle',
        target_state_id
      );
    else
      perform public.queue_account_notification(
        recipient.wos_account_id,
        'battle_plan_published',
        'Battle plan published',
        target_plan_name || ' was published for ' ||
          to_char(target_scheduled_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI') ||
          ' UTC. This account is currently unassigned.',
        jsonb_build_object(
          'plan_id', target_plan_id,
          'battle_id', target_battle_id
        ),
        'battle',
        target_state_id
      );
    end if;
    notification_count := notification_count + 1;
  end loop;

  return notification_count;
end;
$$;


ALTER FUNCTION "public"."publish_battle_plan_with_notifications"("target_plan_id" "uuid", "actor_wos_account_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."queue_account_notification"("target_wos_account_id" "uuid", "notification_type" "text", "notification_title" "text", "notification_body" "text", "notification_data" "jsonb" DEFAULT '{}'::"jsonb", "notification_category" "text" DEFAULT 'state'::"text", "target_state_id" "uuid" DEFAULT NULL::"uuid") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  target_user_id uuid;
  new_notification_id bigint;
begin
  select account.user_id
  into target_user_id
  from public.wos_accounts account
  where account.id = target_wos_account_id;

  if target_user_id is null then
    raise exception 'Notification recipient not found.';
  end if;

  insert into public.notifications (
    user_id,
    state_id,
    wos_account_id,
    category,
    type,
    title,
    body,
    data
  )
  values (
    target_user_id,
    target_state_id,
    target_wos_account_id,
    notification_category,
    notification_type,
    notification_title,
    notification_body,
    coalesce(notification_data, '{}'::jsonb) || jsonb_build_object(
      'state_id', target_state_id,
      'wos_account_id', target_wos_account_id
    )
  )
  returning id into new_notification_id;

  return new_notification_id;
end;
$$;


ALTER FUNCTION "public"."queue_account_notification"("target_wos_account_id" "uuid", "notification_type" "text", "notification_title" "text", "notification_body" "text", "notification_data" "jsonb", "notification_category" "text", "target_state_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."redeem_state_creation_invite"("invite_token" "uuid", "new_state_name" "text", "owner_wos_account_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  creation_invite public.state_creation_invites%rowtype;
  created_state_id uuid;
begin
  if not public.owns_wos_account(owner_wos_account_id) then
    raise exception 'Select one of your configured WOS accounts.';
  end if;

  if nullif(trim(new_state_name), '') is null then
    raise exception 'Enter a state name.';
  end if;

  select * into creation_invite
  from public.state_creation_invites
  where token = invite_token
  for update;

  if creation_invite.id is null
     or creation_invite.used_at is not null
     or creation_invite.expires_at <= now() then
    raise exception 'This state creation invitation is invalid or expired.';
  end if;

  insert into public.states (name)
  values (trim(new_state_name))
  returning id into created_state_id;

  insert into public.state_members (state_id, wos_account_id, role)
  values (created_state_id, owner_wos_account_id, 'owner');

  update public.state_creation_invites
  set used_at = now(), used_by = auth.uid()
  where id = creation_invite.id;

  return created_state_id;
end;
$$;


ALTER FUNCTION "public"."redeem_state_creation_invite"("invite_token" "uuid", "new_state_name" "text", "owner_wos_account_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_vote_generated_tags"("target_state_id" "uuid", "target_wos_account_id" "uuid" DEFAULT NULL::"uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  delete from public.state_member_tags assignment
  using public.state_tags tag
  where assignment.tag_id = tag.id
    and tag.state_id = target_state_id
    and assignment.source = 'vote'
    and (
      target_wos_account_id is null
      or assignment.wos_account_id = target_wos_account_id
    )
    and not exists (
      select 1
      from public.state_poll_votes vote
      join public.state_polls poll on poll.id = vote.poll_id
      join public.state_poll_options poll_option
        on poll_option.id = vote.option_id
      where poll.state_id = target_state_id
        and poll.delete_at > now()
        and vote.wos_account_id = assignment.wos_account_id
        and poll_option.auto_tag_id = assignment.tag_id
    );

  insert into public.state_member_tags (
    tag_id,
    wos_account_id,
    source,
    assigned_by,
    assigned_at
  )
  select distinct
    poll_option.auto_tag_id,
    vote.wos_account_id,
    'vote',
    null::uuid,
    now()
  from public.state_poll_votes vote
  join public.state_polls poll on poll.id = vote.poll_id
  join public.state_poll_options poll_option
    on poll_option.id = vote.option_id
  where poll.state_id = target_state_id
    and poll.delete_at > now()
    and poll_option.auto_tag_id is not null
    and (
      target_wos_account_id is null
      or vote.wos_account_id = target_wos_account_id
    )
  on conflict (tag_id, wos_account_id) do nothing;
end;
$$;


ALTER FUNCTION "public"."refresh_vote_generated_tags"("target_state_id" "uuid", "target_wos_account_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."remove_state_member"("target_state_id" "uuid", "target_wos_account_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  actor_is_owner boolean;
  actor_is_admin boolean;
begin
  actor_is_owner := public.is_state_owner(target_state_id);
  actor_is_admin := public.is_state_admin(target_state_id);

  if not actor_is_admin then
    raise exception 'Only state owners and admins can remove members.';
  end if;

  delete from public.state_member_tags assignment
  using public.state_tags tag, public.state_members member
  where assignment.tag_id = tag.id
    and tag.state_id = target_state_id
    and assignment.wos_account_id = target_wos_account_id
    and member.state_id = target_state_id
    and member.wos_account_id = target_wos_account_id
    and member.role <> 'owner'
    and (actor_is_owner or member.role = 'member');

  delete from public.state_members
  where state_id = target_state_id
    and wos_account_id = target_wos_account_id
    and role <> 'owner'
    and (actor_is_owner or role = 'member');

  if not found then
    raise exception 'Member not found or you cannot remove that account.';
  end if;
end;
$$;


ALTER FUNCTION "public"."remove_state_member"("target_state_id" "uuid", "target_wos_account_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."respond_to_state_invite"("target_invite_id" "uuid", "accept_invite" boolean) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  invitation public.state_invites%rowtype;
  invited_user_id uuid;
  invited_wos_id text;
  invited_username text;
  invited_state_name text;
begin
  select * into invitation
  from public.state_invites
  where id = target_invite_id
  for update;

  if invitation.id is null
     or invitation.status <> 'pending_recipient'
     or invitation.expires_at <= now() then
    raise exception 'This invitation is no longer available.';
  end if;

  if not public.owns_wos_account(invitation.invited_wos_account_id) then
    raise exception 'This invitation belongs to a different WOS account.';
  end if;

  if not accept_invite then
    update public.state_invites
    set status = 'declined',
        recipient_responded_at = now()
    where id = invitation.id;

    return invitation.state_id;
  end if;

  update public.state_invites
  set status = 'pending_owner',
      recipient_responded_at = now()
  where id = invitation.id;

  select account.user_id, account.wos_id, profile.username
  into invited_user_id, invited_wos_id, invited_username
  from public.wos_accounts account
  left join public.profiles profile on profile.id = account.user_id
  where account.id = invitation.invited_wos_account_id;

  select name into invited_state_name
  from public.states
  where id = invitation.state_id;

  -- Notify every distinct owner/admin user. A person with multiple admin WOS
  -- accounts receives only one notification for this acceptance.
  insert into public.notifications (
    user_id,
    type,
    title,
    body,
    data
  )
  select distinct
    admin_account.user_id,
    'state_invite_accepted',
    'Invitation accepted',
    coalesce('@' || invited_username, 'A player') ||
      ' accepted the invitation to ' || invited_state_name ||
      ' with WOS ID ' || invited_wos_id ||
      ' and is waiting for verification.',
    jsonb_build_object(
      'invite_id', invitation.id,
      'state_id', invitation.state_id,
      'wos_account_id', invitation.invited_wos_account_id,
      'wos_id', invited_wos_id,
      'username', invited_username
    )
  from public.state_members admin_member
  join public.wos_accounts admin_account
    on admin_account.id = admin_member.wos_account_id
  where admin_member.state_id = invitation.state_id
    and admin_member.role in ('owner', 'admin');

  return invitation.state_id;
end;
$$;


ALTER FUNCTION "public"."respond_to_state_invite"("target_invite_id" "uuid", "accept_invite" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."review_state_invite"("target_invite_id" "uuid", "approve_invite" boolean) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  invitation public.state_invites%rowtype;
  recipient_user_id uuid;
  invited_state_name text;
begin
  select * into invitation
  from public.state_invites
  where id = target_invite_id
  for update;

  if invitation.id is null
     or invitation.status <> 'pending_owner'
     or invitation.expires_at <= now() then
    raise exception 'This invitation is no longer awaiting approval.';
  end if;

  if not public.is_state_admin(invitation.state_id) then
    raise exception 'Only state owners and admins can review invitations.';
  end if;

  select user_id into recipient_user_id
  from public.wos_accounts
  where id = invitation.invited_wos_account_id;

  select name into invited_state_name
  from public.states where id = invitation.state_id;

  if approve_invite then
    insert into public.state_members (state_id, wos_account_id, role)
    values (invitation.state_id, invitation.invited_wos_account_id, 'member')
    on conflict (state_id, wos_account_id) do nothing;

    update public.state_invites
    set status = 'accepted',
        owner_responded_at = now(),
        used_at = now(),
        used_by = recipient_user_id
    where id = invitation.id;
  else
    update public.state_invites
    set status = 'rejected', owner_responded_at = now()
    where id = invitation.id;
  end if;

  if recipient_user_id is not null then
    insert into public.notifications (user_id, type, title, body, data)
    values (
      recipient_user_id,
      case when approve_invite
        then 'state_invite_approved' else 'state_invite_rejected' end,
      case when approve_invite
        then 'State membership approved'
        else 'State membership not approved' end,
      case when approve_invite
        then 'Your WOS account has joined ' || invited_state_name || '.'
        else 'Your request to join ' || invited_state_name ||
          ' was not approved.' end,
      jsonb_build_object(
        'invite_id', invitation.id,
        'state_id', invitation.state_id
      )
    );
  end if;

  return invitation.state_id;
end;
$$;


ALTER FUNCTION "public"."review_state_invite"("target_invite_id" "uuid", "approve_invite" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_battle_plan_assignment"("target_plan_id" "uuid", "target_wos_account_id" "uuid", "target_group_id" "uuid" DEFAULT NULL::"uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  target_state_id uuid;
  group_state_id uuid;
  group_member_count integer;
  group_capacity integer;
  led_group_id uuid;
begin
  select state_id into target_state_id
  from public.battle_plans
  where id = target_plan_id;

  if target_state_id is null then
    raise exception 'Battle plan not found.';
  end if;

  if not public.is_state_admin(target_state_id) then
    raise exception 'Only state owners and admins can assign battle groups.';
  end if;

  if not exists (
    select 1 from public.state_members
    where state_id = target_state_id
      and wos_account_id = target_wos_account_id
  ) then
    raise exception 'That WOS account is not a member of this state.';
  end if;

  select id into led_group_id
  from public.battle_plan_groups
  where plan_id = target_plan_id
    and leader_wos_account_id = target_wos_account_id;

  if led_group_id is not null
     and (target_group_id is null or target_group_id <> led_group_id) then
    raise exception 'A rally leader must remain in their own group. Change the group leader first.';
  end if;

  if target_group_id is null then
    delete from public.battle_plan_assignments
    where plan_id = target_plan_id
      and wos_account_id = target_wos_account_id;

    update public.battle_plans
    set updated_at = now()
    where id = target_plan_id;
    return;
  end if;

  select state_id, max_members
  into group_state_id, group_capacity
  from public.battle_plan_groups
  where id = target_group_id
    and plan_id = target_plan_id;

  if group_state_id is null or group_state_id <> target_state_id then
    raise exception 'Choose a rally group from this battle plan.';
  end if;

  select count(*) into group_member_count
  from public.battle_plan_assignments
  where group_id = target_group_id
    and not (
      plan_id = target_plan_id
      and wos_account_id = target_wos_account_id
    );

  if group_member_count >= group_capacity then
    raise exception 'That rally group is already full.';
  end if;

  insert into public.battle_plan_assignments (
    plan_id,
    group_id,
    state_id,
    wos_account_id,
    assigned_by
  )
  values (
    target_plan_id,
    target_group_id,
    target_state_id,
    target_wos_account_id,
    auth.uid()
  )
  on conflict (plan_id, wos_account_id)
  do update set
    group_id = excluded.group_id,
    state_id = excluded.state_id,
    assigned_by = auth.uid(),
    assigned_at = now();

  update public.battle_plans
  set updated_at = now()
  where id = target_plan_id;
end;
$$;


ALTER FUNCTION "public"."set_battle_plan_assignment"("target_plan_id" "uuid", "target_wos_account_id" "uuid", "target_group_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_state_alliance_member"("target_state_id" "uuid", "target_wos_account_id" "uuid", "target_alliance_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  alliance_capacity integer;
  alliance_member_count integer;
begin
  if not public.is_state_admin(target_state_id) then
    raise exception 'Only state owners and admins can move alliance members.';
  end if;

  if not exists (
    select 1
    from public.state_members member
    where member.state_id = target_state_id
      and member.wos_account_id = target_wos_account_id
  ) then
    raise exception 'That WOS account is not a member of this state.';
  end if;

  if target_alliance_id is null then
    delete from public.state_alliance_members
    where state_id = target_state_id
      and wos_account_id = target_wos_account_id;
    return;
  end if;

  select max_members into alliance_capacity
    from public.state_alliances alliance
    where alliance.id = target_alliance_id
      and alliance.state_id = target_state_id
    for update;

  if alliance_capacity is null then
    raise exception 'That alliance does not belong to this state.';
  end if;

  if not exists (
    select 1
    from public.state_alliance_members assignment
    where assignment.state_id = target_state_id
      and assignment.wos_account_id = target_wos_account_id
      and assignment.alliance_id = target_alliance_id
  ) then
    select count(*) into alliance_member_count
    from public.state_alliance_members assignment
    where assignment.alliance_id = target_alliance_id;

    if alliance_member_count >= alliance_capacity then
      raise exception 'This alliance has reached its member capacity.';
    end if;
  end if;

  insert into public.state_alliance_members (
    state_id,
    wos_account_id,
    alliance_id,
    assigned_by,
    assigned_at
  )
  values (
    target_state_id,
    target_wos_account_id,
    target_alliance_id,
    auth.uid(),
    now()
  )
  on conflict (state_id, wos_account_id)
  do update set
    alliance_id = excluded.alliance_id,
    assigned_by = excluded.assigned_by,
    assigned_at = excluded.assigned_at;
end;
$$;


ALTER FUNCTION "public"."set_state_alliance_member"("target_state_id" "uuid", "target_wos_account_id" "uuid", "target_alliance_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_state_member_capability"("target_state_id" "uuid", "target_wos_account_id" "uuid", "target_capability" "text", "capability_enabled" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.is_state_admin(target_state_id) then
    raise exception 'Only state owners and admins can assign battle roles.';
  end if;

  if target_capability not in ('rally_caller', 'garrison') then
    raise exception 'Invalid battle role.';
  end if;

  if not exists (
    select 1
    from public.state_members
    where state_id = target_state_id
      and wos_account_id = target_wos_account_id
  ) then
    raise exception 'That WOS account is not a state member.';
  end if;

  if capability_enabled then
    delete from public.state_member_capabilities
    where state_id = target_state_id
      and wos_account_id = target_wos_account_id
      and capability <> target_capability;

    insert into public.state_member_capabilities (
      state_id,
      wos_account_id,
      capability
    )
    values (
      target_state_id,
      target_wos_account_id,
      target_capability
    )
    on conflict do nothing;
  else
    delete from public.state_member_capabilities
    where state_id = target_state_id
      and wos_account_id = target_wos_account_id
      and capability = target_capability;
  end if;
end;
$$;


ALTER FUNCTION "public"."set_state_member_capability"("target_state_id" "uuid", "target_wos_account_id" "uuid", "target_capability" "text", "capability_enabled" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_state_member_role"("target_state_id" "uuid", "target_wos_account_id" "uuid", "new_role" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.is_state_owner(target_state_id) then
    raise exception 'Only the state owner can appoint or remove admins.';
  end if;

  if new_role not in ('admin', 'member') then
    raise exception 'Choose Admin or Member.';
  end if;

  update public.state_members
  set role = new_role
  where state_id = target_state_id
    and wos_account_id = target_wos_account_id
    and role <> 'owner';

  if not found then
    raise exception 'Member not found or the owner role cannot be changed.';
  end if;
end;
$$;


ALTER FUNCTION "public"."set_state_member_role"("target_state_id" "uuid", "target_wos_account_id" "uuid", "new_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_state_rally_lead"("target_state_id" "uuid", "target_wos_account_id" "uuid", "enabled" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  rally_lead_tag_id uuid;
begin
  if not public.is_state_admin(target_state_id) then
    raise exception 'Only state owners and admins can manage rally leaders.';
  end if;

  if not exists (
    select 1 from public.state_members
    where state_id = target_state_id
      and wos_account_id = target_wos_account_id
  ) then
    raise exception 'That WOS account is not a member of this state.';
  end if;

  select id into rally_lead_tag_id
  from public.state_tags
  where state_id = target_state_id
    and system_key = 'rally_lead';

  if rally_lead_tag_id is null then
    raise exception 'The Rally Lead system tag is missing.';
  end if;

  if enabled then
    insert into public.state_member_tags (
      tag_id,
      wos_account_id,
      source,
      assigned_by,
      assigned_at
    ) values (
      rally_lead_tag_id,
      target_wos_account_id,
      'manual',
      auth.uid(),
      now()
    )
    on conflict (tag_id, wos_account_id)
    do update set
      source = 'manual',
      assigned_by = auth.uid(),
      assigned_at = now();
  else
    if exists (
      select 1
      from public.battle_plan_groups plan_group
      join public.battle_plans plan on plan.id = plan_group.plan_id
      where plan_group.state_id = target_state_id
        and plan_group.leader_wos_account_id = target_wos_account_id
        and plan.status = 'draft'
    ) then
      raise exception 'This account leads a draft battle group. Change that group leader first.';
    end if;

    delete from public.state_member_tags
    where tag_id = rally_lead_tag_id
      and wos_account_id = target_wos_account_id;
  end if;
end;
$$;


ALTER FUNCTION "public"."set_state_rally_lead"("target_state_id" "uuid", "target_wos_account_id" "uuid", "enabled" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."shares_state_with"("check_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.state_members mine
    join public.wos_accounts mine_account
      on mine_account.id = mine.wos_account_id
    join public.state_members theirs
      on theirs.state_id = mine.state_id
    join public.wos_accounts their_account
      on their_account.id = theirs.wos_account_id
    where mine_account.user_id = auth.uid()
      and their_account.user_id = check_user_id
  );
$$;


ALTER FUNCTION "public"."shares_state_with"("check_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."start_state_battle"("target_state_id" "uuid", "battle_name" "text" DEFAULT 'Battle'::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  created_battle_id uuid;
begin
  if not public.is_state_admin(target_state_id) then
    raise exception 'Only state owners and admins can start a battle period.';
  end if;

  if exists (
    select 1 from public.battles
    where state_id = target_state_id and status = 'active'
  ) then
    raise exception 'This state already has an active battle period.';
  end if;

  if nullif(trim(battle_name), '') is null then
    raise exception 'Enter a battle period name.';
  end if;

  insert into public.battles (state_id, name, status)
  values (target_state_id, trim(battle_name), 'active')
  returning id into created_battle_id;

  return created_battle_id;
end;
$$;


ALTER FUNCTION "public"."start_state_battle"("target_state_id" "uuid", "battle_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_state_poll_vote"("target_poll_id" "uuid", "target_option_id" "uuid", "voter_wos_account_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  target_state_id uuid;
  target_closes_at timestamptz;
  target_delete_at timestamptz;
begin
  perform public.cleanup_expired_state_polls();

  select state_id, closes_at, delete_at
  into target_state_id, target_closes_at, target_delete_at
  from public.state_polls
  where id = target_poll_id;

  if target_state_id is null then
    raise exception 'Vote not found.';
  end if;

  if now() >= target_closes_at or now() >= target_delete_at then
    raise exception 'This vote has closed.';
  end if;

  if not public.owns_wos_account(voter_wos_account_id) then
    raise exception 'You do not own this WOS account.';
  end if;

  if not exists (
    select 1
    from public.state_members member
    where member.state_id = target_state_id
      and member.wos_account_id = voter_wos_account_id
  ) then
    raise exception 'This WOS account is not a member of the vote state.';
  end if;

  if not exists (
    select 1
    from public.state_poll_options poll_option
    where poll_option.id = target_option_id
      and poll_option.poll_id = target_poll_id
  ) then
    raise exception 'That option does not belong to this vote.';
  end if;

  insert into public.state_poll_votes (
    poll_id,
    option_id,
    wos_account_id,
    voted_at
  )
  values (
    target_poll_id,
    target_option_id,
    voter_wos_account_id,
    now()
  )
  on conflict (poll_id, wos_account_id)
  do update set
    option_id = excluded.option_id,
    voted_at = excluded.voted_at;

  perform public.refresh_vote_generated_tags(
    target_state_id,
    voter_wos_account_id
  );
end;
$$;


ALTER FUNCTION "public"."submit_state_poll_vote"("target_poll_id" "uuid", "target_option_id" "uuid", "voter_wos_account_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_battle_plan"("target_plan_id" "uuid", "plan_name" "text", "selected_battle_type" "text", "plan_scheduled_at" timestamp with time zone, "plan_notes" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  target_state_id uuid;
  cleaned_name text := btrim(coalesce(plan_name, ''));
  cleaned_type text := lower(btrim(coalesce(selected_battle_type, '')));
  cleaned_notes text := nullif(btrim(coalesce(plan_notes, '')), '');
begin
  select state_id into target_state_id
  from public.battle_plans
  where id = target_plan_id;

  if target_state_id is null then
    raise exception 'Battle plan not found.';
  end if;

  if not public.is_state_admin(target_state_id) then
    raise exception 'Only state owners and admins can edit battle plans.';
  end if;

  if char_length(cleaned_name) not between 3 and 100 then
    raise exception 'Plan names must contain between 3 and 100 characters.';
  end if;

  if cleaned_type not in ('svs', 'castle', 'test') then
    raise exception 'Choose SVS, Castle, or Test.';
  end if;

  if cleaned_notes is not null and char_length(cleaned_notes) > 2000 then
    raise exception 'Plan notes cannot exceed 2000 characters.';
  end if;

  update public.battle_plans
  set name = cleaned_name,
      battle_type = cleaned_type,
      scheduled_at = plan_scheduled_at,
      notes = cleaned_notes,
      updated_at = now()
  where id = target_plan_id;
end;
$$;


ALTER FUNCTION "public"."update_battle_plan"("target_plan_id" "uuid", "plan_name" "text", "selected_battle_type" "text", "plan_scheduled_at" timestamp with time zone, "plan_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_battle_plan_group"("target_group_id" "uuid", "group_name" "text", "leader_account_id" "uuid", "destination_alliance_id" "uuid", "publish_tag_id" "uuid" DEFAULT NULL::"uuid", "group_max_members" integer DEFAULT 10, "group_notes" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  target_plan_id uuid;
  target_state_id uuid;
  rally_lead_tag_id uuid;
  current_member_count integer;
  leader_already_in_group boolean;
  cleaned_name text := btrim(coalesce(group_name, ''));
  cleaned_notes text := nullif(btrim(coalesce(group_notes, '')), '');
begin
  select plan_id, state_id into target_plan_id, target_state_id
  from public.battle_plan_groups where id = target_group_id;

  if target_state_id is null then raise exception 'Rally group not found.'; end if;
  if not public.is_state_admin(target_state_id) then
    raise exception 'Only state owners and admins can edit rally groups.';
  end if;
  if char_length(cleaned_name) not between 1 and 60 then
    raise exception 'Rally group names must contain between 1 and 60 characters.';
  end if;
  if group_max_members not between 1 and 100 then
    raise exception 'Rally group capacity must be between 1 and 100.';
  end if;
  if cleaned_notes is not null and char_length(cleaned_notes) > 1000 then
    raise exception 'Rally group notes cannot exceed 1000 characters.';
  end if;

  select count(*) into current_member_count
  from public.battle_plan_assignments where group_id = target_group_id;
  if group_max_members < current_member_count then
    raise exception 'Capacity cannot be lower than the current group size.';
  end if;

  select exists (
    select 1 from public.battle_plan_assignments
    where group_id = target_group_id
      and wos_account_id = leader_account_id
  ) into leader_already_in_group;
  if not leader_already_in_group and group_max_members <= current_member_count then
    raise exception 'Increase the group capacity before assigning that leader.';
  end if;

  select id into rally_lead_tag_id from public.state_tags
  where state_id = target_state_id and system_key = 'rally_lead';
  if not exists (
    select 1 from public.state_member_tags
    where tag_id = rally_lead_tag_id
      and wos_account_id = leader_account_id
  ) then
    raise exception 'Only accounts with the Rally Lead tag can lead a group.';
  end if;
  if not exists (
    select 1 from public.state_alliances
    where id = destination_alliance_id and state_id = target_state_id
  ) then
    raise exception 'Choose a destination alliance from this state.';
  end if;
  if publish_tag_id is not null and not exists (
    select 1 from public.state_tags
    where id = publish_tag_id
      and state_id = target_state_id
      and system_key is null
  ) then
    raise exception 'Choose a regular state tag for the published group.';
  end if;

  update public.battle_plan_groups set
    name = cleaned_name,
    leader_wos_account_id = leader_account_id,
    alliance_id = destination_alliance_id,
    assignment_tag_id = publish_tag_id,
    max_members = group_max_members,
    notes = cleaned_notes,
    updated_at = now()
  where id = target_group_id;

  insert into public.battle_plan_assignments (
    plan_id, group_id, state_id, wos_account_id, assigned_by
  ) values (
    target_plan_id, target_group_id, target_state_id, leader_account_id, auth.uid()
  )
  on conflict (plan_id, wos_account_id) do update set
    group_id = excluded.group_id,
    state_id = excluded.state_id,
    assigned_by = auth.uid(),
    assigned_at = now();

  update public.battle_plans set updated_at = now() where id = target_plan_id;
exception
  when unique_violation then
    raise exception 'That player already leads another rally group in this plan.';
end;
$$;


ALTER FUNCTION "public"."update_battle_plan_group"("target_group_id" "uuid", "group_name" "text", "leader_account_id" "uuid", "destination_alliance_id" "uuid", "publish_tag_id" "uuid", "group_max_members" integer, "group_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_state_alliance"("target_alliance_id" "uuid", "alliance_name" "text", "alliance_color" "text", "alliance_max_members" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  target_state_id uuid;
  cleaned_name text := btrim(coalesce(alliance_name, ''));
  cleaned_color text := lower(btrim(coalesce(alliance_color, '')));
begin
  select state_id into target_state_id
  from public.state_alliances
  where id = target_alliance_id;

  if target_state_id is null then
    raise exception 'Alliance not found.';
  end if;

  if not public.is_state_admin(target_state_id) then
    raise exception 'Only state owners and admins can edit alliances.';
  end if;

  if char_length(cleaned_name) not between 1 and 40 then
    raise exception 'Alliance names must contain between 1 and 40 characters.';
  end if;

  if cleaned_color !~ '^#[0-9a-f]{6}$' then
    raise exception 'Alliance colors must use a six-digit hex code.';
  end if;

  if alliance_max_members not between 1 and 100 then
    raise exception 'Alliance capacity must be between 1 and 100.';
  end if;

  if alliance_max_members < (
    select count(*)
    from public.state_alliance_members assignment
    where assignment.alliance_id = target_alliance_id
  ) then
    raise exception 'Alliance capacity cannot be lower than its current member count.';
  end if;

  update public.state_alliances
  set name = cleaned_name,
      color = cleaned_color,
      max_members = alliance_max_members,
      updated_at = now()
  where id = target_alliance_id;
exception
  when unique_violation then
    raise exception 'An alliance with that name already exists in this state.';
end;
$_$;


ALTER FUNCTION "public"."update_state_alliance"("target_alliance_id" "uuid", "alliance_name" "text", "alliance_color" "text", "alliance_max_members" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_state_tag"("target_tag_id" "uuid", "tag_name" "text", "tag_color" "text", "tag_bulk_move_limit" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  target_state_id uuid;
  target_system_key text;
  cleaned_name text := btrim(coalesce(tag_name, ''));
  cleaned_color text := lower(btrim(coalesce(tag_color, '')));
begin
  select state_id, system_key
  into target_state_id, target_system_key
  from public.state_tags
  where id = target_tag_id;

  if target_state_id is null then raise exception 'Tag not found.'; end if;
  if not public.is_state_admin(target_state_id) then
    raise exception 'Only state owners and admins can edit tags.';
  end if;
  if target_system_key is not null then
    raise exception 'System tags are managed from State members.';
  end if;
  if char_length(cleaned_name) not between 1 and 32 then
    raise exception 'Tag names must contain between 1 and 32 characters.';
  end if;
  if cleaned_color !~ '^#[0-9a-f]{6}$' then
    raise exception 'Tag colors must use a six-digit hex code.';
  end if;
  if tag_bulk_move_limit not between 1 and 100 then
    raise exception 'The tag bulk-move limit must be between 1 and 100.';
  end if;

  update public.state_tags
  set name = cleaned_name,
      color = cleaned_color,
      bulk_move_limit = tag_bulk_move_limit
  where id = target_tag_id;
exception
  when unique_violation then
    raise exception 'A tag with that name already exists in this state.';
end;
$_$;


ALTER FUNCTION "public"."update_state_tag"("target_tag_id" "uuid", "tag_name" "text", "tag_color" "text", "tag_bulk_move_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_enemy_leader_battle"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  battle_state_id uuid;
  battle_status text;
begin
  if new.battle_id is null then
    raise exception 'Enemy leaders must belong to a battle period.';
  end if;

  select state_id, status
  into battle_state_id, battle_status
  from public.battles
  where id = new.battle_id;

  if battle_state_id is null or battle_state_id <> new.state_id then
    raise exception 'The enemy leader and battle must belong to the same state.';
  end if;

  if battle_status <> 'active' then
    raise exception 'Enemy leaders can only be changed during an active battle period.';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."validate_enemy_leader_battle"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_enemy_leader_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if exists (
    select 1
    from public.battles
    where id = old.battle_id
      and status <> 'active'
  ) then
    raise exception 'Completed battle history cannot be changed.';
  end if;

  return old;
end;
$$;


ALTER FUNCTION "public"."validate_enemy_leader_delete"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."battle_plan_assignments" (
    "plan_id" "uuid" NOT NULL,
    "group_id" "uuid" NOT NULL,
    "state_id" "uuid" NOT NULL,
    "wos_account_id" "uuid" NOT NULL,
    "assigned_by" "uuid",
    "assigned_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."battle_plan_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."battle_plan_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "plan_id" "uuid" NOT NULL,
    "state_id" "uuid" NOT NULL,
    "author_user_id" "uuid",
    "author_wos_account_id" "uuid",
    "visibility" "text" DEFAULT 'public'::"text" NOT NULL,
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "battle_plan_comments_body_length" CHECK ((("char_length"("btrim"("body")) >= 1) AND ("char_length"("btrim"("body")) <= 2000))),
    CONSTRAINT "battle_plan_comments_visibility_check" CHECK (("visibility" = ANY (ARRAY['public'::"text", 'admins'::"text"])))
);


ALTER TABLE "public"."battle_plan_comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."battle_plan_groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "plan_id" "uuid" NOT NULL,
    "state_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "leader_wos_account_id" "uuid" NOT NULL,
    "max_members" smallint DEFAULT 10 NOT NULL,
    "notes" "text",
    "sort_order" smallint DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "alliance_id" "uuid",
    "assignment_tag_id" "uuid",
    CONSTRAINT "battle_plan_groups_max_members_check" CHECK ((("max_members" >= 1) AND ("max_members" <= 100))),
    CONSTRAINT "battle_plan_groups_name_length" CHECK ((("char_length"("btrim"("name")) >= 1) AND ("char_length"("btrim"("name")) <= 60))),
    CONSTRAINT "battle_plan_groups_notes_length" CHECK ((("notes" IS NULL) OR ("char_length"("notes") <= 1000)))
);


ALTER TABLE "public"."battle_plan_groups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."battle_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "state_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "battle_type" "text" NOT NULL,
    "scheduled_at" timestamp with time zone NOT NULL,
    "notes" "text",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "published_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "battle_plans_battle_type_check" CHECK (("battle_type" = ANY (ARRAY['svs'::"text", 'castle'::"text", 'test'::"text"]))),
    CONSTRAINT "battle_plans_name_length" CHECK ((("char_length"("btrim"("name")) >= 3) AND ("char_length"("btrim"("name")) <= 100))),
    CONSTRAINT "battle_plans_notes_length" CHECK ((("notes" IS NULL) OR ("char_length"("notes") <= 2000))),
    CONSTRAINT "battle_plans_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text"])))
);


ALTER TABLE "public"."battle_plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."battles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "state_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ended_at" timestamp with time zone,
    "battle_type" "text",
    "scheduled_at" timestamp with time zone,
    "plan_id" "uuid",
    "result" "text",
    "started_at" timestamp with time zone,
    CONSTRAINT "battles_battle_type_check" CHECK ((("battle_type" IS NULL) OR ("battle_type" = ANY (ARRAY['svs'::"text", 'castle'::"text", 'test'::"text"])))),
    CONSTRAINT "battles_result_check" CHECK ((("result" IS NULL) OR ("result" = ANY (ARRAY['win'::"text", 'loss'::"text"])))),
    CONSTRAINT "battles_status_check" CHECK (("status" = ANY (ARRAY['scheduled'::"text", 'active'::"text", 'completed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."battles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."enemy_leaders" (
    "id" bigint NOT NULL,
    "state_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "x" smallint NOT NULL,
    "y" smallint NOT NULL,
    "pet_expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "battle_id" "uuid",
    CONSTRAINT "enemy_leaders_x_check" CHECK ((("x" >= 0) AND ("x" <= 1199))),
    CONSTRAINT "enemy_leaders_y_check" CHECK ((("y" >= 0) AND ("y" <= 1199)))
);


ALTER TABLE "public"."enemy_leaders" OWNER TO "postgres";


ALTER TABLE "public"."enemy_leaders" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."enemy_leaders_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text" NOT NULL,
    "data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "state_id" "uuid",
    "wos_account_id" "uuid",
    "category" "text" DEFAULT 'state'::"text" NOT NULL,
    CONSTRAINT "notifications_category_check" CHECK (("category" = ANY (ARRAY['state'::"text", 'social'::"text", 'tag'::"text", 'alliance'::"text", 'battle'::"text"])))
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


ALTER TABLE "public"."notifications" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."notifications_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "display_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "username" "text",
    "avatar_path" "text",
    "preferred_language" "text" DEFAULT 'en'::"text" NOT NULL,
    CONSTRAINT "profiles_preferred_language_check" CHECK (("preferred_language" = ANY (ARRAY['en'::"text", 'zh'::"text", 'es'::"text", 'pt'::"text", 'ar'::"text", 'hi'::"text", 'ru'::"text", 'id'::"text", 'th'::"text"]))),
    CONSTRAINT "profiles_username_format" CHECK ((("username" IS NULL) OR ("username" ~ '^[A-Za-z0-9_]{3,24}$'::"text")))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rallies" (
    "id" bigint NOT NULL,
    "battle_id" "uuid" NOT NULL,
    "enemy_leader_id" bigint,
    "enemy_name" "text" NOT NULL,
    "x" smallint NOT NULL,
    "y" smallint NOT NULL,
    "march_time" integer NOT NULL,
    "impact_time" timestamp with time zone NOT NULL,
    "pet_active" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "cancelled_at" timestamp with time zone,
    CONSTRAINT "rallies_march_time_check" CHECK (("march_time" >= 0)),
    CONSTRAINT "rallies_x_check" CHECK ((("x" >= 0) AND ("x" <= 1199))),
    CONSTRAINT "rallies_y_check" CHECK ((("y" >= 0) AND ("y" <= 1199)))
);


ALTER TABLE "public"."rallies" OWNER TO "postgres";


ALTER TABLE "public"."rallies" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."rallies_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."state_alliance_members" (
    "state_id" "uuid" NOT NULL,
    "wos_account_id" "uuid" NOT NULL,
    "alliance_id" "uuid" NOT NULL,
    "assigned_by" "uuid",
    "assigned_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."state_alliance_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."state_alliances" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "state_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "color" "text" DEFAULT '#4f8fba'::"text" NOT NULL,
    "max_members" smallint DEFAULT 100 NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "state_alliances_color_format" CHECK (("color" ~ '^#[0-9a-fA-F]{6}$'::"text")),
    CONSTRAINT "state_alliances_max_members_check" CHECK ((("max_members" >= 1) AND ("max_members" <= 100))),
    CONSTRAINT "state_alliances_name_length" CHECK ((("char_length"("btrim"("name")) >= 1) AND ("char_length"("btrim"("name")) <= 40)))
);


ALTER TABLE "public"."state_alliances" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."state_announcement_recipients" (
    "announcement_id" "uuid" NOT NULL,
    "state_id" "uuid" NOT NULL,
    "wos_account_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."state_announcement_recipients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."state_announcements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "state_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text" NOT NULL,
    "audience_type" "text" NOT NULL,
    "audience_id" "uuid",
    "audience_value" "text",
    "created_by" "uuid",
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "state_announcements_audience_shape" CHECK (((("audience_type" = 'all'::"text") AND ("audience_id" IS NULL) AND ("audience_value" IS NULL)) OR (("audience_type" = ANY (ARRAY['alliance'::"text", 'tag'::"text"])) AND ("audience_id" IS NOT NULL) AND ("audience_value" IS NULL)) OR (("audience_type" = ANY (ARRAY['role'::"text", 'capability'::"text"])) AND ("audience_id" IS NULL) AND ("audience_value" IS NOT NULL)))),
    CONSTRAINT "state_announcements_audience_type_check" CHECK (("audience_type" = ANY (ARRAY['all'::"text", 'alliance'::"text", 'tag'::"text", 'role'::"text", 'capability'::"text"]))),
    CONSTRAINT "state_announcements_body_length" CHECK ((("char_length"("btrim"("body")) >= 1) AND ("char_length"("btrim"("body")) <= 2000))),
    CONSTRAINT "state_announcements_title_length" CHECK ((("char_length"("btrim"("title")) >= 3) AND ("char_length"("btrim"("title")) <= 100)))
);


ALTER TABLE "public"."state_announcements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."state_creation_invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "token" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '7 days'::interval) NOT NULL,
    "used_at" timestamp with time zone,
    "used_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."state_creation_invites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."state_invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "state_id" "uuid" NOT NULL,
    "token" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_by" "uuid" NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '72:00:00'::interval) NOT NULL,
    "used_at" timestamp with time zone,
    "used_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "invited_wos_account_id" "uuid",
    "status" "text" DEFAULT 'pending_recipient'::"text" NOT NULL,
    "recipient_responded_at" timestamp with time zone,
    "owner_responded_at" timestamp with time zone,
    CONSTRAINT "state_invites_status_check" CHECK (("status" = ANY (ARRAY['pending_recipient'::"text", 'pending_owner'::"text", 'accepted'::"text", 'declined'::"text", 'rejected'::"text", 'revoked'::"text"])))
);


ALTER TABLE "public"."state_invites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."state_member_capabilities" (
    "state_id" "uuid" NOT NULL,
    "wos_account_id" "uuid" NOT NULL,
    "capability" "text" NOT NULL,
    "assigned_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "state_member_capabilities_capability_check" CHECK (("capability" = ANY (ARRAY['rally_caller'::"text", 'garrison'::"text"])))
);


ALTER TABLE "public"."state_member_capabilities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."state_member_tags" (
    "tag_id" "uuid" NOT NULL,
    "wos_account_id" "uuid" NOT NULL,
    "source" "text" DEFAULT 'manual'::"text" NOT NULL,
    "assigned_by" "uuid",
    "assigned_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source_plan_id" "uuid",
    CONSTRAINT "state_member_tags_source_check" CHECK (("source" = ANY (ARRAY['manual'::"text", 'vote'::"text", 'battle_plan'::"text"])))
);


ALTER TABLE "public"."state_member_tags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."state_members" (
    "state_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "wos_account_id" "uuid" NOT NULL,
    CONSTRAINT "state_members_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'member'::"text"])))
);


ALTER TABLE "public"."state_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."state_poll_options" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "poll_id" "uuid" NOT NULL,
    "label" "text" NOT NULL,
    "sort_order" smallint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "auto_tag_id" "uuid",
    CONSTRAINT "state_poll_options_label_length" CHECK ((("char_length"("btrim"("label")) >= 1) AND ("char_length"("btrim"("label")) <= 100))),
    CONSTRAINT "state_poll_options_sort_order" CHECK ((("sort_order" >= 0) AND ("sort_order" <= 20)))
);


ALTER TABLE "public"."state_poll_options" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."state_poll_votes" (
    "poll_id" "uuid" NOT NULL,
    "option_id" "uuid" NOT NULL,
    "wos_account_id" "uuid" NOT NULL,
    "voted_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."state_poll_votes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."state_polls" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "state_id" "uuid" NOT NULL,
    "question" "text" NOT NULL,
    "description" "text",
    "created_by" "uuid",
    "closes_at" timestamp with time zone NOT NULL,
    "delete_at" timestamp with time zone DEFAULT ("now"() + '30 days'::interval) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "state_polls_description_length" CHECK ((("description" IS NULL) OR ("char_length"("description") <= 1000))),
    CONSTRAINT "state_polls_question_length" CHECK ((("char_length"("btrim"("question")) >= 3) AND ("char_length"("btrim"("question")) <= 140))),
    CONSTRAINT "state_polls_valid_dates" CHECK ((("closes_at" > "created_at") AND ("closes_at" <= "delete_at")))
);


ALTER TABLE "public"."state_polls" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."state_tags" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "state_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "color" "text" DEFAULT '#e4a853'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "bulk_move_limit" smallint DEFAULT 100 NOT NULL,
    "system_key" "text",
    CONSTRAINT "state_tags_bulk_move_limit_check" CHECK ((("bulk_move_limit" >= 1) AND ("bulk_move_limit" <= 100)))
);


ALTER TABLE "public"."state_tags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."states" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."states" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wos_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "wos_id" "text" NOT NULL,
    "nickname" "text",
    "is_configured" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "furnace_level" smallint,
    "infantry_tier" smallint,
    "lancer_tier" smallint,
    "marksman_tier" smallint,
    "infantry_fc_level" smallint,
    "lancer_fc_level" smallint,
    "marksman_fc_level" smallint,
    "infantry_t12_skill" smallint,
    "lancer_t12_skill" smallint,
    "marksman_t12_skill" smallint,
    "game_avatar_url" "text",
    "state_number" integer,
    "furnace_level_raw" smallint,
    "power" bigint,
    "chief_level" smallint,
    "vip_level" smallint,
    "kills" bigint,
    "labyrinth_score" bigint,
    "alliance_external_id" bigint,
    "alliance_abbr" "text",
    "alliance_name" "text",
    "game_active" boolean,
    "player_data_source" "text",
    "player_data_updated_at" timestamp with time zone,
    "player_data_synced_at" timestamp with time zone,
    CONSTRAINT "configured_wos_id_is_numeric" CHECK (((NOT "is_configured") OR ("wos_id" ~ '^[0-9]+$'::"text"))),
    CONSTRAINT "wos_accounts_furnace_level_check" CHECK ((("furnace_level" IS NULL) OR (("furnace_level" >= 0) AND ("furnace_level" <= 10)))),
    CONSTRAINT "wos_accounts_infantry_fc_level_check" CHECK ((("infantry_fc_level" IS NULL) OR (("infantry_fc_level" >= 0) AND ("infantry_fc_level" <= 10)))),
    CONSTRAINT "wos_accounts_infantry_t12_skill_check" CHECK ((("infantry_t12_skill" IS NULL) OR (("infantry_t12_skill" >= 0) AND ("infantry_t12_skill" <= 3)))),
    CONSTRAINT "wos_accounts_infantry_tier_check" CHECK ((("infantry_tier" IS NULL) OR (("infantry_tier" >= 1) AND ("infantry_tier" <= 12)))),
    CONSTRAINT "wos_accounts_lancer_fc_level_check" CHECK ((("lancer_fc_level" IS NULL) OR (("lancer_fc_level" >= 0) AND ("lancer_fc_level" <= 10)))),
    CONSTRAINT "wos_accounts_lancer_t12_skill_check" CHECK ((("lancer_t12_skill" IS NULL) OR (("lancer_t12_skill" >= 0) AND ("lancer_t12_skill" <= 3)))),
    CONSTRAINT "wos_accounts_lancer_tier_check" CHECK ((("lancer_tier" IS NULL) OR (("lancer_tier" >= 1) AND ("lancer_tier" <= 12)))),
    CONSTRAINT "wos_accounts_marksman_fc_level_check" CHECK ((("marksman_fc_level" IS NULL) OR (("marksman_fc_level" >= 0) AND ("marksman_fc_level" <= 10)))),
    CONSTRAINT "wos_accounts_marksman_t12_skill_check" CHECK ((("marksman_t12_skill" IS NULL) OR (("marksman_t12_skill" >= 0) AND ("marksman_t12_skill" <= 3)))),
    CONSTRAINT "wos_accounts_marksman_tier_check" CHECK ((("marksman_tier" IS NULL) OR (("marksman_tier" >= 1) AND ("marksman_tier" <= 12))))
);


ALTER TABLE "public"."wos_accounts" OWNER TO "postgres";


COMMENT ON COLUMN "public"."wos_accounts"."furnace_level" IS 'Derived Fire Crystal level used by planning filters: 0-10.';



COMMENT ON COLUMN "public"."wos_accounts"."furnace_level_raw" IS 'Raw game Furnace level: 1-30 normal Furnace, 31-40 maps to FC1-FC10.';



COMMENT ON COLUMN "public"."wos_accounts"."player_data_source" IS 'Approved external provider used for the latest player-data synchronization.';



ALTER TABLE ONLY "public"."battle_plan_assignments"
    ADD CONSTRAINT "battle_plan_assignments_pkey" PRIMARY KEY ("plan_id", "wos_account_id");



ALTER TABLE ONLY "public"."battle_plan_comments"
    ADD CONSTRAINT "battle_plan_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."battle_plan_groups"
    ADD CONSTRAINT "battle_plan_groups_id_plan_id_state_id_key" UNIQUE ("id", "plan_id", "state_id");



ALTER TABLE ONLY "public"."battle_plan_groups"
    ADD CONSTRAINT "battle_plan_groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."battle_plan_groups"
    ADD CONSTRAINT "battle_plan_groups_plan_id_leader_wos_account_id_key" UNIQUE ("plan_id", "leader_wos_account_id");



ALTER TABLE ONLY "public"."battle_plans"
    ADD CONSTRAINT "battle_plans_id_state_id_key" UNIQUE ("id", "state_id");



ALTER TABLE ONLY "public"."battle_plans"
    ADD CONSTRAINT "battle_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."battles"
    ADD CONSTRAINT "battles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."enemy_leaders"
    ADD CONSTRAINT "enemy_leaders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rallies"
    ADD CONSTRAINT "rallies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."state_alliance_members"
    ADD CONSTRAINT "state_alliance_members_pkey" PRIMARY KEY ("state_id", "wos_account_id");



ALTER TABLE ONLY "public"."state_alliances"
    ADD CONSTRAINT "state_alliances_id_state_id_key" UNIQUE ("id", "state_id");



ALTER TABLE ONLY "public"."state_alliances"
    ADD CONSTRAINT "state_alliances_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."state_announcement_recipients"
    ADD CONSTRAINT "state_announcement_recipients_pkey" PRIMARY KEY ("announcement_id", "wos_account_id");



ALTER TABLE ONLY "public"."state_announcements"
    ADD CONSTRAINT "state_announcements_id_state_id_key" UNIQUE ("id", "state_id");



ALTER TABLE ONLY "public"."state_announcements"
    ADD CONSTRAINT "state_announcements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."state_creation_invites"
    ADD CONSTRAINT "state_creation_invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."state_creation_invites"
    ADD CONSTRAINT "state_creation_invites_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."state_invites"
    ADD CONSTRAINT "state_invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."state_invites"
    ADD CONSTRAINT "state_invites_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."state_member_capabilities"
    ADD CONSTRAINT "state_member_capabilities_pkey" PRIMARY KEY ("state_id", "wos_account_id", "capability");



ALTER TABLE ONLY "public"."state_member_tags"
    ADD CONSTRAINT "state_member_tags_pkey" PRIMARY KEY ("tag_id", "wos_account_id");



ALTER TABLE ONLY "public"."state_members"
    ADD CONSTRAINT "state_members_pkey" PRIMARY KEY ("state_id", "wos_account_id");



ALTER TABLE ONLY "public"."state_poll_options"
    ADD CONSTRAINT "state_poll_options_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."state_poll_options"
    ADD CONSTRAINT "state_poll_options_poll_id_sort_order_key" UNIQUE ("poll_id", "sort_order");



ALTER TABLE ONLY "public"."state_poll_votes"
    ADD CONSTRAINT "state_poll_votes_pkey" PRIMARY KEY ("poll_id", "wos_account_id");



ALTER TABLE ONLY "public"."state_polls"
    ADD CONSTRAINT "state_polls_pkey" PRIMARY KEY ("id");



ALTER TABLE "public"."state_tags"
    ADD CONSTRAINT "state_tags_color_format" CHECK (("color" ~ '^#[0-9a-fA-F]{6}$'::"text")) NOT VALID;



ALTER TABLE "public"."state_tags"
    ADD CONSTRAINT "state_tags_name_length" CHECK ((("char_length"("btrim"("name")) >= 1) AND ("char_length"("btrim"("name")) <= 32))) NOT VALID;



ALTER TABLE ONLY "public"."state_tags"
    ADD CONSTRAINT "state_tags_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."states"
    ADD CONSTRAINT "states_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wos_accounts"
    ADD CONSTRAINT "wos_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wos_accounts"
    ADD CONSTRAINT "wos_accounts_wos_id_key" UNIQUE ("wos_id");



CREATE INDEX "battle_plan_assignments_group_idx" ON "public"."battle_plan_assignments" USING "btree" ("group_id");



CREATE INDEX "battle_plan_comments_plan_created_idx" ON "public"."battle_plan_comments" USING "btree" ("plan_id", "created_at");



CREATE INDEX "battle_plan_comments_state_idx" ON "public"."battle_plan_comments" USING "btree" ("state_id");



CREATE INDEX "battle_plan_groups_plan_order_idx" ON "public"."battle_plan_groups" USING "btree" ("plan_id", "sort_order", "created_at");



CREATE INDEX "battle_plans_state_schedule_idx" ON "public"."battle_plans" USING "btree" ("state_id", "scheduled_at" DESC);



CREATE UNIQUE INDEX "battles_plan_unique" ON "public"."battles" USING "btree" ("plan_id") WHERE ("plan_id" IS NOT NULL);



CREATE INDEX "battles_state_schedule_idx" ON "public"."battles" USING "btree" ("state_id", "scheduled_at");



CREATE INDEX "enemy_leaders_battle_id_idx" ON "public"."enemy_leaders" USING "btree" ("battle_id");



CREATE UNIQUE INDEX "enemy_leaders_battle_name_unique" ON "public"."enemy_leaders" USING "btree" ("battle_id", "lower"("name")) WHERE ("battle_id" IS NOT NULL);



CREATE INDEX "notifications_account_created_idx" ON "public"."notifications" USING "btree" ("wos_account_id", "created_at" DESC);



CREATE INDEX "notifications_state_created_idx" ON "public"."notifications" USING "btree" ("state_id", "created_at" DESC);



CREATE INDEX "notifications_user_created_idx" ON "public"."notifications" USING "btree" ("user_id", "created_at" DESC);



CREATE UNIQUE INDEX "profiles_username_lower_unique" ON "public"."profiles" USING "btree" ("lower"("username")) WHERE ("username" IS NOT NULL);



CREATE INDEX "state_alliance_members_alliance_idx" ON "public"."state_alliance_members" USING "btree" ("alliance_id");



CREATE UNIQUE INDEX "state_alliances_state_name_unique" ON "public"."state_alliances" USING "btree" ("state_id", "lower"("name"));



CREATE INDEX "state_announcement_recipients_account_idx" ON "public"."state_announcement_recipients" USING "btree" ("state_id", "wos_account_id");



CREATE INDEX "state_announcements_audience_idx" ON "public"."state_announcements" USING "btree" ("state_id", "audience_type", "audience_id");



CREATE INDEX "state_announcements_expires_idx" ON "public"."state_announcements" USING "btree" ("expires_at");



CREATE INDEX "state_announcements_state_created_idx" ON "public"."state_announcements" USING "btree" ("state_id", "created_at" DESC);



CREATE INDEX "state_invites_invited_wos_account_idx" ON "public"."state_invites" USING "btree" ("invited_wos_account_id");



CREATE INDEX "state_invites_state_id_idx" ON "public"."state_invites" USING "btree" ("state_id");



CREATE UNIQUE INDEX "state_member_one_battle_capability_unique" ON "public"."state_member_capabilities" USING "btree" ("state_id", "wos_account_id");



CREATE INDEX "state_member_tags_source_plan_idx" ON "public"."state_member_tags" USING "btree" ("source_plan_id") WHERE ("source_plan_id" IS NOT NULL);



CREATE INDEX "state_members_wos_account_id_idx" ON "public"."state_members" USING "btree" ("wos_account_id");



CREATE INDEX "state_poll_options_auto_tag_idx" ON "public"."state_poll_options" USING "btree" ("auto_tag_id") WHERE ("auto_tag_id" IS NOT NULL);



CREATE INDEX "state_poll_votes_option_idx" ON "public"."state_poll_votes" USING "btree" ("option_id");



CREATE INDEX "state_polls_delete_at_idx" ON "public"."state_polls" USING "btree" ("delete_at");



CREATE INDEX "state_polls_state_created_idx" ON "public"."state_polls" USING "btree" ("state_id", "created_at" DESC);



CREATE UNIQUE INDEX "state_tags_state_name_unique" ON "public"."state_tags" USING "btree" ("state_id", "lower"("name"));



CREATE UNIQUE INDEX "state_tags_state_system_key_unique" ON "public"."state_tags" USING "btree" ("state_id", "system_key") WHERE ("system_key" IS NOT NULL);



CREATE INDEX "wos_accounts_alliance_external_id_idx" ON "public"."wos_accounts" USING "btree" ("alliance_external_id");



CREATE INDEX "wos_accounts_state_number_idx" ON "public"."wos_accounts" USING "btree" ("state_number");



CREATE INDEX "wos_accounts_user_id_idx" ON "public"."wos_accounts" USING "btree" ("user_id");



CREATE OR REPLACE TRIGGER "battle_plan_comment_notification_cleanup" AFTER DELETE ON "public"."battle_plan_comments" FOR EACH ROW EXECUTE FUNCTION "public"."cleanup_deleted_plan_comment_notifications"();



CREATE OR REPLACE TRIGGER "battle_plan_notification_cleanup" AFTER DELETE ON "public"."battle_plans" FOR EACH ROW EXECUTE FUNCTION "public"."cleanup_deleted_battle_plan_notifications"();



CREATE OR REPLACE TRIGGER "battle_status_notification" AFTER UPDATE OF "status" ON "public"."battles" FOR EACH ROW EXECUTE FUNCTION "public"."notify_battle_status_change"();



CREATE OR REPLACE TRIGGER "create_state_system_tags_after_insert" AFTER INSERT ON "public"."states" FOR EACH ROW EXECUTE FUNCTION "public"."create_state_system_tags"();



CREATE OR REPLACE TRIGGER "protect_state_system_tag_before_change" BEFORE DELETE OR UPDATE ON "public"."state_tags" FOR EACH ROW EXECUTE FUNCTION "public"."protect_state_system_tag"();



CREATE OR REPLACE TRIGGER "state_alliance_assignment_notification" AFTER INSERT OR DELETE OR UPDATE ON "public"."state_alliance_members" FOR EACH ROW EXECUTE FUNCTION "public"."notify_state_alliance_assignment"();



CREATE OR REPLACE TRIGGER "state_member_tag_awarded_notification" AFTER INSERT ON "public"."state_member_tags" FOR EACH ROW EXECUTE FUNCTION "public"."notify_state_tag_awarded"();



CREATE OR REPLACE TRIGGER "state_poll_creator_notification" AFTER INSERT ON "public"."state_polls" FOR EACH ROW EXECUTE FUNCTION "public"."notify_state_poll_creator"();



CREATE OR REPLACE TRIGGER "validate_enemy_leader_battle_trigger" BEFORE INSERT OR UPDATE ON "public"."enemy_leaders" FOR EACH ROW EXECUTE FUNCTION "public"."validate_enemy_leader_battle"();



CREATE OR REPLACE TRIGGER "validate_enemy_leader_delete_trigger" BEFORE DELETE ON "public"."enemy_leaders" FOR EACH ROW EXECUTE FUNCTION "public"."validate_enemy_leader_delete"();



ALTER TABLE ONLY "public"."battle_plan_assignments"
    ADD CONSTRAINT "battle_plan_assignments_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."battle_plan_assignments"
    ADD CONSTRAINT "battle_plan_assignments_group_fkey" FOREIGN KEY ("group_id", "plan_id", "state_id") REFERENCES "public"."battle_plan_groups"("id", "plan_id", "state_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."battle_plan_assignments"
    ADD CONSTRAINT "battle_plan_assignments_membership_fkey" FOREIGN KEY ("state_id", "wos_account_id") REFERENCES "public"."state_members"("state_id", "wos_account_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."battle_plan_comments"
    ADD CONSTRAINT "battle_plan_comments_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."battle_plan_comments"
    ADD CONSTRAINT "battle_plan_comments_author_wos_account_id_fkey" FOREIGN KEY ("author_wos_account_id") REFERENCES "public"."wos_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."battle_plan_comments"
    ADD CONSTRAINT "battle_plan_comments_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."battle_plans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."battle_plan_comments"
    ADD CONSTRAINT "battle_plan_comments_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "public"."states"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."battle_plan_groups"
    ADD CONSTRAINT "battle_plan_groups_alliance_fkey" FOREIGN KEY ("alliance_id", "state_id") REFERENCES "public"."state_alliances"("id", "state_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."battle_plan_groups"
    ADD CONSTRAINT "battle_plan_groups_assignment_tag_fkey" FOREIGN KEY ("assignment_tag_id") REFERENCES "public"."state_tags"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."battle_plan_groups"
    ADD CONSTRAINT "battle_plan_groups_leader_membership_fkey" FOREIGN KEY ("state_id", "leader_wos_account_id") REFERENCES "public"."state_members"("state_id", "wos_account_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."battle_plan_groups"
    ADD CONSTRAINT "battle_plan_groups_plan_fkey" FOREIGN KEY ("plan_id", "state_id") REFERENCES "public"."battle_plans"("id", "state_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."battle_plans"
    ADD CONSTRAINT "battle_plans_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."battle_plans"
    ADD CONSTRAINT "battle_plans_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "public"."states"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."battles"
    ADD CONSTRAINT "battles_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."battle_plans"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."battles"
    ADD CONSTRAINT "battles_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "public"."states"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."enemy_leaders"
    ADD CONSTRAINT "enemy_leaders_battle_id_fkey" FOREIGN KEY ("battle_id") REFERENCES "public"."battles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."enemy_leaders"
    ADD CONSTRAINT "enemy_leaders_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "public"."states"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "public"."states"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_wos_account_id_fkey" FOREIGN KEY ("wos_account_id") REFERENCES "public"."wos_accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rallies"
    ADD CONSTRAINT "rallies_battle_id_fkey" FOREIGN KEY ("battle_id") REFERENCES "public"."battles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rallies"
    ADD CONSTRAINT "rallies_enemy_leader_id_fkey" FOREIGN KEY ("enemy_leader_id") REFERENCES "public"."enemy_leaders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."state_alliance_members"
    ADD CONSTRAINT "state_alliance_members_alliance_fkey" FOREIGN KEY ("alliance_id", "state_id") REFERENCES "public"."state_alliances"("id", "state_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."state_alliance_members"
    ADD CONSTRAINT "state_alliance_members_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."state_alliance_members"
    ADD CONSTRAINT "state_alliance_members_membership_fkey" FOREIGN KEY ("state_id", "wos_account_id") REFERENCES "public"."state_members"("state_id", "wos_account_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."state_alliances"
    ADD CONSTRAINT "state_alliances_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."state_alliances"
    ADD CONSTRAINT "state_alliances_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "public"."states"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."state_announcement_recipients"
    ADD CONSTRAINT "state_announcement_recipients_announcement_fkey" FOREIGN KEY ("announcement_id", "state_id") REFERENCES "public"."state_announcements"("id", "state_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."state_announcement_recipients"
    ADD CONSTRAINT "state_announcement_recipients_membership_fkey" FOREIGN KEY ("state_id", "wos_account_id") REFERENCES "public"."state_members"("state_id", "wos_account_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."state_announcements"
    ADD CONSTRAINT "state_announcements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."state_announcements"
    ADD CONSTRAINT "state_announcements_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "public"."states"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."state_creation_invites"
    ADD CONSTRAINT "state_creation_invites_used_by_fkey" FOREIGN KEY ("used_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."state_invites"
    ADD CONSTRAINT "state_invites_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."state_invites"
    ADD CONSTRAINT "state_invites_invited_wos_account_id_fkey" FOREIGN KEY ("invited_wos_account_id") REFERENCES "public"."wos_accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."state_invites"
    ADD CONSTRAINT "state_invites_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "public"."states"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."state_invites"
    ADD CONSTRAINT "state_invites_used_by_fkey" FOREIGN KEY ("used_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."state_member_capabilities"
    ADD CONSTRAINT "state_member_capabilities_membership_fkey" FOREIGN KEY ("state_id", "wos_account_id") REFERENCES "public"."state_members"("state_id", "wos_account_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."state_member_capabilities"
    ADD CONSTRAINT "state_member_capabilities_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "public"."states"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."state_member_capabilities"
    ADD CONSTRAINT "state_member_capabilities_wos_account_id_fkey" FOREIGN KEY ("wos_account_id") REFERENCES "public"."wos_accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."state_member_tags"
    ADD CONSTRAINT "state_member_tags_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."state_member_tags"
    ADD CONSTRAINT "state_member_tags_source_plan_id_fkey" FOREIGN KEY ("source_plan_id") REFERENCES "public"."battle_plans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."state_member_tags"
    ADD CONSTRAINT "state_member_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "public"."state_tags"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."state_member_tags"
    ADD CONSTRAINT "state_member_tags_wos_account_id_fkey" FOREIGN KEY ("wos_account_id") REFERENCES "public"."wos_accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."state_members"
    ADD CONSTRAINT "state_members_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "public"."states"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."state_members"
    ADD CONSTRAINT "state_members_wos_account_id_fkey" FOREIGN KEY ("wos_account_id") REFERENCES "public"."wos_accounts"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."state_poll_options"
    ADD CONSTRAINT "state_poll_options_auto_tag_id_fkey" FOREIGN KEY ("auto_tag_id") REFERENCES "public"."state_tags"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."state_poll_options"
    ADD CONSTRAINT "state_poll_options_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "public"."state_polls"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."state_poll_votes"
    ADD CONSTRAINT "state_poll_votes_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "public"."state_poll_options"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."state_poll_votes"
    ADD CONSTRAINT "state_poll_votes_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "public"."state_polls"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."state_poll_votes"
    ADD CONSTRAINT "state_poll_votes_wos_account_id_fkey" FOREIGN KEY ("wos_account_id") REFERENCES "public"."wos_accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."state_polls"
    ADD CONSTRAINT "state_polls_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."state_polls"
    ADD CONSTRAINT "state_polls_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "public"."states"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."state_tags"
    ADD CONSTRAINT "state_tags_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."state_tags"
    ADD CONSTRAINT "state_tags_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "public"."states"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wos_accounts"
    ADD CONSTRAINT "wos_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "admins and recipients read state invitations" ON "public"."state_invites" FOR SELECT TO "authenticated" USING (("public"."is_state_admin"("state_id") OR "public"."owns_wos_account"("invited_wos_account_id")));



CREATE POLICY "admins manage state capabilities" ON "public"."state_member_capabilities" TO "authenticated" USING ("public"."is_state_admin"("state_id")) WITH CHECK ("public"."is_state_admin"("state_id"));



CREATE POLICY "admins manage state tags" ON "public"."state_tags" TO "authenticated" USING ("public"."is_state_admin"("state_id")) WITH CHECK ("public"."is_state_admin"("state_id"));



CREATE POLICY "admins manage tag assignments" ON "public"."state_member_tags" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."state_tags" "tag"
  WHERE (("tag"."id" = "state_member_tags"."tag_id") AND "public"."is_state_admin"("tag"."state_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."state_tags" "tag"
  WHERE (("tag"."id" = "state_member_tags"."tag_id") AND "public"."is_state_admin"("tag"."state_id") AND (EXISTS ( SELECT 1
           FROM "public"."state_members" "member"
          WHERE (("member"."state_id" = "tag"."state_id") AND ("member"."wos_account_id" = "state_member_tags"."wos_account_id"))))))));



ALTER TABLE "public"."battle_plan_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."battle_plan_comments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."battle_plan_groups" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."battle_plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."battles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "callers add enemy leaders" ON "public"."enemy_leaders" FOR INSERT TO "authenticated" WITH CHECK ("public"."can_call_state_rallies"("state_id"));



CREATE POLICY "callers add rallies" ON "public"."rallies" FOR INSERT TO "authenticated" WITH CHECK ("public"."can_manage_battle"("battle_id"));



CREATE POLICY "callers remove enemy leaders" ON "public"."enemy_leaders" FOR DELETE TO "authenticated" USING ("public"."can_call_state_rallies"("state_id"));



CREATE POLICY "callers update enemy leaders" ON "public"."enemy_leaders" FOR UPDATE TO "authenticated" USING ("public"."can_call_state_rallies"("state_id")) WITH CHECK ("public"."can_call_state_rallies"("state_id"));



CREATE POLICY "callers update rallies" ON "public"."rallies" FOR UPDATE TO "authenticated" USING ("public"."can_manage_battle"("battle_id")) WITH CHECK ("public"."can_manage_battle"("battle_id"));



ALTER TABLE "public"."enemy_leaders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "members read alliance assignments" ON "public"."state_alliance_members" FOR SELECT TO "authenticated" USING ("public"."is_state_member"("state_id"));



CREATE POLICY "members read own poll votes" ON "public"."state_poll_votes" FOR SELECT TO "authenticated" USING (("public"."owns_wos_account"("wos_account_id") OR (EXISTS ( SELECT 1
   FROM "public"."state_polls" "poll"
  WHERE (("poll"."id" = "state_poll_votes"."poll_id") AND "public"."is_state_admin"("poll"."state_id"))))));



CREATE POLICY "members read public plan comments" ON "public"."battle_plan_comments" FOR SELECT TO "authenticated" USING ((("visibility" = 'public'::"text") AND "public"."is_state_member"("state_id")));



CREATE POLICY "members read state alliances" ON "public"."state_alliances" FOR SELECT TO "authenticated" USING ("public"."is_state_member"("state_id"));



CREATE POLICY "members read state capabilities" ON "public"."state_member_capabilities" FOR SELECT TO "authenticated" USING ("public"."is_state_member"("state_id"));



CREATE POLICY "members read state poll options" ON "public"."state_poll_options" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."state_polls" "poll"
  WHERE (("poll"."id" = "state_poll_options"."poll_id") AND ("poll"."delete_at" > "now"()) AND "public"."is_state_member"("poll"."state_id")))));



CREATE POLICY "members read state polls" ON "public"."state_polls" FOR SELECT TO "authenticated" USING (("public"."is_state_member"("state_id") AND ("delete_at" > "now"())));



CREATE POLICY "members read state tags" ON "public"."state_tags" FOR SELECT TO "authenticated" USING ("public"."is_state_member"("state_id"));



CREATE POLICY "members read tag assignments" ON "public"."state_member_tags" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."state_tags" "tag"
  WHERE (("tag"."id" = "state_member_tags"."tag_id") AND "public"."is_state_member"("tag"."state_id")))));



CREATE POLICY "members read their state memberships" ON "public"."state_members" FOR SELECT TO "authenticated" USING ("public"."is_state_member"("state_id"));



CREATE POLICY "members read their states" ON "public"."states" FOR SELECT TO "authenticated" USING ("public"."is_state_member"("id"));



CREATE POLICY "members read visible battle plan assignments" ON "public"."battle_plan_assignments" FOR SELECT TO "authenticated" USING ("public"."can_view_battle_plan"("plan_id"));



CREATE POLICY "members read visible battle plan groups" ON "public"."battle_plan_groups" FOR SELECT TO "authenticated" USING ("public"."can_view_battle_plan"("plan_id"));



CREATE POLICY "members read visible battle plans" ON "public"."battle_plans" FOR SELECT TO "authenticated" USING ("public"."can_view_battle_plan"("id"));



ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "owners create battles" ON "public"."battles" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_state_owner"("state_id"));



CREATE POLICY "owners delete battles" ON "public"."battles" FOR DELETE TO "authenticated" USING ("public"."is_state_owner"("state_id"));



CREATE POLICY "owners revoke state invitations" ON "public"."state_invites" FOR DELETE TO "authenticated" USING ("public"."is_state_owner"("state_id"));



CREATE POLICY "owners update battles" ON "public"."battles" FOR UPDATE TO "authenticated" USING ("public"."is_state_owner"("state_id")) WITH CHECK ("public"."is_state_owner"("state_id"));



CREATE POLICY "owners update their states" ON "public"."states" FOR UPDATE TO "authenticated" USING ("public"."is_state_owner"("id")) WITH CHECK ("public"."is_state_owner"("id"));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rallies" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "recipients read state announcements" ON "public"."state_announcements" FOR SELECT TO "authenticated" USING ("public"."can_view_state_announcement"("id"));



CREATE POLICY "specialists read battles" ON "public"."battles" FOR SELECT TO "authenticated" USING ("public"."can_view_state_operations"("state_id"));



CREATE POLICY "specialists read enemy leaders" ON "public"."enemy_leaders" FOR SELECT TO "authenticated" USING ("public"."can_view_state_operations"("state_id"));



CREATE POLICY "specialists read rallies" ON "public"."rallies" FOR SELECT TO "authenticated" USING ("public"."can_view_battle"("battle_id"));



CREATE POLICY "state members read permitted plan comments" ON "public"."battle_plan_comments" FOR SELECT TO "authenticated" USING ("public"."can_view_battle_plan_comment"("id"));



ALTER TABLE "public"."state_alliance_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."state_alliances" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."state_announcement_recipients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."state_announcements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."state_creation_invites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."state_invites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."state_member_capabilities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."state_member_tags" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."state_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."state_poll_options" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."state_poll_votes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."state_polls" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."state_tags" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."states" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users add own WOS accounts" ON "public"."wos_accounts" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND ("is_configured" = true)));



CREATE POLICY "users delete own notifications" ON "public"."notifications" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "users mark own notifications" ON "public"."notifications" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "users read own notifications" ON "public"."notifications" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "users read permitted WOS accounts" ON "public"."wos_accounts" FOR SELECT TO "authenticated" USING ("public"."can_read_wos_account"("id"));



CREATE POLICY "users read permitted announcement recipients" ON "public"."state_announcement_recipients" FOR SELECT TO "authenticated" USING (("public"."owns_wos_account"("wos_account_id") OR "public"."is_state_admin"("state_id")));



CREATE POLICY "users read profiles in shared states" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((("id" = "auth"."uid"()) OR "public"."shares_state_with"("id")));



CREATE POLICY "users remove own unused WOS accounts" ON "public"."wos_accounts" FOR DELETE TO "authenticated" USING ((("user_id" = "auth"."uid"()) AND (NOT (EXISTS ( SELECT 1
   FROM "public"."state_members" "sm"
  WHERE ("sm"."wos_account_id" = "wos_accounts"."id"))))));



CREATE POLICY "users update own WOS accounts" ON "public"."wos_accounts" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK ((("user_id" = "auth"."uid"()) AND ("is_configured" = true)));



CREATE POLICY "users update own profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("id" = "auth"."uid"())) WITH CHECK (("id" = "auth"."uid"()));



ALTER TABLE "public"."wos_accounts" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."battle_plan_assignments";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."battle_plan_comments";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."battle_plan_groups";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."battle_plans";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."battles";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."enemy_leaders";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."notifications";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."rallies";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."state_alliance_members";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."state_announcements";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."state_member_tags";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";











































































































































































REVOKE ALL ON FUNCTION "public"."accept_state_invite"("invite_token" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."accept_state_invite"("invite_token" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_state_invite"("invite_token" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."activate_scheduled_battle"("target_battle_id" "uuid", "actor_wos_account_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."activate_scheduled_battle"("target_battle_id" "uuid", "actor_wos_account_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."activate_scheduled_battle"("target_battle_id" "uuid", "actor_wos_account_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."assign_tagged_members_to_alliance"("target_alliance_id" "uuid", "target_tag_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."assign_tagged_members_to_alliance"("target_alliance_id" "uuid", "target_tag_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."assign_tagged_members_to_alliance"("target_alliance_id" "uuid", "target_tag_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."bulk_assign_battle_plan_members"("target_plan_id" "uuid", "target_group_id" "uuid", "target_wos_account_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."bulk_assign_battle_plan_members"("target_plan_id" "uuid", "target_group_id" "uuid", "target_wos_account_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."bulk_assign_battle_plan_members"("target_plan_id" "uuid", "target_group_id" "uuid", "target_wos_account_ids" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_call_state_rallies"("check_state_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_call_state_rallies"("check_state_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_call_state_rallies"("check_state_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_manage_battle"("check_battle_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_manage_battle"("check_battle_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_manage_battle"("check_battle_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_read_wos_account"("check_wos_account_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_read_wos_account"("check_wos_account_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_read_wos_account"("check_wos_account_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_view_battle"("check_battle_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_view_battle"("check_battle_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_view_battle"("check_battle_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_view_battle_plan"("target_plan_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_view_battle_plan"("target_plan_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_view_battle_plan"("target_plan_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_view_battle_plan_comment"("target_comment_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_view_battle_plan_comment"("target_comment_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_view_battle_plan_comment"("target_comment_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_view_state_announcement"("target_announcement_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_view_state_announcement"("target_announcement_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_view_state_announcement"("target_announcement_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_view_state_operations"("check_state_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_view_state_operations"("check_state_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_view_state_operations"("check_state_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_deleted_battle_plan_notifications"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_deleted_battle_plan_notifications"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_deleted_battle_plan_notifications"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_deleted_plan_comment_notifications"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_deleted_plan_comment_notifications"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_deleted_plan_comment_notifications"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."cleanup_expired_state_announcements"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cleanup_expired_state_announcements"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_expired_state_announcements"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."cleanup_expired_state_polls"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cleanup_expired_state_polls"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_expired_state_polls"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."complete_account_setup"("chosen_username" "text", "chosen_wos_id" "text", "chosen_wos_nickname" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_account_setup"("chosen_username" "text", "chosen_wos_id" "text", "chosen_wos_nickname" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_account_setup"("chosen_username" "text", "chosen_wos_id" "text", "chosen_wos_nickname" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."complete_active_battle"("target_battle_id" "uuid", "actor_wos_account_id" "uuid", "selected_result" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_active_battle"("target_battle_id" "uuid", "actor_wos_account_id" "uuid", "selected_result" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_active_battle"("target_battle_id" "uuid", "actor_wos_account_id" "uuid", "selected_result" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_battle_plan"("target_state_id" "uuid", "plan_name" "text", "selected_battle_type" "text", "plan_scheduled_at" timestamp with time zone, "plan_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_battle_plan"("target_state_id" "uuid", "plan_name" "text", "selected_battle_type" "text", "plan_scheduled_at" timestamp with time zone, "plan_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_battle_plan"("target_state_id" "uuid", "plan_name" "text", "selected_battle_type" "text", "plan_scheduled_at" timestamp with time zone, "plan_notes" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_battle_plan_comment"("target_plan_id" "uuid", "commenter_wos_account_id" "uuid", "comment_body" "text", "comment_visibility" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_battle_plan_comment"("target_plan_id" "uuid", "commenter_wos_account_id" "uuid", "comment_body" "text", "comment_visibility" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_battle_plan_comment"("target_plan_id" "uuid", "commenter_wos_account_id" "uuid", "comment_body" "text", "comment_visibility" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_battle_plan_group"("target_plan_id" "uuid", "group_name" "text", "leader_account_id" "uuid", "destination_alliance_id" "uuid", "publish_tag_id" "uuid", "group_max_members" integer, "group_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_battle_plan_group"("target_plan_id" "uuid", "group_name" "text", "leader_account_id" "uuid", "destination_alliance_id" "uuid", "publish_tag_id" "uuid", "group_max_members" integer, "group_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_battle_plan_group"("target_plan_id" "uuid", "group_name" "text", "leader_account_id" "uuid", "destination_alliance_id" "uuid", "publish_tag_id" "uuid", "group_max_members" integer, "group_notes" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_state_alliance"("target_state_id" "uuid", "alliance_name" "text", "alliance_color" "text", "alliance_max_members" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_state_alliance"("target_state_id" "uuid", "alliance_name" "text", "alliance_color" "text", "alliance_max_members" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_state_alliance"("target_state_id" "uuid", "alliance_name" "text", "alliance_color" "text", "alliance_max_members" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_state_announcement"("target_state_id" "uuid", "sender_wos_account_id" "uuid", "announcement_title" "text", "announcement_body" "text", "target_audience_type" "text", "target_audience_id" "uuid", "target_audience_value" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_state_announcement"("target_state_id" "uuid", "sender_wos_account_id" "uuid", "announcement_title" "text", "announcement_body" "text", "target_audience_type" "text", "target_audience_id" "uuid", "target_audience_value" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_state_announcement"("target_state_id" "uuid", "sender_wos_account_id" "uuid", "announcement_title" "text", "announcement_body" "text", "target_audience_type" "text", "target_audience_id" "uuid", "target_audience_value" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_state_join_invite"("target_state_id" "uuid", "target_wos_id" "text", "valid_for_hours" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_state_join_invite"("target_state_id" "uuid", "target_wos_id" "text", "valid_for_hours" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_state_join_invite"("target_state_id" "uuid", "target_wos_id" "text", "valid_for_hours" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_state_poll"("target_state_id" "uuid", "creator_wos_account_id" "uuid", "poll_question" "text", "poll_description" "text", "option_labels" "text"[], "option_tag_ids" "uuid"[], "poll_closes_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_state_poll"("target_state_id" "uuid", "creator_wos_account_id" "uuid", "poll_question" "text", "poll_description" "text", "option_labels" "text"[], "option_tag_ids" "uuid"[], "poll_closes_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_state_poll"("target_state_id" "uuid", "creator_wos_account_id" "uuid", "poll_question" "text", "poll_description" "text", "option_labels" "text"[], "option_tag_ids" "uuid"[], "poll_closes_at" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."create_state_system_tags"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_state_system_tags"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_state_system_tags"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_state_tag"("target_state_id" "uuid", "tag_name" "text", "tag_color" "text", "tag_bulk_move_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_state_tag"("target_state_id" "uuid", "tag_name" "text", "tag_color" "text", "tag_bulk_move_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_state_tag"("target_state_id" "uuid", "tag_name" "text", "tag_color" "text", "tag_bulk_move_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_battle_plan"("target_plan_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_battle_plan"("target_plan_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_battle_plan"("target_plan_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_battle_plan_comment"("target_comment_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_battle_plan_comment"("target_comment_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_battle_plan_comment"("target_comment_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_battle_plan_comment"("target_comment_id" "uuid", "actor_wos_account_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_battle_plan_comment"("target_comment_id" "uuid", "actor_wos_account_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_battle_plan_comment"("target_comment_id" "uuid", "actor_wos_account_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_battle_plan_group"("target_group_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_battle_plan_group"("target_group_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_battle_plan_group"("target_group_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_state_alliance"("target_alliance_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_state_alliance"("target_alliance_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_state_alliance"("target_alliance_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_state_announcement"("target_announcement_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_state_announcement"("target_announcement_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_state_announcement"("target_announcement_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_state_poll"("target_poll_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_state_poll"("target_poll_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_state_poll"("target_poll_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_state_tag"("target_tag_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_state_tag"("target_tag_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_state_tag"("target_tag_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."end_state_battle"("target_battle_id" "uuid", "selected_battle_type" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."end_state_battle"("target_battle_id" "uuid", "selected_battle_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."end_state_battle"("target_battle_id" "uuid", "selected_battle_type" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_battle_plan_comments"("target_state_id" "uuid", "viewer_wos_account_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_battle_plan_comments"("target_state_id" "uuid", "viewer_wos_account_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_battle_plan_comments"("target_state_id" "uuid", "viewer_wos_account_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_state_battle_history"("target_state_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_state_battle_history"("target_state_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_state_battle_history"("target_state_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_state_battle_history_v2"("target_state_id" "uuid", "viewer_wos_account_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_state_battle_history_v2"("target_state_id" "uuid", "viewer_wos_account_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_state_battle_history_v2"("target_state_id" "uuid", "viewer_wos_account_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_state_overview"("target_state_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_state_overview"("target_state_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_state_overview"("target_state_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_state_poll_admin_responses"("target_state_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_state_poll_admin_responses"("target_state_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_state_poll_admin_responses"("target_state_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_state_poll_counts"("target_state_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_state_poll_counts"("target_state_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_state_poll_counts"("target_state_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_state_admin"("check_state_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_state_admin"("check_state_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_state_admin"("check_state_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_state_admin_account"("target_state_id" "uuid", "target_wos_account_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_state_admin_account"("target_state_id" "uuid", "target_wos_account_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_state_admin_account"("target_state_id" "uuid", "target_wos_account_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_state_member"("check_state_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_state_member"("check_state_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_state_member"("check_state_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_state_member_account"("target_state_id" "uuid", "target_wos_account_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_state_member_account"("target_state_id" "uuid", "target_wos_account_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_state_member_account"("target_state_id" "uuid", "target_wos_account_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_state_owner"("check_state_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_state_owner"("check_state_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_state_owner"("check_state_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_battle_status_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_battle_status_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_battle_status_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_state_alliance_assignment"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_state_alliance_assignment"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_state_alliance_assignment"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."notify_state_poll_creator"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."notify_state_poll_creator"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_state_tag_awarded"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_state_tag_awarded"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_state_tag_awarded"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."owns_wos_account"("check_wos_account_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."owns_wos_account"("check_wos_account_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."owns_wos_account"("check_wos_account_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."protect_state_system_tag"() TO "anon";
GRANT ALL ON FUNCTION "public"."protect_state_system_tag"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."protect_state_system_tag"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."publish_battle_plan"("target_plan_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."publish_battle_plan"("target_plan_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."publish_battle_plan"("target_plan_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."publish_battle_plan_with_notifications"("target_plan_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."publish_battle_plan_with_notifications"("target_plan_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."publish_battle_plan_with_notifications"("target_plan_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."publish_battle_plan_with_notifications"("target_plan_id" "uuid", "actor_wos_account_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."publish_battle_plan_with_notifications"("target_plan_id" "uuid", "actor_wos_account_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."publish_battle_plan_with_notifications"("target_plan_id" "uuid", "actor_wos_account_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."queue_account_notification"("target_wos_account_id" "uuid", "notification_type" "text", "notification_title" "text", "notification_body" "text", "notification_data" "jsonb", "notification_category" "text", "target_state_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."queue_account_notification"("target_wos_account_id" "uuid", "notification_type" "text", "notification_title" "text", "notification_body" "text", "notification_data" "jsonb", "notification_category" "text", "target_state_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."redeem_state_creation_invite"("invite_token" "uuid", "new_state_name" "text", "owner_wos_account_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."redeem_state_creation_invite"("invite_token" "uuid", "new_state_name" "text", "owner_wos_account_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."redeem_state_creation_invite"("invite_token" "uuid", "new_state_name" "text", "owner_wos_account_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."refresh_vote_generated_tags"("target_state_id" "uuid", "target_wos_account_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."refresh_vote_generated_tags"("target_state_id" "uuid", "target_wos_account_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."refresh_vote_generated_tags"("target_state_id" "uuid", "target_wos_account_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."remove_state_member"("target_state_id" "uuid", "target_wos_account_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."remove_state_member"("target_state_id" "uuid", "target_wos_account_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."remove_state_member"("target_state_id" "uuid", "target_wos_account_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."respond_to_state_invite"("target_invite_id" "uuid", "accept_invite" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."respond_to_state_invite"("target_invite_id" "uuid", "accept_invite" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."respond_to_state_invite"("target_invite_id" "uuid", "accept_invite" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."review_state_invite"("target_invite_id" "uuid", "approve_invite" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."review_state_invite"("target_invite_id" "uuid", "approve_invite" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."review_state_invite"("target_invite_id" "uuid", "approve_invite" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_battle_plan_assignment"("target_plan_id" "uuid", "target_wos_account_id" "uuid", "target_group_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_battle_plan_assignment"("target_plan_id" "uuid", "target_wos_account_id" "uuid", "target_group_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_battle_plan_assignment"("target_plan_id" "uuid", "target_wos_account_id" "uuid", "target_group_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_state_alliance_member"("target_state_id" "uuid", "target_wos_account_id" "uuid", "target_alliance_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_state_alliance_member"("target_state_id" "uuid", "target_wos_account_id" "uuid", "target_alliance_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_state_alliance_member"("target_state_id" "uuid", "target_wos_account_id" "uuid", "target_alliance_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_state_member_capability"("target_state_id" "uuid", "target_wos_account_id" "uuid", "target_capability" "text", "capability_enabled" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_state_member_capability"("target_state_id" "uuid", "target_wos_account_id" "uuid", "target_capability" "text", "capability_enabled" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_state_member_capability"("target_state_id" "uuid", "target_wos_account_id" "uuid", "target_capability" "text", "capability_enabled" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_state_member_role"("target_state_id" "uuid", "target_wos_account_id" "uuid", "new_role" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_state_member_role"("target_state_id" "uuid", "target_wos_account_id" "uuid", "new_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_state_member_role"("target_state_id" "uuid", "target_wos_account_id" "uuid", "new_role" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_state_rally_lead"("target_state_id" "uuid", "target_wos_account_id" "uuid", "enabled" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_state_rally_lead"("target_state_id" "uuid", "target_wos_account_id" "uuid", "enabled" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_state_rally_lead"("target_state_id" "uuid", "target_wos_account_id" "uuid", "enabled" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."shares_state_with"("check_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."shares_state_with"("check_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."shares_state_with"("check_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."start_state_battle"("target_state_id" "uuid", "battle_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."start_state_battle"("target_state_id" "uuid", "battle_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."start_state_battle"("target_state_id" "uuid", "battle_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."submit_state_poll_vote"("target_poll_id" "uuid", "target_option_id" "uuid", "voter_wos_account_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_state_poll_vote"("target_poll_id" "uuid", "target_option_id" "uuid", "voter_wos_account_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_state_poll_vote"("target_poll_id" "uuid", "target_option_id" "uuid", "voter_wos_account_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_battle_plan"("target_plan_id" "uuid", "plan_name" "text", "selected_battle_type" "text", "plan_scheduled_at" timestamp with time zone, "plan_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_battle_plan"("target_plan_id" "uuid", "plan_name" "text", "selected_battle_type" "text", "plan_scheduled_at" timestamp with time zone, "plan_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_battle_plan"("target_plan_id" "uuid", "plan_name" "text", "selected_battle_type" "text", "plan_scheduled_at" timestamp with time zone, "plan_notes" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_battle_plan_group"("target_group_id" "uuid", "group_name" "text", "leader_account_id" "uuid", "destination_alliance_id" "uuid", "publish_tag_id" "uuid", "group_max_members" integer, "group_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_battle_plan_group"("target_group_id" "uuid", "group_name" "text", "leader_account_id" "uuid", "destination_alliance_id" "uuid", "publish_tag_id" "uuid", "group_max_members" integer, "group_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_battle_plan_group"("target_group_id" "uuid", "group_name" "text", "leader_account_id" "uuid", "destination_alliance_id" "uuid", "publish_tag_id" "uuid", "group_max_members" integer, "group_notes" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_state_alliance"("target_alliance_id" "uuid", "alliance_name" "text", "alliance_color" "text", "alliance_max_members" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_state_alliance"("target_alliance_id" "uuid", "alliance_name" "text", "alliance_color" "text", "alliance_max_members" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_state_alliance"("target_alliance_id" "uuid", "alliance_name" "text", "alliance_color" "text", "alliance_max_members" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_state_tag"("target_tag_id" "uuid", "tag_name" "text", "tag_color" "text", "tag_bulk_move_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_state_tag"("target_tag_id" "uuid", "tag_name" "text", "tag_color" "text", "tag_bulk_move_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_state_tag"("target_tag_id" "uuid", "tag_name" "text", "tag_color" "text", "tag_bulk_move_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_enemy_leader_battle"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_enemy_leader_battle"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_enemy_leader_battle"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_enemy_leader_delete"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_enemy_leader_delete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_enemy_leader_delete"() TO "service_role";
























GRANT ALL ON TABLE "public"."battle_plan_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."battle_plan_assignments" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."battle_plan_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."battle_plan_comments" TO "service_role";



GRANT ALL ON TABLE "public"."battle_plan_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."battle_plan_groups" TO "service_role";



GRANT ALL ON TABLE "public"."battle_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."battle_plans" TO "service_role";



GRANT ALL ON TABLE "public"."battles" TO "authenticated";
GRANT ALL ON TABLE "public"."battles" TO "service_role";



GRANT ALL ON TABLE "public"."enemy_leaders" TO "authenticated";
GRANT ALL ON TABLE "public"."enemy_leaders" TO "service_role";



GRANT ALL ON SEQUENCE "public"."enemy_leaders_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."enemy_leaders_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."enemy_leaders_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON SEQUENCE "public"."notifications_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."notifications_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."notifications_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."rallies" TO "authenticated";
GRANT ALL ON TABLE "public"."rallies" TO "service_role";



GRANT ALL ON SEQUENCE "public"."rallies_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."rallies_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."rallies_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."state_alliance_members" TO "authenticated";
GRANT ALL ON TABLE "public"."state_alliance_members" TO "service_role";



GRANT ALL ON TABLE "public"."state_alliances" TO "authenticated";
GRANT ALL ON TABLE "public"."state_alliances" TO "service_role";



GRANT ALL ON TABLE "public"."state_announcement_recipients" TO "authenticated";
GRANT ALL ON TABLE "public"."state_announcement_recipients" TO "service_role";



GRANT ALL ON TABLE "public"."state_announcements" TO "authenticated";
GRANT ALL ON TABLE "public"."state_announcements" TO "service_role";



GRANT ALL ON TABLE "public"."state_creation_invites" TO "authenticated";
GRANT ALL ON TABLE "public"."state_creation_invites" TO "service_role";



GRANT ALL ON TABLE "public"."state_invites" TO "authenticated";
GRANT ALL ON TABLE "public"."state_invites" TO "service_role";



GRANT ALL ON TABLE "public"."state_member_capabilities" TO "authenticated";
GRANT ALL ON TABLE "public"."state_member_capabilities" TO "service_role";



GRANT ALL ON TABLE "public"."state_member_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."state_member_tags" TO "service_role";



GRANT ALL ON TABLE "public"."state_members" TO "authenticated";
GRANT ALL ON TABLE "public"."state_members" TO "service_role";



GRANT ALL ON TABLE "public"."state_poll_options" TO "authenticated";
GRANT ALL ON TABLE "public"."state_poll_options" TO "service_role";



GRANT ALL ON TABLE "public"."state_poll_votes" TO "authenticated";
GRANT ALL ON TABLE "public"."state_poll_votes" TO "service_role";



GRANT ALL ON TABLE "public"."state_polls" TO "authenticated";
GRANT ALL ON TABLE "public"."state_polls" TO "service_role";



GRANT ALL ON TABLE "public"."state_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."state_tags" TO "service_role";



GRANT ALL ON TABLE "public"."states" TO "authenticated";
GRANT ALL ON TABLE "public"."states" TO "service_role";



GRANT ALL ON TABLE "public"."wos_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."wos_accounts" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



































