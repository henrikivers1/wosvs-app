import { runAutoPlan, type AutoPlanSettings } from "@/lib/autoPlan";
import { requireStateMember } from "@/lib/stateAccess";

export const maxDuration = 60;

type PlanRequest = {
  stateId?: string;
  planId?: string;
  action?: "generate" | "publish";
};

// "Generate now" / "Publish now" on the Planning page: runs the same steps
// the hourly automation would run later, straight away.
export async function POST(request: Request) {
  let body: PlanRequest = {};
  try {
    body = (await request.json()) as PlanRequest;
  } catch {
    // Missing body: handled below.
  }
  const access = await requireStateMember(body.stateId ?? null);
  if (access instanceof Response) return access;
  if (!access.isAdmin) {
    return Response.json(
      { error: "Only state owners and admins can plan rallies." },
      { status: 403 },
    );
  }
  if (!body.planId || (body.action !== "generate" && body.action !== "publish")) {
    return Response.json({ error: "A plan and an action are required." }, { status: 400 });
  }

  const [{ data: plan }, { data: settings }] = await Promise.all([
    access.admin
      .from("battle_plans")
      .select(
        "id, state_id, name, scheduled_at, status, attendance_reminder_sent_at, auto_planned_at",
      )
      .eq("id", body.planId)
      .eq("state_id", body.stateId!)
      .maybeSingle(),
    access.admin
      .from("states")
      .select(
        "auto_plan, auto_publish, rally_count, rally_size, default_formation, default_joiner_heroes, autofill_priorities",
      )
      .eq("id", body.stateId!)
      .maybeSingle(),
  ]);
  if (!plan || !settings) {
    return Response.json({ error: "Battle plan not found." }, { status: 404 });
  }

  try {
    const result = await runAutoPlan(
      access.admin,
      plan,
      settings as AutoPlanSettings,
      body.action === "generate" ? { generateNow: true } : { publishNow: true },
    );
    return Response.json(result);
  } catch (error) {
    console.error("[auto-plan]", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Planning failed." },
      { status: 500 },
    );
  }
}
