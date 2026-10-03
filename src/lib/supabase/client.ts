import { createBrowserClient } from "@supabase/ssr";
import { createDemoClient } from "@/lib/demo/client";
import { isDemoMode } from "@/lib/demo/mode";

function createSupabaseClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}

export function createClient(): ReturnType<typeof createSupabaseClient> {
  // In the private demo every page talks to fake in-browser data instead.
  if (isDemoMode()) {
    return createDemoClient() as unknown as ReturnType<
      typeof createSupabaseClient
    >;
  }
  return createSupabaseClient();
}
