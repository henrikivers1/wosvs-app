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

export type SvsForecast = {
  drawExpectedAt: string | null;
  nextBattleAt: string | null;
};

function isoFromUnix(value: unknown) {
  const seconds = toNumber(value);
  return seconds ? new Date(seconds * 1000).toISOString() : null;
}

// When the next draw and battle are expected (free, stored data).
export async function fetchSvsForecast(
  stateNumber: number,
): Promise<SvsForecast> {
  const body = objectOf(
    await oracleRequest(`/states/${stateNumber}/svs/forecast`),
  );
  return {
    drawExpectedAt: isoFromUnix(body.draw_expected_at),
    nextBattleAt: isoFromUnix(body.next_battle_at),
  };
}

export type SvsResult = {
  battleAt: string;
  opponent: number | null;
  // null until WOSOracle has decided the battle.
  won: boolean | null;
};

// This state's SvS record, newest first (free, stored data).
export async function fetchSvsResults(
  stateNumber: number,
): Promise<SvsResult[]> {
  const body = objectOf(await oracleRequest(`/states/${stateNumber}/svs`));
  return listOf(body.matches).flatMap((match) => {
    const battleAt = isoFromUnix(match.ts);
    if (!battleAt) return [];
    const winner = toNumber(match.battle_winner);
    return [
      {
        battleAt,
        opponent: toNumber(match.opponent_state_id),
        won: winner === null ? null : winner === stateNumber,
      },
    ];
  });
}

export type StateSummary = {
  stateNumber: number;
  trackedPlayers: number;
  topPlayers: {
    wosId: string | null;
    name: string;
    power: number;
    furnaceLevel: number;
    allianceAbbr: string;
  }[];
  alliances: OpponentAlliance[];
  stats: {
    key: string;
    label: string;
    value: number;
    rank: number;
    outOf: number;
  }[];
};

// State summary: top players, top alliances and stat rankings.
export async function fetchStateSummary(
  stateNumber: number,
): Promise<StateSummary> {
  const body = objectOf(
    await oracleRequest(`/states/${stateNumber}`, {
      notFoundMessage: `WOSOracle does not track state ${stateNumber}.`,
    }),
  );
  return {
    stateNumber,
    trackedPlayers: toNumber(body.tracked_players) ?? 0,
    topPlayers: listOf(body.top_players).map((player) => ({
      wosId: optionalText(player.id),
      name: optionalText(player.name) ?? "",
      power: toNumber(player.power) ?? 0,
      furnaceLevel: toNumber(player.furnace_level) ?? 0,
      allianceAbbr: optionalText(player.alliance_abbr) ?? "",
    })),
    alliances: listOf(body.alliances).flatMap((alliance) => {
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
    }),
    stats: listOf(body.stats).flatMap((stat) => {
      const label = optionalText(stat.label) ?? optionalText(stat.key);
      if (!label) return [];
      return [
        {
          key: optionalText(stat.key) ?? label,
          label,
          value: toNumber(stat.value) ?? 0,
          rank: toNumber(stat.rank) ?? 0,
          outOf: toNumber(stat.out_of) ?? 0,
        },
      ];
    }),
  };
}

export type SvsRecord = {
  record: Record<string, number>;
  recent: {
    battleAt: string;
    opponent: number | null;
    outcome: string;
    prepWon: boolean | null;
    battleWon: boolean | null;
  }[];
};

// A state's SvS history: totals plus the most recent engagements.
export async function fetchSvsRecord(stateNumber: number): Promise<SvsRecord> {
  const body = objectOf(await oracleRequest(`/states/${stateNumber}/svs`));
  const rawRecord =
    body.record &&
    typeof body.record === "object" &&
    !Array.isArray(body.record)
      ? (body.record as Record<string, unknown>)
      : {};
  const record = Object.fromEntries(
    Object.entries(rawRecord).flatMap(([key, value]) => {
      const number = toNumber(value);
      return number === null ? [] : [[key, number]];
    }),
  );
  const outcomeFor = (winner: unknown) => {
    const number = toNumber(winner);
    return number === null ? null : number === stateNumber;
  };
  const recent = listOf(body.matches)
    .flatMap((match) => {
      const battleAt = isoFromUnix(match.ts);
      if (!battleAt) return [];
      return [
        {
          battleAt,
          opponent: toNumber(match.opponent_state_id),
          outcome: optionalText(match.outcome) ?? "",
          prepWon: outcomeFor(match.prep_winner),
          battleWon: outcomeFor(match.battle_winner),
        },
      ];
    })
    .sort((first, second) => second.battleAt.localeCompare(first.battleAt))
    .slice(0, 10);
  return { record, recent };
}
