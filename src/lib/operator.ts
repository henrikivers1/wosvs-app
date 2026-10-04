import { createAdminClient, hasAdminCredentials } from "@/lib/supabase/admin";
import { authConfigProblem, fail, signedInUser } from "@/lib/pinAuth";

// The people running Overwatch are the WOS IDs in OPERATOR_WOS_IDS. Answers
// the admin client for them, an error response for everyone else.

export async function requireOperator() {
  const problem = authConfigProblem();
  if (problem || !hasAdminCredentials()) {
    if (problem) console.error(`[operator] ${problem}`);
    return fail("The server is not configured correctly.", 500);
  }
  const { user } = await signedInUser();
  if (!user) return fail("Authentication required.", 401);
  const operators = (process.env.OPERATOR_WOS_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const admin = createAdminClient();
  const { data: account } = await admin
    .from("wos_accounts")
    .select("wos_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!account || !operators.includes(account.wos_id)) {
    return fail("Only Overwatch operators can do this.", 403);
  }
  return admin;
}
