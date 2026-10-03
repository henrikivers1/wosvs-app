import {
  OraclePlayerError,
  optionalText,
  oracleRequest,
  record,
  toNumber,
  type OracleRequestOptions,
} from "@/lib/wosOracle";

// WOSOracle endpoints used to prepare a battle: one fetcher per endpoint.
// They read WOSOracle's stored data, so most answers are cached for ten
// minutes in the database (shared by every server instance).
const CACHE_SECONDS = 600;

type Background = Pick<OracleRequestOptions, "waitForMinute">;

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

function listOf(value: unknown) {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}

function isoFromUnix(value: unknown) {
  const seconds = toNumber(value);
  return seconds ? new Date(seconds * 1000).toISOString() : null;
}

// GET /svs/matchups. Never cached: the hourly draw check must see a new
// draw as soon as WOSOracle publishes it.
export async function fetchSvsMatchup(
  stateNumber: number,
  options: Background = {},
): Promise<SvsMatchup | null> {
  const body = record(
    await oracleRequest(`/svs/matchups?sid=${stateNumber}`, options),
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
  return {
    season: toNumber(body.season),
    stateNumber,
    opponent: states.find((state) => state !== stateNumber) ?? null,
    battleAt: isoFromUnix(matchup.battle_ts),
  };
}

export type SvsForecast = {
  drawExpectedAt: string | null;
  nextBattleAt: string | null;
};

// GET /states/{n}/svs/forecast: when the next draw and battle are expected.
export async function fetchSvsForecast(
  stateNumber: number,
  options: Background = {},
): Promise<SvsForecast> {
  const body = record(
    await oracleRequest(`/states/${stateNumber}/svs/forecast`, {
      ...options,
      maxAgeSeconds: CACHE_SECONDS,
    }),
  );
  return {
    drawExpectedAt: isoFromUnix(body.draw_expected_at),
    nextBattleAt: isoFromUnix(body.next_battle_at),
  };
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

// GET /states/{n}: top players, alliances and stat rankings.
export async function fetchStateSummary(
  stateNumber: number,
  options: Background = {},
): Promise<StateSummary> {
  const body = record(
    await oracleRequest(`/states/${stateNumber}`, {
      ...options,
      maxAgeSeconds: CACHE_SECONDS,
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

export type SvsMatch = {
  battleAt: string;
  opponent: number | null;
  outcome: string;
  prepWon: boolean | null;
  // null until WOSOracle has decided the battle.
  battleWon: boolean | null;
};

export type SvsRecord = {
  record: Record<string, number>;
  // Newest first.
  recent: SvsMatch[];
};

// GET /states/{n}/svs: SvS totals and every recorded match. Used for the
// Intel page and to fill in Win/Loss after a battle.
export async function fetchSvsRecord(
  stateNumber: number,
  options: Background & { fresh?: boolean } = {},
): Promise<SvsRecord> {
  const body = record(
    await oracleRequest(`/states/${stateNumber}/svs`, {
      waitForMinute: options.waitForMinute,
      maxAgeSeconds: options.fresh ? 0 : CACHE_SECONDS,
    }),
  );
  const rawRecord =
    body.record &&
    typeof body.record === "object" &&
    !Array.isArray(body.record)
      ? (body.record as Record<string, unknown>)
      : {};
  const outcomeFor = (winner: unknown) => {
    const number = toNumber(winner);
    return number === null ? null : number === stateNumber;
  };
  return {
    record: Object.fromEntries(
      Object.entries(rawRecord).flatMap(([key, value]) => {
        const number = toNumber(value);
        return number === null ? [] : [[key, number]];
      }),
    ),
    recent: listOf(body.matches)
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
      .sort((first, second) => second.battleAt.localeCompare(first.battleAt)),
  };
}

export type AllianceProfile = {
  id: number;
  abbr: string;
  name: string;
  state: number | null;
  memberCount: number;
  power: number;
};

// GET /alliances/{id}: profile and member roster. Works for shell alliances
// that are not in a state's top list.
export async function fetchAlliance(
  allianceId: number,
  stateNumber: number | null,
  options: Background = {},
): Promise<{ profile: AllianceProfile; members: RosterMember[] }> {
  const query = stateNumber ? `?kid=${stateNumber}` : "";
  const body = record(
    await oracleRequest(`/alliances/${allianceId}${query}`, {
      ...options,
      maxAgeSeconds: CACHE_SECONDS,
      notFoundMessage: "WOSOracle does not know that alliance ID.",
    }),
  );
  return {
    profile: {
      id: toNumber(body.id) ?? allianceId,
      abbr: optionalText(body.abbr) ?? "",
      name: optionalText(body.name) ?? "",
      state: toNumber(body.state),
      memberCount: toNumber(body.member_count) ?? 0,
      power: toNumber(body.power) ?? 0,
    },
    members: listOf(body.members)
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
      .sort((first, second) => second.power - first.power),
  };
}

const TOP_PLAYER_COUNT = 20;
const ROSTERS_FOR_TOP_PLAYERS = 5;
const PERSONAL_POWER_BOARD = 3;

// Premium: GET /states/{n}/leaderboards/{type}, top 100 (3 = Personal
// Power). Throws OraclePlayerError 402 on the base plan; that answer is
// remembered for a day, so it costs one request a day at most.
async function fetchLeaderboard(
  stateNumber: number,
  boardType: number,
  options: Background,
) {
  const body = record(
    await oracleRequest(
      `/states/${stateNumber}/leaderboards/${boardType}?cached=1`,
      { ...options, maxAgeSeconds: CACHE_SECONDS },
    ),
  );
  return listOf(body.entries).map((entry) => ({
    wosId: optionalText(entry.player_id),
    name: optionalText(entry.name) ?? "",
    allianceAbbr: optionalText(entry.alliance) ?? "",
    power: toNumber(entry.power) ?? 0,
    score: toNumber(entry.score) ?? 0,
  }));
}

// A state's strongest players. With Premium this is the Personal Power
// board; on the base plan the strongest alliance rosters are merged.
export async function fetchTopPlayers(
  summary: StateSummary,
  options: Background = {},
): Promise<StateSummary["topPlayers"]> {
  try {
    const board = await fetchLeaderboard(
      summary.stateNumber,
      PERSONAL_POWER_BOARD,
      options,
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
      fetchAlliance(alliance.id, summary.stateNumber, options).then(
        ({ members }) =>
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
