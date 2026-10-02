import { syncWosAccount } from "@/lib/playerSync";
import type { createAdminClient } from "@/lib/supabase/admin";
import { OraclePlayerError, oracleDailyBudget } from "@/lib/wosOracle";
import {
  fetchStateSummary,
  fetchSvsForecast,
  fetchSvsMatchup,
  fetchSvsRecord,
  fetchSvsResults,
} from "@/lib/wosOracleState";

type AdminClient = ReturnType<typeof createAdminClient>;

const HOUR_MS = 60 * 60 * 1000;
const BATTLE_DURATION_MS = 5 * HOUR_MS;
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
// Stay under WOSOracle's 50 requests per minute.
const PLAYER_SYNC_SPACING_MS = 1_300;
// Requests kept free for people using the app during the day.
const INTERACTIVE_RESERVE = 100;

export type AutomationReport = {
  statesChecked: number;
  drawsFound: number;
  intelSaved: number;
  battlesAdvanced: number;
  resultsSaved: number;
  playersSynced: number;
  errors: string[];
};

type StateRow = {
  id: string;
  name: string;
  game_state_number: number | null;
  svs_draw_expected_at: string | null;
  oracle_checked_at: string | null;
};

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function drawCheckDue(state: StateRow, now: number) {
  if (!state.oracle_checked_at) return true;
  const since = now - new Date(state.oracle_checked_at).getTime();
  const drawAt = state.svs_draw_expected_at
    ? new Date(state.svs_draw_expected_at).getTime()
    : null;
  const nearDraw = drawAt !== null && Math.abs(drawAt - now) < 24 * HOUR_MS;
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
  const matchup = await fetchSvsMatchup(stateNumber);
  const battleAt = matchup?.battleAt ? new Date(matchup.battleAt) : null;
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

    await admin
      .from("states")
      .update({
        svs_season: matchup.season,
        svs_opponent: matchup.opponent,
        svs_battle_at: battleAt.toISOString(),
        svs_draw_expected_at: null,
        svs_next_battle_at: battleAt.toISOString(),
        oracle_checked_at: new Date().toISOString(),
      })
      .eq("id", state.id);
    return;
  }

  const forecast = await fetchSvsForecast(stateNumber);
  await admin
    .from("states")
    .update({
      svs_season: matchup?.season ?? null,
      svs_opponent: null,
      svs_battle_at: null,
      svs_draw_expected_at: forecast.drawExpectedAt,
      svs_next_battle_at: forecast.nextBattleAt,
      oracle_checked_at: new Date().toISOString(),
    })
    .eq("id", state.id);
}

// Stores the opponent's state summary and SvS record next to our own
// summary for the Intel page. Three WOSOracle requests, at most daily.
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

  const [opponent, opponentSvs, own] = await Promise.all([
    fetchStateSummary(target.opponent),
    fetchSvsRecord(target.opponent),
    fetchStateSummary(target.stateNumber),
  ]);
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

  const results = await fetchSvsResults(state.game_state_number!);
  for (const battle of due) {
    const battleAt = new Date(battle.scheduled_at!).getTime();
    const match = results.find(
      (result) =>
        Math.abs(new Date(result.battleAt).getTime() - battleAt) < 24 * HOUR_MS,
    );
    if (match?.won !== null && match?.won !== undefined) {
      await admin.rpc("automation_set_battle_result", {
        target_battle_id: battle.id,
        battle_result: match.won ? "win" : "loss",
      });
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
async function weeklyPlayerSync(admin: AdminClient, report: AutomationReport) {
  const remaining =
    oracleDailyBudget() -
    INTERACTIVE_RESERVE -
    (await requestsUsedToday(admin));
  const batchSize = Math.min(PLAYER_SYNCS_PER_RUN, remaining);
  if (batchSize <= 0) return;

  const { data: accounts, error } = await admin
    .from("wos_accounts")
    .select("id, wos_id")
    .eq("is_configured", true)
    .or(
      `player_data_synced_at.is.null,player_data_synced_at.lt.${new Date(
        Date.now() - WEEKLY_SYNC_MAX_AGE_MS,
      ).toISOString()}`,
    )
    .order("player_data_synced_at", { ascending: true, nullsFirst: true })
    .limit(batchSize);
  if (error) {
    report.errors.push(`Player sync lookup: ${error.message}`);
    return;
  }

  for (const [index, account] of (accounts ?? []).entries()) {
    if (index > 0) {
      await new Promise((resolve) =>
        setTimeout(resolve, PLAYER_SYNC_SPACING_MS),
      );
    }
    try {
      await syncWosAccount(admin, account);
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
    errors: [],
  };
  const now = Date.now();

  let query = admin
    .from("states")
    .select(
      "id, name, game_state_number, svs_draw_expected_at, oracle_checked_at",
    )
    .not("game_state_number", "is", null);
  if (options.stateId) query = query.eq("id", options.stateId);
  const { data: states, error } = await query;
  if (error) {
    report.errors.push(
      error.code === "42703"
        ? "The database is missing the SvS automation columns. Run supabase/migrations/20261003090000_svs_automation.sql in the Supabase SQL Editor."
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

  // Start and end battles on time; no WOSOracle requests involved.
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
