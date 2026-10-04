// Several reinforcements for rallies that hit close together. Each landing
// target gets one march; when its plain send would come too soon after
// another tap, the march is sent later and sped up with a march
// accelerator, which takes 25% or 50% off the time that is left:
//
//   25%:      lands at send + b + 0.75 × (M − b)
//   50%:      lands at send + b + 0.5 × (M − b)
//   2 × 25%:  lands at send + b2 + 0.75 × (0.75 × (M − b1) − (b2 − b1))
//
// M is the march time and b (b1, b2) how long after sending the player
// taps the speedup. A late speedup tap moves the landing only by a quarter
// (25%) or half (50%) of the delay, so only the send tap must be exact.

export type Speedup = "none" | "25" | "50" | "25x2";

// Which speedups players use: one 50% for a third close march, or two 25%
// (cheaper, a little slower: 56.25% of the time left instead of 50%).
export type SpeedupMode = "off" | "25-50" | "25-25x2";

export type MarchTap = { kind: "send" | "speedup"; at: number; percent?: 25 | 50 };

export type PlannedMarch = {
  targetId: string;
  speedup: Speedup;
  // Taps in order: the send, then any speedups. Times in ms.
  taps: MarchTap[];
  landsAt: number;
};

export type MarchPlanOptions = {
  marchMs: number;
  // Seconds after sending (or after the first speedup) before a speedup tap.
  speedupDelayMs: number;
  // Taps closer than this are too fast for a finger and the game.
  minGapMs: number;
  // Every tap this much earlier, for the player's ping.
  earlyMs: number;
  mode: SpeedupMode;
};

// Opening the march and finding the accelerator takes a few seconds.
export const DEFAULT_SPEEDUP_DELAY_MS = 5000;
// The first version's default, still saved in some browsers.
export const OLD_DEFAULT_SPEEDUP_DELAY_MS = 3000;
export const DEFAULT_MIN_TAP_GAP_MS = 2000;

// A speedup can wait up to this much longer than the player's delay, to
// find room between other taps.
const MAX_EXTRA_DELAY_MS = 5000;
const DELAY_STEP_MS = 250;

// Taps for one speedup choice that lands at `target`, with the first
// speedup b ms after sending (the second one speedupDelayMs later), or
// null when the march is too short for it.
function tapsFor(
  speedup: Speedup,
  target: number,
  { marchMs: m, speedupDelayMs, earlyMs }: MarchPlanOptions,
  b: number,
): MarchTap[] | null {
  if (speedup === "none") return [{ kind: "send", at: target - m - earlyMs }];
  if (speedup === "25" || speedup === "50") {
    if (m <= b) return null;
    const left = speedup === "25" ? 0.75 : 0.5;
    const send = target - b - left * (m - b);
    return [
      { kind: "send", at: send - earlyMs },
      { kind: "speedup", at: send + b - earlyMs, percent: speedup === "25" ? 25 : 50 },
    ];
  }
  // Two 25% speedups.
  const b1 = b;
  const b2 = b + speedupDelayMs;
  const afterFirst = 0.75 * (m - b1);
  if (m <= b1 || afterFirst <= b2 - b1) return null;
  const send = target - b2 - 0.75 * (afterFirst - (b2 - b1));
  return [
    { kind: "send", at: send - earlyMs },
    { kind: "speedup", at: send + b1 - earlyMs, percent: 25 },
    { kind: "speedup", at: send + b2 - earlyMs, percent: 25 },
  ];
}

function choices(mode: SpeedupMode): Speedup[] {
  if (mode === "off") return ["none"];
  return mode === "25-50" ? ["none", "25", "50"] : ["none", "25", "25x2"];
}

// What each choice costs: speedups are bought with gems (two 25% are
// cheaper than one 50%), and leaving a rally without a march is worst.
const COST: Record<Speedup, number> = { none: 0, "25": 1, "25x2": 2, "50": 3 };
const SKIP_COST = 100;
// Enough to search every combination for a handful of close rallies.
const MAX_SEARCH_STEPS = 200_000;

type Option = { speedup: Speedup; taps: MarchTap[]; cost: number };

function optionsFor(target: number, options: MarchPlanOptions): Option[] {
  const list: Option[] = [];
  for (const speedup of choices(options.mode)) {
    const extra = speedup === "none" ? 0 : MAX_EXTRA_DELAY_MS;
    for (let wait = 0; wait <= extra; wait += DELAY_STEP_MS) {
      const taps = tapsFor(speedup, target, options, options.speedupDelayMs + wait);
      // A little cost for waiting longer than the player needs.
      if (taps) list.push({ speedup, taps, cost: COST[speedup] + wait / 100_000 });
    }
  }
  return list.sort((first, second) => first.cost - second.cost);
}

// One march per target, each with a speedup choice so that the marches'
// taps follow each other at least minGapMs apart. Close rallies are planned together: the
// cheapest combination that leaves the fewest rallies without a march.
// Targets nothing fits are null: there is no time to send for them.
// Marches in `fixed` are already sent: they keep their taps and the others
// are planned around them.
export function planMarches(
  targets: Array<{ id: string; at: number }>,
  options: MarchPlanOptions,
  fixed: Map<string, PlannedMarch> = new Map(),
): Map<string, PlannedMarch | null> {
  const plan = new Map<string, PlannedMarch | null>(fixed);
  const sorted = [...targets]
    .filter((target) => !fixed.has(target.id))
    .sort((first, second) => first.at - second.at);
  const fixedMarches = [...fixed.values()].map((march) => march.taps);

  // Without speedups every target keeps its plain send, as before.
  if (options.mode === "off") {
    for (const target of sorted) {
      plan.set(target.id, {
        targetId: target.id,
        speedup: "none",
        taps: tapsFor("none", target.at, options, 0)!,
        landsAt: target.at,
      });
    }
    return plan;
  }

  // All taps for a target fall within its march time before it, so targets
  // further apart than that never get in each other's way.
  const groups: Array<typeof sorted> = [];
  for (const target of sorted) {
    const group = groups[groups.length - 1];
    const previous = group?.[group.length - 1];
    if (previous && target.at - options.marchMs - options.earlyMs < previous.at + options.minGapMs) {
      group.push(target);
    } else {
      groups.push([target]);
    }
  }

  for (const group of groups) {
    const choicesPerTarget = group.map((target) => optionsFor(target.at, options));
    let best: Array<Option | null> = group.map(() => null);
    let bestCost = group.length * SKIP_COST;
    const current: Array<Option | null> = [];
    let steps = 0;

    // One march at a time: a march's send and speedups never mix with
    // another march's taps, so the player always speeds up the march they
    // just sent. Every tap is minGapMs from the other marches' taps.
    const apart = (first: MarchTap[], second: MarchTap[]) =>
      first[first.length - 1].at + options.minGapMs <= second[0].at ||
      second[second.length - 1].at + options.minGapMs <= first[0].at;
    const fits = (option: Option) =>
      fixedMarches.every((taps) => apart(taps, option.taps)) &&
      current.every((other) => !other || apart(other.taps, option.taps));

    const search = (index: number, cost: number) => {
      if (cost >= bestCost || steps > MAX_SEARCH_STEPS) return;
      if (index === group.length) {
        best = [...current];
        bestCost = cost;
        return;
      }
      for (const option of choicesPerTarget[index]) {
        steps += 1;
        if (cost + option.cost >= bestCost) break;
        if (!fits(option)) continue;
        current.push(option);
        search(index + 1, cost + option.cost);
        current.pop();
      }
      current.push(null);
      search(index + 1, cost + SKIP_COST);
      current.pop();
    };
    search(0, 0);

    group.forEach((target, index) => {
      const option = best[index];
      plan.set(
        target.id,
        option
          ? { targetId: target.id, speedup: option.speedup, taps: option.taps, landsAt: target.at }
          : null,
      );
    });
  }
  return plan;
}
