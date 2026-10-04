import { createAdminClient, hasAdminCredentials } from "@/lib/supabase/admin";
import { authConfigProblem, fail, signedInUser } from "@/lib/pinAuth";

// The people running Overwatch are the WOS IDs in OPERATOR_WOS_IDS. Answers
// the admin client for them, an error response for everyone else.

function operatorWosIds() {
  return (process.env.OPERATOR_WOS_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

export async function requireOperator() {
  const problem = authConfigProblem();
  if (problem || !hasAdminCredentials()) {
    if (problem) console.error(`[operator] ${problem}`);
    return fail("The server is not configured correctly.", 500);
  }
  const { user } = await signedInUser();
  if (!user) return fail("Authentication required.", 401);
  const operators = operatorWosIds();
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

// Tells every operator who has a login, for example when a player joins a
// state. Never fails the caller: a missed notice is only logged.
export async function notifyOperators(
  admin: ReturnType<typeof createAdminClient>,
  notice: {
    type: string;
    title: string;
    body: string;
    stateId?: string;
    data?: Record<string, unknown>;
  },
) {
  const operators = operatorWosIds();
  if (!operators.length) return;
  const { data: accounts, error } = await admin
    .from("wos_accounts")
    .select("id, user_id")
    .in("wos_id", operators)
    .not("user_id", "is", null);
  if (error) {
    console.error("[operator] Finding operators failed:", error);
    return;
  }
  if (!accounts?.length) return;
  const { error: insertError } = await admin.from("notifications").insert(
    accounts.map((account) => ({
      user_id: account.user_id,
      wos_account_id: account.id,
      state_id: notice.stateId ?? null,
      type: notice.type,
      category: "membership",
      title: notice.title,
      body: notice.body,
      data: notice.data ?? {},
    })),
  );
  if (insertError) console.error("[operator] Notifying operators failed:", insertError);
}
