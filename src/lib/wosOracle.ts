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

function textField(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new OraclePlayerError(`WOSOracle response is missing ${field}.`, 502);
  }
  return value.trim();
}

function numberField(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new OraclePlayerError(
      `WOSOracle response contains an invalid ${field}.`,
      502,
    );
  }
  return Math.trunc(value);
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
  if (value === null || value === undefined) return null;
  const alliance = record(value);
  return {
    id: numberField(alliance.id, "alliance id"),
    abbr: textField(alliance.abbr, "alliance abbreviation"),
    name: textField(alliance.name, "alliance name"),
  };
}

export function fireCrystalLevel(rawFurnaceLevel: number) {
  return Math.max(0, Math.min(10, rawFurnaceLevel - 30));
}

export async function fetchOraclePlayer(wosId: string): Promise<OraclePlayer> {
  if (!/^[0-9]+$/.test(wosId)) {
    throw new OraclePlayerError("A numeric WOS ID is required.", 400);
  }

  const baseUrl = (
    process.env.WOS_ORACLE_API_BASE_URL ?? DEFAULT_ORACLE_API_BASE_URL
  ).replace(/\/$/, "");
  const headers = new Headers({ Accept: "application/json" });
  const apiKey = process.env.WOS_ORACLE_API_KEY;

  if (apiKey) {
    const headerName =
      process.env.WOS_ORACLE_API_AUTH_HEADER ?? "Authorization";
    const scheme = process.env.WOS_ORACLE_API_AUTH_SCHEME ?? "Bearer";
    headers.set(headerName, scheme ? `${scheme} ${apiKey}` : apiKey);
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/players/${encodeURIComponent(wosId)}`, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new OraclePlayerError("WOSOracle could not be reached.", 502);
  }

  if (!response.ok) {
    const message =
      response.status === 404
        ? "That WOS player was not found."
        : response.status === 401 || response.status === 403
          ? "WOSOracle authentication failed."
          : `WOSOracle returned ${response.status}.`;
    throw new OraclePlayerError(message, response.status);
  }

  let responseBody: unknown;
  try {
    responseBody = await response.json();
  } catch {
    throw new OraclePlayerError("WOSOracle returned a non-JSON response.", 502);
  }

  const payload = record(responseBody);
  const returnedId = textField(String(payload.id ?? ""), "player id");
  if (returnedId !== wosId) {
    throw new OraclePlayerError("WOSOracle returned a different player.", 502);
  }

  const furnaceLevel = numberField(payload.furnace_level, "furnace level");
  if (furnaceLevel < 1 || furnaceLevel > 40) {
    throw new OraclePlayerError(
      "WOSOracle returned an unsupported furnace level.",
      502,
    );
  }

  const updatedAt = textField(payload.updated_at, "update time");
  if (Number.isNaN(Date.parse(updatedAt))) {
    throw new OraclePlayerError(
      "WOSOracle returned an invalid update time.",
      502,
    );
  }

  return {
    id: returnedId,
    name: textField(payload.name, "player name").slice(0, 100),
    avatarUrl: safeAvatarUrl(payload.avatar_url),
    state: numberField(payload.state, "state"),
    furnaceLevel,
    power: numberField(payload.power, "power"),
    chiefLevel: numberField(payload.level, "chief level"),
    vipLevel: numberField(payload.vip, "VIP level"),
    kills: numberField(payload.kills, "kills"),
    labyrinthScore: numberField(payload.labyrinth_score, "Labyrinth score"),
    alliance: parseAlliance(payload.alliance),
    active: payload.active === true,
    updatedAt,
  };
}
