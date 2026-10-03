import { oracleErrorResponse, positiveInteger } from "@/lib/oracleRouteError";
import { requireStateMember } from "@/lib/stateAccess";
import { fetchAlliance } from "@/lib/wosOracleState";

// Member list of one enemy alliance, strongest first.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const access = await requireStateMember(params.get("stateId"));
  if (access instanceof Response) return access;

  const allianceId = positiveInteger(params.get("allianceId"));
  const stateNumber = positiveInteger(params.get("stateNumber"));
  if (!allianceId || !stateNumber) {
    return Response.json(
      { error: "An alliance and its state number are required." },
      { status: 400 },
    );
  }

  try {
    return Response.json({
      members: (
        await fetchAlliance(allianceId, stateNumber, { userId: access.userId })
      ).members,
    });
  } catch (error) {
    return oracleErrorResponse(error, "oracle-roster");
  }
}
