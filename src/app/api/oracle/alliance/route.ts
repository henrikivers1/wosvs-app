import { oracleErrorResponse, positiveInteger } from "@/lib/oracleRouteError";
import { requireStateMember } from "@/lib/stateAccess";
import { fetchAllianceProfile } from "@/lib/wosOracleState";

// Looks up one alliance by WOSOracle id, e.g. a shell alliance with no
// power yet that never appears in the state's top list.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const access = await requireStateMember(params.get("stateId"));
  if (access instanceof Response) return access;
  if (!access.isAdmin) {
    return Response.json(
      { error: "Only state owners and admins can add alliances." },
      { status: 403 },
    );
  }
  const allianceId = positiveInteger(params.get("allianceId"));
  if (!allianceId) {
    return Response.json(
      { error: "Enter a numeric alliance ID." },
      { status: 400 },
    );
  }
  try {
    return Response.json({
      alliance: await fetchAllianceProfile(allianceId, access.gameStateNumber),
    });
  } catch (error) {
    return oracleErrorResponse(error, "oracle-alliance");
  }
}
