import type { SupabaseClient } from "@supabase/supabase-js";

// A user's profile picture is the in-game avatar of their highest-power
// WOS account that has been synchronized from WOSOracle.
export async function fetchProfileAvatarUrl(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("wos_accounts")
    .select("game_avatar_url")
    .eq("user_id", userId)
    .not("game_avatar_url", "is", null)
    .order("power", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  return data?.game_avatar_url ?? null;
}
