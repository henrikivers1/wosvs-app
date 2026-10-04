import { timingSafeEqual } from "node:crypto";
import { runAutomation } from "@/lib/automation";
import { requireStateMember } from "@/lib/stateAccess";
import { createAdminClient, serviceRoleKeyProblem } from "@/lib/supabase/admin";

export const maxDuration = 60;

const MANUAL_CHECK_COOLDOWN_MS = 5 * 60 * 1000;

function isScheduler(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || !header.startsWith("Bearer ")) return false;
  const given = Buffer.from(header.slice("Bearer ".length));
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// Called hourly by the scheduler (Supabase pg_cron) with CRON_SECRET, or by
// a state owner/admin from State management to check their state right now.
export async function POST(request: Request) {
  if (isScheduler(request)) {
    const keyProblem = serviceRoleKeyProblem();
    if (keyProblem) {
      console.error(`[automation] ${keyProblem}`);
      return Response.json({ error: "Server misconfigured." }, { status: 500 });
    }
    const report = await runAutomation(createAdminClient(), {
      playerSync: true,
    });
    if (report.errors.length) console.error("[automation]", report.errors);
    return Response.json(report);
  }

  let stateId: string | null = null;
  try {
    stateId = ((await request.json()) as { stateId?: string }).stateId ?? null;
  } catch {
    // Missing body: handled by requireStateMember.
  }
  const access = await requireStateMember(stateId);
  if (access instanceof Response) return access;
  if (!access.isAdmin) {
    return Response.json(
      { error: "Only state owners and admins can run automation." },
      { status: 403 },
    );
  }
  if (!access.gameStateNumber) {
    return Response.json(
      { error: "Set your in-game state number first." },
      { status: 409 },
    );
  }

  // Claim the cooldown in one statement, so parallel clicks cannot all
  // reach WOSOracle.
  const cutoff = new Date(Date.now() - MANUAL_CHECK_COOLDOWN_MS).toISOString();
  const { data: claimed } = await access.admin
    .from("states")
    .update({ oracle_checked_at: new Date().toISOString() })
    .eq("id", stateId!)
    .or(`oracle_checked_at.is.null,oracle_checked_at.lt.${cutoff}`)
    .select("id");
  if (!claimed?.length) {
    return Response.json(
      { error: "Checked less than 5 minutes ago. Try again in a few minutes." },
      { status: 429 },
    );
  }

  const report = await runAutomation(access.admin, {
    stateId: stateId!,
    forceDrawCheck: true,
  });
  return Response.json(report);
}
