import { createAdminClient, serviceRoleKeyProblem } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type StateAccess = {
  userId: string;
  admin: ReturnType<typeof createAdminClient>;
  gameStateNumber: number | null;
  isAdmin: boolean;
};

// Confirms the signed-in user has a WOS account in the given app state.
// Used by every /api route that acts for a state.
// Returns an error Response to send back when they do not.
export async function requireStateMember(
  stateId: string | null,
): Promise<StateAccess | Response> {
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
  const keyProblem = serviceRoleKeyProblem();
  if (keyProblem) {
    console.error(`[state-access] ${keyProblem}`);
    return Response.json(
      { error: "The server is not configured correctly." },
      { status: 500 },
    );
  }

  const admin = createAdminClient();
  // Membership (via the user's own accounts) and the state row in parallel.
  const [membershipResult, stateResult] = await Promise.all([
    admin
      .from("state_members")
      .select("role, wos_accounts!inner(user_id)")
      .eq("state_id", stateId)
      .eq("wos_accounts.user_id", user.id),
    admin
      .from("states")
      .select("game_state_number")
      .eq("id", stateId)
      .maybeSingle(),
  ]);
  const { data: memberships, error: membershipError } = membershipResult;
  if (membershipError) {
    console.error("[state-access] Membership lookup failed:", membershipError);
    return Response.json(
      { error: "Your membership could not be checked." },
      { status: 500 },
    );
  }
  if (!memberships || memberships.length === 0) {
    return Response.json(
      { error: "You are not a member of this state." },
      { status: 403 },
    );
  }
  const { data: state, error: stateError } = stateResult;
  if (stateError) {
    console.error("[state-access] State lookup failed:", stateError);
    return Response.json(
      {
        error:
          stateError.code === "42703"
            ? "The database is missing columns. Run the latest files in supabase/migrations in Supabase."
            : "The state could not be loaded.",
      },
      { status: 500 },
    );
  }

  return {
    userId: user.id,
    admin,
    gameStateNumber: state?.game_state_number ?? null,
    isAdmin: memberships.some((membership) =>
      ["owner", "admin"].includes(membership.role),
    ),
  };
}
