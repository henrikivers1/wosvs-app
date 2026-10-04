import type { EnemyRally } from "@/types/rally";

// The gap between two consecutive enemy rallies hitting the castle. Our
// reinforcements should land inside it: after `after` has hit (so they are
// not consumed by it) and before `before` arrives.
export type LandingWindow = {
  id: string;
  after: EnemyRally;
  // null after the last called rally: land right after it hits.
  before: EnemyRally | null;
  opensAt: Date;
  closesAt: Date | null;
  // Just after `after` hits. Real gaps between rally hits are often only
  // half a second, so landing right behind the first hit is what counts.
  targetTime: Date;
};

// How long after the hit to land, unless the gap is shorter than twice
// that (then the middle of the gap). Players can change it.
export const DEFAULT_LAND_AFTER_MS = 100;

export function buildLandingWindows(
  rallies: EnemyRally[],
  landAfterMs: number = DEFAULT_LAND_AFTER_MS,
): LandingWindow[] {
  const ordered = [...rallies].sort(
    (first, second) => first.impactTime.getTime() - second.impactTime.getTime(),
  );
  const windows: LandingWindow[] = [];

  for (let index = 0; index < ordered.length - 1; index += 1) {
    const after = ordered[index];
    const before = ordered[index + 1];
    const opensAt = after.impactTime.getTime();
    const closesAt = before.impactTime.getTime();
    if (closesAt <= opensAt) continue;

    windows.push({
      id: `${after.id}-${before.id}`,
      after,
      before,
      opensAt: new Date(opensAt),
      closesAt: new Date(closesAt),
      targetTime: new Date(opensAt + Math.min(landAfterMs, (closesAt - opensAt) / 2)),
    });
  }

  const last = ordered[ordered.length - 1];
  if (last) {
    const opensAt = last.impactTime.getTime();
    windows.push({
      id: `${last.id}-after`,
      after: last,
      before: null,
      opensAt: new Date(opensAt),
      closesAt: null,
      targetTime: new Date(opensAt + landAfterMs),
    });
  }

  return windows;
}

export function windowSendTime(
  window: LandingWindow,
  marchTimeSeconds: number,
  sendEarlyMs: number,
) {
  return new Date(
    window.targetTime.getTime() - marchTimeSeconds * 1000 - sendEarlyMs,
  );
}
