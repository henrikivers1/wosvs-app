import { oracleErrorResponse, positiveInteger } from "@/lib/oracleRouteError";
import { requireStateMember, type StateAccess } from "@/lib/stateAccess";
import { fetchStateAlliances, fetchSvsMatchup } from "@/lib/wosOracleState";

// Opponent of the active (or next scheduled) battle: the number set on its
// plan, falling back to this season's SvS draw.
async function resolveOpponent(access: StateAccess, stateId: string) {
  const { data: battles } = await access.admin
    .from("battles")
    .select("status, plan_id, battle_plans(opponent_state_number)")
    .eq("state_id", stateId)
    .in("status", ["active", "scheduled"])
    .order("status", { ascending: true })
    .order("scheduled_at", { ascending: true })
    .limit(5);

  for (const battle of battles ?? []) {
    const plan = Array.isArray(battle.battle_plans)
      ? battle.battle_plans[0]
      : battle.battle_plans;
    if (plan?.opponent_state_number) {
      return { opponent: plan.opponent_state_number as number, source: "plan" };
    }
  }

  if (access.gameStateNumber) {
    const matchup = await fetchSvsMatchup(access.gameStateNumber);
    if (matchup?.opponent) {
      return { opponent: matchup.opponent, source: "draw" };
    }
  }
  return null;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const stateId = params.get("stateId");
  const access = await requireStateMember(stateId);
  if (access instanceof Response) return access;

  try {
    const requested = positiveInteger(params.get("opponent"));
    const resolved = requested
      ? { opponent: requested, source: "manual" }
      : await resolveOpponent(access, stateId!);

    if (!resolved) {
      return Response.json(
        {
          error:
            "No opponent known yet. Set it on the battle plan or enter the state number.",
        },
        { status: 404 },
      );
    }

    const alliances = await fetchStateAlliances(resolved.opponent);
    return Response.json({ ...resolved, alliances });
  } catch (error) {
    return oracleErrorResponse(error, "oracle-opponent");
  }
}
