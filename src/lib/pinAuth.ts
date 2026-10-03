import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { createAdminClient } from "@/lib/supabase/admin";

// Sign-in with WOS ID and PIN, on top of Supabase Auth email logins.
//
// The Supabase password is an HMAC of the PIN keyed with AUTH_PIN_PEPPER, so
// a PIN cannot be guessed against Supabase directly: every attempt goes
// through /api/auth/*, which locks a WOS ID after a few wrong PINs.

type AdminClient = ReturnType<typeof createAdminClient>;

export const PIN_PATTERN = /^[0-9]{6,12}$/;
export const WOS_ID_PATTERN = /^[0-9]{1,20}$/;

// Wrong PINs allowed before a lock, per network address and in total. The
// per-address limit stops guessing; the higher total stops guessing from many
// addresses without letting one person lock a player out.
export const SIGN_IN_LIMITS = { perAddress: 5, total: 30 };
// A join link's first-time PIN is shared by the whole state.
export const JOIN_LINK_LIMITS = { perAddress: 10, total: 60 };
export const LOCK_MINUTES = 15;

export function authConfigProblem(): string | null {
  const pepper = process.env.AUTH_PIN_PEPPER ?? "";
  if (pepper.length < 32) {
    return "AUTH_PIN_PEPPER must be set to a random secret of at least 32 characters.";
  }
  return null;
}

export function pinPassword(userId: string, pin: string) {
  return createHmac("sha256", process.env.AUTH_PIN_PEPPER!)
    .update(`${userId}:${pin}`)
    .digest("base64url");
}

// New logins get an address nobody receives mail at; it is never shown.
export function playerEmail(wosId: string) {
  return `${wosId}@players.wosoverwatch.com`;
}

export function oneTimePin() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function randomPassword() {
  return randomBytes(32).toString("base64url");
}

export function sameText(first: string, second: string) {
  const a = Buffer.from(first);
  const b = Buffer.from(second);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function fail(error: string, status: number, extra?: object) {
  return Response.json({ error, ...extra }, { status });
}

type Guard = { key: string; max: number }[];

// The address Vercel saw the request come from (it overwrites the header).
function clientAddress(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

// key is 'wos:<WOS ID>' or 'link:<token>'.
export function pinGuard(
  key: string,
  request: Request,
  limits: { perAddress: number; total: number },
): Guard {
  return [
    { key: `${key}@${clientAddress(request)}`, max: limits.perAddress },
    { key, max: limits.total },
  ];
}

// When locked, until when (the later lock); otherwise null.
export async function guardLocked(admin: AdminClient, guard: Guard) {
  const locks = await Promise.all(
    guard.map(({ key }) => admin.rpc("pin_locked_until", { p_key: key })),
  );
  return latest(locks.map(({ data }) => (data as string | null) ?? null));
}

// Counts a wrong PIN; answers the lock it caused, if any.
export async function guardFailed(admin: AdminClient, guard: Guard) {
  const locks = await Promise.all(
    guard.map(({ key, max }) =>
      admin.rpc("record_pin_failure", {
        p_key: key,
        p_max: max,
        p_lock_minutes: LOCK_MINUTES,
      }),
    ),
  );
  return latest(locks.map(({ data }) => (data as string | null) ?? null));
}

// After a right PIN, or a reset: forget the wrong ones (all addresses).
export async function clearFailures(admin: AdminClient, key: string) {
  await admin.rpc("clear_pin_failures", { p_key: key });
}

function latest(values: (string | null)[]) {
  return (
    values
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null
  );
}

export function lockedResponse(until: string) {
  const minutes = Math.max(
    1,
    Math.ceil((new Date(until).getTime() - Date.now()) / 60_000),
  );
  return fail(
    `Too many wrong PINs. Try again in ${minutes} minutes.`,
    429,
    { lockedMinutes: minutes },
  );
}

// Checks a PIN without touching the browser session.
export async function pinMatches(email: string, userId: string, pin: string) {
  const client = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password: pinPassword(userId, pin),
  });
  if (data.session) await client.auth.signOut({ scope: "local" });
  return !error;
}

// Signs the browser in: the session lands in the response cookies.
export async function signInWithPin(email: string, userId: string, pin: string) {
  // Loaded here so scripts can use this file outside a request.
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: pinPassword(userId, pin),
  });
  return !error;
}

export async function setPin(
  admin: AdminClient,
  userId: string,
  pin: string,
  mustChange: boolean,
) {
  const { error } = await admin.auth.admin.updateUserById(userId, {
    password: pinPassword(userId, pin),
  });
  if (error) throw new Error(error.message);
  const { error: profileError } = await admin
    .from("profiles")
    .update({ must_change_pin: mustChange })
    .eq("id", userId);
  if (profileError) throw new Error(profileError.message);
}

// The login a WOS ID belongs to, with the email Supabase signs it in with.
export async function findLogin(admin: AdminClient, wosId: string) {
  const { data: account } = await admin
    .from("wos_accounts")
    .select("id, user_id")
    .eq("wos_id", wosId)
    .maybeSingle();
  if (!account) return null;
  const { data } = await admin.auth.admin.getUserById(account.user_id);
  if (!data.user?.email) return null;
  return { accountId: account.id, userId: account.user_id, email: data.user.email };
}

// Creates a login for a WOS ID. The PIN is the player's own, or a one-time
// PIN they must change (mustChange).
export async function createLogin(
  admin: AdminClient,
  wosId: string,
  pin: string,
  mustChange: boolean,
) {
  const { data, error } = await admin.auth.admin.createUser({
    email: playerEmail(wosId),
    password: randomPassword(),
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(error?.message ?? "The login could not be created.");
  }
  const userId = data.user.id;
  try {
    const { data: account, error: accountError } = await admin
      .from("wos_accounts")
      .insert({ user_id: userId, wos_id: wosId })
      .select("id")
      .single();
    if (accountError || !account) {
      throw new Error(accountError?.message ?? "The WOS ID could not be saved.");
    }
    await setPin(admin, userId, pin, mustChange);
    return { userId, accountId: account.id as string, email: playerEmail(wosId) };
  } catch (error) {
    await admin.auth.admin.deleteUser(userId);
    throw error;
  }
}

export async function signedInUser() {
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}
