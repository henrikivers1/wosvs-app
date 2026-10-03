"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DragEvent } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { SvsStatus } from "@/components/SvsStatus";
import { AutoFillPanel } from "@/components/planning/AutoFillPanel";
import { RallySetupEditor } from "@/components/planning/RallySetupEditor";
import {
  computeAutofill,
  pickHero,
  type AutofillCriterion,
  type AutofillDraft,
  type AutofillGroup,
  type AutofillMember,
  type GroupShift,
} from "@/lib/autofill";
import {
  AVAILABILITY_OPTIONS,
  availabilityLabel,
  type AttendanceRow,
  type Availability,
} from "@/lib/attendance";
import { useStates } from "@/components/StateProvider";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/components/LanguageProvider";
import { furnaceLabel } from "@/lib/furnace";

type BattleType = "svs" | "castle" | "test";
type BattlePlan = {
  id: string;
  name: string;
  battle_type: BattleType;
  scheduled_at: string;
  notes: string | null;
  status: "draft" | "published";
  opponent_state_number: number | null;
  auto_created: boolean;
};
type PlanGroup = {
  id: string;
  plan_id: string;
  name: string;
  leader_wos_account_id: string;
  alliance_id: string | null;
  assignment_tag_id: string | null;
  max_members: number;
  notes: string | null;
  sort_order: number;
  formation: string | null;
  joiner_heroes: string[];
  shift: GroupShift;
};
type PlanAssignment = {
  plan_id: string;
  group_id: string;
  wos_account_id: string;
  hero: string | null;
};
type SortKey = "power" | "fc" | "troop" | "labyrinth" | "name";
type AccountRow = {
  id: string;
  user_id: string;
  wos_id: string;
  nickname: string | null;
  furnace_level: number | null;
  furnace_level_raw: number | null;
  power: number | null;
  labyrinth_score: number | null;
  heroes_updated_at: string | null;
  infantry_tier: number | null;
  lancer_tier: number | null;
  marksman_tier: number | null;
  infantry_fc_level: number | null;
  lancer_fc_level: number | null;
  marksman_fc_level: number | null;
  infantry_t12_skill: number | null;
  lancer_t12_skill: number | null;
  marksman_t12_skill: number | null;
};
type StateTag = {
  id: string;
  name: string;
  color: string;
  system_key: string | null;
  kind?: "custom" | "rally" | "hero";
};
type StateAlliance = {
  id: string;
  name: string;
  color: string;
  max_members: number;
};
type StateMember = AccountRow & {
  role: string;
  username: string | null;
  tags: StateTag[];
  // Joiner heroes the player has at 4★ or higher.
  heroes: string[];
};
type PlanComment = {
  id: string;
  plan_id: string;
  author_wos_account_id: string | null;
  visibility: "public" | "admins";
  body: string;
  created_at: string;
};
type ScheduledBattle = {
  id: string;
  plan_id: string | null;
  status: "scheduled" | "active" | "completed" | "cancelled";
  scheduled_at: string | null;
};

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

function average(values: Array<number | null>) {
  const numbers = values.filter((value): value is number => value !== null);
  return numbers.length
    ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length
    : null;
}

function formatAverage(value: number | null) {
  return value === null ? "—" : value.toFixed(1);
}

export default function BattlePlanningPage() {
  const { t, formatDateTime, formatNumber } = useLanguage();
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<SortKey>("power");
  const [setupGroupId, setSetupGroupId] = useState<string | null>(null);
  // The automatic SvS plan that is upcoming or live, for the Labyrinth panel.
  const [upcomingPlanId, setUpcomingPlanId] = useState<string | null>(null);
  const [planComments, setPlanComments] = useState<PlanComment[]>([]);
  const [scheduledBattles, setScheduledBattles] = useState<ScheduledBattle[]>(
    [],
  );
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>(
    {},
  );
  const [commentVisibility, setCommentVisibility] = useState<
    Record<string, "public" | "admins">
  >({});
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [editingPlanName, setEditingPlanName] = useState("");
  const [editingScheduledAt, setEditingScheduledAt] = useState("");
  const [editingPlanNotes, setEditingPlanNotes] = useState("");
  const [editingPlanOpponent, setEditingPlanOpponent] = useState("");
  const [addingGroupToPlanId, setAddingGroupToPlanId] = useState<string | null>(
    null,
  );
  const [groupName, setGroupName] = useState("");
  const [groupLeaderId, setGroupLeaderId] = useState("");
  const [groupAllianceId, setGroupAllianceId] = useState("");
  const [groupTagId, setGroupTagId] = useState("");
  const [groupCapacity, setGroupCapacity] = useState(10);
  const [groupNotes, setGroupNotes] = useState("");
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState("");
  const [editingGroupLeaderId, setEditingGroupLeaderId] = useState("");
  const [editingGroupAllianceId, setEditingGroupAllianceId] = useState("");
  const [editingGroupTagId, setEditingGroupTagId] = useState("");
  const [editingGroupCapacity, setEditingGroupCapacity] = useState(10);
  const [editingGroupNotes, setEditingGroupNotes] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [availabilityFilter, setAvailabilityFilter] = useState<
    Availability | "unanswered" | ""
  >("");
  const [voiceOnly, setVoiceOnly] = useState(false);
  const [minimumFurnace, setMinimumFurnace] = useState(0);
  const [minimumTroopTier, setMinimumTroopTier] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const isAdmin =
    activeMembership?.role === "owner" || activeMembership?.role === "admin";
  const rallyLeadTag = tags.find((tag) => tag.system_key === "rally_lead");
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
    setLoading(true);
    setMessage(t(""));
    const stateId = activeMembership.stateId;
    const [
      planResult,
      memberResult,
      tagResult,
      allianceResult,
      attendanceResult,
      battleResult,
    ] = await Promise.all([
      supabase
        .from("battle_plans")
        .select(
          "id, name, battle_type, scheduled_at, notes, status, opponent_state_number, auto_created",
        )
        .eq("state_id", stateId)
        .order("scheduled_at", { ascending: true }),
      supabase
        .from("state_members")
        .select("wos_account_id, role")
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
    ]);
    const firstError =
      planResult.error ||
      memberResult.error ||
      tagResult.error ||
      allianceResult.error ||
      attendanceResult.error ||
      battleResult.error;
    if (firstError) {
      setMessage(firstError.message);
      setLoading(false);
      return;
    }

    const planRows = (planResult.data ?? []) as BattlePlan[];
    const memberRows = (memberResult.data ?? []) as Array<{
      wos_account_id: string;
      role: string;
    }>;
    const stateTags = (tagResult.data ?? []) as StateTag[];
    const planIds = planRows.map((plan) => plan.id);
    const accountIds = memberRows.map((member) => member.wos_account_id);
    const [
      groupResult,
      assignmentResult,
      accountResult,
      tagAssignmentResult,
      commentResult,
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
            .from("wos_accounts")
            .select(
              "id, user_id, wos_id, nickname, furnace_level, furnace_level_raw, power, labyrinth_score, heroes_updated_at, infantry_tier, lancer_tier, marksman_tier, infantry_fc_level, lancer_fc_level, marksman_fc_level, infantry_t12_skill, lancer_t12_skill, marksman_t12_skill",
            )
            .in("id", accountIds)
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
    ]);
    const secondError =
      groupResult.error ||
      assignmentResult.error ||
      accountResult.error ||
      tagAssignmentResult.error ||
      commentResult.error;
    if (secondError) {
      setMessage(secondError.message);
      setLoading(false);
      return;
    }

    const accountRows = (accountResult.data ?? []) as AccountRow[];
    const [{ data: heroRows }, { data: stateRow }] = await Promise.all([
      accountIds.length
        ? supabase
            .from("player_heroes")
            .select("wos_account_id, hero")
            .in("wos_account_id", accountIds)
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from("states")
        .select("hero_generation_max")
        .eq("id", stateId)
        .maybeSingle(),
    ]);
    const heroesByAccount = new Map<string, string[]>();
    ((heroRows ?? []) as { wos_account_id: string; hero: string }[]).forEach(
      (row) =>
        heroesByAccount.set(row.wos_account_id, [
          ...(heroesByAccount.get(row.wos_account_id) ?? []),
          row.hero,
        ]),
    );
    setHeroGeneration(stateRow?.hero_generation_max ?? null);
    const userIds = [...new Set(accountRows.map((account) => account.user_id))];
    const profileResult = userIds.length
      ? await supabase.from("profiles").select("id, username").in("id", userIds)
      : { data: [], error: null };
    if (profileResult.error) {
      setMessage(profileResult.error.message);
      setLoading(false);
      return;
    }
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
    const stillRelevantAfter = Date.now() - 5 * 60 * 60 * 1000;
    setUpcomingPlanId(
      planRows.find(
        (plan) =>
          plan.auto_created &&
          new Date(plan.scheduled_at).getTime() > stillRelevantAfter,
      )?.id ?? null,
    );
    setPlanComments((commentResult.data ?? []) as PlanComment[]);
    setScheduledBattles((battleResult.data ?? []) as ScheduledBattle[]);
    setLoading(false);
  }, [activeMembership, supabase, t]);

  useEffect(() => {
    if (!loadingStates && signedIn === false) {
      router.replace("/login");
      return;
    }
    const loadId = window.setTimeout(() => void loadPlanning(), 0);
    return () => window.clearTimeout(loadId);
  }, [loadPlanning, loadingStates, router, signedIn]);

  useEffect(() => {
    if (!activeMembership) return;
    const channel = supabase
      .channel(`plan-comments-${activeMembership.key}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "battle_plans",
          filter: `state_id=eq.${activeMembership.stateId}`,
        },
        () => void loadPlanning(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "battle_plan_groups" },
        () => void loadPlanning(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "battle_plan_assignments" },
        () => void loadPlanning(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "battle_plan_comments",
          filter: `state_id=eq.${activeMembership.stateId}`,
        },
        () => void loadPlanning(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "battles",
          filter: `state_id=eq.${activeMembership.stateId}`,
        },
        () => void loadPlanning(),
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `wos_account_id=eq.${activeMembership.wosAccountId}`,
        },
        () => void loadPlanning(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeMembership, loadPlanning, supabase]);

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
    setSaving(true);
    const { error } = await supabase.rpc("update_battle_plan", {
      target_plan_id: editingPlanId,
      plan_name: editingPlanName.trim(),
      selected_battle_type: "svs",
      plan_scheduled_at: date.toISOString(),
      plan_notes: editingPlanNotes.trim() || null,
    });
    const opponentError = error
      ? null
      : (
          await supabase.rpc("set_battle_plan_opponent", {
            target_plan_id: editingPlanId,
            opponent_number: parseOpponent(editingPlanOpponent),
          })
        ).error;
    if (error || opponentError) setMessage((error ?? opponentError)!.message);
    else {
      setEditingPlanId(null);
      await loadPlanning();
      setMessage(t("Battle plan updated. Republish to notify players."));
    }
    setSaving(false);
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
    setSaving(true);
    const { error } = await supabase.rpc("delete_battle_plan", {
      target_plan_id: plan.id,
    });
    if (error) setMessage(error.message);
    else {
      await loadPlanning();
      setMessage(t("Battle plan deleted."));
    }
    setSaving(false);
  }
  function openGroupForm(planId: string) {
    setAddingGroupToPlanId(planId);
    setGroupName("");
    setGroupLeaderId("");
    setGroupAllianceId("");
    setGroupTagId("");
    setGroupCapacity(10);
    setGroupNotes("");
  }
  async function createGroup(planId: string) {
    if (!groupName.trim() || !groupLeaderId || !groupAllianceId) {
      setMessage(t("Enter a name, Rally Lead, and destination alliance."));
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc("create_battle_plan_group", {
      target_plan_id: planId,
      group_name: groupName.trim(),
      leader_account_id: groupLeaderId,
      destination_alliance_id: groupAllianceId,
      publish_tag_id: groupTagId || null,
      group_max_members: groupCapacity,
      group_notes: groupNotes.trim() || null,
    });
    if (error) setMessage(error.message);
    else {
      setAddingGroupToPlanId(null);
      await loadPlanning();
      setMessage(t("Rally group created and its leader assigned."));
    }
    setSaving(false);
  }
  function beginEditingGroup(group: PlanGroup) {
    setEditingGroupId(group.id);
    setEditingGroupName(group.name);
    setEditingGroupLeaderId(group.leader_wos_account_id);
    setEditingGroupAllianceId(group.alliance_id ?? "");
    setEditingGroupTagId(group.assignment_tag_id ?? "");
    setEditingGroupCapacity(group.max_members);
    setEditingGroupNotes(group.notes ?? "");
  }
  async function saveGroup() {
    if (
      !editingGroupId ||
      !editingGroupName.trim() ||
      !editingGroupLeaderId ||
      !editingGroupAllianceId
    ) {
      setMessage(t("Enter a name, Rally Lead, and destination alliance."));
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc("update_battle_plan_group", {
      target_group_id: editingGroupId,
      group_name: editingGroupName.trim(),
      leader_account_id: editingGroupLeaderId,
      destination_alliance_id: editingGroupAllianceId,
      publish_tag_id: editingGroupTagId || null,
      group_max_members: editingGroupCapacity,
      group_notes: editingGroupNotes.trim() || null,
    });
    if (error) setMessage(error.message);
    else {
      setEditingGroupId(null);
      await loadPlanning();
      setMessage(t("Rally group updated. Republish to apply assignments."));
    }
    setSaving(false);
  }
  async function deleteGroup(group: PlanGroup) {
    const count = assignments.filter(
      (item) => item.group_id === group.id,
    ).length;
    if (
      !window.confirm(
        `Delete “${group.name}”? ${count} assigned accounts will become unassigned.`,
      )
    )
      return;
    setSaving(true);
    const { error } = await supabase.rpc("delete_battle_plan_group", {
      target_group_id: group.id,
    });
    if (error) setMessage(error.message);
    else await loadPlanning();
    setSaving(false);
  }
  async function assignMember(
    planId: string,
    accountId: string,
    groupId: string | null,
  ) {
    if (!isAdmin || saving) return;
    if (groupId) {
      await moveMembers(planId, groupId, [accountId]);
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc("set_battle_plan_assignment", {
      target_plan_id: planId,
      target_wos_account_id: accountId,
      target_group_id: groupId,
    });
    if (error) setMessage(error.message);
    else await loadPlanning();
    setSaving(false);
  }
  function dropMember(
    event: DragEvent<HTMLElement>,
    planId: string,
    groupId: string | null,
  ) {
    event.preventDefault();
    const accountId = event.dataTransfer.getData("text/plain");
    if (accountId) void assignMember(planId, accountId, groupId);
  }
  async function publishPlan(plan: BattlePlan) {
    const action = plan.status === "published" ? "Republish" : "Publish";
    if (
      !window.confirm(
        `${action} “${plan.name}”? Assigned accounts will be moved to each group’s destination alliance, optional group tags will be applied, and players will be notified.`,
      )
    )
      return;
    if (!activeMembership) return;
    setSaving(true);
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
        `Plan published and battle scheduled. ${Number(data ?? 0)} accounts notified.`,
      );
    }
    setSaving(false);
  }

  async function postComment(planId: string) {
    if (!activeMembership) return;
    const body = (commentDrafts[planId] ?? "").trim();
    if (!body) {
      setMessage(t("Write a comment before posting."));
      return;
    }
    setSaving(true);
    setMessage(t(""));
    const { error } = await supabase.rpc("create_battle_plan_comment", {
      target_plan_id: planId,
      commenter_wos_account_id: activeMembership.wosAccountId,
      comment_body: body,
      comment_visibility: isAdmin
        ? (commentVisibility[planId] ?? "public")
        : "public",
    });
    if (error) setMessage(error.message);
    else {
      setCommentDrafts((drafts) => ({ ...drafts, [planId]: "" }));
      await loadPlanning();
      setMessage(t("Comment posted."));
    }
    setSaving(false);
  }

  async function deleteComment(comment: PlanComment) {
    if (!window.confirm(t("Delete this comment?"))) return;
    setSaving(true);
    setMessage(t(""));
    const { error } = await supabase.rpc("delete_battle_plan_comment", {
      target_comment_id: comment.id,
      actor_wos_account_id: activeMembership?.wosAccountId,
    });
    if (error) setMessage(error.message);
    else {
      await loadPlanning();
      setMessage(t("Comment deleted."));
    }
    setSaving(false);
  }

  function getPlanGroups(planId: string) {
    return groups.filter((group) => group.plan_id === planId);
  }
  function getGroupMembers(planId: string, groupId: string) {
    const ids = new Set(
      assignments
        .filter((item) => item.plan_id === planId && item.group_id === groupId)
        .map((item) => item.wos_account_id),
    );
    return members.filter((member) => ids.has(member.id));
  }
  function getCandidates(planId: string) {
    const assigned = new Set(
      assignments
        .filter((item) => item.plan_id === planId)
        .map((item) => item.wos_account_id),
    );
    const search = memberSearch.trim().toLowerCase();
    const answers = new Map(
      attendance
        .filter((row) => row.plan_id === planId)
        .map((row) => [row.wos_account_id, row]),
    );
    return members
      .filter((member) => {
        if (assigned.has(member.id)) return false;
        if (
          search &&
          ![member.nickname, member.wos_id, member.username]
            .filter(Boolean)
            .some((value) => value?.toLowerCase().includes(search))
        )
          return false;
        if (tagFilter && !member.tags.some((tag) => tag.id === tagFilter))
          return false;
        const answer = answers.get(member.id);
        if (availabilityFilter === "unanswered" && answer) return false;
        if (
          availabilityFilter &&
          availabilityFilter !== "unanswered" &&
          answer?.availability !== availabilityFilter
        )
          return false;
        if (voiceOnly && !answer?.voice_call) return false;
        if ((member.furnace_level ?? 0) < minimumFurnace) return false;
        if (
          minimumTroopTier > 0 &&
          [member.infantry_tier, member.lancer_tier, member.marksman_tier].some(
            (value) => (value ?? 0) < minimumTroopTier,
          )
        )
          return false;
        return true;
      })
      .sort((first, second) => {
        if (sortBy === "name") {
          return (first.nickname || first.wos_id).localeCompare(
            second.nickname || second.wos_id,
          );
        }
        return memberScore(second, sortBy) - memberScore(first, sortBy);
      });
  }
  function memberScore(member: StateMember, key: SortKey) {
    if (key === "fc") return member.furnace_level_raw ?? 0;
    if (key === "labyrinth") return member.labyrinth_score ?? 0;
    if (key === "troop") return averageTroopTier(member);
    return member.power ?? 0;
  }
  function averageTroopTier(member: StateMember) {
    const tiers = [
      member.infantry_tier,
      member.lancer_tier,
      member.marksman_tier,
    ].filter((value): value is number => value !== null);
    return tiers.length
      ? tiers.reduce((sum, value) => sum + value, 0) / tiers.length
      : 0;
  }
  function getAssignment(planId: string, accountId: string) {
    return assignments.find(
      (item) => item.plan_id === planId && item.wos_account_id === accountId,
    );
  }
  // Current state of one rally for auto-fill and hero picking.
  function toAutofillGroup(planId: string, group: PlanGroup): AutofillGroup {
    const groupAssignments = assignments.filter(
      (item) => item.plan_id === planId && item.group_id === group.id,
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
  async function applyDrafts(
    planId: string,
    drafts: AutofillDraft[],
    replaceExisting: boolean,
  ) {
    const { data, error } = await supabase.rpc("apply_battle_plan_autofill", {
      target_plan_id: planId,
      new_assignments: drafts,
      replace_existing: replaceExisting,
    });
    if (error) {
      setMessage(error.message);
      return null;
    }
    return Number(data ?? 0);
  }
  async function runAutofill(
    planId: string,
    priorities: AutofillCriterion[],
    replaceExisting: boolean,
  ) {
    if (!isAdmin || saving) return;
    const planGroups = getPlanGroups(planId);
    if (!planGroups.length) {
      setMessage(t("Add at least one rally group first."));
      return;
    }
    const leaderIds = new Set(
      planGroups.map((group) => group.leader_wos_account_id),
    );
    const assignedIds = new Set(
      assignments
        .filter((item) => item.plan_id === planId)
        .map((item) => item.wos_account_id),
    );
    const groupsForFill = planGroups.map((group) => {
      const current = toAutofillGroup(planId, group);
      if (!replaceExisting) return current;
      return {
        ...current,
        memberIds: [group.leader_wos_account_id],
        heroUsage: {},
        totalPower:
          members.find((member) => member.id === group.leader_wos_account_id)
            ?.power ?? 0,
      };
    });
    const answers = new Map(
      attendance
        .filter((row) => row.plan_id === planId)
        .map((row) => [row.wos_account_id, row]),
    );
    const pool: AutofillMember[] = members
      .filter(
        (member) =>
          !leaderIds.has(member.id) &&
          (replaceExisting || !assignedIds.has(member.id)),
      )
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
    const drafts = computeAutofill(groupsForFill, pool, priorities);
    setSaving(true);
    const applied = await applyDrafts(planId, drafts, replaceExisting);
    if (applied !== null) {
      await loadPlanning();
      setMessage(
        t(
          "Auto-fill placed {count} players. Review the rallies, then publish.",
          { count: applied },
        ),
      );
    }
    setSaving(false);
  }
  async function moveMembers(planId: string, groupId: string, ids: string[]) {
    if (!isAdmin || saving || !ids.length) return;
    const group = getPlanGroups(planId).find((item) => item.id === groupId);
    if (!group) return;
    const current = toAutofillGroup(planId, group);
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
    setSaving(true);
    const applied = await applyDrafts(planId, drafts, false);
    if (applied !== null) {
      setSelectedIds(new Set());
      await loadPlanning();
    }
    setSaving(false);
  }
  async function setMemberHero(
    planId: string,
    accountId: string,
    hero: string | null,
  ) {
    if (!isAdmin || saving) return;
    setSaving(true);
    const { error } = await supabase.rpc("set_assignment_details", {
      target_plan_id: planId,
      target_wos_account_id: accountId,
      assigned_hero: hero,
      assigned_formation: null,
    });
    if (error) setMessage(error.message);
    else await loadPlanning();
    setSaving(false);
  }
  function toggleSelected(accountId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(accountId)) next.delete(accountId);
      else next.add(accountId);
      return next;
    });
  }
  async function toggleRallyLead(member: StateMember, enabled: boolean) {
    if (!activeMembership) return;
    setSaving(true);
    setMessage(t(""));
    const { error } = await supabase.rpc("set_state_rally_lead", {
      target_state_id: activeMembership.stateId,
      target_wos_account_id: member.id,
      enabled,
    });
    if (error) setMessage(error.message);
    else await loadPlanning();
    setSaving(false);
  }
  // Labyrinth score is the best strength signal WOSOracle offers, so the
  // strongest Labyrinth players are the natural rally lead candidates.
  function renderLabyrinthLeaders() {
    const ranked = members
      .filter((member) => (member.labyrinth_score ?? 0) > 0)
      .sort(
        (first, second) =>
          (second.labyrinth_score ?? 0) - (first.labyrinth_score ?? 0),
      )
      .slice(0, 20);
    return (
      <section>
        <p className="section-label">{t("Rally leads")}</p>
        <h2>{t("Top 20 Labyrinth in your state")}</h2>
        <p>
          {t(
            "Ranked from your members' synced WOSOracle data. Mark the players who lead rallies; only Rally Leads can lead a group.",
          )}
        </p>
        {ranked.length === 0 ? (
          <p>
            {t(
              "No Labyrinth scores yet. They appear after members' accounts are synced.",
            )}
          </p>
        ) : (
          <ol className="labyrinth-leaders">
            {ranked.map((member) => {
              const isLead = member.tags.some(
                (tag) => tag.system_key === "rally_lead",
              );
              const answer = upcomingPlanId
                ? attendance.find(
                    (row) =>
                      row.plan_id === upcomingPlanId &&
                      row.wos_account_id === member.id,
                  )
                : undefined;
              return (
                <li key={member.id}>
                  <span>
                    <strong>{member.nickname || member.wos_id}</strong>{" "}
                    {t("Lab")} {formatNumber(member.labyrinth_score ?? 0)} ·{" "}
                    {furnaceLabel(member.furnace_level_raw)} ·{" "}
                    {member.power === null ? "—" : formatNumber(member.power)}
                    {answer &&
                      ` · ${t(availabilityLabel(answer.availability))}${
                        answer.voice_call ? ` · ${t("Voice")}` : ""
                      }`}
                  </span>
                  <button
                    type="button"
                    disabled={saving}
                    className={isLead ? "secondary-link" : undefined}
                    onClick={() => void toggleRallyLead(member, !isLead)}
                  >
                    {isLead ? t("Remove Rally Lead") : t("Make Rally Lead")}
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    );
  }
  function renderStats(groupMembers: StateMember[]) {
    const troopValues = groupMembers.flatMap((member) => [
      member.infantry_tier,
      member.lancer_tier,
      member.marksman_tier,
    ]);
    const skillValues = groupMembers.flatMap((member) => [
      member.infantry_t12_skill,
      member.lancer_t12_skill,
      member.marksman_t12_skill,
    ]);
    return (
      <div className="plan-group-stats">
        <span>
          {t("Avg power")}{" "}
          <strong>
            {(() => {
              const value = average(groupMembers.map((member) => member.power));
              return value === null ? "—" : formatNumber(Math.round(value));
            })()}
          </strong>
        </span>
        <span>
          {t("Avg furnace")}{" "}
          <strong>
            {formatAverage(
              average(groupMembers.map((member) => member.furnace_level)),
            )}
          </strong>
        </span>
        <span>
          {t("Avg troop")}{" "}
          <strong>{formatAverage(average(troopValues))}</strong>
        </span>
        <span>
          {t("Avg T12 skill")}{" "}
          <strong>{formatAverage(average(skillValues))}</strong>
        </span>
      </div>
    );
  }
  function renderMemberCard(member: StateMember, planId: string) {
    const planGroups = getPlanGroups(planId);
    const assignedGroupId =
      assignments.find(
        (item) => item.plan_id === planId && item.wos_account_id === member.id,
      )?.group_id ?? "";
    return (
      <div
        key={member.id}
        className="plan-member-card"
        draggable={isAdmin && !saving}
        onDragStart={(event) => {
          event.dataTransfer.setData("text/plain", member.id);
          event.dataTransfer.effectAllowed = "move";
        }}
      >
        <div className="plan-member-main">
          {isAdmin && !assignedGroupId && (
            <input
              type="checkbox"
              aria-label={t("Select")}
              checked={selectedIds.has(member.id)}
              onChange={() => toggleSelected(member.id)}
            />
          )}
          <strong>{member.nickname || `WOS ID ${member.wos_id}`}</strong>
          <small>
            {member.username ? `@${member.username} · ` : ""}
            {t("WOS ID")} {member.wos_id}
          </small>
        </div>
        <small className="plan-member-stats">
          {furnaceLabel(member.furnace_level_raw)} {t("· Power")}{" "}
          {member.power === null ? "—" : formatNumber(member.power)}{" "}
          {t("· Lab")}{" "}
          {member.labyrinth_score === null || member.labyrinth_score === 0
            ? "—"
            : formatNumber(member.labyrinth_score)}{" "}
          {t("· Troops")} {member.infantry_tier ?? "—"}
          {t("/")}
          {member.lancer_tier ?? "—"}
          {t("/")}
          {member.marksman_tier ?? "—"}
        </small>
        <div className="plan-member-context">
          {(() => {
            const answer = attendance.find(
              (row) =>
                row.plan_id === planId && row.wos_account_id === member.id,
            );
            return answer ? (
              <span className="member-tag-pill attendance-pill">
                {t(availabilityLabel(answer.availability))}
                {answer.voice_call ? ` · ${t("Voice")}` : ""}
              </span>
            ) : null;
          })()}
          {member.heroes_updated_at ? (
            <span className="member-tag-pill hero-pill">
              {member.heroes.length
                ? `4★ ${member.heroes.join(", ")}`
                : t("No 4★ joiner heroes")}
            </span>
          ) : (
            <span className="member-tag-pill heroes-unknown-pill">
              {t("Heroes unknown")}
            </span>
          )}
          {member.tags
            .filter((tag) => tag.kind !== "hero")
            .map((tag) => (
              <span key={tag.id} className="member-tag-pill">
                <span style={{ backgroundColor: tag.color }} />
                {tag.name}
              </span>
            ))}
        </div>
        {isAdmin &&
          assignedGroupId &&
          (() => {
            const group = planGroups.find(
              (item) => item.id === assignedGroupId,
            );
            const assignedHero = getAssignment(planId, member.id)?.hero ?? "";
            const options = [
              ...new Set([
                ...(group?.joiner_heroes ?? []),
                ...(assignedHero ? [assignedHero] : []),
              ]),
            ];
            if (!options.length) return null;
            return (
              <label className="plan-assignment-select">
                {t("Joins with")}
                <select
                  value={assignedHero}
                  disabled={saving}
                  onChange={(event) =>
                    void setMemberHero(
                      planId,
                      member.id,
                      event.target.value || null,
                    )
                  }
                >
                  <option value="">{t("No hero yet")}</option>
                  {options.map((hero) => (
                    <option key={hero} value={hero}>
                      {hero}
                      {member.heroes.includes(hero) ? "" : ` (${t("not 4★")})`}
                    </option>
                  ))}
                </select>
              </label>
            );
          })()}
        {isAdmin && (
          <label className="plan-assignment-select">
            {t("Assignment")}
            <select
              value={assignedGroupId}
              disabled={saving}
              onChange={(event) =>
                void assignMember(planId, member.id, event.target.value || null)
              }
            >
              <option value="">{t("Unassigned")}</option>
              {planGroups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name} {t("(")}
                  {getGroupMembers(planId, group.id).length}
                  {t("/")}
                  {group.max_members}
                  {t(")")}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
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

  return (
    <main>
      <AppHeader />
      {!activeMembership ? (
        <section className="empty-state">
          <h2>{t("Choose a state")}</h2>
          <p>{t("Select a state before opening battle planning.")}</p>
        </section>
      ) : (
        <>
          <section className="battle-planning-heading">
            <p className="section-label">{activeMembership.stateName}</p>
            <h1>{t("Battle planning")}</h1>
            <p>
              {t(
                "The SvS plan is created automatically as soon as the draw is made. Build rally groups, assign members, then publish the alliance roster and optional tags.",
              )}
            </p>
          </section>
          <SvsStatus stateId={activeMembership.stateId} />
          {isAdmin && renderLabyrinthLeaders()}
          <section>
            <div className="section-title-row">
              <div>
                <p className="section-label">{t("Scheduled operations")}</p>
                <h2>
                  {isAdmin
                    ? t("Draft and published plans")
                    : t("Published plans")}
                </h2>
              </div>
            </div>
            {message && <p className="page-message">{message}</p>}
            {loading ? (
              <p>{t("Loading battle plans...")}</p>
            ) : plans.length === 0 ? (
              <div className="empty-state compact-empty-state">
                <h3>{t("No battle plans yet")}</h3>
              </div>
            ) : (
              <div className="battle-plan-list">
                {plans.map((plan) => {
                  const planGroups = getPlanGroups(plan.id);
                  const candidates = getCandidates(plan.id);
                  const comments = planComments.filter(
                    (comment) => comment.plan_id === plan.id,
                  );
                  const ownAssignment = assignments.find(
                    (item) =>
                      item.plan_id === plan.id &&
                      item.wos_account_id === activeMembership.wosAccountId,
                  );
                  const ownGroup = planGroups.find(
                    (group) => group.id === ownAssignment?.group_id,
                  );
                  const ownAlliance = alliances.find(
                    (alliance) => alliance.id === ownGroup?.alliance_id,
                  );
                  const scheduledBattle = scheduledBattles.find(
                    (battle) => battle.plan_id === plan.id,
                  );
                  return (
                    <article
                      key={plan.id}
                      id={`plan-${plan.id}`}
                      className="battle-plan-card"
                    >
                      <div className="battle-plan-card-heading">
                        <div>
                          <span
                            className={`poll-status ${plan.status === "published" ? "open" : "closed"}`}
                          >
                            {t(
                              plan.status.charAt(0).toUpperCase() +
                                plan.status.slice(1),
                            )}
                          </span>
                          {scheduledBattle && (
                            <span className="battle-type-badge">
                              {t(
                                scheduledBattle.status.charAt(0).toUpperCase() +
                                  scheduledBattle.status.slice(1),
                              )}
                            </span>
                          )}
                          <span className="battle-type-badge">
                            {plan.battle_type.toUpperCase()}
                          </span>
                          <h3>{plan.name}</h3>
                          <time>{formatDateTime(plan.scheduled_at)}</time>
                          {plan.opponent_state_number && (
                            <span className="battle-type-badge">
                              {t("vs state {opponent}", {
                                opponent: plan.opponent_state_number,
                              })}
                            </span>
                          )}
                        </div>
                        {isAdmin && (
                          <div className="battle-plan-actions">
                            <button
                              className="secondary-link"
                              onClick={() => beginEditingPlan(plan)}
                            >
                              {t("Edit")}
                            </button>
                            <button
                              disabled={
                                saving ||
                                scheduledBattle?.status === "active" ||
                                scheduledBattle?.status === "completed"
                              }
                              onClick={() => void publishPlan(plan)}
                            >
                              {plan.status === "published"
                                ? t("Republish")
                                : t("Publish & schedule")}
                            </button>
                            {scheduledBattle?.status !== "active" && (
                              <button
                                className="danger-button"
                                disabled={saving}
                                onClick={() => void deletePlan(plan)}
                              >
                                {t("Delete plan")}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      {plan.notes && (
                        <p className="battle-plan-notes">{plan.notes}</p>
                      )}
                      {!isAdmin && ownGroup && (
                        <div className="own-plan-assignment">
                          <span>{t("Your assignment")}</span>
                          <strong>{ownGroup.name}</strong>
                          <small>
                            {t("Alliance:")}{" "}
                            {ownAlliance?.name ?? t("Not selected")}
                          </small>
                        </div>
                      )}
                      {!isAdmin && !ownGroup && (
                        <p className="unassigned-plan-warning">
                          {t(
                            "This WOS account has not been assigned to a rally group.",
                          )}
                        </p>
                      )}
                      {isAdmin && editingPlanId === plan.id && (
                        <div className="plan-inline-editor">
                          <label>
                            {t("Plan name")}
                            <input
                              value={editingPlanName}
                              onChange={(event) =>
                                setEditingPlanName(event.target.value)
                              }
                            />
                          </label>
                          <label>
                            {t("Start (UTC)")}
                            <input
                              type="datetime-local"
                              value={editingScheduledAt}
                              onChange={(event) =>
                                setEditingScheduledAt(event.target.value)
                              }
                            />
                          </label>
                          <label>
                            {t("Opponent state")}
                            <input
                              type="text"
                              inputMode="numeric"
                              value={editingPlanOpponent}
                              onChange={(event) =>
                                setEditingPlanOpponent(event.target.value)
                              }
                            />
                          </label>
                          <label>
                            {t("Notes")}
                            <textarea
                              value={editingPlanNotes}
                              onChange={(event) =>
                                setEditingPlanNotes(event.target.value)
                              }
                            />
                          </label>
                          <div className="button-row">
                            <button
                              disabled={saving}
                              onClick={() => void savePlan()}
                            >
                              {t("Save plan")}
                            </button>
                            <button
                              className="secondary-link"
                              onClick={() => setEditingPlanId(null)}
                            >
                              {t("Cancel")}
                            </button>
                          </div>
                        </div>
                      )}
                      {isAdmin && (
                        <div className="plan-admin-toolbar">
                          <button
                            className="secondary-link"
                            onClick={() => openGroupForm(plan.id)}
                          >
                            {t("Add rally group")}
                          </button>
                          <span>
                            {t(
                              "Only accounts with the permanent Rally Lead tag appear as leaders.",
                            )}
                          </span>
                        </div>
                      )}
                      {isAdmin && addingGroupToPlanId === plan.id && (
                        <div className="plan-group-editor">
                          <label>
                            {t("Group name")}
                            <input
                              value={groupName}
                              onChange={(event) =>
                                setGroupName(event.target.value)
                              }
                              placeholder={t("TED Rally")}
                            />
                          </label>
                          <label>
                            {t("Rally Lead")}
                            <select
                              value={groupLeaderId}
                              onChange={(event) =>
                                setGroupLeaderId(event.target.value)
                              }
                            >
                              <option value="">
                                {t("Choose tagged leader")}
                              </option>
                              {rallyLeaders.map((member) => (
                                <option key={member.id} value={member.id}>
                                  {member.nickname || member.wos_id}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            {t("Destination alliance")}
                            <select
                              value={groupAllianceId}
                              onChange={(event) =>
                                setGroupAllianceId(event.target.value)
                              }
                            >
                              <option value="">{t("Choose alliance")}</option>
                              {alliances.map((alliance) => (
                                <option key={alliance.id} value={alliance.id}>
                                  {alliance.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            {t("Tag after publish")}
                            <select
                              value={groupTagId}
                              onChange={(event) =>
                                setGroupTagId(event.target.value)
                              }
                            >
                              <option value="">
                                {t("Automatic: leader’s rally tag")}
                              </option>
                              {regularTags.map((tag) => (
                                <option key={tag.id} value={tag.id}>
                                  {tag.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            {t("Capacity")}
                            <input
                              type="number"
                              min="1"
                              max="100"
                              value={groupCapacity}
                              onChange={(event) =>
                                setGroupCapacity(Number(event.target.value))
                              }
                            />
                          </label>
                          <label>
                            {t("Instructions")}
                            <input
                              value={groupNotes}
                              onChange={(event) =>
                                setGroupNotes(event.target.value)
                              }
                            />
                          </label>
                          <button
                            disabled={saving}
                            onClick={() => void createGroup(plan.id)}
                          >
                            {t("Create group")}
                          </button>
                          <button
                            className="secondary-link"
                            onClick={() => setAddingGroupToPlanId(null)}
                          >
                            {t("Cancel")}
                          </button>
                          {rallyLeaders.length === 0 && (
                            <p className="page-message">
                              {t(
                                "Assign Rally Lead tags from State members first.",
                              )}
                            </p>
                          )}
                        </div>
                      )}
                      {isAdmin && (
                        <AutoFillPanel
                          disabled={saving || !planGroups.length}
                          onRun={(priorities, replaceExisting) =>
                            void runAutofill(
                              plan.id,
                              priorities,
                              replaceExisting,
                            )
                          }
                        />
                      )}
                      {isAdmin && (
                        <div className="plan-roster-filters">
                          <div className="section-title-row">
                            <div>
                              <p className="section-label">
                                {t("Unassigned players")}
                              </p>
                              <h4>{t("Pick players for the rallies")}</h4>
                            </div>
                            <span className="retention-badge">
                              {t("{count} players", {
                                count: candidates.length,
                              })}
                            </span>
                          </div>
                          <input
                            type="search"
                            value={memberSearch}
                            onChange={(event) =>
                              setMemberSearch(event.target.value)
                            }
                            placeholder={t("Name, username, or WOS ID")}
                          />
                          <select
                            value={tagFilter}
                            onChange={(event) =>
                              setTagFilter(event.target.value)
                            }
                          >
                            <option value="">{t("Any tag")}</option>
                            {tags.map((tag) => (
                              <option key={tag.id} value={tag.id}>
                                {tag.name}
                              </option>
                            ))}
                          </select>
                          <select
                            value={availabilityFilter}
                            onChange={(event) =>
                              setAvailabilityFilter(
                                event.target.value as
                                  | Availability
                                  | "unanswered"
                                  | "",
                              )
                            }
                          >
                            <option value="">{t("Any availability")}</option>
                            {AVAILABILITY_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {t(option.label)}
                              </option>
                            ))}
                            <option value="unanswered">
                              {t("Not answered")}
                            </option>
                          </select>
                          <label>
                            <input
                              type="checkbox"
                              checked={voiceOnly}
                              onChange={(event) =>
                                setVoiceOnly(event.target.checked)
                              }
                            />
                            {t("Voice call only")}
                          </label>
                          <label>
                            {t("Minimum Fire Crystal Furnace")}
                            <input
                              type="number"
                              min="0"
                              max="10"
                              value={minimumFurnace}
                              onChange={(event) =>
                                setMinimumFurnace(Number(event.target.value))
                              }
                            />
                          </label>
                          <label>
                            {t("Minimum all troop tiers")}
                            <input
                              type="number"
                              min="0"
                              max="12"
                              value={minimumTroopTier}
                              onChange={(event) =>
                                setMinimumTroopTier(Number(event.target.value))
                              }
                            />
                          </label>
                          <button
                            className="secondary-link"
                            onClick={() => {
                              setMemberSearch("");
                              setTagFilter("");
                              setAvailabilityFilter("");
                              setVoiceOnly(false);
                              setMinimumFurnace(0);
                              setMinimumTroopTier(0);
                            }}
                          >
                            {t("Clear filters")}
                          </button>
                          <label>
                            {t("Sort by")}
                            <select
                              value={sortBy}
                              onChange={(event) =>
                                setSortBy(event.target.value as SortKey)
                              }
                            >
                              <option value="power">{t("Power")}</option>
                              <option value="fc">{t("FC level")}</option>
                              <option value="troop">{t("Troop tier")}</option>
                              <option value="labyrinth">
                                {t("Labyrinth")}
                              </option>
                              <option value="name">{t("Name")}</option>
                            </select>
                          </label>
                          <div className="selection-bar">
                            <button
                              type="button"
                              className="secondary-link"
                              onClick={() =>
                                setSelectedIds(
                                  new Set(
                                    candidates.map((member) => member.id),
                                  ),
                                )
                              }
                            >
                              {t("Select all shown")}
                            </button>
                            <button
                              type="button"
                              className="secondary-link"
                              disabled={!selectedIds.size}
                              onClick={() => setSelectedIds(new Set())}
                            >
                              {t("Clear selection")}
                            </button>
                            <select
                              value=""
                              disabled={!selectedIds.size || saving}
                              onChange={(event) =>
                                event.target.value &&
                                void moveMembers(plan.id, event.target.value, [
                                  ...selectedIds,
                                ])
                              }
                            >
                              <option value="">
                                {t("Move {count} selected to…", {
                                  count: selectedIds.size,
                                })}
                              </option>
                              {planGroups.map((group) => (
                                <option key={group.id} value={group.id}>
                                  {group.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="plan-member-list candidate-result-list">
                            {candidates
                              .slice(0, 80)
                              .map((member) =>
                                renderMemberCard(member, plan.id),
                              )}
                            {candidates.length > 80 && (
                              <p>
                                {t(
                                  "Showing the first 80 of {count}. Use the filters to narrow the list.",
                                  { count: candidates.length },
                                )}
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                      <div className="battle-plan-board">
                        {planGroups.map((group) => {
                          const groupMembers = getGroupMembers(
                            plan.id,
                            group.id,
                          );
                          const leader = members.find(
                            (member) =>
                              member.id === group.leader_wos_account_id,
                          );
                          const alliance = alliances.find(
                            (item) => item.id === group.alliance_id,
                          );
                          const assignmentTag = tags.find(
                            (tag) => tag.id === group.assignment_tag_id,
                          );
                          return (
                            <div
                              key={group.id}
                              className="plan-group-column"
                              onDragOver={(event) => event.preventDefault()}
                              onDrop={(event) =>
                                dropMember(event, plan.id, group.id)
                              }
                            >
                              {isAdmin && editingGroupId === group.id ? (
                                <div className="plan-group-edit-panel">
                                  <label>
                                    {t("Name")}
                                    <input
                                      value={editingGroupName}
                                      onChange={(event) =>
                                        setEditingGroupName(event.target.value)
                                      }
                                    />
                                  </label>
                                  <label>
                                    {t("Rally Lead")}
                                    <select
                                      value={editingGroupLeaderId}
                                      onChange={(event) =>
                                        setEditingGroupLeaderId(
                                          event.target.value,
                                        )
                                      }
                                    >
                                      {rallyLeaders.map((member) => (
                                        <option
                                          key={member.id}
                                          value={member.id}
                                        >
                                          {member.nickname || member.wos_id}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                  <label>
                                    {t("Destination alliance")}
                                    <select
                                      value={editingGroupAllianceId}
                                      onChange={(event) =>
                                        setEditingGroupAllianceId(
                                          event.target.value,
                                        )
                                      }
                                    >
                                      <option value="">
                                        {t("Choose alliance")}
                                      </option>
                                      {alliances.map((item) => (
                                        <option key={item.id} value={item.id}>
                                          {item.name}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                  <label>
                                    {t("Tag after publish")}
                                    <select
                                      value={editingGroupTagId}
                                      onChange={(event) =>
                                        setEditingGroupTagId(event.target.value)
                                      }
                                    >
                                      <option value="">
                                        {t("Automatic: leader’s rally tag")}
                                      </option>
                                      {regularTags.map((tag) => (
                                        <option key={tag.id} value={tag.id}>
                                          {tag.name}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                  <label>
                                    {t("Capacity")}
                                    <input
                                      type="number"
                                      min="1"
                                      max="100"
                                      value={editingGroupCapacity}
                                      onChange={(event) =>
                                        setEditingGroupCapacity(
                                          Number(event.target.value),
                                        )
                                      }
                                    />
                                  </label>
                                  <label>
                                    {t("Instructions")}
                                    <input
                                      value={editingGroupNotes}
                                      onChange={(event) =>
                                        setEditingGroupNotes(event.target.value)
                                      }
                                    />
                                  </label>
                                  <button
                                    disabled={saving}
                                    onClick={() => void saveGroup()}
                                  >
                                    {t("Save group")}
                                  </button>
                                  <button
                                    className="secondary-link"
                                    onClick={() => setEditingGroupId(null)}
                                  >
                                    {t("Cancel")}
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <div className="plan-group-heading">
                                    <div>
                                      <h4>{group.name}</h4>
                                      <small>
                                        {t("Leader:")}{" "}
                                        {leader?.nickname ||
                                          leader?.wos_id ||
                                          t("Unknown")}
                                      </small>
                                    </div>
                                    <span>
                                      {groupMembers.length}
                                      {t("/")}
                                      {group.max_members}
                                    </span>
                                  </div>
                                  <p className="plan-group-notes">
                                    {t("Alliance:")}{" "}
                                    <strong>
                                      {alliance?.name ??
                                        t("Select before publishing")}
                                    </strong>
                                    {assignmentTag
                                      ? ` · Publish tag: ${assignmentTag.name}`
                                      : ""}
                                  </p>
                                  <p className="plan-group-notes">
                                    {t("Formation:")}{" "}
                                    <strong>
                                      {group.formation ?? t("not set")}
                                    </strong>{" "}
                                    ·{" "}
                                    {t(
                                      availabilityLabel(group.shift ?? "whole"),
                                    )}
                                  </p>
                                  <div className="joiner-slot-summary">
                                    {(group.joiner_heroes ?? []).length ? (
                                      group.joiner_heroes.map((hero) => {
                                        const covered = assignments.filter(
                                          (item) =>
                                            item.group_id === group.id &&
                                            item.hero === hero,
                                        ).length;
                                        return (
                                          <span
                                            key={hero}
                                            className={
                                              covered
                                                ? "member-tag-pill hero-pill"
                                                : "member-tag-pill heroes-unknown-pill"
                                            }
                                          >
                                            {hero} ×{covered}
                                          </span>
                                        );
                                      })
                                    ) : (
                                      <small>
                                        {t("No joiner heroes chosen yet.")}
                                      </small>
                                    )}
                                  </div>
                                  {group.notes && (
                                    <p className="plan-group-notes">
                                      {group.notes}
                                    </p>
                                  )}
                                  {isAdmin && setupGroupId === group.id && (
                                    <RallySetupEditor
                                      group={group}
                                      heroGeneration={heroGeneration}
                                      onCancel={() => setSetupGroupId(null)}
                                      onSaved={() => {
                                        setSetupGroupId(null);
                                        void loadPlanning();
                                      }}
                                    />
                                  )}
                                  {renderStats(groupMembers)}
                                  {isAdmin && (
                                    <div className="plan-group-actions">
                                      <button
                                        className="secondary-link"
                                        disabled={!selectedIds.size || saving}
                                        onClick={() =>
                                          void moveMembers(plan.id, group.id, [
                                            ...selectedIds,
                                          ])
                                        }
                                      >
                                        {t("Move selected here ({count})", {
                                          count: selectedIds.size,
                                        })}
                                      </button>
                                      <button
                                        className="secondary-link"
                                        onClick={() =>
                                          setSetupGroupId(
                                            setupGroupId === group.id
                                              ? null
                                              : group.id,
                                          )
                                        }
                                      >
                                        {t("Rally setup")}
                                      </button>
                                      <button
                                        className="secondary-link"
                                        onClick={() => beginEditingGroup(group)}
                                      >
                                        {t("Edit")}
                                      </button>
                                      <button
                                        className="danger-button"
                                        disabled={saving}
                                        onClick={() => void deleteGroup(group)}
                                      >
                                        {t("Delete")}
                                      </button>
                                    </div>
                                  )}
                                </>
                              )}
                              <div className="plan-member-list">
                                {groupMembers.length ? (
                                  groupMembers.map((member) =>
                                    renderMemberCard(member, plan.id),
                                  )
                                ) : (
                                  <p className="plan-drop-hint">
                                    {t(
                                      "Drop players here, or select them and use Move selected here.",
                                    )}
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="plan-comments">
                        <div className="section-title-row">
                          <div>
                            <p className="section-label">
                              {t("Plan discussion")}
                            </p>
                            <h4>{t("Comments")}</h4>
                          </div>
                          <span className="retention-badge">
                            {comments.length}
                          </span>
                        </div>
                        {comments.length === 0 ? (
                          <p className="plan-comments-empty">
                            {t("No comments yet.")}
                          </p>
                        ) : (
                          <div className="plan-comment-list">
                            {comments.map((comment) => {
                              const author = members.find(
                                (member) =>
                                  member.id === comment.author_wos_account_id,
                              );
                              return (
                                <article
                                  key={comment.id}
                                  className={`plan-comment plan-comment-${comment.visibility}`}
                                >
                                  <div className="plan-comment-heading">
                                    <div>
                                      <strong>
                                        {author?.nickname ||
                                          author?.wos_id ||
                                          t("Former member")}
                                      </strong>
                                      {author?.username && (
                                        <small>
                                          {t("@")}
                                          {author.username}
                                        </small>
                                      )}
                                    </div>
                                    <div>
                                      <span className="comment-visibility">
                                        {comment.visibility === "admins"
                                          ? t("Admin only")
                                          : t("Public")}
                                      </span>
                                      <time>
                                        {formatDateTime(comment.created_at)}
                                      </time>
                                    </div>
                                  </div>
                                  <p>{comment.body}</p>
                                  {(isAdmin ||
                                    comment.author_wos_account_id ===
                                      activeMembership.wosAccountId) && (
                                    <button
                                      type="button"
                                      className="danger-button comment-delete-button"
                                      disabled={saving}
                                      onClick={() =>
                                        void deleteComment(comment)
                                      }
                                    >
                                      {t("Delete")}
                                    </button>
                                  )}
                                </article>
                              );
                            })}
                          </div>
                        )}
                        <div className="plan-comment-form">
                          <label>
                            {t("Comment")}
                            <textarea
                              rows={3}
                              maxLength={2000}
                              value={commentDrafts[plan.id] ?? ""}
                              onChange={(event) =>
                                setCommentDrafts((drafts) => ({
                                  ...drafts,
                                  [plan.id]: event.target.value,
                                }))
                              }
                              placeholder={t(
                                "Write a comment. Use @username to mention and notify someone.",
                              )}
                            />
                          </label>
                          {isAdmin && (
                            <label>
                              {t("Visibility")}
                              <select
                                value={commentVisibility[plan.id] ?? "public"}
                                onChange={(event) =>
                                  setCommentVisibility((visibility) => ({
                                    ...visibility,
                                    [plan.id]: event.target.value as
                                      | "public"
                                      | "admins",
                                  }))
                                }
                              >
                                <option value="public">
                                  {t("Public — all state members")}
                                </option>
                                <option value="admins">
                                  {t("Admin only")}
                                </option>
                              </select>
                            </label>
                          )}
                          <button
                            type="button"
                            disabled={
                              saving || !(commentDrafts[plan.id] ?? "").trim()
                            }
                            onClick={() => void postComment(plan.id)}
                          >
                            {t("Post comment")}
                          </button>
                        </div>
                        <p className="form-hint">
                          {t(
                            "Mention another state member with their account username, for example @Henrik. They receive a notification. Owners and Admins are notified about new comments.",
                          )}
                        </p>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
          {isAdmin && !rallyLeadTag && (
            <section className="empty-state">
              <h2>{t("Rally Lead tag missing")}</h2>
              <p>
                {t(
                  "Run the Battle Planning V2 SQL upgrade before using this page.",
                )}
              </p>
            </section>
          )}
        </>
      )}
    </main>
  );
}
