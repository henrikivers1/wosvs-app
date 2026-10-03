import { demoTable, nowIso, saveDemoTables } from "@/lib/demo/store";

// Demo time controls: jump straight to the live battle or end it, so the
// garrison timing and rally tools can be tried without waiting for SvS.
export function demoStartBattleNow() {
  const start = new Date(Date.now() - 60_000).toISOString();
  const battle = demoTable("battles").find(
    (row) => row.status === "scheduled" || row.status === "active",
  );
  if (!battle) return;
  Object.assign(battle, { status: "active", started_at: nowIso(), scheduled_at: start });
  const plan = demoTable("battle_plans").find((row) => row.id === battle.plan_id);
  if (plan) plan.scheduled_at = start;
  const state = demoTable("states").find((row) => row.id === battle.state_id);
  if (state) Object.assign(state, { svs_battle_at: start, svs_next_battle_at: start });
  saveDemoTables();
}

export function demoEndBattle(result: "win" | "loss") {
  const battle = demoTable("battles").find((row) => row.status === "active");
  if (!battle) return;
  Object.assign(battle, { status: "completed", ended_at: nowIso(), result });
  saveDemoTables();
}

export function demoBattleStatus() {
  return demoTable("battles").some((row) => row.status === "active")
    ? "active"
    : "scheduled";
}
