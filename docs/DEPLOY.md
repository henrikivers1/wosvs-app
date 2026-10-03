# Deploying Overwatch

The app runs on **Vercel**, the database and sign-in on **Supabase**, and it
lives at **wosoverwatch.com**. Do the steps in order; each one says how to
check it worked.

## What you need

| Service | Plan | Cost |
|---|---|---|
| Domain `wosoverwatch.com` | Cloudflare Registrar or Vercel Domains | about $10–15 a year |
| Vercel | Hobby (free, non-commercial) | $0 |
| Supabase | Free to test, **Pro** before members rely on it (no pausing, daily backups) | $0, then $25/month |
| Resend (sign-up emails) | Free | $0 |
| WOSOracle | Premium | your plan |

## 1. Check WOSOracle with your Premium key

Before anything else, confirm the app understands WOSOracle's real answers.
On your computer, in the project folder:

1. Create `.env.local` with one line: `WOS_ORACLE_API_KEY=<your key>`.
   This file is never committed.
2. Run:

   ```
   npm install
   npm run oracle:check -- --state <your state number> --player <your WOS ID>
   ```

3. It prints ✓, ! (warning) or ✗ per endpoint and saves the raw answers to
   `oracle-check-output.json`. Send that file (it holds only game data, no
   key) and the printed summary for review. Fix anything marked ✗ before
   going on.

## 2. Buy the domain

Buy `wosoverwatch.com`. If you buy it outside Vercel, you'll point it at
Vercel in step 4.

## 3. Supabase

1. **Back up first** if the project already has data: Database → Backups
   (Pro), or `supabase db dump`.
2. **Extensions** (Database → Extensions): enable **pg_cron** and **pg_net**.
3. **Database:** in the SQL Editor run, in filename order, every file in
   `supabase/migrations/` that has not been run on this project yet. A brand
   new project runs `supabase/schema.sql` first.
   - The last one is `20261006090000_security_hardening.sql`.
   - Check: `select jobname, schedule from cron.job;` lists
     `wos-advance-battles` and `wos-housekeeping`. If not, pg_cron was off:
     enable it and run `20261005120000_…` and `20261005150000_…` again.
4. **Sign-in URLs** (Authentication → URL Configuration):
   - Site URL: `https://wosoverwatch.com`
   - Redirect URLs: `https://wosoverwatch.com/**`
5. **Email** (Authentication → SMTP): Supabase's own email only reaches
   your Supabase team and about 2 messages an hour, so sign-ups fail without
   this.
   1. Create a Resend account and add the domain `wosoverwatch.com`.
   2. Add the DNS records Resend shows at your domain registrar.
   3. In Supabase, enable custom SMTP with Resend's host, port, username
      and API key; sender `no-reply@wosoverwatch.com`, name `Overwatch`.
6. **Keys** (Project Settings → API): note the project URL, the publishable
   key and the secret (service role) key for step 4.

## 4. Vercel

1. Merge the working branch into `main` (Vercel publishes `main`).
2. Vercel → Add New → Project → import `henrikivers1/wosvs-app`.
3. Environment Variables (Production):

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | publishable key |
   | `SUPABASE_SERVICE_ROLE_KEY` | secret key (never share it) |
   | `WOS_ORACLE_API_KEY` | your WOSOracle key |
   | `CRON_SECRET` | a long random text you make up, e.g. from `openssl rand -hex 32` |
   | `WOS_ORACLE_DAILY_BUDGET` | optional: your plan's daily request limit minus a margin (default 950) |

4. Deploy. Then Settings → Domains → add `wosoverwatch.com` and
   `www.wosoverwatch.com` (redirect www to the bare domain), and set the DNS
   records Vercel shows.
5. Check: `https://wosoverwatch.com` shows the landing page, and the free
   demo opens.

## 5. The hourly automation

In the Supabase SQL Editor, open `supabase/automation-cron.example.sql`,
replace `REPLACE_WITH_CRON_SECRET` with the same `CRON_SECRET`, and run it.

Check after the next hour (:07):

```sql
select status, return_message, start_time
from cron.job_run_details order by start_time desc limit 5;
```

## 6. Your state

There is no "create state" button yet, so the first state is made here.

1. Sign up on wosoverwatch.com with your WOS ID, confirm the email, and wait
   until Account shows your in-game name (the sync worked).
2. In the SQL Editor, with your WOS ID:

   ```sql
   with owner_account as (
     select id, state_number from public.wos_accounts where wos_id = '<your WOS ID>'
   ), new_state as (
     insert into public.states (name, game_state_number)
     select 'State ' || state_number, state_number from owner_account
     returning id
   )
   insert into public.state_members (state_id, wos_account_id, role)
   select new_state.id, owner_account.id, 'owner' from new_state, owner_account;
   ```

3. Reload Overwatch. Under State management, set the hero generation, load
   your alliances and give out roles. Members who add a WOS ID from your
   state now send you join requests automatically.

## 7. First SvS: a rehearsal

For the first SvS, turn **automatic publishing off** (State management → SvS
automation) so you review the plan before members see it. Watch the Next SvS
checklist in Planning: draw, reminder, rallies, publish, battle, result.
Report anything that does not happen when the checklist says it will.

## After launch

- Logs: Vercel → Project → Logs (look for `[automation]` and `[wosOracle]`).
- WOSOracle usage today: `select * from oracle_usage order by day desc limit 3;`
- Privacy requests go to `privacy@wosoverwatch.com`: set up forwarding to
  your own inbox (Cloudflare Email Routing is free).
