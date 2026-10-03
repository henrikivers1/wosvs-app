"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { SvsStatus } from "@/components/SvsStatus";
import { MoreMenu } from "@/components/planning/MoreMenu";
import { NeedsAttention } from "@/components/planning/NeedsAttention";
import { NextSvsChecklist } from "@/components/planning/NextSvsChecklist";
import {
  PlanComments,
  type PlanComment,
} from "@/components/planning/PlanComments";
import { PlayerSheet } from "@/components/planning/PlayerSheet";
import { RallyColumn } from "@/components/planning/RallyColumn";
import { RallyForm, type RallyFormValues } from "@/components/planning/RallyForm";
import { RallyLeadsPanel } from "@/components/planning/RallyLeadsPanel";
import { RallySetupEditor } from "@/components/planning/RallySetupEditor";
import { UnassignedList } from "@/components/planning/UnassignedList";
import { findPlanIssues, type PlanIssue } from "@/components/planning/planIssues";
import {
  averageTroopTier,
  type AccountRow,
  type BattlePlan,
  type PlanAssignment,
  type PlanGroup,
  type StateAlliance,
  type StateMember,
  type StateTag,
} from "@/components/planning/types";
import {
  AUTOFILL_CRITERIA,
  computeAutofill,
  distributeGroupHeroes,
  pickHero,
  type AutofillCriterion,
  type AutofillDraft,
  type AutofillGroup,
  type AutofillMember,
} from "@/lib/autofill";
import type { AttendanceRow } from "@/lib/attendance";
import { useStates } from "@/components/StateProvider";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/components/LanguageProvider";

export type AutomationSettings = {
  auto_plan: boolean;
  auto_publish: boolean;
  rally_count: number;
  rally_size: number;
  default_formation: string | null;
  default_joiner_heroes: string[];
  autofill_priorities: string[];
};
// Plans this long after their battle start move to the history list.
const PLAN_HISTORY_AFTER_MS = 5 * 60 * 60 * 1000;
const ACCOUNT_COLUMNS =
  "id, user_id, wos_id, nickname, furnace_level, furnace_level_raw, power, labyrinth_score, heroes_updated_at, infantry_tier, lancer_tier, marksman_tier, infantry_fc_level, lancer_fc_level, marksman_fc_level, infantry_t12_skill, lancer_t12_skill, marksman_t12_skill, alliance_abbr";
type ScheduledBattle = {
  id: string;
  plan_id: string | null;
  status: "scheduled" | "active" | "completed" | "cancelled";
  scheduled_at: string | null;
};
type RallyEditor = { groupId: string; mode: "setup" | "edit" } | null;

function parseOpponent(value: string) {
  const trimmed = value.trim();
  return /^[0-9]+$/.test(trimmed) && Number(trimmed) > 0
    ? Number(trimmed)
    : null;
}

// The edit form works in UTC, like the game: "2026-10-10T12:00".
function toUtcInputValue(value: string) {
  return new Date(value).toISOString().slice(0, 16);
}

function fromUtcInputValue(value: string) {
  return new Date(`${value}:00Z`);
}

function scrollToRally(groupId: string) {
  window.setTimeout(
    () =>
      document
        .getElementById(`rally-${groupId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" }),
    50,
  );
}

export default function BattlePlanningPage() {
  const { t, formatDateTime } = useLanguage();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { activeMembership, signedIn, loadingStates } = useStates();
  const [plans, setPlans] = useState<BattlePlan[]>([]);
  const [groups, setGroups] = useState<PlanGroup[]>([]);
  const [assignments, setAssignments] = useState<PlanAssignment[]>([]);
  const [members, setMembers] = useState<StateMember[]>([]);
  const [tags, setTags] = useState<StateTag[]>([]);
  const [alliances, setAlliances] = useState<StateAlliance[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [heroGeneration, setHeroGeneration] = useState<number | null>(null);
  const [automation, setAutomation] = useState<AutomationSettings | null>(
    null,
  );
  // When the data was loaded; used instead of reading the clock in render.
  const [loadedAt, setLoadedAt] = useState(0);
  const [newPlanOpponent, setNewPlanOpponent] = useState("");
  const [newPlanDate, setNewPlanDate] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [planComments, setPlanComments] = useState<PlanComment[]>([]);
  const [scheduledBattles, setScheduledBattles] = useState<ScheduledBattle[]>(
    [],
  );
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [editingPlanName, setEditingPlanName] = useState("");
  const [editingScheduledAt, setEditingScheduledAt] = useState("");
  const [editingPlanNotes, setEditingPlanNotes] = useState("");
  const [editingPlanOpponent, setEditingPlanOpponent] = useState("");
  const [addingRallyToPlanId, setAddingRallyToPlanId] = useState<
    string | null
  >(null);
  const [rallyEditor, setRallyEditor] = useState<RallyEditor>(null);
  const [showRallyLeads, setShowRallyLeads] = useState(false);
  const [openPlayer, setOpenPlayer] = useState<{
    planId: string;
    memberId: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const isAdmin =
    activeMembership?.role === "owner" || activeMembership?.role === "admin";
  const regularTags = tags.filter((tag) => !tag.system_key);
  const rallyLeaders = members.filter((member) =>
    member.tags.some((tag) => tag.system_key === "rally_lead"),
  );

  const loadPlanning = useCallback(async () => {
    if (!activeMembership) {
      setPlans([]);
      setGroups([]);
      setAssignments([]);
      setMembers([]);
      setTags([]);
      setAlliances([]);
      setAttendance([]);
      setPlanComments([]);
      setScheduledBattles([]);
      setLoading(false);
      return;
    }
    const stateId = activeMembership.stateId;
    // Round 1: everything that only needs the state id.
    const [
      planResult,
      memberResult,
      tagResult,
      allianceResult,
      attendanceResult,
      battleResult,
      stateResult,
    ] = await Promise.all([
      supabase
        .from("battle_plans")
        .select(
          "id, name, battle_type, scheduled_at, notes, status, opponent_state_number, auto_created, attendance_reminder_sent_at, auto_planned_at",
        )
        .eq("state_id", stateId)
        .order("scheduled_at", { ascending: true }),
      supabase
        .from("state_members")
        .select(`wos_account_id, role, wos_accounts!inner(${ACCOUNT_COLUMNS})`)
        .eq("state_id", stateId),
      supabase
        .from("state_tags")
        .select("id, name, color, system_key, kind")
        .eq("state_id", stateId)
        .order("name"),
      supabase
        .from("state_alliances")
        .select("id, name, color, max_members")
        .eq("state_id", stateId)
        .order("name"),
      supabase
        .from("battle_attendance")
        .select("plan_id, wos_account_id, availability, voice_call")
        .eq("state_id", stateId),
      supabase
        .from("battles")
        .select("id, plan_id, status, scheduled_at")
        .eq("state_id", stateId)
        .in("status", ["scheduled", "active", "completed"]),
      supabase
        .from("states")
        .select(
          "hero_generation_max, svs_opponent, svs_battle_at, svs_next_battle_at, auto_plan, auto_publish, rally_count, rally_size, default_formation, default_joiner_heroes, autofill_priorities",
        )
        .eq("id", stateId)
        .maybeSingle(),
    ]);
    const firstError =
      planResult.error ||
      memberResult.error ||
      tagResult.error ||
      allianceResult.error ||
      attendanceResult.error ||
      battleResult.error ||
      stateResult.error;
    if (firstError) {
      setMessage(firstError.message);
      setLoading(false);
      return;
    }

    const planRows = (planResult.data ?? []) as BattlePlan[];
    const memberRows = (memberResult.data ?? []) as unknown as Array<{
      wos_account_id: string;
      role: string;
      wos_accounts: AccountRow | AccountRow[];
    }>;
    const accountRows = memberRows.map((row) =>
      Array.isArray(row.wos_accounts) ? row.wos_accounts[0] : row.wos_accounts,
    );
    const stateTags = (tagResult.data ?? []) as StateTag[];
    // Full detail only for current plans; older ones are listed as history.
    const now = Date.now();
    setLoadedAt(now);
    const historyBefore = now - PLAN_HISTORY_AFTER_MS;
    const planIds = planRows
      .filter((plan) => new Date(plan.scheduled_at).getTime() > historyBefore)
      .map((plan) => plan.id);
    const accountIds = accountRows.map((account) => account.id);
    const userIds = [...new Set(accountRows.map((account) => account.user_id))];

    // Round 2: rows that hang off the plans and members found above.
    const [
      groupResult,
      assignmentResult,
      tagAssignmentResult,
      commentResult,
      heroResult,
      profileResult,
    ] = await Promise.all([
      planIds.length
        ? supabase
            .from("battle_plan_groups")
            .select(
              "id, plan_id, name, leader_wos_account_id, alliance_id, assignment_tag_id, max_members, notes, sort_order, formation, joiner_heroes, shift",
            )
            .in("plan_id", planIds)
            .order("sort_order")
        : Promise.resolve({ data: [], error: null }),
      planIds.length
        ? supabase
            .from("battle_plan_assignments")
            .select("plan_id, group_id, wos_account_id, hero")
            .in("plan_id", planIds)
        : Promise.resolve({ data: [], error: null }),
      accountIds.length
        ? supabase
            .from("state_member_tags")
            .select("tag_id, wos_account_id")
            .in("wos_account_id", accountIds)
        : Promise.resolve({ data: [], error: null }),
      planIds.length
        ? supabase.rpc("get_battle_plan_comments", {
            target_state_id: stateId,
            viewer_wos_account_id: activeMembership.wosAccountId,
          })
        : Promise.resolve({ data: [], error: null }),
      accountIds.length
        ? supabase
            .from("player_heroes")
            .select("wos_account_id, hero")
            .in("wos_account_id", accountIds)
        : Promise.resolve({ data: [], error: null }),
      userIds.length
        ? supabase.from("profiles").select("id, username").in("id", userIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    const secondError =
      groupResult.error ||
      assignmentResult.error ||
      tagAssignmentResult.error ||
      commentResult.error ||
      heroResult.error ||
      profileResult.error;
    if (secondError) {
      setMessage(secondError.message);
      setLoading(false);
      return;
    }

    const stateRow = stateResult.data;
    const heroesByAccount = new Map<string, string[]>();
    (
      (heroResult.data ?? []) as { wos_account_id: string; hero: string }[]
    ).forEach((row) =>
      heroesByAccount.set(row.wos_account_id, [
        ...(heroesByAccount.get(row.wos_account_id) ?? []),
        row.hero,
      ]),
    );
    setHeroGeneration(stateRow?.hero_generation_max ?? null);
    setAutomation(
      stateRow && "auto_plan" in stateRow
        ? (stateRow as unknown as AutomationSettings)
        : null,
    );
    const nextBattle = stateRow?.svs_battle_at ?? stateRow?.svs_next_battle_at;
    setNewPlanOpponent(
      stateRow?.svs_opponent ? String(stateRow.svs_opponent) : "",
    );
    setNewPlanDate(nextBattle ? String(nextBattle).slice(0, 10) : "");
    const membershipById = new Map(
      memberRows.map((member) => [member.wos_account_id, member]),
    );
    const usernameById = new Map(
      (profileResult.data ?? []).map((profile) => [
        profile.id,
        profile.username,
      ]),
    );
    const tagById = new Map(stateTags.map((tag) => [tag.id, tag]));
    const tagAssignments = (tagAssignmentResult.data ?? []) as Array<{
      tag_id: string;
      wos_account_id: string;
    }>;
    const loadedMembers = accountRows
      .flatMap<StateMember>((account) => {
        const membership = membershipById.get(account.id);
        if (!membership) return [];
        return [
          {
            ...account,
            role: membership.role,
            username: usernameById.get(account.user_id) ?? null,
            heroes: heroesByAccount.get(account.id) ?? [],
            tags: tagAssignments
              .filter((item) => item.wos_account_id === account.id)
              .flatMap((item) => {
                const tag = tagById.get(item.tag_id);
                return tag ? [tag] : [];
              }),
          },
        ];
      })
      .sort((first, second) =>
        (first.nickname || first.wos_id).localeCompare(
          second.nickname || second.wos_id,
        ),
      );
    setPlans(planRows);
    setGroups((groupResult.data ?? []) as PlanGroup[]);
    setAssignments((assignmentResult.data ?? []) as PlanAssignment[]);
    setMembers(loadedMembers);
    setTags(stateTags);
    setAlliances((allianceResult.data ?? []) as StateAlliance[]);
    setAttendance((attendanceResult.data ?? []) as AttendanceRow[]);
    setPlanComments((commentResult.data ?? []) as PlanComment[]);
    setScheduledBattles((battleResult.data ?? []) as ScheduledBattle[]);
    setLoading(false);
  }, [activeMembership, supabase]);

  useEffect(() => {
    if (!loadingStates && signedIn === false) {
      router.replace("/login");
      return;
    }
    const loadId = window.setTimeout(() => void loadPlanning(), 0);
    return () => window.clearTimeout(loadId);
  }, [loadPlanning, loadingStates, router, signedIn]);

  // One reload for a burst of changes (an auto-fill writes a row per
  // player), and only for this state's rows.
  useEffect(() => {
    if (!activeMembership) return;
    let timer: number | undefined;
    const reload = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void loadPlanning(), 400);
    };
    const stateFilter = `state_id=eq.${activeMembership.stateId}`;
    const channel = supabase.channel(`planning-${activeMembership.key}`);
    for (const table of [
      "battle_plans",
      "battle_plan_groups",
      "battle_plan_assignments",
      "battle_plan_comments",
      "battle_attendance",
      "battles",
    ]) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: stateFilter },
        reload,
      );
    }
    channel.subscribe();
    return () => {
      window.clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [activeMembership, loadPlanning, supabase]);

  // Runs one write, reloads, and shows its message or error.
  async function run(
    action: () => PromiseLike<{ error: { message: string } | null }>,
    success?: string,
  ) {
    setSaving(true);
    setMessage("");
    const { error } = await action();
    if (error) setMessage(error.message);
    else {
      await loadPlanning();
      if (success) setMessage(success);
    }
    setSaving(false);
    return !error;
  }

  // --- Plan ---------------------------------------------------------------
  function beginEditingPlan(plan: BattlePlan) {
    setEditingPlanId(plan.id);
    setEditingPlanName(plan.name);
    setEditingScheduledAt(toUtcInputValue(plan.scheduled_at));
    setEditingPlanNotes(plan.notes ?? "");
    setEditingPlanOpponent(
      plan.opponent_state_number ? String(plan.opponent_state_number) : "",
    );
  }
  async function savePlan() {
    if (!editingPlanId) return;
    const date = fromUtcInputValue(editingScheduledAt);
    if (editingPlanName.trim().length < 3 || Number.isNaN(date.getTime())) {
      setMessage(t("Enter a valid plan name and time."));
      return;
    }
    const saved = await run(async () => {
      const { error } = await supabase.rpc("update_battle_plan", {
        target_plan_id: editingPlanId,
        plan_name: editingPlanName.trim(),
        selected_battle_type: "svs",
        plan_scheduled_at: date.toISOString(),
        plan_notes: editingPlanNotes.trim() || null,
      });
      if (error) return { error };
      return supabase.rpc("set_battle_plan_opponent", {
        target_plan_id: editingPlanId,
        opponent_number: parseOpponent(editingPlanOpponent),
      });
    }, t("Battle plan updated. Republish to notify players."));
    if (saved) setEditingPlanId(null);
  }
  async function deletePlan(plan: BattlePlan) {
    if (
      !window.confirm(
        t(
          "Delete “{name}”, every group in it and its upcoming battle? Finished battles stay in the history.",
          { name: plan.name },
        ),
      )
    )
      return;
    await run(
      () =>
        supabase.rpc("delete_battle_plan", { target_plan_id: plan.id }),
      t("Battle plan deleted."),
    );
  }
  // After publishing, changes go out with Republish.
  async function republishPlan(plan: BattlePlan) {
    if (
      !activeMembership ||
      !window.confirm(
        t("Republish “{name}”? Every member gets their updated assignment.", {
          name: plan.name,
        }),
      )
    )
      return;
    setSaving(true);
    setMessage("");
    const { data, error } = await supabase.rpc(
      "publish_battle_plan_with_notifications",
      {
        target_plan_id: plan.id,
        actor_wos_account_id: activeMembership.wosAccountId,
      },
    );
    if (error) setMessage(error.message);
    else {
      await loadPlanning();
      setMessage(
        t("Republished. {count} accounts notified.", {
          count: Number(data ?? 0),
        }),
      );
    }
    setSaving(false);
  }
  async function createSvsPlan() {
    if (!activeMembership || !isAdmin) return;
    await run(
      () =>
        supabase.rpc("create_svs_plan", {
          target_state_id: activeMembership.stateId,
          opponent_number: Number(newPlanOpponent) || null,
          battle_date: newPlanDate || null,
        }),
      t("SvS plan created."),
    );
  }

  // Runs the automation's next step now ("generate" also fills open seats).
  async function runPlanStep(planId: string, action: "generate" | "publish") {
    if (!activeMembership || saving) return;
    if (
      action === "publish" &&
      !window.confirm(
        t("Publish now? Every member gets their rally assignment."),
      )
    ) {
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/automation/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stateId: activeMembership.stateId,
          planId,
          action,
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        ralliesCreated?: number;
        playersAssigned?: number;
        published?: boolean;
      };
      if (!response.ok) throw new Error(result.error ?? "Planning failed.");
      setMessage(
        result.published
          ? t("Published. Every member got their assignment.")
          : t("{rallies} rallies created, {players} players added.", {
              rallies: result.ralliesCreated ?? 0,
              players: result.playersAssigned ?? 0,
            }),
      );
      await loadPlanning();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  // --- Rallies ------------------------------------------------------------
  async function saveRally(planId: string, group: PlanGroup | null, values: RallyFormValues) {
    if (!values.name.trim() || !values.leaderId || !values.allianceId) {
      setMessage(t("Enter a name, Rally Lead, and destination alliance."));
      return;
    }
    const fields = {
      group_name: values.name.trim(),
      leader_account_id: values.leaderId,
      destination_alliance_id: values.allianceId,
      publish_tag_id: values.tagId || null,
      group_max_members: values.capacity,
      group_notes: values.notes.trim() || null,
    };
    const saved = await run(
      () =>
        group
          ? supabase.rpc("update_battle_plan_group", {
              target_group_id: group.id,
              ...fields,
            })
          : supabase.rpc("create_battle_plan_group", {
              target_plan_id: planId,
              ...fields,
            }),
      group ? t("Rally updated.") : t("Rally added."),
    );
    if (saved) {
      setRallyEditor(null);
      setAddingRallyToPlanId(null);
    }
  }
  async function deleteRally(group: PlanGroup) {
    const count = assignments.filter((item) => item.group_id === group.id).length;
    if (
      !window.confirm(
        t("Delete “{name}”? Its {count} players go back to the waiting list.", {
          name: group.name,
          count,
        }),
      )
    )
      return;
    await run(() =>
      supabase.rpc("delete_battle_plan_group", { target_group_id: group.id }),
    );
  }

  // Current state of one rally for auto-fill and hero picking.
  function toAutofillGroup(group: PlanGroup): AutofillGroup {
    const groupAssignments = assignments.filter(
      (item) => item.group_id === group.id,
    );
    const heroUsage: Record<string, number> = {};
    groupAssignments.forEach((item) => {
      if (item.hero) heroUsage[item.hero] = (heroUsage[item.hero] ?? 0) + 1;
    });
    return {
      id: group.id,
      maxMembers: group.max_members,
      memberIds: groupAssignments.map((item) => item.wos_account_id),
      shift: group.shift ?? "whole",
      joinerHeroes: group.joiner_heroes ?? [],
      heroUsage,
      totalPower: groupAssignments.reduce(
        (sum, item) =>
          sum +
          (members.find((member) => member.id === item.wos_account_id)?.power ??
            0),
        0,
      ),
    };
  }
  function applyDrafts(
    planId: string,
    drafts: AutofillDraft[],
    replaceExisting: boolean,
  ) {
    return supabase.rpc("apply_battle_plan_autofill", {
      target_plan_id: planId,
      new_assignments: drafts,
      replace_existing: replaceExisting,
    });
  }
  // Empties every rally (leaders stay) and fills them again by the state's
  // auto-fill priorities.
  async function rebuildRallies(planId: string) {
    const planGroups = groups.filter((group) => group.plan_id === planId);
    if (!planGroups.length) return;
    if (
      !window.confirm(
        t(
          "Rebuild every rally from scratch? Leaders stay; everyone else is placed again by your auto-fill priorities, and hand-made changes are lost.",
        ),
      )
    )
      return;
    const priorities = (
      automation?.autofill_priorities ?? ["hero_match", "equal_power", "fc"]
    ).filter((value): value is AutofillCriterion =>
      AUTOFILL_CRITERIA.some((criterion) => criterion.value === value),
    );
    const leaderIds = new Set(planGroups.map((group) => group.leader_wos_account_id));
    const answers = new Map(
      attendance
        .filter((row) => row.plan_id === planId)
        .map((row) => [row.wos_account_id, row]),
    );
    const pool: AutofillMember[] = members
      .filter((member) => !leaderIds.has(member.id))
      .map((member) => ({
        id: member.id,
        power: member.power ?? 0,
        fc: member.furnace_level_raw ?? 0,
        troop: averageTroopTier(member),
        labyrinth: member.labyrinth_score ?? 0,
        voice: Boolean(answers.get(member.id)?.voice_call),
        availability: answers.get(member.id)?.availability ?? null,
        heroes: member.heroes,
      }));
    const drafts = computeAutofill(
      planGroups.map((group) => ({
        ...toAutofillGroup(group),
        memberIds: [group.leader_wos_account_id],
        heroUsage: {},
        totalPower:
          members.find((member) => member.id === group.leader_wos_account_id)
            ?.power ?? 0,
      })),
      pool,
      priorities,
      { requireHero: false },
    );
    await run(
      () => applyDrafts(planId, drafts, true),
      t("Rallies rebuilt: {count} players placed.", { count: drafts.length }),
    );
  }
  async function moveMembers(planId: string, groupId: string, ids: string[]) {
    if (!isAdmin || saving || !ids.length) return;
    const group = groups.find((item) => item.id === groupId);
    if (!group) return;
    const current = toAutofillGroup(group);
    const drafts: AutofillDraft[] = ids.map((id) => {
      const member = members.find((item) => item.id === id);
      const hero = pickHero(
        current.joinerHeroes,
        member?.heroes ?? [],
        current.heroUsage,
      );
      if (hero) current.heroUsage[hero] = (current.heroUsage[hero] ?? 0) + 1;
      return { group_id: groupId, wos_account_id: id, hero };
    });
    const moved = await run(() => applyDrafts(planId, drafts, false));
    if (moved) setSelectedIds(new Set());
  }
  async function moveMember(planId: string, accountId: string, groupId: string | null) {
    if (!isAdmin || saving) return;
    if (groups.some((group) => group.leader_wos_account_id === accountId)) {
      setMessage(t("Rally Leads stay with their rally. Change the leader instead."));
      return;
    }
    if (groupId) {
      await moveMembers(planId, groupId, [accountId]);
      return;
    }
    await run(() =>
      supabase.rpc("set_battle_plan_assignment", {
        target_plan_id: planId,
        target_wos_account_id: accountId,
        target_group_id: null,
      }),
    );
  }
  async function setMemberHero(planId: string, accountId: string, hero: string | null) {
    if (!isAdmin || saving) return;
    await run(() =>
      supabase.rpc("set_assignment_details", {
        target_plan_id: planId,
        target_wos_account_id: accountId,
        assigned_hero: hero,
        assigned_formation: null,
      }),
    );
  }
  // Hands the rally's joiner heroes to its members by 4★ ownership so
  // every hero is covered.
  async function assignGroupHeroes(
    planId: string,
    group: PlanGroup,
    joinerHeroes: string[] = group.joiner_heroes ?? [],
  ) {
    if (!isAdmin) return;
    const memberIds = assignments
      .filter((item) => item.group_id === group.id)
      .map((item) => item.wos_account_id);
    const heroes = distributeGroupHeroes(
      memberIds,
      group.leader_wos_account_id,
      joinerHeroes,
      (memberId) =>
        members.find((member) => member.id === memberId)?.heroes ?? [],
    );
    const drafts: AutofillDraft[] = Object.entries(heroes).map(
      ([memberId, hero]) => ({ group_id: group.id, wos_account_id: memberId, hero }),
    );
    if (!drafts.length) return;
    const covered = new Set(Object.values(heroes).filter(Boolean));
    await run(
      () => applyDrafts(planId, drafts, false),
      t("Heroes assigned in {group}: {covered} of {total} joiner heroes covered.", {
        group: group.name,
        covered: covered.size,
        total: joinerHeroes.length,
      }),
    );
  }
  async function toggleRallyLead(member: StateMember, enabled: boolean) {
    if (!activeMembership) return;
    await run(() =>
      supabase.rpc("set_state_rally_lead", {
        target_state_id: activeMembership.stateId,
        target_wos_account_id: member.id,
        enabled,
      }),
    );
  }

  // --- Comments -----------------------------------------------------------
  async function postComment(
    planId: string,
    body: string,
    visibility: "public" | "admins",
  ) {
    if (!activeMembership || !body) return false;
    return run(
      () =>
        supabase.rpc("create_battle_plan_comment", {
          target_plan_id: planId,
          commenter_wos_account_id: activeMembership.wosAccountId,
          comment_body: body,
          comment_visibility: visibility,
        }),
      t("Comment posted."),
    );
  }
  async function deleteComment(comment: PlanComment) {
    if (!window.confirm(t("Delete this comment?"))) return;
    await run(
      () =>
        supabase.rpc("delete_battle_plan_comment", {
          target_comment_id: comment.id,
          actor_wos_account_id: activeMembership?.wosAccountId,
        }),
      t("Comment deleted."),
    );
  }

  if (loadingStates || signedIn === null)
    return (
      <main>
        <AppHeader />
        <section className="loading-panel">
          <p>{t("Loading battle planning...")}</p>
        </section>
      </main>
    );

  const historyBefore = loadedAt - PLAN_HISTORY_AFTER_MS;
  const currentPlans = plans.filter(
    (plan) => new Date(plan.scheduled_at).getTime() > historyBefore,
  );
  const historyPlans = plans
    .filter((plan) => new Date(plan.scheduled_at).getTime() <= historyBefore)
    .reverse();

  function renderPlan(plan: BattlePlan) {
    if (!activeMembership) return null;
    const planGroups = groups.filter((group) => group.plan_id === plan.id);
    const planAssignments = assignments.filter((item) => item.plan_id === plan.id);
    const planAttendance = attendance.filter((row) => row.plan_id === plan.id);
    const answers = new Map(planAttendance.map((row) => [row.wos_account_id, row]));
    const assignmentById = new Map(
      planAssignments.map((item) => [item.wos_account_id, item]),
    );
    const issues: PlanIssue[] = isAdmin
      ? findPlanIssues({
          groups: planGroups,
          assignments: planAssignments,
          members,
          attendance: planAttendance,
        })
      : [];
    const flagged = new Set(
      issues.flatMap((issue) =>
        "member" in issue
          ? [issue.member.id]
          : "members" in issue
            ? issue.members.map((member) => member.id)
            : [],
      ),
    );
    const heroByMember = new Map(
      planAssignments.map((item) => [item.wos_account_id, item.hero]),
    );
    const waiting = members.filter((member) => !assignmentById.has(member.id));
    const scheduledBattle = scheduledBattles.find(
      (battle) => battle.plan_id === plan.id,
    );
    const battleStarted =
      scheduledBattle?.status === "active" ||
      scheduledBattle?.status === "completed";
    const comments = planComments.filter((comment) => comment.plan_id === plan.id);
    const ownGroup = planGroups.find(
      (group) =>
        group.id === assignmentById.get(activeMembership.wosAccountId)?.group_id,
    );
    const leadCount = rallyLeaders.length;

    const openSheet = (member: StateMember) =>
      setOpenPlayer({ planId: plan.id, memberId: member.id });

    return (
      <div key={plan.id} className="plan-workspace-wrap">
        {isAdmin && (
          <NextSvsChecklist
            plan={plan}
            autoPlan={automation?.auto_plan ?? true}
            autoPublish={automation?.auto_publish ?? true}
            memberCount={members.length}
            votedCount={planAttendance.length}
            availableCount={
              planAttendance.filter((row) => row.availability !== "unavailable")
                .length
            }
            rallyCount={planGroups.length}
            assignedCount={planAssignments.length}
            issueCount={
              issues.filter(
                (issue) =>
                  issue.kind !== "heroes_unknown" &&
                  issue.kind !== "no_hero_anywhere",
              ).length
            }
            missingAlliance={planGroups.filter((group) => !group.alliance_id).length}
            busy={saving}
            now={loadedAt}
            onGenerate={() => void runPlanStep(plan.id, "generate")}
            onPublish={() => void runPlanStep(plan.id, "publish")}
          />
        )}

        <div className="plan-toolbar">
          <div className="plan-toolbar-title">
            <h2>{plan.name}</h2>
            <span
              className={`plan-status-pill ${plan.status === "published" ? "is-published" : ""}`}
            >
              {plan.status === "published" ? t("Published") : t("Draft")}
            </span>
            <time>{formatDateTime(plan.scheduled_at)}</time>
          </div>
          {isAdmin && (
            <div className="plan-toolbar-actions">
              <button
                type="button"
                className="secondary-link"
                aria-expanded={showRallyLeads}
                onClick={() => setShowRallyLeads((value) => !value)}
              >
                {t("Rally Leads ({count})", { count: leadCount })}
              </button>
              {plan.status === "published" && (
                <button
                  type="button"
                  className="secondary-link"
                  disabled={saving || battleStarted}
                  onClick={() => void republishPlan(plan)}
                >
                  {t("Republish")}
                </button>
              )}
              <MoreMenu
                label={t("Plan actions")}
                items={[
                  { label: t("Add rally"), onSelect: () => setAddingRallyToPlanId(plan.id) },
                  {
                    label: t("Rebuild all rallies"),
                    onSelect: () => void rebuildRallies(plan.id),
                    disabled: saving || !planGroups.length,
                  },
                  { label: t("Edit plan"), onSelect: () => beginEditingPlan(plan) },
                  ...(scheduledBattle?.status !== "active"
                    ? [
                        {
                          label: t("Delete plan"),
                          onSelect: () => void deletePlan(plan),
                          danger: true,
                        },
                      ]
                    : []),
                ]}
              />
            </div>
          )}
        </div>
        {plan.notes && <p className="battle-plan-notes">{plan.notes}</p>}
        {message && <p className="page-message">{message}</p>}

        {isAdmin && editingPlanId === plan.id && (
          <div className="plan-inline-editor">
            <label>
              {t("Plan name")}
              <input
                value={editingPlanName}
                onChange={(event) => setEditingPlanName(event.target.value)}
              />
            </label>
            <label>
              {t("Start (UTC)")}
              <input
                type="datetime-local"
                value={editingScheduledAt}
                onChange={(event) => setEditingScheduledAt(event.target.value)}
              />
            </label>
            <label>
              {t("Opponent state")}
              <input
                type="text"
                inputMode="numeric"
                value={editingPlanOpponent}
                onChange={(event) => setEditingPlanOpponent(event.target.value)}
              />
            </label>
            <label>
              {t("Notes")}
              <textarea
                value={editingPlanNotes}
                onChange={(event) => setEditingPlanNotes(event.target.value)}
              />
            </label>
            <div className="button-row">
              <button
                type="button"
                className="primary-button"
                disabled={saving}
                onClick={() => void savePlan()}
              >
                {t("Save plan")}
              </button>
              <button
                type="button"
                className="secondary-link"
                onClick={() => setEditingPlanId(null)}
              >
                {t("Cancel")}
              </button>
            </div>
          </div>
        )}

        {isAdmin && showRallyLeads && (
          <RallyLeadsPanel
            members={members}
            answers={answers}
            busy={saving}
            onToggle={(member, enabled) => void toggleRallyLead(member, enabled)}
            onClose={() => setShowRallyLeads(false)}
          />
        )}

        {isAdmin && addingRallyToPlanId === plan.id && (
          <section className="rally-form-panel">
            <h3>{t("Add rally")}</h3>
            <RallyForm
              group={null}
              leaders={rallyLeaders}
              alliances={alliances}
              tags={regularTags}
              busy={saving}
              onSubmit={(values) => void saveRally(plan.id, null, values)}
              onCancel={() => setAddingRallyToPlanId(null)}
            />
          </section>
        )}

        {isAdmin && planGroups.length > 0 && (
          <NeedsAttention
            issues={issues}
            busy={saving}
            onFillOpenSlots={() => void runPlanStep(plan.id, "generate")}
            onAssignHeroes={(group) => void assignGroupHeroes(plan.id, group)}
            onMove={(member, target) =>
              void moveMember(plan.id, member.id, target?.id ?? null)
            }
            onEditGroup={(group) => {
              setRallyEditor({ groupId: group.id, mode: "edit" });
              scrollToRally(group.id);
            }}
            onSetupGroup={(group) => {
              setRallyEditor({ groupId: group.id, mode: "setup" });
              scrollToRally(group.id);
            }}
            onOpenPlayer={openSheet}
          />
        )}

        {!isAdmin && (
          <div className="own-plan-assignment">
            <span>{t("Your assignment")}</span>
            <strong>{ownGroup?.name ?? t("Not in a rally yet")}</strong>
          </div>
        )}

        {planGroups.length === 0 ? (
          <div className="empty-state compact-empty-state">
            <h3>{t("No rallies yet")}</h3>
            <p>
              {isAdmin
                ? t("Press Generate now above, or add a rally from the ⋯ menu.")
                : t("Your admins have not set up the rallies yet.")}
            </p>
          </div>
        ) : (
          <div className={`plan-workspace${isAdmin ? "" : " is-readonly"}`}>
            {isAdmin && (
              <UnassignedList
                players={waiting}
                answers={answers}
                groups={planGroups}
                tags={tags}
                isAdmin={isAdmin}
                busy={saving}
                selectedIds={selectedIds}
                onToggle={(accountId) =>
                  setSelectedIds((current) => {
                    const next = new Set(current);
                    if (next.has(accountId)) next.delete(accountId);
                    else next.add(accountId);
                    return next;
                  })
                }
                onSelect={(ids) => setSelectedIds(new Set(ids))}
                onMoveSelected={(groupId) =>
                  void moveMembers(plan.id, groupId, [...selectedIds])
                }
                onOpenPlayer={openSheet}
                onDropPlayer={(accountId) =>
                  assignmentById.has(accountId) &&
                  void moveMember(plan.id, accountId, null)
                }
              />
            )}
            <div className="rally-board">
              {planGroups.map((group) => {
                const groupMembers = planAssignments
                  .filter((item) => item.group_id === group.id)
                  .flatMap((item) => {
                    const member = members.find(
                      (candidate) => candidate.id === item.wos_account_id,
                    );
                    return member ? [member] : [];
                  })
                  .sort((first, second) =>
                    first.id === group.leader_wos_account_id
                      ? -1
                      : second.id === group.leader_wos_account_id
                        ? 1
                        : (second.power ?? 0) - (first.power ?? 0),
                  );
                const editor =
                  isAdmin && rallyEditor?.groupId === group.id ? (
                    rallyEditor.mode === "setup" ? (
                      <RallySetupEditor
                        group={group}
                        heroGeneration={heroGeneration}
                        onCancel={() => setRallyEditor(null)}
                        onSaved={(joinerHeroes) => {
                          setRallyEditor(null);
                          void assignGroupHeroes(plan.id, group, joinerHeroes);
                        }}
                      />
                    ) : (
                      <RallyForm
                        group={group}
                        leaders={rallyLeaders}
                        alliances={alliances}
                        tags={regularTags}
                        busy={saving}
                        onSubmit={(values) => void saveRally(plan.id, group, values)}
                        onCancel={() => setRallyEditor(null)}
                      />
                    )
                  ) : null;
                return (
                  <div key={group.id} id={`rally-${group.id}`} className="rally-board-cell">
                    <RallyColumn
                      group={group}
                      members={groupMembers}
                      heroByMember={heroByMember}
                      allianceName={
                        alliances.find((item) => item.id === group.alliance_id)
                          ?.name ?? null
                      }
                      flagged={flagged}
                      isAdmin={isAdmin}
                      busy={saving}
                      selectedCount={selectedIds.size}
                      editor={editor}
                      onOpenPlayer={openSheet}
                      onDropPlayer={(accountId) =>
                        assignmentById.get(accountId)?.group_id !== group.id &&
                        void moveMember(plan.id, accountId, group.id)
                      }
                      onMoveSelected={() =>
                        void moveMembers(plan.id, group.id, [...selectedIds])
                      }
                      onSetup={() => setRallyEditor({ groupId: group.id, mode: "setup" })}
                      onAssignHeroes={() => void assignGroupHeroes(plan.id, group)}
                      onEdit={() => setRallyEditor({ groupId: group.id, mode: "edit" })}
                      onDelete={() => void deleteRally(group)}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <PlanComments
          comments={comments}
          members={members}
          viewerAccountId={activeMembership.wosAccountId}
          isAdmin={isAdmin}
          busy={saving}
          onPost={(body, visibility) => postComment(plan.id, body, visibility)}
          onDelete={(comment) => void deleteComment(comment)}
        />
      </div>
    );
  }

  const sheetPlan = openPlayer
    ? plans.find((plan) => plan.id === openPlayer.planId)
    : undefined;
  const sheetMember = openPlayer
    ? members.find((member) => member.id === openPlayer.memberId)
    : undefined;

  return (
    <main className="planning-page">
      <AppHeader />
      {!activeMembership ? (
        <section className="empty-state">
          <h2>{t("Choose a state")}</h2>
          <p>{t("Select a state before opening battle planning.")}</p>
        </section>
      ) : (
        <>
          <section className="page-heading">
            <p className="section-label">{activeMembership.stateName}</p>
            <h1>{t("Battle planning")}</h1>
            <p>
              {t(
                "The automation builds and publishes the plan. Check what needs attention, adjust anything by hand, and publish.",
              )}
            </p>
          </section>
          {loading ? (
            <section className="loading-panel">
              <p>{t("Loading battle plans...")}</p>
            </section>
          ) : currentPlans.length === 0 ? (
            <>
              <SvsStatus stateId={activeMembership.stateId} />
              {isAdmin && (
                <section>
                  <p className="section-label">{t("No SvS plan")}</p>
                  <h2>{t("Create the SvS plan")}</h2>
                  <p>
                    {t(
                      "There is no upcoming battle plan. It is normally created automatically from the SvS draw; if it was deleted, create it again here. A state can only have one upcoming plan.",
                    )}
                  </p>
                  <div className="invite-form">
                    <label>
                      {t("Opponent state")}
                      <input
                        type="text"
                        inputMode="numeric"
                        value={newPlanOpponent}
                        onChange={(event) => setNewPlanOpponent(event.target.value)}
                      />
                    </label>
                    <label>
                      {t("Battle date (12:00–17:00 UTC)")}
                      <input
                        type="date"
                        value={newPlanDate}
                        onChange={(event) => setNewPlanDate(event.target.value)}
                      />
                    </label>
                    <button
                      type="button"
                      className="primary-button"
                      disabled={saving || !newPlanOpponent || !newPlanDate}
                      onClick={() => void createSvsPlan()}
                    >
                      {t("Create SvS plan")}
                    </button>
                  </div>
                  {message && <p className="page-message">{message}</p>}
                </section>
              )}
            </>
          ) : (
            currentPlans.map(renderPlan)
          )}

          {historyPlans.length > 0 && (
            <details className="plan-history">
              <summary>
                {t("Earlier plans ({count})", { count: historyPlans.length })}
              </summary>
              <ul>
                {historyPlans.map((plan) => {
                  const battle = scheduledBattles.find(
                    (item) => item.plan_id === plan.id,
                  );
                  const status = battle?.status ?? plan.status;
                  return (
                    <li key={plan.id}>
                      <strong>{plan.name}</strong>{" "}
                      <time>{formatDateTime(plan.scheduled_at)}</time>{" "}
                      <span className="battle-type-badge">
                        {t(status.charAt(0).toUpperCase() + status.slice(1))}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </details>
          )}
        </>
      )}

      {sheetPlan && sheetMember && (
        <PlayerSheet
          member={sheetMember}
          groups={groups.filter((group) => group.plan_id === sheetPlan.id)}
          groupSizes={
            new Map(
              groups
                .filter((group) => group.plan_id === sheetPlan.id)
                .map((group) => [
                  group.id,
                  assignments.filter((item) => item.group_id === group.id).length,
                ]),
            )
          }
          groupId={
            assignments.find(
              (item) =>
                item.plan_id === sheetPlan.id &&
                item.wos_account_id === sheetMember.id,
            )?.group_id ?? null
          }
          hero={
            assignments.find(
              (item) =>
                item.plan_id === sheetPlan.id &&
                item.wos_account_id === sheetMember.id,
            )?.hero ?? null
          }
          answer={attendance.find(
            (row) =>
              row.plan_id === sheetPlan.id &&
              row.wos_account_id === sheetMember.id,
          )}
          isLeader={groups.some(
            (group) =>
              group.plan_id === sheetPlan.id &&
              group.leader_wos_account_id === sheetMember.id,
          )}
          isAdmin={isAdmin}
          busy={saving}
          onMove={(groupId) => void moveMember(sheetPlan.id, sheetMember.id, groupId)}
          onSetHero={(hero) => void setMemberHero(sheetPlan.id, sheetMember.id, hero)}
          onClose={() => setOpenPlayer(null)}
        />
      )}
    </main>
  );
}
