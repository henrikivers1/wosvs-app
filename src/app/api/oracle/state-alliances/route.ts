import { oracleErrorResponse } from "@/lib/oracleRouteError";
import { requireStateMember } from "@/lib/stateAccess";
import { fetchStateAlliances } from "@/lib/wosOracleState";

// Our own state's alliances on WOSOracle (top list on the current plan).
export async function GET(request: Request) {
  const access = await requireStateMember(
    new URL(request.url).searchParams.get("stateId"),
  );
  if (access instanceof Response) return access;
  if (!access.isAdmin) {
    return Response.json(
      { error: "Only state owners and admins can add alliances." },
      { status: 403 },
    );
  }
  if (!access.gameStateNumber) {
    return Response.json(
      { error: "Set your in-game state number first." },
      { status: 409 },
    );
  }
  try {
    return Response.json({
      alliances: await fetchStateAlliances(access.gameStateNumber),
    });
  } catch (error) {
    return oracleErrorResponse(error, "oracle-state-alliances");
  }
}
