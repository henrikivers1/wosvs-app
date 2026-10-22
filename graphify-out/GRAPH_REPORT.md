# Graph Report - wosvs-app  (2026-10-22)

## Corpus Check
- 200 files · ~215,508 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: .woff2 2, (none) 1, .ico 1)

## Summary
- 1596 nodes · 3660 edges · 115 communities (71 shown, 44 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 96 edges (avg confidence: 0.86)
- Token cost: 162,795 input · 0 output

## Community Hubs (Navigation)
- WOSOracle Data Integration
- Auth & Admin API Routes
- Package & Build Config
- Cleanup & Pipeline Migration
- Battle Planning Page
- Plan Comments Schema
- Demo Query Engine
- Frostdragon Tyrant UI
- Layout & i18n
- Auto-Plan Generator
- Garrison & Lead Rotation SQL
- Roster Import
- Tour Screen Recorder
- Supabase Client & Overwatch
- Plan Issues & Rally Forms
- Notifications Overhaul SQL
- Autofill & Hero Settings
- Landing & Guides UI
- Plan Board Components
- Demo RPC Layer
- Architecture: Jobs & Live
- Architecture: Oracle Pipeline
- Pet Block Rotation
- Demo Seed & Store
- State Membership Schema
- V1 Fixes Migration
- Security Hardening SQL
- March Timing Planner
- Frostdragon Tyrant SQL
- Live Battle & Tour Narration
- Tour Audio Composer
- State Sections Pages
- Battle Plan Schema
- TypeScript Config
- Join & PIN Pages
- Battle Access Guard
- Notifications Page
- Pet Block Times SQL
- Server Clock & Live Layout
- Tour Animation Scenes
- Account Page
- Rally Setup & Heroes SQL
- Oracle Alliance Picker
- Call Rally & Reinforcement
- Header & Login
- Enemy Leaders Page
- Attendance & Intel
- Battles & Rallies Schema
- Deployment & Env
- Landing Video Pipeline
- Brand Marks & Icons
- Tags Page
- WOS ID PIN Login SQL
- Claude Settings
- Demo Mode Banner
- Architecture: DB & Demo
- Architecture: Auth & Billing
- Announcements Page
- Intel & Attendance SQL
- Operator Console
- Billing & Contact UI
- Reinforcement Alerts
- Demo Notifications
- Roster Import SQL
- Announcements Schema
- Demo Client Shim
- SvS Automation SQL
- Plan Rally Leads SQL
- FDT & Plan Publishing Docs
- State Polls Schema
- Auto-Planning SQL
- States & System Tags
- Rally Tag Assignment SQL
- Enemy Leader Notice SQL
- Reset SvS Plan SQL
- Tour Still Grabber
- Delete Plan SQL
- Unique Enemy Leaders SQL
- Agent Instructions
- Player Claim Lock SQL
- Default Garrison SQL
- Vote Scene & Attendance
- Nightly Housekeeping SQL
- Next.js Bootstrap Notes
- Castle Event Timing
- Oracle Opponent SQL
- Upcoming SvS SQL
- Early Live Battle SQL
- PostCSS Config
- Auth API Routes Doc
- Time API Doc
- Late Attendance Doc
- Battle Result Doc

## God Nodes (most connected - your core abstractions)
1. `useLanguage()` - 114 edges
2. `AppHeader()` - 63 edges
3. `react` - 52 edges
4. `createClient()` - 52 edges
5. `BattlePlanningPage()` - 39 edges
6. `useStates()` - 39 edges
7. `renderPlan()` - 34 edges
8. `next` - 30 edges
9. `DemoQuery` - 30 edges
10. `createAdminClient()` - 27 edges

## Surprising Connections (you probably didn't know these)
- `supabase/migrations and schema.sql` --semantically_similar_to--> `wosoverwatch-overwatch-architecture.sql migration`  [INFERRED] [semantically similar]
  docs/DEPLOY.md → OVERWATCH-UPGRADE.md
- `Scene: vote` --references--> `automation_ensure_svs_plan`  [INFERRED]
  scripts/tour/narration.json → docs/ARCHITECTURE.md
- `Scene: intel` --references--> `refreshIntel`  [INFERRED]
  scripts/tour/narration.json → docs/ARCHITECTURE.md
- `Scene: intel` --references--> `addLabyrinthScores`  [INFERRED]
  scripts/tour/narration.json → docs/ARCHITECTURE.md
- `Scene: vote` --references--> `set_battle_attendance`  [INFERRED]
  scripts/tour/narration.json → docs/ARCHITECTURE.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **SvS automatic plan generation flow (T-24h)** — docs_architecture_runautoplan, docs_architecture_creategarrison, docs_architecture_createrallies, docs_architecture_fillplan, docs_architecture_strengthengarrison, src_lib_autofill, docs_architecture_prevent_lead_as_joiner [EXTRACTED 1.00]
- **WOSOracle request path with cache and budget** — docs_architecture_oraclerequest, docs_architecture_oracle_cache, docs_architecture_reserve_oracle_request, docs_architecture_wosoraclestate_ts, docs_architecture_wosoracle [EXTRACTED 1.00]
- **Landing tour video production pipeline** — scripts_tour_record, scripts_tour_anim, scripts_tour_narrate, scripts_tour_compose, scripts_tour_assemble, scripts_tour_anim_render, scripts_tour_narration_script, scripts_tour_readme_overwatch_tour_mp4 [EXTRACTED 1.00]
- **Overwatch brand mark SVG variants** — public_brand_overwatch_mark_on_dark, public_brand_overwatch_mark_on_light, public_brand_overwatch_mark_mono_white, public_brand_overwatch_mark_small_on_dark, public_favicon [INFERRED 0.95]
- **PWA / platform app icon set** — public_icon_192, public_icon_512, public_icon_maskable_512, public_apple_touch_icon_180 [INFERRED 0.95]

## Communities (115 total, 44 thin omitted)

### Community 0 - "WOSOracle Data Integration"
Cohesion: 0.06
Nodes (77): allianceArgument, LEADERBOARD_TYPES, raw, stateNumber, summary, wosId, GET(), GET() (+69 more)

### Community 1 - "Auth & Admin API Routes"
Cohesion: 0.10
Nodes (59): auth_pin_attempts table, @supabase/supabase-js, admin, flag, pin, configured(), GET(), loadLink() (+51 more)

### Community 2 - "Package & Build Config"
Cohesion: 0.05
Nodes (42): eslintConfig, dependencies, next, react, react-dom, @supabase/ssr, @supabase/supabase-js, @vercel/analytics (+34 more)

### Community 3 - "Cleanup & Pipeline Migration"
Cohesion: 0.07
Nodes (16): battle_plan_assignments_member_idx, battle_plan_groups_leader_idx, enemy_leaders_wos_id_idx, notifications_announcement_id_idx, notifications_battle_id_idx, notifications_comment_id_idx, notifications_plan_id_idx, notifications_user_unread_idx (+8 more)

### Community 4 - "Battle Planning Page"
Cohesion: 0.15
Nodes (34): BattlePlanningPage(), addGarrison(), applyDrafts(), assignGroupHeroes(), beginEditingPlan(), createSvsPlan(), deleteComment(), deletePlan() (+26 more)

### Community 5 - "Plan Comments Schema"
Cohesion: 0.06
Nodes (4): "battle_plan_comment_notification_cleanup", "public"."battle_plan_comments", "public"."can_view_battle_plan_comment"(), "public"."delete_battle_plan_comment"()

### Community 6 - "Demo Query Engine"
Cohesion: 0.10
Nodes (7): compare(), DemoQuery, embeddedTables(), same(), uniqueViolation(), newNumericId(), Row

### Community 7 - "Frostdragon Tyrant UI"
Cohesion: 0.12
Nodes (25): FdtPlanningPage(), createEvent(), deleteEvent(), renderCreateForm(), run(), saveEvent(), fromUtcInputValue(), Member (+17 more)

### Community 8 - "Layout & i18n"
Cohesion: 0.09
Nodes (23): @vercel/analytics, archivo, metadata, plexMono, RootLayout(), viewport, LanguageProvider(), StateProvider() (+15 more)

### Community 9 - "Auto-Plan Generator"
Cohesion: 0.11
Nodes (29): maxDuration, PlanRequest, POST(), AdminClient, allianceFor(), assignLeads(), Assignment, AutoPlanResult (+21 more)

### Community 10 - "Garrison & Lead Rotation SQL"
Cohesion: 0.11
Nodes (12): battle_plan_assignments_no_lead_joiners, battle_plan_groups_default_rotation, battle_plan_groups_one_garrison, public.apply_battle_plan_autofill(), public.assign_group_rally_tag(), public.create_garrison_group(), public.default_lead_rotation(), public.publish_battle_plan() (+4 more)

### Community 11 - "Roster Import"
Cohesion: 0.09
Nodes (17): RFC-4180, ManageStatePage(), createAlliance(), saveAlliance(), validateAlliance(), RosterImportCard(), pick(), heroByName() (+9 more)

### Community 12 - "Tour Screen Recorder"
Cohesion: 0.08
Nodes (21): attendance, between, board, callButton, errors, firstStatus, grid, leader (+13 more)

### Community 13 - "Supabase Client & Overwatch"
Cohesion: 0.10
Nodes (21): StateAlliance, StateMember, AccountLabel, Alliance, Announcement, Assignment, Battle, OverwatchPage() (+13 more)

### Community 14 - "Plan Issues & Rally Forms"
Cohesion: 0.15
Nodes (24): AutomationSettings, RallyEditor, ScheduledBattle, NeedsAttention(), describe(), PlanComment, PlanComments(), findPlanIssues() (+16 more)

### Community 15 - "Notifications Overhaul SQL"
Cohesion: 0.08
Nodes (13): battle_plan_assignment_notification, battle_status_notification, notifications_categorize, public.account_display_name(), public.categorize_notification(), public.notify_battle_status_change(), public.notify_member_action(), public.notify_state_capability_change() (+5 more)

### Community 16 - "Autofill & Hero Settings"
Cohesion: 0.12
Nodes (21): fillRallies, Settings, AutofillPriorityEditor(), FORMATION_PRESETS, RallySetup, AUTOFILL_CRITERIA, AutofillCriterion, AutofillDraft (+13 more)

### Community 17 - "Landing & Guides UI"
Cohesion: 0.14
Nodes (19): GuidesPage(), BATTLE_SECTION_PATHS, FEATURES, QUESTIONS, ROLES, TIMELINE, LandingVideo(), NavIcon() (+11 more)

### Community 18 - "Plan Board Components"
Cohesion: 0.19
Nodes (18): MoreMenu(), PlanLeadsPicker(), PlayerSheet(), average(), defenseLine(), DRAG_TYPE, RallyColumn(), useCompactNumber() (+10 more)

### Community 19 - "Demo RPC Layer"
Cohesion: 0.19
Nodes (22): snapshotDemoMembers(), accountName(), Args, assign(), byId(), fail(), groupLeads(), handlers (+14 more)

### Community 20 - "Architecture: Jobs & Live"
Cohesion: 0.09
Nodes (21): automation_advance_battles, automation_housekeeping, automation_pet_swap_reminders, createGarrison, Live Battle, Pet blocks (12-14, 14-16, 16-17 UTC), Scheduled jobs (pg_cron), seed_enemy_leaders_on_start (+13 more)

### Community 21 - "Architecture: Oracle Pipeline"
Cohesion: 0.13
Nodes (23): addLabyrinthScores, automation_set_battle_result, count_oracle_request (legacy), fetchAlliance, fetchOraclePlayer, fetchStateSummary, fetchSvsForecast, fetchSvsMatchup (+15 more)

### Community 22 - "Pet Block Rotation"
Cohesion: 0.18
Nodes (19): AutomationSettingsCard(), save(), saveFormation(), BlockTimeSelect(), OPTIONS, RotationEditor(), BATTLE_MINUTES, battleClock() (+11 more)

### Community 23 - "Demo Seed & Store"
Cohesion: 0.13
Nodes (17): DemoError, DemoResult, Filter, KEYLESS_TABLES, NOTIFYING_TABLES, NUMERIC_ID_TABLES, RELATIONS, buildDemoSeed() (+9 more)

### Community 24 - "State Membership Schema"
Cohesion: 0.16
Nodes (21): "public"."accept_state_invite"(), "public"."assign_tagged_members_to_alliance"(), "public"."can_call_state_rallies"(), "public"."can_read_wos_account"(), "public"."can_view_state_operations"(), "public"."create_state_alliance"(), "public"."is_state_admin"(), "public"."is_state_admin_account"() (+13 more)

### Community 25 - "V1 Fixes Migration"
Cohesion: 0.10
Nodes (5): battle_attendance_late_change, public.notify_late_attendance_change(), public.notify_member_left_state(), public.seed_enemy_leaders_on_start(), wos_account_left_state

### Community 26 - "Security Hardening SQL"
Cohesion: 0.11
Nodes (7): public.can_view_battle_plan_comment(), public.complete_account_setup(), public.limit_wos_accounts_per_user(), public.oracle_usage_user, states_game_state_number, states_game_state_number_unique, wos_accounts_per_user

### Community 27 - "March Timing Planner"
Cohesion: 0.15
Nodes (18): COUNTDOWN_TICKS_MS, GarrisonTap, ReinforcementTiming, StoredSettings, choices(), COST, DEFAULT_MIN_TAP_GAP_MS, DEFAULT_SPEEDUP_DELAY_MS (+10 more)

### Community 28 - "Frostdragon Tyrant SQL"
Cohesion: 0.19
Nodes (12): fdt_assignments_alliance_idx, fdt_assignments_state_idx, fdt_events_state_idx, fdt_votes_state_idx, public.create_fdt_event(), public.delete_fdt_event(), public.fdt_assignments, public.fdt_events (+4 more)

### Community 29 - "Live Battle & Tour Narration"
Cohesion: 0.15
Nodes (15): landAfterMs garrison landing offset, useReinforcementTiming, Castle scene: garrison landing between two enemy rallies, MARKS (marks.json from record.mjs), Scene: castle, Scene: garrison, Overwatch tour narration (video transcript), BattleContext (+7 more)

### Community 30 - "Tour Audio Composer"
Cohesion: 0.26
Nodes (14): add(), bandpass(), bass_note(), bell(), clap(), hat(), kick(), lowpass() (+6 more)

### Community 31 - "State Sections Pages"
Cohesion: 0.12
Nodes (14): AccountRow, Alliance, AllianceAssignment, AllianceNotice, AlliancesPage(), MemberRow, ProfileRow, StateMember (+6 more)

### Community 32 - "Battle Plan Schema"
Cohesion: 0.18
Nodes (17): "battle_plan_notification_cleanup", "public"."battle_plan_assignments", "public"."bulk_assign_battle_plan_members"(), "public"."can_view_battle_plan"(), "public"."create_battle_plan_group"(), "public"."create_state_tag"(), "public"."delete_battle_plan_group"(), "public"."delete_state_alliance"() (+9 more)

### Community 33 - "TypeScript Config"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 34 - "Join & PIN Pages"
Cohesion: 0.16
Nodes (11): contentSecurityPolicy, nextConfig, supabaseUrl, next, ChangePinPage(), Checked, JoinPage(), check() (+3 more)

### Community 35 - "Battle Access Guard"
Cohesion: 0.22
Nodes (11): AdminLayout(), LiveBattlePage(), GarrisonLayout(), BattleToolGuard(), StateContext, StateContextValue, canUseBattleTool(), Membership (+3 more)

### Community 36 - "Notifications Page"
Cohesion: 0.16
Nodes (16): AccountLabel, HISTORY, NOTIFICATION_LINKS, NotificationData, NotificationItem, NotificationsPage(), OVERWATCH, StateLabel (+8 more)

### Community 38 - "Server Clock & Live Layout"
Cohesion: 0.15
Nodes (15): BattleProvider, handleAddLeader(), saveLeader(), LiveLayout(), BattleProvider(), addEnemyLeader(), addRally(), removeEnemyLeader() (+7 more)

### Community 39 - "Tour Animation Scenes"
Cohesion: 0.20
Nodes (13): backdrop(), card(), castle(), city(), drawCastle(), impact(), march(), pill() (+5 more)

### Community 40 - "Account Page"
Cohesion: 0.16
Nodes (9): AccountPage(), COMBAT_FIELDS, CombatProfile, WosAccount, JoinerHeroesEditor(), useLanguage(), NextSvsChecklist(), Step (+1 more)

### Community 41 - "Rally Setup & Heroes SQL"
Cohesion: 0.19
Nodes (5): public.apply_battle_plan_autofill(), public.automation_ensure_svs_plan(), public.player_heroes, public.publish_battle_plan_with_notifications(), public.set_player_heroes()

### Community 42 - "Oracle Alliance Picker"
Cohesion: 0.16
Nodes (9): react, LanguageContext, LanguageContextValue, allianceDisplayName(), AllianceOption, OracleAlliancePicker(), renderOption(), MoreMenuItem (+1 more)

### Community 43 - "Call Rally & Reinforcement"
Cohesion: 0.37
Nodes (10): CallRallyPage(), callRally(), GarrisonPage(), useBattle(), IncomingRallies(), ReinforcementSchedule(), ReinforcementSettings(), formatUtcTimePrecise() (+2 more)

### Community 44 - "Header & Login"
Cohesion: 0.24
Nodes (8): LoginPage(), Home(), RedirectTo(), AppHeader(), signOut(), LandingPage(), StateContact(), enterDemo()

### Community 45 - "Enemy Leaders Page"
Cohesion: 0.22
Nodes (7): ManageLeadersPage(), startEditing(), OpponentRosterPicker(), formatUtcTime(), getEnemyPetTimeRemaining(), isEnemyPetActive(), PET_DURATION_MS

### Community 46 - "Attendance & Intel"
Cohesion: 0.22
Nodes (10): Intel, IntelPage(), RECORD_FIELDS, totalPower(), AttendanceVote(), Availability, AVAILABILITY_OPTIONS, UpcomingSvs (+2 more)

### Community 47 - "Battles & Rallies Schema"
Cohesion: 0.19
Nodes (11): "battle_status_notification", "public"."activate_scheduled_battle"(), "public"."can_manage_battle"(), "public"."can_view_battle"(), "public"."complete_account_setup"(), "public"."end_state_battle"(), "public"."get_state_battle_history"(), "public"."get_state_battle_history_v2"() (+3 more)

### Community 48 - "Deployment & Env"
Cohesion: 0.19
Nodes (11): POST /api/automation/run, AUTH_PIN_PEPPER, CRON_SECRET, Deploying Overwatch, Vercel environment variables, npm run login:create, npm run oracle:check, Vercel hosting (+3 more)

### Community 49 - "Landing Video Pipeline"
Cohesion: 0.19
Nodes (6): window.ready, duration(), Archivo and IBM Plex Mono fonts, Kokoro TTS (af_heart voice), Landing video pipeline (overwatch-tour), public/video/overwatch-tour.mp4

### Community 50 - "Brand Marks & Icons"
Cohesion: 0.24
Nodes (13): Overwatch Brand Mark (mountain peak + beacon flag + signal arcs), Overwatch Brand Palette (navy #0B1D31, ice #EAF4FB, amber #F2B33D, violet #9A7CF0, teal #5FE0C0), Apple Touch Icon 180px (square full-bleed, full mark), Overwatch Mark (mono white, masked cutouts), Overwatch Mark (on dark), Overwatch Mark (on light), Overwatch Mark Small (on dark, peak + flag only), Favicon SVG (32px rounded navy tile with small mark and teal/violet glows) (+5 more)

### Community 51 - "Tags Page"
Cohesion: 0.19
Nodes (10): KindFilter, MemberOption, StateTag, TagAssignment, TagsPage(), createTag(), renderPlayersPanel(), saveTag() (+2 more)

### Community 53 - "Claude Settings"
Cohesion: 0.20
Nodes (11): source, enabledPlugins, agent-skills@addy-agent-skills, ponytail@ponytail, extraKnownMarketplaces, addy-agent-skills, ponytail, source (+3 more)

### Community 54 - "Demo Mode Banner"
Cohesion: 0.39
Nodes (9): DemoBanner(), demoBattleStatus(), demoEndBattle(), demoStartBattleNow(), exitDemo(), isDemoMode(), resetDemo(), notifyDemoUser() (+1 more)

### Community 55 - "Architecture: DB & Demo"
Cohesion: 0.20
Nodes (10): POST /api/automation/plan, battle_status_notification trigger, createRallies, Database functions and triggers, fillPlan, Notification categories (inbox colours), prevent_lead_as_joiner trigger, remindVoters (+2 more)

### Community 56 - "Architecture: Auth & Billing"
Cohesion: 0.18
Nodes (9): authorize_pin_reset, automation_billing_reminders, Billing (states.paid_until), create_state_join_link, App pages/routes, Removed in the pipeline overhaul, requireStateMember (stateAccess.ts), WOSOverwatch architecture map (+1 more)

### Community 57 - "Announcements Page"
Cohesion: 0.20
Nodes (7): Announcement, AnnouncementsPage(), getAudienceLabel(), AudienceType, formatAudienceValue(), NamedAudience, RecipientRow

### Community 58 - "Intel & Attendance SQL"
Cohesion: 0.29
Nodes (6): battle_attendance_state_idx, public.automation_ensure_svs_plan(), public.battle_attendance, public.battle_intel, public.get_upcoming_svs(), public.set_battle_attendance()

### Community 59 - "Operator Console"
Cohesion: 0.31
Nodes (9): addMonths(), day(), Handout, OperatorPage(), createState(), post(), resetPin(), setPaidUntil() (+1 more)

### Community 60 - "Billing & Contact UI"
Cohesion: 0.31
Nodes (5): PrivacyPage(), SECTIONS, BillingBanner(), DiscordHandle(), DISCORD_HANDLE

### Community 61 - "Reinforcement Alerts"
Cohesion: 0.22
Nodes (6): playTone(), readStoredSettings(), showSystemNotification(), useReinforcementTiming(), testSound(), buildLandingWindows()

### Community 62 - "Demo Notifications"
Cohesion: 0.38
Nodes (9): diff(), emitDemoMemberNotifications(), find(), isMine(), playerName(), ROLE_RANK, Snapshot, stateName() (+1 more)

### Community 63 - "Roster Import SQL"
Cohesion: 0.24
Nodes (4): public.apply_roster_import_on_join(), public.state_roster_import_count(), public.state_roster_imports, state_members_roster_import

### Community 64 - "Announcements Schema"
Cohesion: 0.28
Nodes (6): "public"."can_view_state_announcement"(), "public"."create_battle_plan"(), "public"."delete_state_announcement"(), "public"."profiles", "public"."state_announcements", "public"."state_creation_invites"

### Community 65 - "Demo Client Shim"
Cohesion: 0.42
Nodes (8): createDemoClient(), demoApiResponse(), demoAutoPlan(), demoUser, installDemoFetch(), json(), demoEnemyRoster(), random()

### Community 66 - "SvS Automation SQL"
Cohesion: 0.25
Nodes (4): battle_plans_auto_svs_unique, public.automation_advance_battles(), public.automation_ensure_svs_plan(), public.oracle_usage

### Community 68 - "FDT & Plan Publishing Docs"
Cohesion: 0.29
Nodes (7): create_fdt_event, Frostdragon Tyrant (FDT) planning, publish_battle_plan_with_notifications, publish_fdt_event, set_fdt_assignment, set_fdt_vote, Scene: publish

### Community 69 - "State Polls Schema"
Cohesion: 0.43
Nodes (6): "public"."cleanup_expired_state_polls"(), "public"."delete_state_poll"(), "public"."redeem_state_creation_invite"(), "public"."state_poll_options", "public"."state_polls", "state_poll_creator_notification"

### Community 71 - "States & System Tags"
Cohesion: 0.33
Nodes (5): "create_state_system_tags_after_insert", "protect_state_system_tag_before_change", "public"."delete_state_tag"(), "public"."notify_battle_status_change"(), "public"."update_state_tag"()

### Community 78 - "Agent Instructions"
Cohesion: 0.50
Nodes (4): generate-agent-files.js (next dev), node_modules/next/dist/docs guides, Next.js agent rules (not the Next.js you know), CLAUDE.md @AGENTS.md include

### Community 82 - "Vote Scene & Attendance"
Cohesion: 0.67
Nodes (3): automation_ensure_svs_plan, set_battle_attendance, Scene: vote

### Community 84 - "Next.js Bootstrap Notes"
Cohesion: 0.67
Nodes (3): app/page.tsx entry page, create-next-app bootstrap, next/font Geist font

## Knowledge Gaps
- **44 isolated node(s):** `react-dom`, `@tailwindcss/postcss`, `@types/node`, `@types/react`, `@types/react-dom` (+39 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 575 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **44 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useLanguage()` connect `Account Page` to `WOSOracle Data Integration`, `Battle Planning Page`, `Frostdragon Tyrant UI`, `Roster Import`, `Supabase Client & Overwatch`, `Plan Issues & Rally Forms`, `Autofill & Hero Settings`, `Landing & Guides UI`, `Plan Board Components`, `Pet Block Rotation`, `March Timing Planner`, `State Sections Pages`, `Join & PIN Pages`, `Battle Access Guard`, `Notifications Page`, `Oracle Alliance Picker`, `Call Rally & Reinforcement`, `Header & Login`, `Enemy Leaders Page`, `Attendance & Intel`, `Tags Page`, `Demo Mode Banner`, `Announcements Page`, `Operator Console`, `Billing & Contact UI`, `Reinforcement Alerts`?**
  _High betweenness centrality (0.091) - this node is a cross-community bridge._
- **What connects `react-dom`, `@tailwindcss/postcss`, `@types/node` to the rest of the system?**
  _44 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `WOSOracle Data Integration` be split into smaller, more focused modules?**
  _Cohesion score 0.05823068309070549 - nodes in this community are weakly interconnected._
- **Why does `WOSOverwatch architecture map` connect `Architecture: Auth & Billing` to `Architecture: Oracle Pipeline`, `FDT & Plan Publishing Docs`, `Architecture: Jobs & Live`, `Architecture: DB & Demo`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._
- **Should `Auth & Admin API Routes` be split into smaller, more focused modules?**
  _Cohesion score 0.09922251018141429 - nodes in this community are weakly interconnected._
- **Why does `react` connect `Oracle Alliance Picker` to `WOSOracle Data Integration`, `Package & Build Config`, `Frostdragon Tyrant UI`, `Roster Import`, `Supabase Client & Overwatch`, `Plan Issues & Rally Forms`, `Autofill & Hero Settings`, `Landing & Guides UI`, `Plan Board Components`, `Pet Block Rotation`, `March Timing Planner`, `Live Battle & Tour Narration`, `State Sections Pages`, `Join & PIN Pages`, `Battle Access Guard`, `Notifications Page`, `Server Clock & Live Layout`, `Account Page`, `Call Rally & Reinforcement`, `Header & Login`, `Enemy Leaders Page`, `Attendance & Intel`, `Tags Page`, `Demo Mode Banner`, `Announcements Page`, `Operator Console`, `Billing & Contact UI`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._
- **Should `Package & Build Config` be split into smaller, more focused modules?**
  _Cohesion score 0.0463768115942029 - nodes in this community are weakly interconnected._