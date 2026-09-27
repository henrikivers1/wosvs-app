import type {
  EnemyLeader,
  EnemyRally,
  RallyWave,
} from "@/types/rally";

export const PET_DURATION_MS = 2 * 60 * 60 * 1000;

export function formatUtcTime(date: Date): string {
  return date.toLocaleTimeString("en-GB", {
    timeZone: "UTC",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function isEnemyPetActive(
  leader: EnemyLeader,
  currentTime: Date
): boolean {
  return (
    leader.petExpiresAt !== null &&
    leader.petExpiresAt > currentTime.getTime()
  );
}

export function getEnemyPetTimeRemaining(
  leader: EnemyLeader,
  currentTime: Date
): string {
  if (!isEnemyPetActive(leader, currentTime)) {
    return "Inactive";
  }

  const totalSeconds = Math.ceil(
    (leader.petExpiresAt! - currentTime.getTime()) / 1000
  );
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${hours}:${minutes
    .toString()
    .padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;
}

export function groupRalliesIntoWaves(
  rallies: EnemyRally[]
): RallyWave[] {
  return rallies.reduce<RallyWave[]>((waves, rally) => {
    const impactSecond = Math.floor(
      rally.impactTime.getTime() / 1000
    );
    const existingWave = waves.find(
      (wave) => wave.impactSecond === impactSecond
    );

    if (existingWave) {
      existingWave.rallies.push(rally);
    } else {
      waves.push({ impactSecond, rallies: [rally] });
    }

    return waves;
  }, []);
}
