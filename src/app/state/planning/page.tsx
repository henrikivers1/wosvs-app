"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DragEvent } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { SvsStatus } from "@/components/SvsStatus";
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
};
type PlanAssignment = {
  plan_id: string;
  group_id: string;
  wos_account_id: string;
};
type AccountRow = {
  id: string;
  user_id: string;
  wos_id: string;
  nickname: string | null;
  furnace_level: number | null;
  furnace_level_raw: number | null;
  power: number | null;
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
  const filtersActive = Boolean(
    memberSearch.trim() ||
    tagFilter ||
    availabilityFilter ||
    voiceOnly ||
    minimumFurnace > 0 ||
    minimumTroopTier > 0,
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
          "id, name, battle_type, scheduled_at, notes, status, opponent_state_number",
        )
        .eq("state_id", stateId)
        .order("scheduled_at", { ascending: true }),
      supabase
        .from("state_members")
        .select("wos_account_id, role")
        .eq("state_id", stateId),
      supabase
        .from("state_tags")
        .select("id, name, color, system_key")
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
              "id, plan_id, name, leader_wos_account_id, alliance_id, assignment_tag_id, max_members, notes, sort_order",
            )
            .in("plan_id", planIds)
            .order("sort_order")
        : Promise.resolve({ data: [], error: null }),
      planIds.length
        ? supabase
            .from("battle_plan_assignments")
            .select("plan_id, group_id, wos_account_id")
            .in("plan_id", planIds)
        : Promise.resolve({ data: [], error: null }),
      accountIds.length
        ? supabase
            .from("wos_accounts")
            .select(
              "id, user_id, wos_id, nickname, furnace_level, furnace_level_raw, power, infantry_tier, lancer_tier, marksman_tier, infantry_fc_level, lancer_fc_level, marksman_fc_level, infantry_t12_skill, lancer_t12_skill, marksman_t12_skill",
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
    if (!window.confirm(`Delete “${plan.name}” and every group in it?`)) return;
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
  async function bulkAssign(planId: string, group: PlanGroup) {
    const candidates = getCandidates(planId);
    if (!candidates.length) {
      setMessage(t("No unassigned accounts match the current filters."));
      return;
    }
    if (group.max_members <= getGroupMembers(planId, group.id).length) {
      setMessage(t("That rally group is full."));
      return;
    }
    setSaving(true);
    const { data, error } = await supabase.rpc(
      "bulk_assign_battle_plan_members",
      {
        target_plan_id: planId,
        target_group_id: group.id,
        target_wos_account_ids: candidates.map((member) => member.id),
      },
    );
    if (error) setMessage(error.message);
    else {
      await loadPlanning();
      setMessage(
        `${Number(data ?? 0)} matching accounts added to ${group.name}.`,
      );
    }
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
    if (!filtersActive) return [];
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
    return members.filter((member) => {
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
    });
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
          <strong>{member.nickname || `WOS ID ${member.wos_id}`}</strong>
          <small>
            {member.username ? `@${member.username} · ` : ""}
            {t("WOS ID")} {member.wos_id}
          </small>
        </div>
        <small className="plan-member-stats">
          {furnaceLabel(member.furnace_level_raw)} {t("· Power")}{" "}
          {member.power === null ? "—" : formatNumber(member.power)}{" "}
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
          {member.tags.map((tag) => (
            <span key={tag.id} className="member-tag-pill">
              <span style={{ backgroundColor: tag.color }} />
              {tag.name}
            </span>
          ))}
        </div>
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
                            {plan.status === "draft" && (
                              <button
                                className="danger-button"
                                disabled={saving}
                                onClick={() => void deletePlan(plan)}
                              >
                                {t("Delete draft")}
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
                              <option value="">{t("No automatic tag")}</option>
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
                        <div className="plan-roster-filters">
                          <div className="section-title-row">
                            <div>
                              <p className="section-label">
                                {t("Candidate finder")}
                              </p>
                              <h4>{t("Find accounts worth assigning")}</h4>
                            </div>
                            <span className="retention-badge">
                              {filtersActive
                                ? `${candidates.length} matches`
                                : t("Add a filter")}
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
                          <p>
                            {filtersActive
                              ? t(
                                  "Drag individual matches into a group, or use Add matching on a group.",
                                )
                              : t(
                                  "The full member list stays hidden. Add at least one filter to find candidates.",
                                )}
                          </p>
                          {filtersActive && (
                            <div className="plan-member-list candidate-result-list">
                              {candidates
                                .slice(0, 50)
                                .map((member) =>
                                  renderMemberCard(member, plan.id),
                                )}
                              {candidates.length > 50 && (
                                <p>
                                  {t("Showing the first 50 of")}{" "}
                                  {candidates.length}{" "}
                                  {t("matches. Narrow the filters.")}
                                </p>
                              )}
                            </div>
                          )}
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
                                        {t("No automatic tag")}
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
                                  {group.notes && (
                                    <p className="plan-group-notes">
                                      {group.notes}
                                    </p>
                                  )}
                                  {renderStats(groupMembers)}
                                  {isAdmin && (
                                    <div className="plan-group-actions">
                                      <button
                                        className="secondary-link"
                                        disabled={
                                          !filtersActive ||
                                          !candidates.length ||
                                          saving
                                        }
                                        onClick={() =>
                                          void bulkAssign(plan.id, group)
                                        }
                                      >
                                        {t("Add matching")}
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
                                    {t("Drop filtered candidates here.")}
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
