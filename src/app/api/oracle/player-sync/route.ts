import { syncWosAccount } from "@/lib/playerSync";
import { createAdminClient, hasAdminCredentials } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { OraclePlayerError } from "@/lib/wosOracle";

// Player data is refreshed weekly by the automation job (see
// lib/automation.ts). Manual refreshes are limited to protect the daily
// WOSOracle quota.
const MANUAL_REFRESH_AFTER_MS = 24 * 60 * 60 * 1000;
// After a failed lookup, wait before asking WOSOracle about it again.
const RETRY_FAILED_AFTER_MS = 10 * 60 * 1000;

type SyncRequest = {
  accountId?: unknown;
  force?: unknown;
};

export async function POST(request: Request) {
  if (!hasAdminCredentials()) {
    return Response.json(
      { error: "Player synchronization is not configured on the server." },
      { status: 500 },
    );
  }

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
    .select("id, wos_id, player_data_synced_at, player_data_sync_failed_at")
    .eq("id", body.accountId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (accountError) {
    console.error("[player-sync] Account lookup failed:", accountError);
    return Response.json(
      { error: "The WOS account could not be loaded." },
      { status: 500 },
    );
  }
  if (!account) {
    return Response.json({ error: "WOS account not found." }, { status: 404 });
  }

  // Never-synced accounts sync right away; otherwise only a manual refresh
  // once a day.
  const lastSynced = account.player_data_synced_at
    ? new Date(account.player_data_synced_at).getTime()
    : 0;
  if (
    lastSynced &&
    (body.force !== true || Date.now() - lastSynced < MANUAL_REFRESH_AFTER_MS)
  ) {
    return Response.json({ cached: true });
  }
  const lastFailed = account.player_data_sync_failed_at
    ? new Date(account.player_data_sync_failed_at).getTime()
    : 0;
  if (Date.now() - lastFailed < RETRY_FAILED_AFTER_MS) {
    return Response.json(
      {
        error:
          "The last WOSOracle lookup for this account failed. Check the WOS ID and try again in a few minutes.",
      },
      { status: 429 },
    );
  }

  try {
    const { player, syncedAt } = await syncWosAccount(
      createAdminClient(),
      account,
      { userId: user.id },
    );
    return Response.json({
      cached: false,
      player: { id: player.id, name: player.name, syncedAt },
    });
  } catch (error) {
    if (error instanceof OraclePlayerError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("[player-sync] Unexpected failure:", error);
    return Response.json(
      { error: "Player synchronization failed." },
      { status: 500 },
    );
  }
}
