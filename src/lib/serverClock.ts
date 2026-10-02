export type ClockSync = {
  // Add to Date.now() to get the shared server time.
  offsetMs: number;
  // Worst-case error of the estimate: half the best round trip.
  accuracyMs: number;
  syncedAt: number;
};

const SAMPLE_COUNT = 6;

async function sampleServerClock() {
  const startedAt = Date.now();
  const startedPerf = performance.now();
  const response = await fetch("/api/time", { cache: "no-store" });
  const { now } = (await response.json()) as { now: number };
  const roundTripMs = performance.now() - startedPerf;

  // NTP-style estimate: the server read its clock roughly halfway through
  // the round trip, so network latency cancels out.
  return {
    roundTripMs,
    offsetMs: now - (startedAt + roundTripMs / 2),
  };
}

export async function syncServerClock(): Promise<ClockSync | null> {
  const samples: Awaited<ReturnType<typeof sampleServerClock>>[] = [];

  for (let index = 0; index < SAMPLE_COUNT; index += 1) {
    try {
      samples.push(await sampleServerClock());
    } catch {
      // Ignore a failed sample; the others are still usable.
    }
  }

  if (samples.length === 0) return null;
  const best = samples.reduce((fastest, sample) =>
    sample.roundTripMs < fastest.roundTripMs ? sample : fastest,
  );

  return {
    offsetMs: Math.round(best.offsetMs),
    accuracyMs: Math.ceil(best.roundTripMs / 2),
    syncedAt: Date.now(),
  };
}
