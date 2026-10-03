import {
  emitDemoMemberNotifications,
  snapshotDemoMembers,
} from "@/lib/demo/notify";
import { demoTable, nowIso, saveDemoTables } from "@/lib/demo/store";

// Demo time controls: jump straight to the live battle or end it, so the
// garrison timing and rally tools can be tried without waiting for SvS.
export function demoStartBattleNow() {
  // Keep the official 12:00 UTC start: today's battle, or tomorrow's once
  // today's 12:00–17:00 window has passed. Only the status goes live now.
  const start = new Date();
  if (start.getUTCHours() >= 17) start.setUTCDate(start.getUTCDate() + 1);
  start.setUTCHours(12, 0, 0, 0);
  const startIso = start.toISOString();
  const battle = demoTable("battles").find(
    (row) => row.status === "scheduled" || row.status === "active",
  );
  if (!battle) return;
  Object.assign(battle, {
    status: "active",
    started_at: nowIso(),
    scheduled_at: startIso,
  });
  const plan = demoTable("battle_plans").find(
    (row) => row.id === battle.plan_id,
  );
  if (plan) plan.scheduled_at = startIso;
  const state = demoTable("states").find((row) => row.id === battle.state_id);
  if (state) {
    Object.assign(state, {
      svs_battle_at: startIso,
      svs_next_battle_at: startIso,
    });
  }
  saveDemoTables();
}

export function demoEndBattle(result: "win" | "loss") {
  const battle = demoTable("battles").find((row) => row.status === "active");
  if (!battle) return;
  const before = snapshotDemoMembers();
  Object.assign(battle, { status: "completed", ended_at: nowIso(), result });
  // Every member gets the Victory / Defeat message.
  emitDemoMemberNotifications(before);
  saveDemoTables();
}

export function demoBattleStatus() {
  return demoTable("battles").some((row) => row.status === "active")
    ? "active"
    : "scheduled";
}
