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

export type AllianceProfile = {
  id: number;
  abbr: string;
  name: string;
  state: number | null;
  memberCount: number;
  power: number;
};

// One alliance by its WOSOracle id; works for shell alliances that are not
// in a state's top list.
export async function fetchAllianceProfile(
  allianceId: number,
  stateNumber: number | null,
): Promise<AllianceProfile> {
  const query = stateNumber ? `?kid=${stateNumber}` : "";
  const body = objectOf(
    await oracleRequest(`/alliances/${allianceId}${query}`, {
      revalidateSeconds: CACHE_SECONDS,
      notFoundMessage: "WOSOracle does not know that alliance ID.",
    }),
  );
  return {
    id: toNumber(body.id) ?? allianceId,
    abbr: optionalText(body.abbr) ?? "",
    name: optionalText(body.name) ?? "",
    state: toNumber(body.state),
    memberCount: toNumber(body.member_count) ?? 0,
    power: toNumber(body.power) ?? 0,
  };
}

const TOP_PLAYER_COUNT = 20;
const ROSTERS_FOR_TOP_PLAYERS = 5;

export type LeaderboardEntry = {
  rank: number;
  wosId: string | null;
  name: string;
  allianceAbbr: string;
  power: number;
  score: number;
};

// Premium: a state's ranking board, top 100 (3 = Personal Power,
// 20 = Labyrinth). Throws OraclePlayerError 402 on the base plan.
export async function fetchLeaderboard(
  stateNumber: number,
  boardType: number,
): Promise<LeaderboardEntry[]> {
  const body = objectOf(
    await oracleRequest(
      `/states/${stateNumber}/leaderboards/${boardType}?cached=1`,
      { revalidateSeconds: CACHE_SECONDS },
    ),
  );
  return listOf(body.entries).map((entry) => ({
    rank: toNumber(entry.rank) ?? 0,
    wosId: optionalText(entry.player_id),
    name: optionalText(entry.name) ?? "",
    allianceAbbr: optionalText(entry.alliance) ?? "",
    power: toNumber(entry.power) ?? 0,
    score: toNumber(entry.score) ?? 0,
  }));
}

const PERSONAL_POWER_BOARD = 3;

// A state's strongest players. With Premium this is the Personal Power
// board; on the base plan the strongest alliance rosters are merged.
export async function fetchTopPlayers(
  summary: StateSummary,
): Promise<StateSummary["topPlayers"]> {
  try {
    const board = await fetchLeaderboard(
      summary.stateNumber,
      PERSONAL_POWER_BOARD,
    );
    if (board.length) {
      return board
        .filter((entry) => entry.name)
        .slice(0, TOP_PLAYER_COUNT)
        .map((entry) => ({
          wosId: entry.wosId,
          name: entry.name,
          power: entry.power || entry.score,
          furnaceLevel: 0,
          allianceAbbr: entry.allianceAbbr,
        }));
    }
  } catch (error) {
    // 402 = base plan: fall back to merging rosters below.
    if (!(error instanceof OraclePlayerError) || error.status !== 402) {
      throw error;
    }
  }

  const players = new Map<string, StateSummary["topPlayers"][number]>();
  const add = (player: StateSummary["topPlayers"][number]) => {
    const key = player.wosId ?? `name:${player.name.toLowerCase()}`;
    const known = players.get(key);
    if (!known || player.power > known.power) players.set(key, player);
  };
  summary.topPlayers.forEach(add);

  const strongest = [...summary.alliances]
    .sort((first, second) => second.power - first.power)
    .slice(0, ROSTERS_FOR_TOP_PLAYERS);
  const rosters = await Promise.allSettled(
    strongest.map((alliance) =>
      fetchAllianceRoster(alliance.id, summary.stateNumber).then((members) =>
        members.map((member) => ({
          wosId: member.wosId,
          name: member.name,
          power: member.power,
          furnaceLevel: member.furnaceLevel,
          allianceAbbr: alliance.abbr,
        })),
      ),
    ),
  );
  rosters.forEach((result) => {
    if (result.status === "fulfilled") result.value.forEach(add);
  });

  return [...players.values()]
    .sort((first, second) => second.power - first.power)
    .slice(0, TOP_PLAYER_COUNT);
}
