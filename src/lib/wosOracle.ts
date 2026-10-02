import { createAdminClient, hasAdminCredentials } from "@/lib/supabase/admin";

const DEFAULT_ORACLE_API_BASE_URL = "https://wosoracle.com/api/v1";

type OracleAlliance = {
  id: number;
  abbr: string;
  name: string;
};

export type OraclePlayer = {
  id: string;
  name: string;
  avatarUrl: string | null;
  state: number;
  furnaceLevel: number;
  power: number;
  chiefLevel: number;
  vipLevel: number;
  kills: number;
  labyrinthScore: number;
  alliance: OracleAlliance | null;
  active: boolean;
  updatedAt: string;
};

export class OraclePlayerError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new OraclePlayerError("WOSOracle returned an invalid response.", 502);
  }
  return value as Record<string, unknown>;
}

// Accept both a bare player object and common envelopes such as
// { data: {...} } or { player: {...} }.
function unwrapPlayer(value: unknown): Record<string, unknown> {
  let payload = record(value);
  for (const key of ["data", "player", "result"]) {
    const inner = payload[key];
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      payload = inner as Record<string, unknown>;
    }
  }
  return payload;
}

function pick(payload: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    if (payload[key] !== undefined && payload[key] !== null) {
      return payload[key];
    }
  }
  return undefined;
}

export function textField(value: unknown, field: string) {
  const text =
    typeof value === "string"
      ? value.trim()
      : typeof value === "number"
        ? String(value)
        : "";
  if (!text) {
    throw new OraclePlayerError(`WOSOracle response is missing ${field}.`, 502);
  }
  return text;
}

export function optionalText(value: unknown) {
  if (typeof value === "number") return String(value);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

// Large numbers such as power are often serialised as strings.
export function toNumber(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value.replace(/[,_\s]/g, ""))
        : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : null;
}

function numberField(value: unknown, field: string) {
  const parsed = toNumber(value);
  if (parsed === null) {
    throw new OraclePlayerError(
      `WOSOracle response contains an invalid ${field}.`,
      502,
    );
  }
  return parsed;
}

function optionalNumber(value: unknown) {
  return toNumber(value) ?? 0;
}

function safeAvatarUrl(value: unknown) {
  if (typeof value !== "string" || !value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function parseAlliance(value: unknown): OracleAlliance | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const alliance = value as Record<string, unknown>;
  const id = toNumber(alliance.id);
  const abbr = optionalText(pick(alliance, "abbr", "tag", "short_name"));
  const name = optionalText(alliance.name);
  if (id === null || (!abbr && !name)) return null;
  return { id, abbr: abbr ?? "", name: name ?? abbr ?? "" };
}

const DEFAULT_DAILY_BUDGET = 950;

export function oracleDailyBudget() {
  const configured = Number(process.env.WOS_ORACLE_DAILY_BUDGET);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_DAILY_BUDGET;
}

// Counts every request against today's WOSOracle quota (stored in Supabase so
// it is shared by all server instances) and refuses once the budget is used.
async function reserveOracleRequest() {
  if (!hasAdminCredentials()) return;
  const { data, error } = await createAdminClient().rpc("count_oracle_request");
  if (error) {
    // Counting must never block a request (e.g. before the migration ran).
    console.error("[wosOracle] Could not count request:", error.message);
    return;
  }
  if (typeof data === "number" && data > oracleDailyBudget()) {
    throw new OraclePlayerError(
      "Today's WOSOracle request budget is used up. Try again after 00:00 UTC.",
      429,
    );
  }
}

// Performs an authenticated GET against the WOSOracle public API and returns
// the parsed JSON body. `revalidateSeconds` lets Next cache responses that do
// not need to be live (matchups, rosters) to save API quota.
export async function oracleRequest(
  path: string,
  options: { revalidateSeconds?: number; notFoundMessage?: string } = {},
): Promise<unknown> {
  const baseUrl = (
    process.env.WOS_ORACLE_API_BASE_URL ?? DEFAULT_ORACLE_API_BASE_URL
  ).replace(/\/$/, "");
  const headers = new Headers({ Accept: "application/json" });
  // Strip whitespace and accidental surrounding quotes from .env values.
  const apiKey = process.env.WOS_ORACLE_API_KEY?.trim().replace(
    /^(["'])(.*)\1$/,
    "$2",
  );

  if (apiKey) {
    const headerName =
      process.env.WOS_ORACLE_API_AUTH_HEADER ?? "Authorization";
    const scheme = process.env.WOS_ORACLE_API_AUTH_SCHEME ?? "Bearer";
    headers.set(headerName, scheme ? `${scheme} ${apiKey}` : apiKey);
  }

  await reserveOracleRequest();

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      headers,
      signal: AbortSignal.timeout(15_000),
      ...(options.revalidateSeconds
        ? { next: { revalidate: options.revalidateSeconds } }
        : { cache: "no-store" as const }),
    });
  } catch {
    throw new OraclePlayerError("WOSOracle could not be reached.", 502);
  }

  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 500);
    console.error(`[wosOracle] GET ${path} -> ${response.status}`, detail);
    const message =
      response.status === 404
        ? (options.notFoundMessage ?? "WOSOracle has no data for that.")
        : response.status === 401 || response.status === 403
          ? `WOSOracle authentication failed${apiKey ? " (API key rejected)" : " (no API key configured)"}.`
          : response.status === 402
            ? "This needs a higher WOSOracle subscription."
            : `WOSOracle returned ${response.status}.`;
    throw new OraclePlayerError(message, response.status);
  }

  const rawBody = await response.text();
  try {
    return JSON.parse(rawBody);
  } catch {
    console.error(
      "[wosOracle] Non-JSON response:",
      response.headers.get("content-type"),
      rawBody.slice(0, 500),
    );
    throw new OraclePlayerError("WOSOracle returned a non-JSON response.", 502);
  }
}

export async function fetchOraclePlayer(wosId: string): Promise<OraclePlayer> {
  if (!/^[0-9]+$/.test(wosId)) {
    throw new OraclePlayerError("A numeric WOS ID is required.", 400);
  }

  const responseBody = await oracleRequest(
    `/players/${encodeURIComponent(wosId)}`,
    { notFoundMessage: "That WOS player was not found." },
  );

  try {
    return parsePlayer(unwrapPlayer(responseBody), wosId);
  } catch (error) {
    console.error(
      "[wosOracle] Unexpected response shape:",
      JSON.stringify(responseBody).slice(0, 1000),
    );
    throw error;
  }
}

function parsePlayer(
  payload: Record<string, unknown>,
  wosId: string,
): OraclePlayer {
  const returnedId = textField(
    pick(payload, "id", "fid", "player_id"),
    "player id",
  );
  if (returnedId !== wosId) {
    throw new OraclePlayerError("WOSOracle returned a different player.", 502);
  }

  const furnaceLevel = numberField(
    pick(payload, "furnace_level", "stove_lv", "furnace"),
    "furnace level",
  );
  if (furnaceLevel < 1) {
    throw new OraclePlayerError(
      "WOSOracle returned an unsupported furnace level.",
      502,
    );
  }

  const reportedUpdate = optionalText(pick(payload, "updated_at", "updatedAt"));
  const updatedAt =
    reportedUpdate && !Number.isNaN(Date.parse(reportedUpdate))
      ? reportedUpdate
      : new Date().toISOString();

  return {
    id: returnedId,
    name: textField(pick(payload, "name", "nickname"), "player name").slice(
      0,
      100,
    ),
    avatarUrl: safeAvatarUrl(pick(payload, "avatar_url", "avatar_image")),
    state: numberField(pick(payload, "state", "kid", "state_id"), "state"),
    furnaceLevel,
    power: optionalNumber(payload.power),
    chiefLevel: optionalNumber(pick(payload, "level", "chief_level")),
    vipLevel: optionalNumber(pick(payload, "vip", "vip_level")),
    kills: optionalNumber(payload.kills),
    labyrinthScore: optionalNumber(payload.labyrinth_score),
    alliance: parseAlliance(payload.alliance),
    active: payload.active !== false,
    updatedAt,
  };
}
