// Gives a WOS ID a login with a one-time PIN, or a new one-time PIN when it
// already has one. For the first operator, who has nobody to ask:
//
//   npm run login:create -- --wos-id 123456789
//
// Reads NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and
// AUTH_PIN_PEPPER from .env.local or the environment. Sign in on the site
// with the WOS ID and the printed PIN; you then choose your own PIN.

import {
  authConfigProblem,
  clearFailures,
  createLogin,
  findLogin,
  oneTimePin,
  setPin,
  WOS_ID_PATTERN,
} from "@/lib/pinAuth";
import { createAdminClient, serviceRoleKeyProblem } from "@/lib/supabase/admin";

try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: use the environment as it is.
}

const flag = process.argv.indexOf("--wos-id");
const wosId = flag >= 0 ? (process.argv[flag + 1] ?? "") : "";
const problem =
  (WOS_ID_PATTERN.test(wosId) ? null : "Usage: npm run login:create -- --wos-id <WOS ID>") ??
  authConfigProblem() ??
  serviceRoleKeyProblem();
if (problem) {
  console.error(problem);
  process.exit(1);
}

const admin = createAdminClient();
const pin = oneTimePin();
const existing = await findLogin(admin, wosId);
if (existing) {
  await setPin(admin, existing.userId, pin, true);
  await admin.rpc("end_user_sessions", { p_user_id: existing.userId });
  await clearFailures(admin, `wos:${wosId}`);
  console.log(`WOS ID ${wosId} has a new one-time PIN: ${pin}`);
} else {
  await createLogin(admin, wosId, pin, true);
  console.log(`Login created for WOS ID ${wosId}. One-time PIN: ${pin}`);
}
