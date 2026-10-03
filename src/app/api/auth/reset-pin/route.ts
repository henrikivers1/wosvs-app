import { createAdminClient, hasAdminCredentials } from "@/lib/supabase/admin";
import {
  authConfigProblem,
  clearFailures,
  fail,
  oneTimePin,
  setPin,
  signedInUser,
} from "@/lib/pinAuth";

// Gives a member a one-time PIN (they choose their own on the next sign-in)
// and signs them out everywhere. Owners reset anyone, admins reset members.
// Also how a WOS ID someone else registered goes back to its real player.
export async function POST(request: Request) {
  const problem = authConfigProblem();
  if (problem || !hasAdminCredentials()) {
    if (problem) console.error(`[auth-reset-pin] ${problem}`);
    return fail("Sign-in is not configured on the server.", 500);
  }
  const { supabase, user } = await signedInUser();
  if (!user) return fail("Authentication required.", 401);

  let body: { stateId?: unknown; wosAccountId?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail("Invalid request body.", 400);
  }
  if (typeof body.stateId !== "string" || typeof body.wosAccountId !== "string") {
    return fail("A state and a member are required.", 400);
  }

  // Runs as the signed-in user, so the database checks the roles.
  const { data: targetUserId, error } = await supabase.rpc("authorize_pin_reset", {
    target_state_id: body.stateId,
    target_wos_account_id: body.wosAccountId,
  });
  if (error || typeof targetUserId !== "string") {
    return fail("You cannot reset that player's PIN.", 403);
  }

  const admin = createAdminClient();
  const pin = oneTimePin();
  try {
    await setPin(admin, targetUserId, pin, true);
    await admin.rpc("end_user_sessions", { p_user_id: targetUserId });
    const { data: account } = await admin
      .from("wos_accounts")
      .select("wos_id")
      .eq("id", body.wosAccountId)
      .maybeSingle();
    if (account) await clearFailures(admin, `wos:${account.wos_id}`);
  } catch (resetError) {
    console.error("[auth-reset-pin] Reset failed:", resetError);
    return fail("The PIN could not be reset.", 500);
  }
  return Response.json({ pin });
}
