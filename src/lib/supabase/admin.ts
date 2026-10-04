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

// Detects a publishable/anon key pasted by mistake: it does not fail, it
// silently returns no rows because row-level security still applies.
export function serviceRoleKeyProblem(): string | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) return "SUPABASE_SERVICE_ROLE_KEY is not configured.";
  if (key.startsWith("sb_publishable_")) {
    return "SUPABASE_SERVICE_ROLE_KEY contains the publishable key. Use the secret key (sb_secret_...).";
  }
  if (key.split(".").length === 3) {
    try {
      const payload = JSON.parse(
        Buffer.from(key.split(".")[1], "base64url").toString("utf8"),
      ) as { role?: string };
      if (payload.role && payload.role !== "service_role") {
        return `SUPABASE_SERVICE_ROLE_KEY is the "${payload.role}" key. Use the service_role key.`;
      }
    } catch {
      // Not a JWT we can read; let Supabase decide.
    }
  }
  return null;
}

export function hasAdminCredentials() {
  const problem = serviceRoleKeyProblem();
  if (problem) console.error(`[supabase-admin] ${problem}`);
  return problem === null;
}
