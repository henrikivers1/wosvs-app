# WOSOverwatch: how it works

A map of every part of the app: what it does, what calls it, and what still
needs a person. Keep it current when you add or remove a page, route or
database function.

## 1. The SvS pipeline

Battles always run **12:00–17:00 UTC** on battle day (`src/lib/svsTime.ts`;
the SQL uses the same values). The castle is at 599,599.

| When | What happens | Who does it |
|---|---|---|
| Every hour (6 h before the draw window) | Look up the SvS draw on WOSOracle. Before the draw, store the expected draw time for the countdown | `runAutomation` → `refreshDraw` |
| Draw published | Create the SvS plan and battle row, tell every member ("SvS opponent drawn") | `automation_ensure_svs_plan` |
| Daily until the battle | Opponent intel: summary, SvS record, 20 strongest players, our own summary | `refreshIntel` |
| Any time | Members vote attendance (Whole / First half / Second half / Can't) and voice call | Members, `set_battle_attendance` |
| T−30 h | Remind members who have not voted | `runAutoPlan` → `remindVoters` |
| T−24 h | **Generate rallies:** Rally Lead tag holders who can play, topped up with the best Labyrinth players who voted (they get the Rally Lead tag). Each rally goes into the leader's own in-game alliance (created in the app if missing), takes its half from the leader's vote, and gets the state's default formation and joiner heroes. Then rallies are **filled** by the state's auto-fill priorities. Admins get "Rallies are ready for review" | `runAutoPlan` → `createRallies`, `fillRallies` |
| Every hour after that | Late voters are added to open slots, never moving anyone; after publishing they get their assignment message at once | `fillRallies` |
| T−6 h | **Publish:** alliances and plan tags applied, every member gets "Hi X, you've been assigned to Y in Z…", leaders get "you're leading Y" | `publish_battle_plan_with_notifications` |
| 11:00 UTC | Live Battle opens an hour before the start, to the minute (pg_cron), so garrison and coordinators can enter coordinates. It appears without a reload. Enemy leaders seen in earlier battles are pre-added with their coordinates. The battle itself still runs 12:00–17:00 | `automation_advance_battles`, `seed_enemy_leaders_on_start`, StateProvider realtime |
| 12:00–17:00 | Coordinators call enemy rallies; garrison players get their send countdown between rallies (or right after the last one) | Live Battle pages |
| 17:00 UTC | Battle ends; members get "Battle over" | `automation_advance_battles` |
| Every 6 h for 7 days | Win/Loss read from WOSOracle; "Battle over" becomes **Victory!/Defeat** for every member | `saveResults` → `automation_set_battle_result` |
| Mondays | Weekly player refresh from WOSOracle (power, FC, Labyrinth, alliance, state) in budget-limited batches; accounts that fail wait a day | `weeklyPlayerSync` |

Every automatic step can be run early from the **Next SvS** checklist on
Planning ("Generate now", "Publish now", and "Fill open seats" under Needs attention). Generating
and publishing can be switched off per state, and the rally count, rally
size, default formation and joiner heroes can be changed, in **State
management → SvS automation**. Nothing the automation does overwrites manual
changes.

### Joining a state

1. Sign up with email, username and WOS ID (`handle_new_user` stores the
   account; an already-claimed WOS ID no longer breaks signup).
2. New players land on Account, which syncs the WOS ID from WOSOracle.
3. If an app state has that in-game state number, a **join request** is
   created (`request_state_join_for_account`) and owners/admins are notified.
   The same happens when an account transfers to another state.
4. An owner/admin approves it in State management (`review_state_invite`).
   Admins can also invite a WOS ID directly; the player accepts in the inbox.
5. A state's in-game number fills itself in from the owner's synced account
   (`fill_state_number_from_owner`).

## 2. Scheduled jobs

| Job | Schedule | Where |
|---|---|---|
| `wos-automation` → `POST /api/automation/run` | hourly at :07 | `supabase/automation-cron.example.sql` (pg_cron + pg_net, secret in Vault) |
| `wos-advance-battles` → `automation_advance_battles()` | every minute | created by migration `20261005120000` when pg_cron is enabled |

## 3. WOSOracle usage

All requests go through `oracleRequest` (`src/lib/wosOracle.ts`):

- Responses are cached in `oracle_cache`, which every server instance
  shares. Only real upstream requests count.
- A 402 (Premium endpoint) answer is remembered for a day, and a 404 for an
  hour.
- The budget is checked through `reserve_oracle_request`, in this order:
  per minute (45), per person (40 an hour, for requests a person's action
  caused) and per day (`WOS_ORACLE_DAILY_BUDGET`, default 950). People share
  at most 60% of the day, so the automation always has the rest. A refused
  request does not count against the day.
- When the minute budget is used up, background jobs wait for the next
  minute; people get "try again in a minute".
- A failed player sync is not retried for 10 minutes, and "Check now" runs
  at most once every 5 minutes per state (claimed in one statement).
- `npm run oracle:check -- --state <n> --player <WOS ID>` runs these fetchers
  against the live API and saves the raw answers.

| Endpoint | Fetcher (`wosOracleState.ts`) | Cache | Used by |
|---|---|---|---|
| `/svs/matchups?sid=` | `fetchSvsMatchup` | none (must see a new draw at once) | draw check |
| `/states/{n}/svs/forecast` | `fetchSvsForecast` | 10 min | draw countdown |
| `/states/{n}` | `fetchStateSummary` | 10 min | intel, alliance import, opponent fallback |
| `/states/{n}/svs` | `fetchSvsRecord` | 10 min (fresh for results) | intel, Win/Loss |
| `/alliances/{id}?kid=` | `fetchAlliance` (profile + members) | 10 min | roster picker, add alliance by ID, top players on the base plan |
| `/states/{n}/leaderboards/3` (Premium) | `fetchTopPlayers` | 10 min / 402 for a day | 20 strongest players |
| `/players/{id}` | `fetchOraclePlayer` | none | player sync |

Typical cost per state:

- **Before the draw:** 2 requests per check (8/day; hourly on draw day).
- **After the draw:** 4/day.
- **Intel:** 4 requests with Premium, 9 on the base plan, once a day.
- **Results:** 1 per 6 h.
- **Player sync:** 1 per account per week.
- **Enemy-leader opponent list:** free, because it reads the stored intel.

## 4. Pages

| Route | For | What it does |
|---|---|---|
| `/` | everyone | Landing page when signed out; members are sent to Overwatch and players without a state to Account |
| `/login`, `/auth/confirm`, `/account/setup` | everyone | Sign in / sign up, email confirmation, username fallback for old accounts |
| `/account` | everyone | WOS accounts (add, sync, remove), join request status, 4★ joiner heroes, manual troop/FC fields |
| `/notifications` | everyone | Inbox, colour per action, filters, invitation accept/decline |
| `/state/overwatch` | members | Next SvS, attendance vote, own rally/hero/formation, notices, plan comments |
| `/state/intel` | members | Opponent and own state from the stored intel |
| `/state/planning` | admins | Next SvS checklist (one gold button per step), Needs attention (`planIssues.ts`: each problem with a one-tap fix), waiting list beside compact rally columns (drag, player sheet, rally ⋯ menu for setup/heroes/edit/delete), plan ⋯ menu (add rally, rebuild all, edit, delete), Rally Leads panel, folded comments, plan history. Auto-fill priorities live in State management → SvS automation |
| `/state/manage` | admins | Alliances, invitations and approvals, in-game number and hero generation, SvS automation settings, release a claimed WOS ID, members (role, Coordinator/Garrison, remove) |
| `/state/alliances` | members | Published alliance rosters and alliance notices |
| `/state/announcements` | admins | Send and remove notices |
| `/state/tags` | admins | Custom tags and their players (rally/hero tags are automatic) |
| `/state/stats` | members | Battle history with results |
| `/battle` | battle roles | Opens Call rally (Coordinator) or Garrison |
| `/admin/leaders` | Coordinator | Enemy rally leaders; opponent's top players listed automatically, coordinates remembered |
| `/admin/call-rally` | Coordinator | Call an enemy rally (timer → impact time on the synced clock) |
| `/garrison` | Garrison | Personal send countdown, alerts, incoming schedule |

The live battle pages share `src/app/(live)/layout.tsx`, which is the only
place `BattleProvider` runs. It provides enemy leaders and rallies over
realtime, plus the synced server clock.

## 5. API routes

| Route | Caller | Purpose |
|---|---|---|
| `POST /api/automation/run` | pg_cron (secret), admins (SvS status "Check now") | The hourly job (section 1) |
| `POST /api/automation/plan` | Planning checklist | Generate/fill or publish one plan now (`runAutoPlan`) |
| `POST /api/oracle/player-sync` | Account page | Sync one WOS account (once a day by hand) and send the join request |
| `GET /api/oracle/opponent` | Enemy leaders | Opponent alliances and top players, from stored intel first |
| `GET /api/oracle/roster` | Enemy leaders | One opponent alliance's members |
| `GET /api/oracle/state-alliances`, `/alliance` | State management (admins) | Import alliances, add one by ID |
| `POST /api/accounts/release-claim` | State management (admins) | Free a WOS ID claimed by the wrong user |
| `GET /api/time` | Live battle | Server time for the clock sync |

Every state route checks membership with `requireStateMember`
(`src/lib/stateAccess.ts`), which runs one membership query and one state
query in parallel.

## 6. Library modules (`src/lib`)

| Module | Role |
|---|---|
| `automation.ts` | The hourly job: draw, intel, results, battle status fallback, planning, Monday sync |
| `autoPlan.ts` | Reminders, rally generation, filling and publishing for one plan |
| `autofill.ts` | Pure ranking/assignment logic, shared by the server and the Planning page |
| `wosOracle.ts`, `wosOracleState.ts` | WOSOracle client, cache, budget, one fetcher per endpoint |
| `playerSync.ts` | Player data from WOSOracle into `wos_accounts`, join request on new/transferred accounts |
| `stateAccess.ts`, `battleAccess.ts` | Who may use a state route or live battle tool |
| `svsTime.ts`, `attendance.ts` | Battle time and attendance options |
| `reinforcementWindows.ts`, `rallyTime.ts`, `serverClock.ts`, `battleDisplay.ts` | Live battle timing |
| `heroes.ts`, `furnace.ts` | Hero catalogue (Gen 1–17), FC levels (5 steps per FC) |
| `notificationKinds.ts` | Notification categories, colours, filters and localized text |
| `demo/*` | The private demo (section 8) |

## 7. Database

### Called by the app (signed-in users; each checks permissions itself)

| Area | Functions |
|---|---|
| Accounts | `complete_account_setup`, `set_player_heroes` |
| Membership | `create_state_join_invite`, `respond_to_state_invite`, `review_state_invite`, `set_state_member_role`, `set_state_member_capability`, `remove_state_member`, `set_state_rally_lead` |
| State settings | `set_state_hero_generation`, `set_state_automation`, `create/update/delete_state_alliance`, `create/update/delete_state_tag` |
| SvS plan | `create_svs_plan`, `update_battle_plan`, `set_battle_plan_opponent`, `delete_battle_plan`, `get_upcoming_svs`, `set_battle_attendance` |
| Rallies | `create/update/delete_battle_plan_group`, `set_battle_plan_group_setup`, `set_battle_plan_assignment`, `set_assignment_details`, `apply_battle_plan_autofill`, `publish_battle_plan_with_notifications` |
| Comments and notices | `create_battle_plan_comment`, `delete_battle_plan_comment`, `get_battle_plan_comments`, `create_state_announcement`, `delete_state_announcement`, `cleanup_expired_state_announcements` |
| History | `get_state_battle_history_v2`, `get_state_overview` |
| Permission checks used by RLS | `is_state_member/admin/owner`, `is_state_member_account`, `is_state_admin_account`, `owns_wos_account`, `can_read_wos_account`, `shares_state_with`, `can_view_*`, `can_manage_battle`, `can_call_state_rallies` |

### Server only (service role)

- **Automation:** `automation_ensure_svs_plan`, `automation_advance_battles`, `automation_set_battle_result`, `publish_battle_plan`, `request_state_join_for_account`, `release_wos_account_claim`.
- **WOSOracle budget:** `reserve_oracle_request`. `count_oracle_request` is the older counter, kept as a fallback until the new migration has run.
- **Notifications:** `queue_account_notification`, `notify_member_action`, `account_display_name`.

### Triggers

| Table | Trigger → effect |
|---|---|
| `battles` | `battle_status_notification` → Battle over / cancelled / Victory / Defeat for every member; `battle_seed_enemy_leaders` → known enemy leaders at battle start |
| `state_members` | role change or removal → member notification |
| `state_member_capabilities` | Coordinator/Garrison granted or removed → notification |
| `state_member_tags` | tag added/removed (not plan tags) → notification |
| `state_alliance_members` | alliance move → notification (muted while publishing) |
| `battle_plan_assignments` | changes on a published plan → "Your rally assignment changed" / "Removed from …" |
| `battle_plan_groups` | `assign_group_rally_tag` → "<leader> rally" tag |
| `notifications` | `notifications_categorize` → category (colour) from the type |
| `wos_accounts` | `fill_state_number_from_owner` |
| `states` | system tags (Rally Lead) on create |
| `battle_plans`, `battle_plan_comments` | clean up related notifications on delete |
| `enemy_leaders` | only for an active battle of the same state |

### Notification categories (inbox colours)

| Category | Colour | Types |
|---|---|---|
| victory / defeat | green / red | `battle_result` |
| battle | orange | `svs_drawn`, `attendance_reminder`, `rallies_generated`, `battle_started`, `battle_completed`, `battle_cancelled` |
| assignment | blue | `battle_plan_assignment`, `battle_plan_published`, `battle_plan_assignment_changed` |
| role | purple | `member_role_changed`, `capability_granted` |
| tag | the tag's colour | `state_tag_awarded` |
| alliance | gold | `state_alliance_assigned` |
| membership | cyan | `state_invite`, `state_invite_accepted`, `state_invite_approved`, `state_join_request`, `state_join_requested` |
| removal | dark rose | `member_removed`, `capability_revoked`, `state_tag_removed`, `state_alliance_removed`, `battle_plan_assignment_removed`, `wos_account_released`, `state_invite_rejected` |
| comment / notice | grey / sand | plan comments and mentions, `state_announcement` |

## 8. Demo

"Try the private demo" swaps the Supabase client for an in-browser fake
(`src/lib/demo`) backed by localStorage. Nothing reaches Supabase or
WOSOracle:

- `/api/*` calls are answered locally.
- "Generate now" / "Publish now" run the real `runAutoPlan` against the demo
  data.
- Notifications are produced by diffing the demo data before and after each
  action, mirroring the database triggers.
- The banner can start the battle and end it as a win or a loss.

## 9. Removed in the pipeline overhaul

- **Dead database objects:**
  - The manual battle-period flow (`start/end_state_battle`, `activate_scheduled_battle`, `complete_active_battle`).
  - Polls and votes (four functions, three tables, the trigger) and state-creation invites.
  - The token invite link (`accept_state_invite`, `/invite/[token]`).
  - Bulk moves (`assign_tagged_members_to_alliance`, `bulk_assign_battle_plan_members`, `state_tags.bulk_move_limit`), `set_state_alliance_member`, `create_battle_plan`.
  - Superseded overloads.
- **Duplicate notifications** on publish, member removal and permission switches.
- **The Profile page** (merged into Account), the manual hero-tag catalogue, the Rally Lead toggles in State management (Rally Leads are managed in Planning and by the automation), and four header-only languages.
- **Polling and unfiltered realtime:** the 15 s header poll, and unfiltered subscriptions that reloaded whole pages for other states' changes.
- **About 950 unused translation entries.**

## 10. Still manual (and why)

- **Enemy leader coordinates the first time a player is seen.** WOSOracle's map
  needs a higher plan; after that they are remembered.
- **Calling an enemy rally** (the in-game timer is only visible in the game).
- **Approving join requests:** anyone can type any WOS ID, and WOSOracle
  cannot prove who owns one. Limits: 10 WOS accounts per login, admins
  release a wrong claim, and a state's in-game number must match its owner's
  synced account and is unique across Overwatch.
- **Owners creating a state:** there is no "create state" flow in the app yet.

