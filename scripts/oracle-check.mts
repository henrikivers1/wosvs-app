// Checks every WOSOracle endpoint Overwatch uses against the live API, with
// the app's own parsing code, and saves the raw answers for review.
//
//   npm run oracle:check -- --state 1234 --player 123456789 [--alliance 5678]
//
// Reads WOS_ORACLE_API_KEY (and the optional WOS_ORACLE_* settings) from
// .env.local or the environment. It never touches the database: the request
// cache and budget are skipped, so every answer is live. About 20 requests.

import { writeFileSync } from "node:fs";
import {
  fetchOraclePlayer,
  oracleRequest,
  OraclePlayerError,
} from "@/lib/wosOracle";
import {
  fetchAlliance,
  fetchStateSummary,
  fetchSvsForecast,
  fetchSvsMatchup,
  fetchSvsRecord,
  type StateSummary,
} from "@/lib/wosOracleState";

const OUTPUT_FILE = "oracle-check-output.json";
// Leaderboard types to probe; 3 (Personal Power) is the one Overwatch uses.
const LEADERBOARD_TYPES = Array.from({ length: 12 }, (_, index) => index + 1);

try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: use the environment as it is.
}
// Keep this run live and away from the database.
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
const logError = console.error;
console.error = (...args: unknown[]) => {
  const text = String(args[0]);
  if (text.startsWith("[supabase-admin]")) return;
  // Probing boards that do not exist is expected.
  if (text.includes("/leaderboards/") && text.includes("-> 404")) return;
  logError(...args);
};

function argument(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index > 0 ? process.argv[index + 1] : undefined;
}

const stateNumber = Number(argument("state"));
const wosId = argument("player");
const allianceArgument = argument("alliance");
if (!Number.isInteger(stateNumber) || stateNumber < 1 || !wosId) {
  console.log(
    "Usage: npm run oracle:check -- --state <your state number> --player <your WOS ID> [--alliance <alliance ID>]",
  );
  process.exit(1);
}
if (!process.env.WOS_ORACLE_API_KEY) {
  console.log("WOS_ORACLE_API_KEY is not set (in .env.local or the environment).");
  process.exit(1);
}

// Record every raw answer, keyed by path, without the key or headers.
const raw: Record<string, { status: number; body: unknown }> = {};
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const response = await realFetch(input, init);
  const url = new URL(String(input instanceof Request ? input.url : input));
  const text = await response.clone().text();
  let body: unknown = text.slice(0, 2000);
  try {
    body = JSON.parse(text);
  } catch {
    // Keep the start of a non-JSON answer as text.
  }
  raw[url.pathname + url.search] = { status: response.status, body };
  return response;
};

let failures = 0;
let warnings = 0;
const ok = (message: string) => console.log(`  ✓ ${message}`);
const warn = (message: string) => {
  warnings += 1;
  console.log(`  ! ${message}`);
};

async function check(name: string, run: () => Promise<void>) {
  console.log(`\n${name}`);
  try {
    await run();
  } catch (error) {
    failures += 1;
    const status = error instanceof OraclePlayerError ? ` (${error.status})` : "";
    console.log(`  ✗ ${error instanceof Error ? error.message : error}${status}`);
  }
}

let summary = null as StateSummary | null;

await check(`Player ${wosId}`, async () => {
  const player = await fetchOraclePlayer(wosId);
  ok(`${player.name}, state ${player.state}, Furnace ${player.furnaceLevel}, power ${player.power}`);
  ok(`alliance: ${player.alliance ? `[${player.alliance.abbr}] ${player.alliance.name}` : "none"}`);
  if (!player.labyrinthScore) warn("Labyrinth score is 0 or missing: rally lead top-up relies on it");
  if (!player.avatarUrl) warn("no avatar URL");
});

await check(`SvS draw for state ${stateNumber}`, async () => {
  const matchup = await fetchSvsMatchup(stateNumber);
  if (matchup) {
    ok(`season ${matchup.season}, vs state ${matchup.opponent}, battle ${matchup.battleAt}`);
    if (!matchup.battleAt) warn("the draw has no battle time");
  } else {
    const body = Object.values(raw).at(-1)?.body as { matchups?: unknown } | undefined;
    if (Array.isArray(body?.matchups)) {
      ok(`no current draw for this state (${body.matchups.length} matchups listed)`);
    } else {
      warn("the answer has no matchups list: draw detection would never fire");
    }
  }
});

await check("SvS forecast", async () => {
  const forecast = await fetchSvsForecast(stateNumber);
  ok(`draw expected ${forecast.drawExpectedAt ?? "?"}, next battle ${forecast.nextBattleAt ?? "?"}`);
  if (!forecast.drawExpectedAt && !forecast.nextBattleAt) warn("both dates are empty");
});

await check(`State ${stateNumber} summary`, async () => {
  summary = await fetchStateSummary(stateNumber);
  ok(`${summary.trackedPlayers} tracked players, ${summary.topPlayers.length} top players, ${summary.alliances.length} alliances, ${summary.stats.length} stats`);
  if (!summary.topPlayers.length) warn("no top players");
  if (!summary.alliances.length) warn("no alliances: alliance import would be empty");
  if (summary.topPlayers.length && !summary.topPlayers[0].wosId) warn("top players have no IDs");
});

await check("SvS record", async () => {
  const history = await fetchSvsRecord(stateNumber, { fresh: true });
  ok(`record ${JSON.stringify(history.record)}, ${history.recent.length} matches`);
  const latest = history.recent[0];
  if (latest) {
    ok(`latest: ${latest.battleAt} vs ${latest.opponent}, battle won: ${latest.battleWon}`);
    if (latest.battleWon === null && Date.parse(latest.battleAt) < Date.now() - 86_400_000) {
      warn("an old battle has no winner: Victory/Defeat messages would never be sent");
    }
  } else {
    warn("no matches: Victory/Defeat messages would never be sent");
  }
});

await check("Alliance roster", async () => {
  const allianceId = Number(allianceArgument ?? summary?.alliances[0]?.id);
  if (!allianceId) throw new Error("no alliance ID (pass --alliance)");
  const { profile, members } = await fetchAlliance(allianceId, stateNumber);
  ok(`[${profile.abbr}] ${profile.name}, ${members.length} members`);
  if (!members.length) warn("no members");
  if (members.length && members.every((member) => !member.wosId)) warn("members have no WOS IDs");
});

await check("Premium leaderboards", async () => {
  const available: string[] = [];
  for (const type of LEADERBOARD_TYPES) {
    try {
      const body = (await oracleRequest(
        `/states/${stateNumber}/leaderboards/${type}?cached=1`,
      )) as { entries?: unknown[]; name?: unknown; title?: unknown };
      const label = String(body.name ?? body.title ?? "");
      available.push(`${type}${label ? ` ${label}` : ""} (${body.entries?.length ?? "no entries list"})`);
    } catch (error) {
      if (error instanceof OraclePlayerError && error.status === 402) {
        throw new Error("402: this key does not have Premium");
      }
      if (!(error instanceof OraclePlayerError && error.status === 404)) throw error;
    }
  }
  ok(`boards: ${available.join(", ") || "none"}`);
  if (!available.some((board) => board.startsWith("3"))) {
    warn("board 3 (Personal Power) is missing: opponent's top players fall back to alliance rosters");
  }
});

writeFileSync(OUTPUT_FILE, `${JSON.stringify(raw, null, 2)}\n`);
console.log(
  `\n${failures} failed, ${warnings} warnings, ${Object.keys(raw).length} requests.` +
    `\nRaw answers saved to ${OUTPUT_FILE} (game data only, no key).`,
);
process.exit(failures ? 1 : 0);
