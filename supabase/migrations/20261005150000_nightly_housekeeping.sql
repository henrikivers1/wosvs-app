-- Nightly housekeeping (03:17 UTC), so nothing depends on someone opening a
-- page and tables do not grow forever:
--   * expired announcements are removed (no longer done on page loads);
--   * read notifications older than 30 days, and any older than 90 days;
--   * invitations and join requests past their expiry are marked revoked;
--   * WOSOracle cache entries older than 7 days and per-minute counters
--     older than a day;
--   * automatic rally tags that no rally group or player uses any more.
-- Needs pg_cron (Database > Extensions).

create or replace function public.automation_housekeeping()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  removed_notifications integer;
  revoked_invites integer;
  removed_tags integer;
begin
  perform public.cleanup_expired_state_announcements();

  delete from public.notifications
  where (read_at is not null and created_at < now() - interval '30 days')
     or created_at < now() - interval '90 days';
  get diagnostics removed_notifications = row_count;

  update public.state_invites
  set status = 'revoked'
  where status in ('pending_recipient', 'pending_owner')
    and expires_at <= now();
  get diagnostics revoked_invites = row_count;

  delete from public.oracle_cache where fetched_at < now() - interval '7 days';
  delete from public.oracle_usage_minute where minute < now() - interval '1 day';

  delete from public.state_tags tag
  where tag.kind = 'rally'
    and tag.system_key is null
    and not exists (
      select 1 from public.battle_plan_groups plan_group
      where plan_group.assignment_tag_id = tag.id
    )
    and not exists (
      select 1 from public.state_member_tags member_tag
      where member_tag.tag_id = tag.id
    );
  get diagnostics removed_tags = row_count;

  return jsonb_build_object(
    'notifications_removed', removed_notifications,
    'invites_revoked', revoked_invites,
    'rally_tags_removed', removed_tags
  );
end;
$$;

alter function public.automation_housekeeping() owner to postgres;
revoke all on function public.automation_housekeeping() from public, anon, authenticated;
grant execute on function public.automation_housekeeping() to service_role;

-- The job runs it, so pages no longer need to.
revoke execute on function public.cleanup_expired_state_announcements() from authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'wos-housekeeping';
    perform cron.schedule('wos-housekeeping', '17 3 * * *',
      'select public.automation_housekeeping()');
  else
    raise notice 'pg_cron is not enabled: enable it and re-run this block for nightly housekeeping.';
  end if;
end;
$$;
