import { oracleErrorResponse, positiveInteger } from "@/lib/oracleRouteError";
import { requireStateMember, type StateAccess } from "@/lib/stateAccess";
import {
  fetchStateSummary,
  fetchTopPlayers,
  type StateSummary,
} from "@/lib/wosOracleState";

// Opponent of the active (or next scheduled) battle: the number set on its
// plan, falling back to the stored SvS draw.
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

  // The draw stored by the automation job; no WOSOracle request needed.
  const { data: state } = await access.admin
    .from("states")
    .select("svs_opponent")
    .eq("id", stateId)
    .maybeSingle();
  if (state?.svs_opponent) {
    return { opponent: state.svs_opponent as number, source: "draw" };
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

    // Prefer the intel the automation already stored: no WOSOracle request.
    const { data: intel } = await access.admin
      .from("battle_intel")
      .select("opponent")
      .eq("state_id", stateId!)
      .eq("opponent_state", resolved.opponent)
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const stored = intel?.opponent as StateSummary | undefined;
    if (stored?.alliances?.length && (stored.topPlayers?.length ?? 0) > 5) {
      return Response.json({
        ...resolved,
        alliances: stored.alliances,
        topPlayers: stored.topPlayers,
      });
    }

    // Otherwise build the top players from WOSOracle (cached for 10 minutes).
    const summary = stored?.alliances?.length
      ? stored
      : await fetchStateSummary(resolved.opponent);
    return Response.json({
      ...resolved,
      alliances: summary.alliances,
      topPlayers: await fetchTopPlayers(summary),
    });
  } catch (error) {
    return oracleErrorResponse(error, "oracle-opponent");
  }
}
