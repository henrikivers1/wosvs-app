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

export function record(value: unknown): Record<string, unknown> {
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

function textField(value: unknown, field: string) {
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
// WOSOracle allows 50 requests a minute; keep a margin for other callers.
const MINUTE_BUDGET = 45;
// A missing Premium endpoint (402) is remembered for a day.
const PAYMENT_REQUIRED_CACHE_MS = 24 * 60 * 60 * 1000;

export function oracleDailyBudget() {
  const configured = Number(process.env.WOS_ORACLE_DAILY_BUDGET);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_DAILY_BUDGET;
}

function errorMessage(status: number, path: string, notFound?: string) {
  if (status === 404) return notFound ?? "WOSOracle has no data for that.";
  if (status === 402) return "This needs a higher WOSOracle subscription.";
  if (status === 401 || status === 403) {
    return "WOSOracle authentication failed (check WOS_ORACLE_API_KEY).";
  }
  return `WOSOracle returned ${status} for ${path.split("?")[0]}.`;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Counts one upstream request against today's and this minute's quota
// (stored in Supabase, so shared by every server instance). Background jobs
// wait for the next minute when the minute budget is used; people get a
// "try again" error instead.
async function reserveOracleRequest(waitForMinute: boolean) {
  if (!hasAdminCredentials()) return;
  const admin = createAdminClient();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data, error } = await admin.rpc("reserve_oracle_request");
    if (error) {
      // Before the migration ran: fall back to the daily counter only.
      const legacy = await admin.rpc("count_oracle_request");
      if (typeof legacy.data === "number" && legacy.data > oracleDailyBudget()) {
        throw new OraclePlayerError(
          "Today's WOSOracle request budget is used up. Try again after 00:00 UTC.",
          429,
        );
      }
      return;
    }
    const usage = data as { day: number; minute: number };
    if (usage.day > oracleDailyBudget()) {
      throw new OraclePlayerError(
        "Today's WOSOracle request budget is used up. Try again after 00:00 UTC.",
        429,
      );
    }
    if (usage.minute <= MINUTE_BUDGET) return;
    if (!waitForMinute || attempt > 0) {
      throw new OraclePlayerError(
        "WOSOracle is busy right now. Try again in a minute.",
        429,
      );
    }
    await sleep(60_000 - (Date.now() % 60_000) + 250);
  }
}

type CacheRow = { status: number; body: unknown; fetched_at: string };

async function readCache(path: string): Promise<CacheRow | null> {
  if (!hasAdminCredentials()) return null;
  const { data } = await createAdminClient()
    .from("oracle_cache")
    .select("status, body, fetched_at")
    .eq("path", path)
    .maybeSingle();
  return (data as CacheRow | null) ?? null;
}

async function writeCache(path: string, status: number, body: unknown) {
  if (!hasAdminCredentials()) return;
  await createAdminClient()
    .from("oracle_cache")
    .upsert({ path, status, body, fetched_at: new Date().toISOString() });
}

export type OracleRequestOptions = {
  // Serve a stored response younger than this instead of a new request.
  maxAgeSeconds?: number;
  notFoundMessage?: string;
  // Background jobs wait for the next minute instead of failing.
  waitForMinute?: boolean;
};

// Performs an authenticated GET against the WOSOracle public API and returns
// the parsed JSON body. Responses (and 402/404 answers) are cached in the
// database; only real upstream requests count against the quota.
export async function oracleRequest(
  path: string,
  options: OracleRequestOptions = {},
): Promise<unknown> {
  const cached = await readCache(path).catch(() => null);
  if (cached) {
    const age = Date.now() - new Date(cached.fetched_at).getTime();
    const maxAgeMs =
      cached.status === 402
        ? PAYMENT_REQUIRED_CACHE_MS
        : (options.maxAgeSeconds ?? 0) * 1000;
    if (age < maxAgeMs) {
      if (cached.status === 200) return cached.body;
      throw new OraclePlayerError(
        errorMessage(cached.status, path, options.notFoundMessage),
        cached.status,
      );
    }
  }

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

  await reserveOracleRequest(options.waitForMinute ?? false);

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      headers,
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch {
    throw new OraclePlayerError("WOSOracle could not be reached.", 502);
  }

  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 500);
    console.error(`[wosOracle] GET ${path} -> ${response.status}`, detail);
    if (response.status === 402 || response.status === 404) {
      await writeCache(path, response.status, null).catch(() => undefined);
    }
    throw new OraclePlayerError(
      errorMessage(response.status, path, options.notFoundMessage),
      response.status,
    );
  }

  const rawBody = await response.text();
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    console.error(
      "[wosOracle] Non-JSON response:",
      response.headers.get("content-type"),
      rawBody.slice(0, 500),
    );
    throw new OraclePlayerError("WOSOracle returned a non-JSON response.", 502);
  }
  if (options.maxAgeSeconds) {
    await writeCache(path, 200, body).catch(() => undefined);
  }
  return body;
}

export async function fetchOraclePlayer(
  wosId: string,
  options: Pick<OracleRequestOptions, "waitForMinute"> = {},
): Promise<OraclePlayer> {
  if (!/^[0-9]+$/.test(wosId)) {
    throw new OraclePlayerError("A numeric WOS ID is required.", 400);
  }

  const responseBody = await oracleRequest(
    `/players/${encodeURIComponent(wosId)}`,
    { notFoundMessage: "That WOS player was not found.", ...options },
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
