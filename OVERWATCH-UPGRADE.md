# WOSOverwatch architecture upgrade

## Apply the database migration

1. Open the Supabase SQL Editor for the project.
2. Paste and run `wosoverwatch-overwatch-architecture.sql` once.
3. Confirm that the editor reports success before deploying the app update.

The migration is intended to run after the existing planning, tags, alliances,
votes, announcements, and notification migrations.

## What changes

- Permissions and operational notifications target the selected WOS account.
- Published plans create linked scheduled battle periods.
- Admins start the live battle from Planning and end it from State management.
- Completed battles retain their plan link and Win/Loss result.
- Empty battle periods are removed when ended; published plans remain.
- Members receive their plan, alliance, tags, notices, and public comments in
  Overwatch.
- Admin-only plan comments are returned only to the selected Owner/Admin WOS
  account.
- Announcements automatically expire Sunday at 23:59:59 UTC.
- Planning tables and inbox delivery use Supabase Realtime when available.

## Verify after deployment

Use two WOS accounts, preferably under different logins, and confirm:

1. Publish a plan and receive a Battle notification on each targeted account.
2. Open Overwatch as a member and verify the assignment, alliance, tags, and
   public comments.
3. Post an admin-only comment and verify that the member account cannot read it.
4. Post a member comment and verify Owner/Admin account notifications.
5. Send an announcement to a tag and verify only tagged accounts receive it.
6. Start the scheduled battle, use Live Battle, then end it with Win or Loss.
7. Confirm the battle and result appear in State Stats & History.

## Local checks

```powershell
npm install
npm run lint
npm run build
```
