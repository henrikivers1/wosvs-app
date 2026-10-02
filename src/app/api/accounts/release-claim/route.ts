import { createAdminClient, hasAdminCredentials } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { fetchOraclePlayer, OraclePlayerError } from "@/lib/wosOracle";

type ReleaseRequest = {
  stateId?: unknown;
  actorAccountId?: unknown;
  wosId?: unknown;
};

function fail(error: string, status: number) {
  return Response.json({ error }, { status });
}

// Lets a state owner/admin remove a WOS ID that another user claimed, so the
// real player can register it. Allowed when the claimed account is a member
// of the admin's state, or when WOSOracle reports the player in the same
// in-game state as the admin's own (server-synchronized) account.
export async function POST(request: Request) {
  if (!hasAdminCredentials()) {
    console.error(
      "[release-claim] SUPABASE_SERVICE_ROLE_KEY is not configured.",
    );
    return fail("Releasing WOS IDs is not configured on the server.", 500);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Authentication required.", 401);

  let body: ReleaseRequest;
  try {
    body = (await request.json()) as ReleaseRequest;
  } catch {
    return fail("Invalid request body.", 400);
  }

  const { stateId, actorAccountId } = body;
  const wosId = typeof body.wosId === "string" ? body.wosId.trim() : "";
  if (
    typeof stateId !== "string" ||
    typeof actorAccountId !== "string" ||
    !/^[0-9]+$/.test(wosId)
  ) {
    return fail(
      "A state, your WOS account and a numeric WOS ID are required.",
      400,
    );
  }

  const admin = createAdminClient();

  const [{ data: actorAccount }, { data: actorMembership }] = await Promise.all(
    [
      admin
        .from("wos_accounts")
        .select("id, user_id, state_number")
        .eq("id", actorAccountId)
        .maybeSingle(),
      admin
        .from("state_members")
        .select("role")
        .eq("state_id", stateId)
        .eq("wos_account_id", actorAccountId)
        .maybeSingle(),
    ],
  );

  if (
    !actorAccount ||
    actorAccount.user_id !== user.id ||
    !actorMembership ||
    !["owner", "admin"].includes(actorMembership.role)
  ) {
    return fail("Only state owners and admins can release WOS IDs.", 403);
  }

  const { data: target, error: targetError } = await admin
    .from("wos_accounts")
    .select("id, user_id")
    .eq("wos_id", wosId)
    .maybeSingle();
  if (targetError) {
    console.error("[release-claim] Account lookup failed:", targetError);
    return fail("The WOS ID could not be looked up.", 500);
  }
  if (!target) return fail("That WOS ID is not registered by anyone.", 404);
  if (target.user_id === user.id) {
    return fail(
      "That WOS ID is on your own login. Remove it from your account page.",
      400,
    );
  }

  const { data: targetMemberships, error: membershipError } = await admin
    .from("state_members")
    .select("state_id, role")
    .eq("wos_account_id", target.id);
  if (membershipError) {
    console.error("[release-claim] Membership lookup failed:", membershipError);
    return fail("The WOS ID could not be looked up.", 500);
  }

  const memberships = targetMemberships ?? [];
  if (memberships.some((membership) => membership.role === "owner")) {
    return fail("The owner of a state cannot be released.", 409);
  }
  if (
    memberships.some(
      (membership) =>
        membership.role === "admin" &&
        (membership.state_id !== stateId || actorMembership.role !== "owner"),
    )
  ) {
    return fail("Only the state owner can release an admin account.", 403);
  }

  const inActorState = memberships.some(
    (membership) => membership.state_id === stateId,
  );
  if (!inActorState) {
    if (actorAccount.state_number === null) {
      return fail(
        "Synchronize your own WOS account first so your in-game state is known.",
        409,
      );
    }
    try {
      const player = await fetchOraclePlayer(wosId);
      if (player.state !== actorAccount.state_number) {
        return fail(
          `That player is in state ${player.state}. You can only release WOS IDs from your own state.`,
          403,
        );
      }
    } catch (error) {
      if (error instanceof OraclePlayerError) {
        return fail(error.message, error.status);
      }
      throw error;
    }
  }

  const { error: releaseError } = await admin.rpc("release_wos_account_claim", {
    target_wos_account_id: target.id,
    actor_state_id: stateId,
  });
  if (releaseError) {
    console.error("[release-claim] Release failed:", releaseError);
    return fail(releaseError.message, 500);
  }

  return Response.json({ released: true });
}
