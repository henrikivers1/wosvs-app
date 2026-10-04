import type { Availability } from "@/lib/attendance";
import type { AutofillCriterion, GroupShift } from "@/lib/autofill";
import {
  blockFits,
  compareDefense,
  fillPlan,
  PET_BLOCKS,
  planRotation,
  seatMemberIds,
  type FillGroup,
  type FillMember,
} from "@/lib/castle";
import type { createAdminClient } from "@/lib/supabase/admin";

// Takes an SvS plan from the draw to a published battle without admin input.
// Runs from the hourly automation job (and from "Generate now" / "Publish
// now" on the Planning page). Every step only adds to what admins already
// set up by hand: existing rallies are never rebuilt or reshuffled.
//
//   T-30h  remind members who have not voted on their attendance
//   T-24h  generate the garrison (Castle Holders by pet block) and the
//          rallies (Rally Leads by pet block), then fill the garrison with
//          the strongest defenders and the rallies by the state's priorities
//   hourly add late voters to open rally slots, until the battle starts
//   T-6h   publish, which sends everyone their assignment

type AdminClient = ReturnType<typeof createAdminClient>;

const HOUR_MS = 60 * 60 * 1000;
export const REMIND_BEFORE_MS = 30 * HOUR_MS;
export const GENERATE_BEFORE_MS = 24 * HOUR_MS;
export const PUBLISH_BEFORE_MS = 6 * HOUR_MS;

export type AutoPlanSettings = {
  auto_plan: boolean;
  auto_publish: boolean;
  rally_count: number;
  rally_size: number;
  garrison_size?: number;
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
  infantry_fc_level: number | null;
  lancer_fc_level: number | null;
  marksman_fc_level: number | null;
  infantry_t12_skill: number | null;
  lancer_t12_skill: number | null;
  marksman_t12_skill: number | null;
  alliance_abbr: string | null;
  alliance_name: string | null;
};

type Group = {
  id: string;
  kind: "rally" | "garrison";
  leader_wos_account_id: string;
  lead_rotation: Array<string | null> | null;
  max_members: number;
  shift: GroupShift | null;
  joiner_heroes: string[] | null;
};

const GROUP_COLUMNS =
  "id, kind, leader_wos_account_id, lead_rotation, max_members, shift, joiner_heroes";

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

async function loadState(admin: AdminClient, stateId: string, planId: string) {
  const [members, attendance, groups, assignments, alliances, systemTags] =
    await Promise.all([
      admin
        .from("state_members")
        .select(
          "role, wos_accounts!inner(id, user_id, nickname, wos_id, power, furnace_level_raw, labyrinth_score, infantry_tier, lancer_tier, marksman_tier, infantry_fc_level, lancer_fc_level, marksman_fc_level, infantry_t12_skill, lancer_t12_skill, marksman_t12_skill, alliance_abbr, alliance_name)",
        )
        .eq("state_id", stateId),
      admin
        .from("battle_attendance")
        .select("wos_account_id, availability, voice_call")
        .eq("plan_id", planId),
      admin
        .from("battle_plan_groups")
        .select(GROUP_COLUMNS)
        .eq("plan_id", planId)
        .order("sort_order"),
      admin
        .from("battle_plan_assignments")
        .select("group_id, wos_account_id, hero")
        .eq("plan_id", planId),
      admin.from("state_alliances").select("id, name").eq("state_id", stateId),
      admin
        .from("state_tags")
        .select("id, system_key")
        .eq("state_id", stateId)
        .in("system_key", ["rally_lead", "castle_holder"]),
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
  const tagIdFor = (key: string) =>
    ((systemTags.data ?? []).find((tag) => tag.system_key === key)?.id as
      | string
      | undefined) ?? null;
  const rallyTagId = tagIdFor("rally_lead");
  const holderTagId = tagIdFor("castle_holder");
  const tagRows = [rallyTagId, holderTagId].some(Boolean)
    ? ((
        await admin
          .from("state_member_tags")
          .select("tag_id, wos_account_id")
          .in("tag_id", [rallyTagId, holderTagId].filter(Boolean) as string[])
      ).data ?? [])
    : [];
  const taggedWith = (tagId: string | null) =>
    new Set(
      tagRows
        .filter((row) => row.tag_id === tagId)
        .map((row) => row.wos_account_id as string),
    );

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
    rallyLeads: taggedWith(rallyTagId),
    castleHolders: taggedWith(holderTagId),
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

// The garrison: Castle Holders who can play, one per pet block, holding in
// the first holder's alliance. Skipped when the state has no holders yet.
async function createGarrison(
  admin: AdminClient,
  plan: { id: string; state_id: string },
  settings: AutoPlanSettings,
  loaded: Loaded,
) {
  if (loaded.groups.some((group) => group.kind === "garrison")) return 0;
  const availability = (id: string) => loaded.answers.get(id)?.availability;
  const holders = loaded.members
    .filter((member) => loaded.castleHolders.has(member.id))
    .filter((member) => {
      const answer = availability(member.id);
      return Boolean(answer) && answer !== "unavailable";
    })
    .sort(compareDefense);
  const rotation = planRotation(
    holders.map((member) => member.id),
    availability,
  );
  const first = holders.find((member) => rotation.includes(member.id));
  if (!first) return 0;

  const allianceId = await allianceFor(admin, plan.state_id, first, loaded);
  const { data: group, error } = await admin
    .from("battle_plan_groups")
    .insert({
      plan_id: plan.id,
      state_id: plan.state_id,
      name: "Garrison",
      kind: "garrison",
      leader_wos_account_id: rotation.find(Boolean)!,
      lead_rotation: rotation,
      alliance_id: allianceId,
      max_members: (settings.garrison_size ?? 15) + 1,
      sort_order: -1,
      shift: "whole",
    })
    .select(GROUP_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  await assignLeads(admin, plan, group as Group, loaded);
  loaded.groups.unshift(group as Group);
  return 1;
}

// Rallies: one per Rally Lead who can play (the best Labyrinth players are
// made Rally Leads when there are too few), and every rally gets one lead
// per pet block from the Rally Leads left over, so leads swap when their
// pets run out. Joiners stay for the whole battle.
async function createRallies(
  admin: AdminClient,
  plan: { id: string; state_id: string },
  settings: AutoPlanSettings,
  loaded: Loaded,
) {
  const availability = (id: string) => loaded.answers.get(id)?.availability;
  const canPlay = (member: Member) => {
    const answer = availability(member.id);
    return Boolean(answer) && answer !== "unavailable";
  };
  const byLabyrinth = (first: Member, second: Member) =>
    (second.labyrinth_score ?? 0) - (first.labyrinth_score ?? 0) ||
    (second.power ?? 0) - (first.power ?? 0);

  const busy = new Set(
    loaded.groups.flatMap((group) => [
      group.leader_wos_account_id,
      ...((group.lead_rotation ?? []).filter(Boolean) as string[]),
    ]),
  );
  const available = loaded.members.filter(
    (member) => canPlay(member) && !busy.has(member.id) && !loaded.castleHolders.has(member.id),
  );
  const tagged = available.filter((member) => loaded.rallyLeads.has(member.id)).sort(byLabyrinth);
  const extra = available
    .filter((member) => !loaded.rallyLeads.has(member.id))
    .sort(byLabyrinth)
    .slice(0, Math.max(0, settings.rally_count - tagged.length));
  for (const member of extra) {
    if (!loaded.rallyTagId) break;
    await admin.from("state_member_tags").insert({
      tag_id: loaded.rallyTagId,
      wos_account_id: member.id,
      source: "manual",
    });
    loaded.rallyLeads.add(member.id);
  }
  const leads = [...tagged, ...extra];
  const rallyCount = Math.min(settings.rally_count, leads.length);
  if (!rallyCount) return 0;

  // The best leads start one rally each. Every other lead joins the rally
  // whose uncovered pet blocks they cover most, so the swaps fill the gaps.
  const teams = leads.slice(0, rallyCount).map((lead) => [lead]);
  const covered = (team: Member[]) =>
    PET_BLOCKS.map((_, block) =>
      team.some((member) => blockFits(availability(member.id), block)),
    );
  for (const lead of leads.slice(rallyCount)) {
    const gain = (team: Member[]) =>
      covered(team).filter(
        (isCovered, block) => !isCovered && blockFits(availability(lead.id), block),
      ).length;
    const best = [...teams].sort(
      (first, second) =>
        gain(second) - gain(first) || first.length - second.length,
    )[0];
    best.push(lead);
  }

  let created = 0;
  for (const [index, team] of teams.entries()) {
    const rotation = planRotation(
      team.map((member) => member.id),
      availability,
    );
    const leaderId = rotation.find(Boolean) ?? team[0].id;
    const leader = team.find((member) => member.id === leaderId) ?? team[0];
    const allianceId = await allianceFor(admin, plan.state_id, leader, loaded);
    const { data: group, error } = await admin
      .from("battle_plan_groups")
      .insert({
        plan_id: plan.id,
        state_id: plan.state_id,
        name: `${displayName(leader).slice(0, 50)} rally`,
        kind: "rally",
        leader_wos_account_id: leader.id,
        lead_rotation: rotation,
        alliance_id: allianceId,
        max_members: settings.rally_size,
        sort_order: index,
        shift: "whole",
        formation: settings.default_formation,
        joiner_heroes: settings.default_joiner_heroes,
      })
      .select(GROUP_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    await assignLeads(admin, plan, group as Group, loaded);
    loaded.groups.push(group as Group);
    created += 1;
  }
  return created;
}

// Puts the leads (or holders) of a group in it, so they are counted and told.
async function assignLeads(
  admin: AdminClient,
  plan: { id: string; state_id: string },
  group: Group,
  loaded: Loaded,
) {
  const ids = [
    ...new Set([
      group.leader_wos_account_id,
      ...((group.lead_rotation ?? []).filter(Boolean) as string[]),
    ]),
  ];
  const { error } = await admin.from("battle_plan_assignments").upsert(
    ids.map((id) => ({
      plan_id: plan.id,
      group_id: group.id,
      state_id: plan.state_id,
      wos_account_id: id,
    })),
    { onConflict: "plan_id,wos_account_id" },
  );
  if (error) throw new Error(error.message);
  loaded.assignments = loaded.assignments.filter((row) => !ids.includes(row.wos_account_id));
  loaded.assignments.push(
    ...ids.map((id) => ({ group_id: group.id, wos_account_id: id, hero: null })),
  );
}

// Adds members who can play and are not placed yet to open seats: the
// garrison first, then the rallies. Never moves anyone.
async function fillRallies(
  admin: AdminClient,
  plan: { id: string; state_id: string },
  settings: AutoPlanSettings,
  loaded: Loaded,
) {
  if (!loaded.groups.length) return 0;
  const powerOf = new Map(loaded.members.map((member) => [member.id, member.power ?? 0]));
  const assigned = new Set(loaded.assignments.map((row) => row.wos_account_id));

  const groups: FillGroup[] = loaded.groups.map((group) => {
    const rows = loaded.assignments.filter((row) => row.group_id === group.id);
    const heroUsage: Record<string, number> = {};
    rows.forEach((row) => {
      if (row.hero) heroUsage[row.hero] = (heroUsage[row.hero] ?? 0) + 1;
    });
    const seats = seatMemberIds(
      group.leader_wos_account_id,
      group.lead_rotation ?? [],
      rows.map((row) => row.wos_account_id),
    );
    return {
      id: group.id,
      kind: group.kind ?? "rally",
      maxMembers: group.max_members,
      memberIds: seats,
      shift: group.shift ?? "whole",
      joinerHeroes: group.kind === "garrison" ? [] : (group.joiner_heroes ?? []),
      heroUsage,
      totalPower: seats.reduce((sum, id) => sum + (powerOf.get(id) ?? 0), 0),
    };
  });
  const candidates: FillMember[] = loaded.members
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
      defense: member,
    }));
  const priorities = settings.autofill_priorities.filter(
    (value): value is AutofillCriterion =>
      VALID_CRITERIA.includes(value as AutofillCriterion),
  );

  const drafts = fillPlan(
    groups,
    candidates,
    priorities,
    new Set([...loaded.rallyLeads, ...loaded.castleHolders]),
  );
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
      await createGarrison(admin, plan, settings, loaded);
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
