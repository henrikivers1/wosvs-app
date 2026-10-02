import type { createAdminClient } from "@/lib/supabase/admin";
import { fetchOraclePlayer, fireCrystalLevel } from "@/lib/wosOracle";

type AdminClient = ReturnType<typeof createAdminClient>;

// Pulls one WOS account from WOSOracle and stores the result. Throws
// OraclePlayerError for WOSOracle problems and Error for database problems.
export async function syncWosAccount(
  admin: AdminClient,
  account: { id: string; wos_id: string },
) {
  const player = await fetchOraclePlayer(account.wos_id);
  const syncedAt = new Date().toISOString();
  const { error } = await admin
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
    .eq("id", account.id);

  if (error) throw new Error(error.message);
  return { player, syncedAt };
}
