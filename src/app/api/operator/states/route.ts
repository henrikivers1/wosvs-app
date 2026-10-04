import { savePlayer } from "@/lib/playerSync";
import { requireOperator } from "@/lib/operator";
import {
  clearFailures,
  createLogin,
  fail,
  findLogin,
  oneTimePin,
  setPin,
  WOS_ID_PATTERN,
} from "@/lib/pinAuth";
import { fetchOraclePlayer, OraclePlayerError } from "@/lib/wosOracle";

// For the people running Overwatch (OPERATOR_WOS_IDS): create states for
// their leaders and hand out one-time PINs.

function oracleFailure(error: unknown) {
  if (error instanceof OraclePlayerError) {
    return fail(error.message, error.status === 404 ? 404 : 503);
  }
  console.error("[operator] Player lookup failed:", error);
  return fail("The WOS ID could not be checked right now.", 503);
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Every state with its owner, member count and members who joined this week.
export async function GET() {
  const admin = await requireOperator();
  if (admin instanceof Response) return admin;

  const [{ data: states, error }, { data: members }] = await Promise.all([
    admin
      .from("states")
      .select("id, name, game_state_number, created_at, paid_until")
      .order("created_at", { ascending: false }),
    admin
      .from("state_members")
      .select("state_id, role, joined_at, wos_accounts!state_members_wos_account_id_fkey!inner(wos_id, nickname)"),
  ]);
  if (error) {
    console.error("[operator] State list failed:", error);
    return fail("The states could not be loaded.", 500);
  }
  const weekAgo = Date.now() - WEEK_MS;
  return Response.json({
    states: (states ?? []).map((state) => {
      const rows = (members ?? []).filter((row) => row.state_id === state.id);
      const owner = rows.find((row) => row.role === "owner");
      const ownerAccount = owner?.wos_accounts as unknown as
        | { wos_id: string; nickname: string | null }
        | undefined;
      return {
        id: state.id,
        name: state.name,
        stateNumber: state.game_state_number,
        createdAt: state.created_at,
        paidUntil: state.paid_until,
        memberCount: rows.length,
        joinedThisWeek: rows.filter(
          (row) => new Date(row.joined_at).getTime() >= weekAgo,
        ).length,
        owner: ownerAccount
          ? { wosId: ownerAccount.wos_id, nickname: ownerAccount.nickname }
          : null,
      };
    }),
  });
}

// { action: "create", ownerWosId, name? } creates a state owned by that WOS
// ID, in the in-game state WOSOracle lists it in. A new owner gets a
// one-time PIN.
// { action: "reset_pin", wosId } gives any player a one-time PIN.
export async function POST(request: Request) {
  const admin = await requireOperator();
  if (admin instanceof Response) return admin;

  let body: {
    action?: unknown;
    ownerWosId?: unknown;
    wosId?: unknown;
    name?: unknown;
    stateId?: unknown;
    paidUntil?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return fail("Invalid request body.", 400);
  }

  // Paid until the end of that day (UTC); null: not billed.
  if (body.action === "set_paid_until") {
    if (typeof body.stateId !== "string") return fail("A state is required.", 400);
    const day = typeof body.paidUntil === "string" ? body.paidUntil : "";
    if (day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) return fail("Use a date like 2026-11-30.", 400);
    const { error } = await admin
      .from("states")
      .update({ paid_until: day ? `${day}T23:59:59Z` : null })
      .eq("id", body.stateId);
    if (error) {
      console.error("[operator] Paid-until failed:", error);
      return fail("The date could not be saved.", 500);
    }
    return Response.json({ ok: true });
  }

  if (body.action === "reset_pin") {
    const wosId = typeof body.wosId === "string" ? body.wosId.trim() : "";
    if (!WOS_ID_PATTERN.test(wosId)) return fail("Enter a WOS ID.", 400);
    const login = await findLogin(admin, wosId);
    if (!login) return fail("Nobody has signed in with that WOS ID yet.", 404);
    const pin = oneTimePin();
    try {
      await setPin(admin, login.userId, pin, true);
      await admin.rpc("end_user_sessions", { p_user_id: login.userId });
      await clearFailures(admin, `wos:${wosId}`);
    } catch (error) {
      console.error("[operator] Reset failed:", error);
      return fail("The PIN could not be reset.", 500);
    }
    return Response.json({ pin });
  }

  if (body.action !== "create") return fail("Unknown action.", 400);
  const ownerWosId =
    typeof body.ownerWosId === "string" ? body.ownerWosId.trim() : "";
  if (!WOS_ID_PATTERN.test(ownerWosId)) return fail("Enter the leader's WOS ID.", 400);

  let player;
  try {
    player = await fetchOraclePlayer(ownerWosId);
  } catch (error) {
    return oracleFailure(error);
  }
  if (!player.state) return fail("WOSOracle lists no state for that player.", 409);

  const { data: taken } = await admin
    .from("states")
    .select("name")
    .eq("game_state_number", player.state)
    .maybeSingle();
  if (taken) {
    return fail(`State ${player.state} is already in Overwatch as ${taken.name}.`, 409);
  }

  const name =
    (typeof body.name === "string" ? body.name.trim() : "").slice(0, 60) ||
    `State ${player.state}`;
  const { data: state, error: stateError } = await admin
    .from("states")
    .insert({ name, game_state_number: player.state })
    .select("id")
    .single();
  if (stateError || !state) {
    console.error("[operator] State creation failed:", stateError);
    return fail("The state could not be created.", 500);
  }

  let login = await findLogin(admin, ownerWosId);
  let pin: string | null = null;
  try {
    if (!login) {
      pin = oneTimePin();
      login = await createLogin(admin, ownerWosId, pin, true);
    }
    await savePlayer(admin, login.accountId, player);
    const { error: memberError } = await admin.from("state_members").upsert(
      { state_id: state.id, wos_account_id: login.accountId, role: "owner" },
      { onConflict: "state_id,wos_account_id" },
    );
    if (memberError) throw new Error(memberError.message);
  } catch (error) {
    console.error("[operator] Owner setup failed:", error);
    await admin.from("states").delete().eq("id", state.id);
    return fail("The owner could not be added, so the state was not created.", 500);
  }

  return Response.json({
    stateId: state.id,
    name,
    stateNumber: player.state,
    owner: { wosId: ownerWosId, nickname: player.name },
    pin,
  });
}
