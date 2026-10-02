import {
  OraclePlayerError,
  optionalText,
  oracleRequest,
  toNumber,
} from "@/lib/wosOracle";

// Free-tier WOSOracle endpoints used to prepare a battle. All of them read
// WOSOracle's stored data, so a 10-minute cache is plenty.
const CACHE_SECONDS = 600;

export type SvsMatchup = {
  season: number | null;
  stateNumber: number;
  // null when the state sits this season out.
  opponent: number | null;
  battleAt: string | null;
};

export type OpponentAlliance = {
  id: number;
  abbr: string;
  name: string;
  power: number;
  memberCount: number;
};

export type RosterMember = {
  wosId: string | null;
  name: string;
  power: number;
  furnaceLevel: number;
  rank: number;
};

function objectOf(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new OraclePlayerError("WOSOracle returned an invalid response.", 502);
  }
  return value as Record<string, unknown>;
}

function listOf(value: unknown) {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}

export async function fetchSvsMatchup(
  stateNumber: number,
): Promise<SvsMatchup | null> {
  const body = objectOf(
    await oracleRequest(`/svs/matchups?sid=${stateNumber}`, {
      revalidateSeconds: CACHE_SECONDS,
    }),
  );

  const matchup = listOf(body.matchups).find((entry) =>
    (Array.isArray(entry.states) ? entry.states : []).some(
      (state) => toNumber(state) === stateNumber,
    ),
  );
  if (!matchup) return null;

  const states = (Array.isArray(matchup.states) ? matchup.states : [])
    .map(toNumber)
    .filter((state): state is number => state !== null);
  const opponent = states.find((state) => state !== stateNumber) ?? null;
  const battleTs = toNumber(matchup.battle_ts);

  return {
    season: toNumber(body.season),
    stateNumber,
    opponent,
    battleAt: battleTs ? new Date(battleTs * 1000).toISOString() : null,
  };
}

export async function fetchStateAlliances(
  stateNumber: number,
): Promise<OpponentAlliance[]> {
  const body = objectOf(
    await oracleRequest(`/states/${stateNumber}`, {
      revalidateSeconds: CACHE_SECONDS,
      notFoundMessage: `WOSOracle does not track state ${stateNumber}.`,
    }),
  );

  return listOf(body.alliances).flatMap((alliance) => {
    const id = toNumber(alliance.id);
    if (!id) return [];
    return [
      {
        id,
        abbr: optionalText(alliance.abbr) ?? "",
        name: optionalText(alliance.name) ?? "",
        power: toNumber(alliance.power) ?? 0,
        memberCount: toNumber(alliance.member_count) ?? 0,
      },
    ];
  });
}

export async function fetchAllianceRoster(
  allianceId: number,
  stateNumber: number,
): Promise<RosterMember[]> {
  const body = objectOf(
    await oracleRequest(`/alliances/${allianceId}?kid=${stateNumber}`, {
      revalidateSeconds: CACHE_SECONDS,
      notFoundMessage: "WOSOracle does not track that alliance.",
    }),
  );

  return listOf(body.members)
    .map((member) => {
      const id = optionalText(member.id);
      return {
        wosId: id && /^[0-9]+$/.test(id) ? id : null,
        name: optionalText(member.name) ?? "",
        power: toNumber(member.power) ?? 0,
        furnaceLevel: toNumber(member.furnace_level) ?? 0,
        rank: toNumber(member.rank) ?? 0,
      };
    })
    .filter((member) => member.name)
    .sort((first, second) => second.power - first.power);
}
