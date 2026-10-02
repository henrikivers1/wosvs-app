import type { EnemyRally } from "@/types/rally";

// The gap between two consecutive enemy rallies hitting the castle. Our
// reinforcements should land inside it: after `after` has hit (so they are
// not consumed by it) and before `before` arrives.
export type LandingWindow = {
  id: string;
  after: EnemyRally;
  before: EnemyRally;
  opensAt: Date;
  closesAt: Date;
  // Aim for the middle of the gap: it tolerates the most timing error in
  // either direction (caller reaction, game ping, rounding of march times).
  targetTime: Date;
};

export function buildLandingWindows(rallies: EnemyRally[]): LandingWindow[] {
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
      targetTime: new Date(opensAt + (closesAt - opensAt) / 2),
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
