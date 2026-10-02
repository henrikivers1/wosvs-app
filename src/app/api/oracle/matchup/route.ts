import { oracleErrorResponse } from "@/lib/oracleRouteError";
import { requireStateMember } from "@/lib/stateAccess";
import { fetchSvsMatchup } from "@/lib/wosOracleState";

// This season's SvS opponent and battle time for an app state.
export async function GET(request: Request) {
  const access = await requireStateMember(
    new URL(request.url).searchParams.get("stateId"),
  );
  if (access instanceof Response) return access;

  if (!access.gameStateNumber) {
    return Response.json(
      {
        error:
          "Set your in-game state number on the State management page first.",
      },
      { status: 409 },
    );
  }

  try {
    const matchup = await fetchSvsMatchup(access.gameStateNumber);
    if (!matchup) {
      return Response.json(
        { error: "WOSOracle has no SvS draw for your state this season yet." },
        { status: 404 },
      );
    }
    return Response.json(matchup);
  } catch (error) {
    return oracleErrorResponse(error, "oracle-matchup");
  }
}
