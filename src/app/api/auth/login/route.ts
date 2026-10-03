import { hasAdminCredentials, createAdminClient } from "@/lib/supabase/admin";
import {
  authConfigProblem,
  clearFailures,
  fail,
  findLogin,
  guardFailed,
  guardLocked,
  lockedResponse,
  PIN_PATTERN,
  pinGuard,
  SIGN_IN_LIMITS,
  signInWithPin,
  WOS_ID_PATTERN,
} from "@/lib/pinAuth";

const WRONG = "Wrong WOS ID or PIN.";

// Signs in with WOS ID and PIN. Answers { mustChangePin } on success.
export async function POST(request: Request) {
  const problem = authConfigProblem();
  if (problem || !hasAdminCredentials()) {
    if (problem) console.error(`[auth-login] ${problem}`);
    return fail("Sign-in is not configured on the server.", 500);
  }

  let body: { wosId?: unknown; pin?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail("Invalid request body.", 400);
  }
  const wosId = typeof body.wosId === "string" ? body.wosId.trim() : "";
  const pin = typeof body.pin === "string" ? body.pin.trim() : "";
  if (!WOS_ID_PATTERN.test(wosId) || !PIN_PATTERN.test(pin)) {
    return fail(WRONG, 400);
  }

  const admin = createAdminClient();
  const key = `wos:${wosId}`;
  const guard = pinGuard(key, request, SIGN_IN_LIMITS);
  const locked = await guardLocked(admin, guard);
  if (locked) return lockedResponse(locked);

  const login = await findLogin(admin, wosId);
  if (!login || !(await signInWithPin(login.email, login.userId, pin))) {
    const lock = await guardFailed(admin, guard);
    if (lock) return lockedResponse(lock);
    return fail(WRONG, 401);
  }
  await clearFailures(admin, key);

  const { data: profile } = await admin
    .from("profiles")
    .select("must_change_pin")
    .eq("id", login.userId)
    .maybeSingle();
  return Response.json({ mustChangePin: profile?.must_change_pin ?? false });
}
