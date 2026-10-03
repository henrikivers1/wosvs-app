import type { createAdminClient } from "@/lib/supabase/admin";
import { fireCrystalLevel } from "@/lib/furnace";
import { fetchOraclePlayer } from "@/lib/wosOracle";

type AdminClient = ReturnType<typeof createAdminClient>;

export type JoinRequestResult = {
  status:
    | "requested"
    | "pending"
    | "invited"
    | "member"
    | "rejected"
    | "no_state"
    | "no_app_state";
  state_id?: string;
  state_name?: string;
  state_number?: number;
};

// Pulls one WOS account from WOSOracle and stores the result. Throws
// OraclePlayerError for WOSOracle problems and Error for database problems.
export async function syncWosAccount(
  admin: AdminClient,
  account: {
    id: string;
    wos_id: string;
    // Pass these when already loaded to skip a lookup.
    state_number?: number | null;
    player_data_synced_at?: string | null;
  },
  options: { background?: boolean } = {},
) {
  let player;
  try {
    player = await fetchOraclePlayer(account.wos_id, {
      waitForMinute: options.background,
    });
  } catch (error) {
    // Remember the failure so the weekly queue moves on to other accounts.
    await admin
      .from("wos_accounts")
      .update({ player_data_sync_failed_at: new Date().toISOString() })
      .eq("id", account.id);
    throw error;
  }
  const previous =
    account.player_data_synced_at !== undefined
      ? account
      : (
          await admin
            .from("wos_accounts")
            .select("state_number, player_data_synced_at")
            .eq("id", account.id)
            .maybeSingle()
        ).data;
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
      player_data_sync_failed_at: null,
    })
    .eq("id", account.id);

  if (error) throw new Error(error.message);

  // A new account, or one that transferred to another state, asks to join
  // the app state with its in-game state number (admins approve it).
  let joinRequest: JoinRequestResult | null = null;
  if (
    player.state &&
    (!previous?.player_data_synced_at || previous.state_number !== player.state)
  ) {
    const { data, error: joinError } = await admin.rpc(
      "request_state_join_for_account",
      { target_wos_account_id: account.id },
    );
    if (joinError) {
      console.error("[player-sync] Join request failed:", joinError.message);
    } else {
      joinRequest = data as JoinRequestResult;
    }
  }
  return { player, syncedAt, joinRequest };
}
