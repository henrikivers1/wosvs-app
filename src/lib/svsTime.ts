// SvS castle battles always run 12:00–17:00 UTC on battle day. WOSOracle
// reports when the battle *phase* opens (00:00 UTC that day), so every
// battle time in the app goes through svsBattleStart. The same values are
// used by the SQL functions create_svs_plan and automation_advance_battles.
export const SVS_START_HOUR_UTC = 12;
export const BATTLE_DURATION_MS = 5 * 60 * 60 * 1000;
// Live Battle opens this long before the start (11:00 UTC), so players can
// enter their city and the enemy leaders' coordinates in time.
export const LIVE_OPENS_BEFORE_MS = 60 * 60 * 1000;

export function svsBattleStart(value: string | number | Date) {
  const start = new Date(value);
  start.setUTCHours(SVS_START_HOUR_UTC, 0, 0, 0);
  return start;
}
