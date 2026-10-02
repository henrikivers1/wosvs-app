import { createClient } from "@/lib/supabase/server";
import {
  fetchOraclePlayer,
  fireCrystalLevel,
  OraclePlayerError,
} from "@/lib/wosOracle";

const REFRESH_AFTER_MS = 6 * 60 * 60 * 1000;

type SyncRequest = {
  accountId?: unknown;
  force?: unknown;
};

export async function POST(request: Request) {
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

  let body: SyncRequest;
  try {
    body = (await request.json()) as SyncRequest;
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (typeof body.accountId !== "string" || !body.accountId) {
    return Response.json(
      { error: "A WOS account is required." },
      { status: 400 },
    );
  }

  const { data: account, error: accountError } = await supabase
    .from("wos_accounts")
    .select("id, wos_id, player_data_synced_at")
    .eq("id", body.accountId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (accountError) {
    return Response.json({ error: accountError.message }, { status: 500 });
  }
  if (!account) {
    return Response.json({ error: "WOS account not found." }, { status: 404 });
  }

  const lastSynced = account.player_data_synced_at
    ? new Date(account.player_data_synced_at).getTime()
    : 0;
  if (body.force !== true && Date.now() - lastSynced < REFRESH_AFTER_MS) {
    return Response.json({ cached: true });
  }

  try {
    const player = await fetchOraclePlayer(account.wos_id);
    const syncedAt = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("wos_accounts")
      .update({
        nickname: player.name,
        game_avatar_url: player.avatarUrl,
        state_number: player.state,
        furnace_level_raw: player.furnaceLevel,
        furnace_level: fireCrystalLevel(player.furnaceLevel),
        power: player.power,
        chief_level: player.chiefLevel,
        vip_level: player.vipLevel,
        kills: player.kills,
        labyrinth_score: player.labyrinthScore,
        alliance_external_id: player.alliance?.id ?? null,
        alliance_abbr: player.alliance?.abbr ?? null,
        alliance_name: player.alliance?.name ?? null,
        game_active: player.active,
        player_data_source: "wosoracle",
        player_data_updated_at: player.updatedAt,
        player_data_synced_at: syncedAt,
      })
      .eq("id", account.id)
      .eq("user_id", user.id);

    if (updateError) {
      return Response.json({ error: updateError.message }, { status: 500 });
    }

    return Response.json({
      cached: false,
      player: {
        id: player.id,
        name: player.name,
        syncedAt,
      },
    });
  } catch (error) {
    if (error instanceof OraclePlayerError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json(
      { error: "Player synchronization failed." },
      { status: 500 },
    );
  }
}
