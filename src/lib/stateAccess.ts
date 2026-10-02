import { createAdminClient, hasAdminCredentials } from "@/lib/supabase/admin";
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
  if (!hasAdminCredentials()) {
    return Response.json(
      { error: "The server is missing SUPABASE_SERVICE_ROLE_KEY." },
      { status: 500 },
    );
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
  const [{ data: memberships }, { data: state }] = await Promise.all([
    admin
      .from("state_members")
      .select("wos_account_id, wos_accounts!inner(user_id)")
      .eq("state_id", stateId)
      .eq("wos_accounts.user_id", user.id)
      .limit(1),
    admin
      .from("states")
      .select("game_state_number")
      .eq("id", stateId)
      .maybeSingle(),
  ]);

  if (!memberships || memberships.length === 0 || !state) {
    return Response.json(
      { error: "You are not a member of this state." },
      { status: 403 },
    );
  }

  return {
    userId: user.id,
    admin,
    gameStateNumber: state.game_state_number ?? null,
  };
}
