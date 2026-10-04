import { savePlayer } from "@/lib/playerSync";
import { createAdminClient, hasAdminCredentials } from "@/lib/supabase/admin";
import {
  authConfigProblem,
  clearFailures,
  createLogin,
  fail,
  findLogin,
  guardFailed,
  guardLocked,
  JOIN_LINK_LIMITS,
  lockedResponse,
  PIN_PATTERN,
  pinGuard,
  sameText,
  SIGN_IN_LIMITS,
  signInWithPin,
  WOS_ID_PATTERN,
} from "@/lib/pinAuth";
import { fetchOraclePlayer, OraclePlayerError } from "@/lib/wosOracle";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
const GONE = "This join link no longer works. Ask your state leader for the new one.";

function configured() {
  const problem = authConfigProblem();
  if (problem) console.error(`[auth-join] ${problem}`);
  return !problem && hasAdminCredentials();
}

async function loadLink(token: string) {
  if (!TOKEN_PATTERN.test(token)) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("state_join_links")
    .select("state_id, pin, states!inner(name, game_state_number)")
    .eq("token", token)
    .maybeSingle();
  if (!data) return null;
  const state = data.states as unknown as {
    name: string;
    game_state_number: number | null;
  };
  return { stateId: data.state_id as string, pin: data.pin as string, state };
}

// The state a join link leads to, for the join page.
export async function GET(request: Request) {
  if (!configured()) return fail("Joining is not configured on the server.", 500);
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const link = await loadLink(token);
  if (!link) return fail(GONE, 404);
  return Response.json({
    stateName: link.state.name,
    stateNumber: link.state.game_state_number,
  });
}

// Joins a state with its link and first-time PIN.
//
// Without `pin`: checks the first-time PIN and that WOSOracle lists the WOS
// ID in the state, and answers whether it is new ("new") or already has a
// login ("existing").
// With `pin`: a new player sets it as their own PIN; an existing player signs
// in with theirs. Either way they become a member and are signed in.
export async function POST(request: Request) {
  if (!configured()) return fail("Joining is not configured on the server.", 500);

  let body: { token?: unknown; linkPin?: unknown; wosId?: unknown; pin?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail("Invalid request body.", 400);
  }
  const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  const token = text(body.token);
  const linkPin = text(body.linkPin);
  const wosId = text(body.wosId);
  const pin = text(body.pin);
  if (!WOS_ID_PATTERN.test(wosId)) return fail("Enter your WOS ID (numbers only).", 400);

  const link = await loadLink(token);
  if (!link) return fail(GONE, 404);

  const admin = createAdminClient();
  const linkGuard = pinGuard(`link:${token}`, request, JOIN_LINK_LIMITS);
  const linkLocked = await guardLocked(admin, linkGuard);
  if (linkLocked) return lockedResponse(linkLocked);
  if (!sameText(linkPin, link.pin)) {
    const lock = await guardFailed(admin, linkGuard);
    if (lock) return lockedResponse(lock);
    return fail("Wrong first-time PIN.", 401);
  }

  if (!link.state.game_state_number) {
    return fail(
      "This state has no in-game state number yet. Ask your state leader.",
      409,
    );
  }

  let player;
  try {
    player = await fetchOraclePlayer(wosId);
  } catch (error) {
    if (error instanceof OraclePlayerError) {
      return fail(
        error.status === 404
          ? "WOSOracle does not know that WOS ID. Check it in your in-game profile."
          : "Your WOS ID could not be checked right now. Try again in a minute.",
        error.status === 404 ? 404 : 503,
      );
    }
    console.error("[auth-join] Player lookup failed:", error);
    return fail("Your WOS ID could not be checked right now.", 503);
  }
  if (player.state !== link.state.game_state_number) {
    return fail(
      `${player.name} is in state ${player.state ?? "?"}, not state ${link.state.game_state_number}.`,
      403,
    );
  }

  const existing = await findLogin(admin, wosId);
  if (!pin) {
    return Response.json({
      status: existing ? "existing" : "new",
      nickname: player.name,
      avatarUrl: player.avatarUrl,
    });
  }
  if (!PIN_PATTERN.test(pin)) return fail("Your PIN needs 6 to 12 digits.", 400);

  let login = existing;
  if (login) {
    const key = `wos:${wosId}`;
    const guard = pinGuard(key, request, SIGN_IN_LIMITS);
    const locked = await guardLocked(admin, guard);
    if (locked) return lockedResponse(locked);
    if (!(await signInWithPin(login.email, login.userId, pin))) {
      const lock = await guardFailed(admin, guard);
      if (lock) return lockedResponse(lock);
      return fail("Wrong PIN for this WOS ID.", 401);
    }
    await clearFailures(admin, key);
  } else {
    try {
      login = await createLogin(admin, wosId, pin, false);
    } catch (error) {
      console.error("[auth-join] Login creation failed:", error);
      return fail(
        "Your login could not be created. If you joined a moment ago, sign in instead.",
        409,
      );
    }
    if (!(await signInWithPin(login.email, login.userId, pin))) {
      return fail("Your login was created. Sign in with your WOS ID and PIN.", 500);
    }
  }

  try {
    await savePlayer(admin, login.accountId, player);
  } catch (error) {
    // The weekly sync fills it in later.
    console.error("[auth-join] Saving player data failed:", error);
  }
  const { error: memberError } = await admin
    .from("state_members")
    .upsert(
      { state_id: link.stateId, wos_account_id: login.accountId, role: "member" },
      { onConflict: "state_id,wos_account_id", ignoreDuplicates: true },
    );
  if (memberError) {
    console.error("[auth-join] Membership failed:", memberError);
    return fail("You are signed in, but joining the state failed. Try the link again.", 500);
  }
  return Response.json({ ok: true, stateId: link.stateId });
}
