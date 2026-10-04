-- Adding a WOS account failed with "new row violates row-level security
-- policy for table wos_accounts". The insert itself is allowed, but the app
-- reads the new row back (insert ... returning), and the existing SELECT
-- policy calls can_read_wos_account(id), which queries wos_accounts and
-- cannot see the row that is still being inserted. A policy that checks the
-- row's own user_id works for the returned row.
drop policy if exists "users read own WOS accounts" on public.wos_accounts;
create policy "users read own WOS accounts"
  on public.wos_accounts
  for select
  to authenticated
  using (user_id = auth.uid());
