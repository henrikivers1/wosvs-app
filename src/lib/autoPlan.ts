import type { Availability } from "@/lib/attendance";
import {
  computeAutofill,
  type AutofillCriterion,
  type AutofillGroup,
  type AutofillMember,
  type GroupShift,
} from "@/lib/autofill";
import type { createAdminClient } from "@/lib/supabase/admin";

// Takes an SvS plan from the draw to a published battle without admin input.
// Runs from the hourly automation job (and from "Generate now" / "Publish
// now" on the Planning page). Every step only adds to what admins already
// set up by hand: existing rallies are never rebuilt or reshuffled.
//
//   T-30h  remind members who have not voted on their attendance
//   T-24h  generate rallies (leaders, alliances, setup) and fill them
//   hourly add late voters to open rally slots, until the battle starts
//   T-6h   publish, which sends everyone their assignment

type AdminClient = ReturnType<typeof createAdminClient>;

const HOUR_MS = 60 * 60 * 1000;
export const REMIND_BEFORE_MS = 30 * HOUR_MS;
export const GENERATE_BEFORE_MS = 24 * HOUR_MS;
export const PUBLISH_BEFORE_MS = 6 * HOUR_MS;

const RALLY_LEAD_COLOR = "#4f8fba";

export type AutoPlanSettings = {
  auto_plan: boolean;
  auto_publish: boolean;
  rally_count: number;
  rally_size: number;
  default_formation: string | null;
  default_joiner_heroes: string[];
  autofill_priorities: string[];
};

export type AutoPlanResult = {
  reminded: number;
  ralliesCreated: number;
  playersAssigned: number;
  published: boolean;
};

type Member = {
  id: string;
  user_id: string;
  role: string;
  nickname: string | null;
  wos_id: string;
  power: number | null;
  furnace_level_raw: number | null;
  labyrinth_score: number | null;
  infantry_tier: number | null;
  lancer_tier: number | null;
  marksman_tier: number | null;
  alliance_abbr: string | null;
  alliance_name: string | null;
};

type Group = {
  id: string;
  leader_wos_account_id: string;
  max_members: number;
  shift: GroupShift | null;
  joiner_heroes: string[] | null;
};

type Assignment = { group_id: string; wos_account_id: string; hero: string | null };

const VALID_CRITERIA: AutofillCriterion[] = [
  "hero_match",
  "equal_power",
  "fc",
  "troop",
  "labyrinth",
  "power",
  "voice",
];

function displayName(member: Member) {
  return member.nickname?.trim() || `WOS ID ${member.wos_id}`;
}

function averageTroop(member: Member) {
  const tiers = [member.infantry_tier, member.lancer_tier, member.marksman_tier]
    .filter((tier): tier is number => tier !== null);
  return tiers.length ? tiers.reduce((sum, tier) => sum + tier, 0) / tiers.length : 0;
}

function shiftFor(availability: Availability | undefined): GroupShift {
  return availability === "first_half" || availability === "second_half"
    ? availability
    : "whole";
}

async function loadState(admin: AdminClient, stateId: string, planId: string) {
  const [members, attendance, groups, assignments, alliances, rallyTag] =
    await Promise.all([
      admin
        .from("state_members")
        .select(
          "role, wos_accounts!inner(id, user_id, nickname, wos_id, power, furnace_level_raw, labyrinth_score, infantry_tier, lancer_tier, marksman_tier, alliance_abbr, alliance_name)",
        )
        .eq("state_id", stateId),
      admin
        .from("battle_attendance")
        .select("wos_account_id, availability, voice_call")
        .eq("plan_id", planId),
      admin
        .from("battle_plan_groups")
        .select("id, leader_wos_account_id, max_members, shift, joiner_heroes")
        .eq("plan_id", planId)
        .order("sort_order"),
      admin
        .from("battle_plan_assignments")
        .select("group_id, wos_account_id, hero")
        .eq("plan_id", planId),
      admin.from("state_alliances").select("id, name").eq("state_id", stateId),
admin
        .from("state_tags")
        .select("id")
        .eq("state_id", stateId)
        .eq("system_key", "rally_lead")
        .maybeSingle(),
    ]);
  for (const result of [members, attendance, groups, assignments, alliances]) {
    if (result.error) throw new Error(result.error.message);
  }

  const memberList: Member[] = (members.data ?? []).map((row) => {
    const account = (Array.isArray(row.wos_accounts) ? row.wos_accounts[0] : row.wos_accounts) as Omit<Member, "role">;
    return { ...account, role: row.role as string };
  });
  const heroes = memberList.length
    ? await admin
        .from("player_heroes")
        .select("wos_account_id, hero")
        .in(
          "wos_account_id",
          memberList.map((member) => member.id),
        )
    : { data: [] };
  const heroesByAccount = new Map<string, string[]>();
  for (const row of heroes.data ?? []) {
    heroesByAccount.set(row.wos_account_id, [
      ...(heroesByAccount.get(row.wos_account_id) ?? []),
      row.hero as string,
    ]);
  }
  const rallyTagId = (rallyTag.data?.id as string | undefined) ?? null;
  const tagRows = rallyTagId
    ? ((
        await admin
          .from("state_member_tags")
          .select("wos_account_id")
          .eq("tag_id", rallyTagId)
      ).data ?? [])
    : [];

  return {
    members: memberList,
    answers: new Map(
      (attendance.data ?? []).map((row) => [
        row.wos_account_id as string,
        row as { availability: Availability; voice_call: boolean },
      ]),
    ),
    heroesByAccount,
    groups: (groups.data ?? []) as Group[],
    assignments: (assignments.data ?? []) as Assignment[],
    alliances: (alliances.data ?? []) as { id: string; name: string }[],
    rallyTagId,
    rallyLeads: new Set(tagRows.map((row) => row.wos_account_id)),
  };
}

type Loaded = Awaited<ReturnType<typeof loadState>>;

// The leader's own in-game alliance, created in the app when it is missing
// (named like WOSOracle imports: "[ABC] Name").
async function allianceFor(
  admin: AdminClient,
  stateId: string,
  leader: Member,
  loaded: Loaded,
) {
  const abbr = leader.alliance_abbr?.trim();
  const name = leader.alliance_name?.trim();
  const match = loaded.alliances.find((alliance) => {
    const label = alliance.name.toLowerCase();
    return (
      (abbr && label.includes(`[${abbr.toLowerCase()}]`)) ||
      (name && label === name.toLowerCase())
    );
  });
  if (match) return match.id;
  if (!abbr && !name) return loaded.alliances[0]?.id ?? null;

  const label = (abbr ? `[${abbr}] ${name || abbr}` : name!).slice(0, 40);
  const { data, error } = await admin
    .from("state_alliances")
    .insert({ state_id: stateId, name: label })
    .select("id, name")
    .single();
  if (error) return loaded.alliances[0]?.id ?? null;
  loaded.alliances.push(data);
  return data.id as string;
}

async function remindVoters(
  admin: AdminClient,
  plan: { id: string; state_id: string; name: string; scheduled_at: string },
  loaded: Loaded,
) {
  const missing = loaded.members.filter((member) => !loaded.answers.has(member.id));
  if (missing.length) {
    const { error } = await admin.from("notifications").insert(
      missing.map((member) => ({
        user_id: member.user_id,
        state_id: plan.state_id,
        wos_account_id: member.id,
        type: "attendance_reminder",
        title: "Can you join the SvS?",
        body: `${displayName(member)}: vote whether you can join ${plan.name} so you get a rally spot.`,
        data: {
          plan_id: plan.id,
          plan_name: plan.name,
          battle_start: plan.scheduled_at,
          player: displayName(member),
          state_id: plan.state_id,
          wos_account_id: member.id,
        },
      })),
    );
    if (error) throw new Error(error.message);
  }
  await admin
    .from("battle_plans")
    .update({ attendance_reminder_sent_at: new Date().toISOString() })
    .eq("id", plan.id);
  return missing.length;
}

// Rally leads: Rally Lead tag holders who can play, topped up with the best
// Labyrinth players who voted they can play. New leads get the tag.
async function createRallies(
  admin: AdminClient,
  plan: { id: string; state_id: string },
  settings: AutoPlanSettings,
  loaded: Loaded,
) {
  const canPlay = (member: Member) => {
    const answer = loaded.answers.get(member.id)?.availability;
    return Boolean(answer) && answer !== "unavailable";
  };
  const byLabyrinth = (first: Member, second: Member) =>
    (second.labyrinth_score ?? 0) - (first.labyrinth_score ?? 0) ||
    (second.power ?? 0) - (first.power ?? 0);

  const tagged = loaded.members
    .filter((member) => loaded.rallyLeads.has(member.id) && canPlay(member))
    .sort(byLabyrinth);
  const extra = loaded.members
    .filter((member) => !loaded.rallyLeads.has(member.id) && canPlay(member))
    .sort(byLabyrinth);
  const leads = [...tagged, ...extra].slice(0, settings.rally_count);

  let created = 0;
  for (const [index, leader] of leads.entries()) {
    if (!loaded.rallyLeads.has(leader.id) && loaded.rallyTagId) {
      await admin.from("state_member_tags").insert({
        tag_id: loaded.rallyTagId,
        wos_account_id: leader.id,
        source: "manual",
      });
      loaded.rallyLeads.add(leader.id);
    }
    const allianceId = await allianceFor(admin, plan.state_id, leader, loaded);
    const { data: group, error } = await admin
      .from("battle_plan_groups")
      .insert({
        plan_id: plan.id,
        state_id: plan.state_id,
        name: `${displayName(leader).slice(0, 50)} rally`,
        leader_wos_account_id: leader.id,
        alliance_id: allianceId,
        max_members: settings.rally_size,
        sort_order: index,
        shift: shiftFor(loaded.answers.get(leader.id)?.availability),
        formation: settings.default_formation,
        joiner_heroes: settings.default_joiner_heroes,
      })
      .select("id, leader_wos_account_id, max_members, shift, joiner_heroes")
      .single();
    if (error) throw new Error(error.message);
    const { error: leaderError } = await admin.from("battle_plan_assignments").upsert(
      {
        plan_id: plan.id,
        group_id: group.id,
        state_id: plan.state_id,
        wos_account_id: leader.id,
      },
      { onConflict: "plan_id,wos_account_id" },
    );
    if (leaderError) throw new Error(leaderError.message);
    loaded.groups.push(group as Group);
    loaded.assignments.push({ group_id: group.id, wos_account_id: leader.id, hero: null });
    created += 1;
  }
  return created;
}

// Adds members who can play and are not in a rally yet to open slots,
// ranked by the state's auto-fill priorities. Never moves anyone.
async function fillRallies(
  admin: AdminClient,
  plan: { id: string; state_id: string },
  settings: AutoPlanSettings,
  loaded: Loaded,
) {
  if (!loaded.groups.length) return 0;
  const powerOf = new Map(loaded.members.map((member) => [member.id, member.power ?? 0]));
  const assigned = new Set(loaded.assignments.map((row) => row.wos_account_id));

  const groups: AutofillGroup[] = loaded.groups.map((group) => {
    const rows = loaded.assignments.filter((row) => row.group_id === group.id);
    const heroUsage: Record<string, number> = {};
    rows.forEach((row) => {
      if (row.hero) heroUsage[row.hero] = (heroUsage[row.hero] ?? 0) + 1;
    });
    return {
      id: group.id,
      maxMembers: group.max_members,
      memberIds: rows.map((row) => row.wos_account_id),
      shift: group.shift ?? "whole",
      joinerHeroes: group.joiner_heroes ?? [],
      heroUsage,
      totalPower: rows.reduce((sum, row) => sum + (powerOf.get(row.wos_account_id) ?? 0), 0),
    };
  });
  const candidates: AutofillMember[] = loaded.members
    .filter((member) => !assigned.has(member.id))
    .map((member) => ({
      id: member.id,
      power: member.power ?? 0,
      fc: member.furnace_level_raw ?? 0,
      troop: averageTroop(member),
      labyrinth: member.labyrinth_score ?? 0,
      voice: Boolean(loaded.answers.get(member.id)?.voice_call),
      availability: loaded.answers.get(member.id)?.availability ?? null,
      heroes: loaded.heroesByAccount.get(member.id) ?? [],
    }));
  const priorities = settings.autofill_priorities.filter(
    (value): value is AutofillCriterion =>
      VALID_CRITERIA.includes(value as AutofillCriterion),
  );

  const drafts = computeAutofill(groups, candidates, priorities);
  if (!drafts.length) return 0;
  const { error } = await admin.from("battle_plan_assignments").insert(
    drafts.map((draft) => ({
      plan_id: plan.id,
      group_id: draft.group_id,
      state_id: plan.state_id,
      wos_account_id: draft.wos_account_id,
      hero: draft.hero,
    })),
  );
  if (error) throw new Error(error.message);
  loaded.assignments.push(...drafts);
  return drafts.length;
}

async function notifyAdmins(
  admin: AdminClient,
  plan: { id: string; state_id: string; name: string; scheduled_at: string },
  loaded: Loaded,
  rallies: number,
  players: number,
  autoPublish: boolean,
) {
  const publishAt = new Date(new Date(plan.scheduled_at).getTime() - PUBLISH_BEFORE_MS).toISOString();
  const admins = loaded.members.filter((member) => member.role === "owner" || member.role === "admin");
  const users = [...new Map(admins.map((member) => [member.user_id, member])).values()];
  if (!users.length) return;
  await admin.from("notifications").insert(
    users.map((member) => ({
      user_id: member.user_id,
      state_id: plan.state_id,
      wos_account_id: member.id,
      type: "rallies_generated",
      title: "Rallies are ready for review",
      body: `${rallies} rallies with ${players} players were set up for ${plan.name}. ${
        autoPublish ? "They are published automatically 6 hours before the battle." : "Publish them from Planning."
      }`,
      data: {
        plan_id: plan.id,
        plan_name: plan.name,
        rallies,
        players,
        publish_at: autoPublish ? publishAt : null,
        state_id: plan.state_id,
        wos_account_id: member.id,
      },
    })),
  );
}

export async function runAutoPlan(
  admin: AdminClient,
  plan: {
    id: string;
    state_id: string;
    name: string;
    scheduled_at: string;
    status: string;
    attendance_reminder_sent_at: string | null;
    auto_planned_at: string | null;
  },
  settings: AutoPlanSettings,
  options: { now?: number; generateNow?: boolean; publishNow?: boolean } = {},
): Promise<AutoPlanResult> {
  const result: AutoPlanResult = {
    reminded: 0,
    ralliesCreated: 0,
    playersAssigned: 0,
    published: false,
  };
  const now = options.now ?? Date.now();
  const battleAt = new Date(plan.scheduled_at).getTime();
  if (battleAt <= now) return result;
  const untilBattle = battleAt - now;
  const loaded = await loadState(admin, plan.state_id, plan.id);

  if (!plan.attendance_reminder_sent_at && untilBattle <= REMIND_BEFORE_MS) {
    result.reminded = await remindVoters(admin, plan, loaded);
  }

  const generate =
    options.generateNow ||
    (settings.auto_plan && untilBattle <= GENERATE_BEFORE_MS);
  if (generate) {
    if (!loaded.groups.length) {
      result.ralliesCreated = await createRallies(admin, plan, settings, loaded);
    }
    result.playersAssigned = await fillRallies(admin, plan, settings, loaded);
    if (!plan.auto_planned_at && loaded.groups.length) {
      await admin
        .from("battle_plans")
        .update({ auto_planned_at: new Date(now).toISOString() })
        .eq("id", plan.id);
      if (!options.generateNow) {
        await notifyAdmins(
          admin,
          plan,
          loaded,
          loaded.groups.length,
          loaded.assignments.length,
          settings.auto_publish,
        );
      }
    }
  }

  const publish =
    plan.status === "draft" &&
    loaded.groups.length > 0 &&
    (options.publishNow ||
      (settings.auto_publish && untilBattle <= PUBLISH_BEFORE_MS));
  if (publish) {
    const owner =
      loaded.members.find((member) => member.role === "owner") ??
      loaded.members.find((member) => member.role === "admin");
    if (owner) {
      const { error } = await admin.rpc("publish_battle_plan_with_notifications", {
        target_plan_id: plan.id,
        actor_wos_account_id: owner.id,
      });
      if (error) throw new Error(error.message);
      result.published = true;
    }
  }
  return result;
}
