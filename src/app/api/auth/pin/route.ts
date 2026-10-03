import { createAdminClient, hasAdminCredentials } from "@/lib/supabase/admin";
import {
  authConfigProblem,
  clearFailures,
  fail,
  guardFailed,
  guardLocked,
  lockedResponse,
  PIN_PATTERN,
  pinGuard,
  pinMatches,
  setPin,
  SIGN_IN_LIMITS,
  signedInUser,
} from "@/lib/pinAuth";

// Changes the signed-in player's PIN. The current PIN is needed unless the
// player signed in with a one-time PIN and must choose a new one.
export async function POST(request: Request) {
  const problem = authConfigProblem();
  if (problem || !hasAdminCredentials()) {
    if (problem) console.error(`[auth-pin] ${problem}`);
    return fail("Sign-in is not configured on the server.", 500);
  }
  const { user } = await signedInUser();
  if (!user?.email) return fail("Authentication required.", 401);

  let body: { currentPin?: unknown; newPin?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail("Invalid request body.", 400);
  }
  const currentPin =
    typeof body.currentPin === "string" ? body.currentPin.trim() : "";
  const newPin = typeof body.newPin === "string" ? body.newPin.trim() : "";
  if (!PIN_PATTERN.test(newPin)) {
    return fail("Your PIN needs 6 to 12 digits.", 400);
  }

  const admin = createAdminClient();
  const [{ data: profile }, { data: account }] = await Promise.all([
    admin
      .from("profiles")
      .select("must_change_pin")
      .eq("id", user.id)
      .maybeSingle(),
    admin.from("wos_accounts").select("wos_id").eq("user_id", user.id).maybeSingle(),
  ]);

  if (!profile?.must_change_pin) {
    const key = `wos:${account?.wos_id ?? user.id}`;
    const guard = pinGuard(key, request, SIGN_IN_LIMITS);
    const locked = await guardLocked(admin, guard);
    if (locked) return lockedResponse(locked);
    if (!PIN_PATTERN.test(currentPin) || !(await pinMatches(user.email, user.id, currentPin))) {
      const lock = await guardFailed(admin, guard);
      if (lock) return lockedResponse(lock);
      return fail("Your current PIN is wrong.", 401);
    }
    await clearFailures(admin, key);
  }

  try {
    await setPin(admin, user.id, newPin, false);
  } catch (error) {
    console.error("[auth-pin] PIN change failed:", error);
    return fail("Your PIN could not be changed.", 500);
  }
  return Response.json({ ok: true });
}
