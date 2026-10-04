import { oracleErrorResponse } from "@/lib/oracleRouteError";
import { requireStateMember } from "@/lib/stateAccess";
import { fetchOraclePlayer } from "@/lib/wosOracle";

// One player's public profile, for adding an enemy rally leader by WOS ID
// (with their Labyrinth score). Counts against the caller's hourly budget.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const access = await requireStateMember(params.get("stateId"));
  if (access instanceof Response) return access;
  const wosId = (params.get("wosId") ?? "").trim();
  if (!/^[0-9]{1,20}$/.test(wosId)) {
    return Response.json({ error: "Enter a numeric WOS ID." }, { status: 400 });
  }
  try {
    const player = await fetchOraclePlayer(wosId, { userId: access.userId });
    return Response.json({
      player: {
        wosId,
        name: player.name,
        state: player.state,
        power: player.power,
        furnaceLevel: player.furnaceLevel,
        labyrinthScore: player.labyrinthScore ?? null,
        allianceAbbr: player.alliance?.abbr ?? "",
        allianceName: player.alliance?.name ?? "",
      },
    });
  } catch (error) {
    return oracleErrorResponse(error, "oracle-player");
  }
}
