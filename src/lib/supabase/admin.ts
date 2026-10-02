import { createClient } from "@supabase/supabase-js";

// Server-only client that bypasses row-level security. Never import this
// from a client component; SUPABASE_SERVICE_ROLE_KEY must not be exposed.
export function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  }

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function hasAdminCredentials() {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}
