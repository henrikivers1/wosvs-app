import { createAdminClient, serviceRoleKeyProblem } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type StateAccess = {
  userId: string;
  admin: ReturnType<typeof createAdminClient>;
  gameStateNumber: number | null;
};

// Confirms the signed-in user has a WOS account in the given app state.
// Returns an error Response to send back when they do not.
export async function requireStateMember(
  stateId: string | null,
): Promise<StateAccess | Response> {
  const keyProblem = serviceRoleKeyProblem();
  if (keyProblem) {
    console.error(`[state-access] ${keyProblem}`);
    return Response.json({ error: keyProblem }, { status: 500 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }
  if (!stateId) {
    return Response.json({ error: "A state is required." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: ownAccounts, error: accountsError } = await admin
    .from("wos_accounts")
    .select("id")
    .eq("user_id", user.id);
  if (accountsError) {
    console.error("[state-access] Account lookup failed:", accountsError);
    return Response.json({ error: accountsError.message }, { status: 500 });
  }

  const accountIds = (ownAccounts ?? []).map((account) => account.id);
  const { data: memberships, error: membershipError } = accountIds.length
    ? await admin
        .from("state_members")
        .select("wos_account_id")
        .eq("state_id", stateId)
        .in("wos_account_id", accountIds)
        .limit(1)
    : { data: [], error: null };
  if (membershipError) {
    console.error("[state-access] Membership lookup failed:", membershipError);
    return Response.json({ error: membershipError.message }, { status: 500 });
  }
  if (!memberships || memberships.length === 0) {
    return Response.json(
      { error: "You are not a member of this state." },
      { status: 403 },
    );
  }

  const { data: state, error: stateError } = await admin
    .from("states")
    .select("game_state_number")
    .eq("id", stateId)
    .maybeSingle();
  if (stateError) {
    console.error("[state-access] State lookup failed:", stateError);
    return Response.json(
      {
        error:
          stateError.code === "42703"
            ? "Database is missing the WOSOracle columns. Run the latest migration in Supabase."
            : stateError.message,
      },
      { status: 500 },
    );
  }

  return {
    userId: user.id,
    admin,
    gameStateNumber: state?.game_state_number ?? null,
  };
}
