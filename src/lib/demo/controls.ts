import {
  emitDemoMemberNotifications,
  snapshotDemoMembers,
} from "@/lib/demo/notify";
import { notifyDemoUser } from "@/lib/demo/notify";
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
  // As at 11:00 UTC: the owner (the demo user) is told to map enemy leaders.
  const owner = demoTable("state_members").find(
    (row) => row.state_id === battle.state_id && row.role === "owner",
  );
  notifyDemoUser(
    "map_enemy_leaders",
    "Map the enemy rally leaders",
    "Live Battle is open. Add their likely rally leads (best Labyrinth score first) and their city coordinates under Enemy leaders before the battle starts.",
    { battle_id: battle.id, battle_name: battle.name, battle_start: startIso },
    battle.state_id,
    owner?.wos_account_id ?? null,
  );
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
