import { runAutoPlan, type AutoPlanSettings } from "@/lib/autoPlan";
import { syncWosAccount } from "@/lib/playerSync";
import type { createAdminClient } from "@/lib/supabase/admin";
import { OraclePlayerError, oracleDailyBudget } from "@/lib/wosOracle";
import {
  fetchStateSummary,
  fetchTopPlayers,
  fetchSvsForecast,
  fetchSvsMatchup,
  fetchSvsRecord,
} from "@/lib/wosOracleState";
import { BATTLE_DURATION_MS, svsBattleStart } from "@/lib/svsTime";

type AdminClient = ReturnType<typeof createAdminClient>;

const HOUR_MS = 60 * 60 * 1000;
// Normal draw check cadence; hourly when the draw is due within a day.
const DRAW_CHECK_INTERVAL_MS = 6 * HOUR_MS;
const DRAW_CHECK_INTERVAL_NEAR_DRAW_MS = HOUR_MS;
const RESULT_CHECK_INTERVAL_MS = 6 * HOUR_MS;
// Opponent intel is refreshed daily until the battle starts.
const INTEL_REFRESH_INTERVAL_MS = 24 * HOUR_MS;
// Weekly player refresh on Mondays (UTC), spread over hourly runs.
const WEEKLY_SYNC_DAY = 1;
const WEEKLY_SYNC_MAX_AGE_MS = 6 * 24 * HOUR_MS;
const PLAYER_SYNCS_PER_RUN = 30;
// The job must answer within the 60 s cron/HTTP timeout.
const PLAYER_SYNC_TIME_BUDGET_MS = 40_000;
// Failed accounts (bad ID, not tracked) are retried a day later.
const PLAYER_SYNC_RETRY_AFTER_MS = 24 * HOUR_MS;
// Requests kept free for people using the app during the day.
const INTERACTIVE_RESERVE = 100;

export type AutomationReport = {
  statesChecked: number;
  drawsFound: number;
  intelSaved: number;
  battlesAdvanced: number;
  resultsSaved: number;
  playersSynced: number;
  remindersSent: number;
  ralliesCreated: number;
  playersAssigned: number;
  plansPublished: number;
  errors: string[];
};

type StateRow = AutoPlanSettings & {
  id: string;
  name: string;
  game_state_number: number | null;
  svs_draw_expected_at: string | null;
  oracle_checked_at: string | null;
};

const STATE_COLUMNS =
  "id, name, game_state_number, svs_draw_expected_at, oracle_checked_at, auto_plan, auto_publish, rally_count, rally_size, default_formation, default_joiner_heroes, autofill_priorities";

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function drawCheckDue(state: StateRow, now: number) {
  if (!state.oracle_checked_at) return true;
  const since = now - new Date(state.oracle_checked_at).getTime();
  const drawAt = state.svs_draw_expected_at
    ? new Date(state.svs_draw_expected_at).getTime()
    : null;
  // Hourly from a day before the expected draw until it is published.
  const nearDraw = drawAt !== null && drawAt - now < 24 * HOUR_MS;
  return (
    since >=
    (nearDraw ? DRAW_CHECK_INTERVAL_NEAR_DRAW_MS : DRAW_CHECK_INTERVAL_MS)
  );
}

// Looks up the SvS draw for one state. Once drawn, the plan and its battle
// are created automatically; before that, the expected draw date is stored
// for the countdown.
async function refreshDraw(
  admin: AdminClient,
  state: StateRow,
  report: AutomationReport,
) {
  const stateNumber = state.game_state_number!;
  const now = Date.now();
  // Mark the check first, so a failing WOSOracle call is not retried on
  // every run and the manual cooldown still applies.
  await admin
    .from("states")
    .update({ oracle_checked_at: new Date().toISOString() })
    .eq("id", state.id);
  const matchup = await fetchSvsMatchup(stateNumber, { waitForMinute: true });
  const battleAt = matchup?.battleAt ? svsBattleStart(matchup.battleAt) : null;
  const upcoming =
    matchup?.opponent &&
    battleAt &&
    battleAt.getTime() + BATTLE_DURATION_MS > now;

  if (upcoming) {
    const { data: planId, error } = await admin.rpc(
      "automation_ensure_svs_plan",
      {
        target_state_id: state.id,
        opponent_number: matchup.opponent,
        battle_at: battleAt.toISOString(),
      },
    );
    if (error) throw new Error(error.message);
    report.drawsFound += 1;

    if (planId && battleAt.getTime() > now) {
      try {
        await refreshIntel(admin, {
          planId: planId as string,
          stateId: state.id,
          stateNumber,
          opponent: matchup.opponent!,
        });
        report.intelSaved += 1;
      } catch (intelError) {
        // Intel is a nice-to-have; the draw itself is already saved.
        report.errors.push(`${state.name} intel: ${errorText(intelError)}`);
      }
    }

    const { error: saveError } = await admin
      .from("states")
      .update({
        svs_season: matchup.season,
        svs_opponent: matchup.opponent,
        svs_battle_at: battleAt.toISOString(),
        svs_draw_expected_at: null,
        svs_next_battle_at: battleAt.toISOString(),
      })
      .eq("id", state.id);
    if (saveError) throw new Error(saveError.message);
    return;
  }

  const forecast = await fetchSvsForecast(stateNumber, { waitForMinute: true });
  const { error: saveError } = await admin
    .from("states")
    .update({
      svs_season: matchup?.season ?? null,
      svs_opponent: null,
      svs_battle_at: null,
      svs_draw_expected_at: forecast.drawExpectedAt,
      svs_next_battle_at: forecast.nextBattleAt
        ? svsBattleStart(forecast.nextBattleAt).toISOString()
        : null,
    })
    .eq("id", state.id);
  if (saveError) throw new Error(saveError.message);
}

// Stores the opponent's state summary and SvS record next to our own
// summary for the Intel page. 4 WOSOracle requests with Premium (9 on the
// base plan), at most daily.
async function refreshIntel(
  admin: AdminClient,
  target: {
    planId: string;
    stateId: string;
    stateNumber: number;
    opponent: number;
  },
) {
  const { data: existing } = await admin
    .from("battle_intel")
    .select("opponent_state, fetched_at")
    .eq("plan_id", target.planId)
    .maybeSingle();
  if (
    existing &&
    existing.opponent_state === target.opponent &&
    Date.now() - new Date(existing.fetched_at).getTime() <
      INTEL_REFRESH_INTERVAL_MS
  ) {
    return;
  }

  const background = { waitForMinute: true };
  const [opponent, opponentSvs, own] = await Promise.all([
    fetchStateSummary(target.opponent, background),
    fetchSvsRecord(target.opponent, background),
    fetchStateSummary(target.stateNumber, background),
  ]);
  opponentSvs.recent = opponentSvs.recent.slice(0, 10);
  // Their 20 strongest players, the likely rally leaders.
  opponent.topPlayers = await fetchTopPlayers(opponent, background);
  const { error } = await admin.from("battle_intel").upsert({
    plan_id: target.planId,
    state_id: target.stateId,
    opponent_state: target.opponent,
    opponent,
    opponent_svs: opponentSvs,
    own,
    fetched_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

// Fills in Win/Loss for finished SvS battles from the state's SvS record.
async function saveResults(
  admin: AdminClient,
  state: StateRow,
  report: AutomationReport,
) {
  const now = Date.now();
  const { data: battles } = await admin
    .from("battles")
    .select("id, scheduled_at, result_checked_at")
    .eq("state_id", state.id)
    .eq("status", "completed")
    .eq("battle_type", "svs")
    .is("result", null)
    .gte("ended_at", new Date(now - 7 * 24 * HOUR_MS).toISOString());

  const due = (battles ?? []).filter(
    (battle) =>
      battle.scheduled_at &&
      (!battle.result_checked_at ||
        now - new Date(battle.result_checked_at).getTime() >=
          RESULT_CHECK_INTERVAL_MS),
  );
  if (due.length === 0) return;

  const { recent } = await fetchSvsRecord(state.game_state_number!, {
    fresh: true,
    waitForMinute: true,
  });
  for (const battle of due) {
    const battleAt = new Date(battle.scheduled_at!).getTime();
    const match = recent.find(
      (result) =>
        Math.abs(new Date(result.battleAt).getTime() - battleAt) < 24 * HOUR_MS,
    );
    if (match?.battleWon !== null && match?.battleWon !== undefined) {
      const { error } = await admin.rpc("automation_set_battle_result", {
        target_battle_id: battle.id,
        battle_result: match.battleWon ? "win" : "loss",
      });
      if (error) throw new Error(error.message);
      report.resultsSaved += 1;
    }
    await admin
      .from("battles")
      .update({ result_checked_at: new Date().toISOString() })
      .eq("id", battle.id);
  }
}

async function requestsUsedToday(admin: AdminClient) {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await admin
    .from("oracle_usage")
    .select("requests")
    .eq("day", today)
    .maybeSingle();
  return data?.requests ?? 0;
}

// Refreshes accounts not synced for 6 days, a batch per run, on Mondays.
// Stops after PLAYER_SYNC_TIME_BUDGET_MS; failed accounts wait a day.
async function weeklyPlayerSync(admin: AdminClient, report: AutomationReport) {
  const startedAt = Date.now();
  const remaining =
    oracleDailyBudget() -
    INTERACTIVE_RESERVE -
    (await requestsUsedToday(admin));
  const batchSize = Math.min(PLAYER_SYNCS_PER_RUN, remaining);
  if (batchSize <= 0) return;

  const staleBefore = new Date(Date.now() - WEEKLY_SYNC_MAX_AGE_MS).toISOString();
  const failedBefore = new Date(Date.now() - PLAYER_SYNC_RETRY_AFTER_MS).toISOString();
  const { data: accounts, error } = await admin
    .from("wos_accounts")
    .select("id, wos_id, state_number, player_data_synced_at")
    .eq("is_configured", true)
    .or(`player_data_synced_at.is.null,player_data_synced_at.lt.${staleBefore}`)
    .or(
      `player_data_sync_failed_at.is.null,player_data_sync_failed_at.lt.${failedBefore}`,
    )
    .order("player_data_synced_at", { ascending: true, nullsFirst: true })
    .limit(batchSize);
  if (error) {
    report.errors.push(`Player sync lookup: ${error.message}`);
    return;
  }

  for (const account of accounts ?? []) {
    if (Date.now() - startedAt > PLAYER_SYNC_TIME_BUDGET_MS) return;
    try {
      // The per-minute budget in oracleRequest paces the batch.
      await syncWosAccount(admin, account, { background: true });
      report.playersSynced += 1;
    } catch (syncError) {
      report.errors.push(`Player ${account.wos_id}: ${errorText(syncError)}`);
      // Stop the batch when the quota is used up.
      if (syncError instanceof OraclePlayerError && syncError.status === 429) {
        return;
      }
    }
  }
}

// Reminders, rally generation, late-voter fill and publishing for every
// upcoming SvS plan (no WOSOracle requests).
async function planUpcomingBattles(
  admin: AdminClient,
  states: StateRow[],
  report: AutomationReport,
) {
  const byId = new Map(states.map((state) => [state.id, state]));
  if (!byId.size) return;
  const { data: plans, error } = await admin
    .from("battle_plans")
    .select(
      "id, state_id, name, scheduled_at, status, attendance_reminder_sent_at, auto_planned_at",
    )
    .in("state_id", [...byId.keys()])
    .eq("battle_type", "svs")
    .gt("scheduled_at", new Date().toISOString());
  if (error) {
    report.errors.push(`Plans: ${error.message}`);
    return;
  }
  for (const plan of plans ?? []) {
    const state = byId.get(plan.state_id)!;
    try {
      const result = await runAutoPlan(admin, plan, state);
      report.remindersSent += result.reminded;
      report.ralliesCreated += result.ralliesCreated;
      report.playersAssigned += result.playersAssigned;
      if (result.published) report.plansPublished += 1;
    } catch (planError) {
      report.errors.push(`${state.name} plan: ${errorText(planError)}`);
    }
  }
}

export async function runAutomation(
  admin: AdminClient,
  options: { stateId?: string; forceDrawCheck?: boolean; playerSync?: boolean },
): Promise<AutomationReport> {
  const report: AutomationReport = {
    statesChecked: 0,
    drawsFound: 0,
    intelSaved: 0,
    battlesAdvanced: 0,
    resultsSaved: 0,
    playersSynced: 0,
    remindersSent: 0,
    ralliesCreated: 0,
    playersAssigned: 0,
    plansPublished: 0,
    errors: [],
  };
  const now = Date.now();

  let query = admin
    .from("states")
    .select(STATE_COLUMNS)
    .not("game_state_number", "is", null);
  if (options.stateId) query = query.eq("id", options.stateId);
  const { data: states, error } = await query;
  if (error) {
    report.errors.push(
      error.code === "42703"
        ? "The database is missing automation columns. Run the latest files in supabase/migrations in the Supabase SQL Editor."
        : `States: ${error.message}`,
    );
    return report;
  }

  for (const state of (states ?? []) as StateRow[]) {
    try {
      if (options.forceDrawCheck || drawCheckDue(state, now)) {
        report.statesChecked += 1;
        await refreshDraw(admin, state, report);
      }
      await saveResults(admin, state, report);
    } catch (stateError) {
      report.errors.push(`${state.name}: ${errorText(stateError)}`);
    }
  }

  await planUpcomingBattles(admin, (states ?? []) as StateRow[], report);

  // Start and end battles. pg_cron also runs this every minute in the
  // database; this is the fallback when pg_cron is not enabled.
  const { data: advanced, error: advanceError } = await admin.rpc(
    "automation_advance_battles",
  );
  if (advanceError) report.errors.push(`Battles: ${advanceError.message}`);
  else report.battlesAdvanced = advanced ?? 0;

  if (options.playerSync && new Date().getUTCDay() === WEEKLY_SYNC_DAY) {
    await weeklyPlayerSync(admin, report);
  }

  return report;
}
