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
   - The last one is `20261007090000_wos_id_pin_login.sql`.
   - Check: `select jobname, schedule from cron.job;` lists
     `wos-advance-battles` and `wos-housekeeping`. If not, pg_cron was off:
     enable it and run `20261005120000_…` and `20261005150000_…` again.
4. **Sign-in** (Authentication → Sign In / Providers → Email):
   - Turn **off** "Allow new users to sign up": logins are made only by the
     server, when a player joins with a state's link.
   - Turn **off** "Confirm email". No email is ever sent; logins use
     addresses like `123456789@players.wosoverwatch.com` that nobody reads.
   - Password requirements: leave **no required characters** and leaked
     password protection off (the server makes the passwords, not people).
   - Authentication → Rate Limits: raise **sign-ups and sign-ins** to about
     1000 per 5 minutes. Every sign-in comes from the server's few
     addresses; Overwatch limits wrong PINs itself.
5. **Site URL** (Authentication → URL Configuration): `https://wosoverwatch.com`.
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
   | `AUTH_PIN_PEPPER` | another long random text, e.g. `openssl rand -hex 32`. Never change it: every PIN stops working |
   | `OPERATOR_WOS_IDS` | your WOS ID (comma-separate several): who may open `/operator` |
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

## 6. Your login and the first state

Everyone signs in with their WOS ID and a PIN. You are the first, so make
your own login from your computer:

1. Add to `.env.local` (never committed): `NEXT_PUBLIC_SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY` and `AUTH_PIN_PEPPER`, the same values as in
   Vercel.
2. Run `npm run login:create -- --wos-id <your WOS ID>`. It prints a
   one-time PIN. (Run it again any time you are locked out.)
3. Sign in on wosoverwatch.com with your WOS ID and that PIN, and choose
   your own PIN.
4. Open `wosoverwatch.com/operator`. Under Create a state, enter the
   leader's WOS ID (yours, for your own state). WOSOracle gives the state
   number. A leader who has no login yet gets a one-time PIN: send it to
   them with the WOS ID they sign in with.
5. The leader opens State management, sets the hero generation, loads the
   alliances and presses **Make a join link**. **Copy chat message** gives
   the link and first-time PIN to post in the state and alliance chats.
   Members who open it, enter their WOS ID and the PIN are in right away
   when WOSOracle lists them in that state. A new link stops the old one.

Lost PINs: owners and admins press **Reset PIN** on a member; you can reset
anyone on `/operator`. Logins from before this version (email and password)
also get in this way: give them a one-time PIN.

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
