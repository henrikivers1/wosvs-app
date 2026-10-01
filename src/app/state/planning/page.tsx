"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DragEvent } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { useStates } from "@/components/StateProvider";
import { createClient } from "@/lib/supabase/client";

type BattleType = "svs" | "castle" | "test";
type BattlePlan = { id: string; name: string; battle_type: BattleType; scheduled_at: string; notes: string | null; status: "draft" | "published" };
type PlanGroup = { id: string; plan_id: string; name: string; leader_wos_account_id: string; alliance_id: string | null; assignment_tag_id: string | null; max_members: number; notes: string | null; sort_order: number };
type PlanAssignment = { plan_id: string; group_id: string; wos_account_id: string };
type AccountRow = { id: string; user_id: string; wos_id: string; nickname: string | null; furnace_level: number | null; infantry_tier: number | null; lancer_tier: number | null; marksman_tier: number | null; infantry_fc_level: number | null; lancer_fc_level: number | null; marksman_fc_level: number | null; infantry_t12_skill: number | null; lancer_t12_skill: number | null; marksman_t12_skill: number | null };
type StateTag = { id: string; name: string; color: string; system_key: string | null };
type StateAlliance = { id: string; name: string; color: string; max_members: number };
type StateMember = AccountRow & { role: string; username: string | null; tags: StateTag[] };
type StatePoll = { id: string; question: string; closes_at: string };
type PollOption = { id: string; poll_id: string; label: string; sort_order: number };
type PollResponse = { poll_id: string; option_id: string; wos_account_id: string };

function defaultScheduledTime() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(18, 0, 0, 0);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function toLocalDateTime(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function average(values: Array<number | null>) {
  const numbers = values.filter((value): value is number => value !== null);
  return numbers.length ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length : null;
}

function formatAverage(value: number | null) {
  return value === null ? "—" : value.toFixed(1);
}

export default function BattlePlanningPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { activeMembership, signedIn, loadingStates } = useStates();
  const [plans, setPlans] = useState<BattlePlan[]>([]);
  const [groups, setGroups] = useState<PlanGroup[]>([]);
  const [assignments, setAssignments] = useState<PlanAssignment[]>([]);
  const [members, setMembers] = useState<StateMember[]>([]);
  const [tags, setTags] = useState<StateTag[]>([]);
  const [alliances, setAlliances] = useState<StateAlliance[]>([]);
  const [polls, setPolls] = useState<StatePoll[]>([]);
  const [pollOptions, setPollOptions] = useState<PollOption[]>([]);
  const [pollResponses, setPollResponses] = useState<PollResponse[]>([]);
  const [planName, setPlanName] = useState("");
  const [battleType, setBattleType] = useState<BattleType>("svs");
  const [scheduledAt, setScheduledAt] = useState(defaultScheduledTime);
  const [planNotes, setPlanNotes] = useState("");
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [editingPlanName, setEditingPlanName] = useState("");
  const [editingBattleType, setEditingBattleType] = useState<BattleType>("svs");
  const [editingScheduledAt, setEditingScheduledAt] = useState("");
  const [editingPlanNotes, setEditingPlanNotes] = useState("");
  const [addingGroupToPlanId, setAddingGroupToPlanId] = useState<string | null>(null);
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
  const [pollFilter, setPollFilter] = useState("");
  const [pollOptionFilter, setPollOptionFilter] = useState("");
  const [minimumFurnace, setMinimumFurnace] = useState(0);
  const [minimumTroopTier, setMinimumTroopTier] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const isAdmin = activeMembership?.role === "owner" || activeMembership?.role === "admin";
  const rallyLeadTag = tags.find((tag) => tag.system_key === "rally_lead");
  const regularTags = tags.filter((tag) => !tag.system_key);
  const rallyLeaders = members.filter((member) => member.tags.some((tag) => tag.system_key === "rally_lead"));
  const filtersActive = Boolean(memberSearch.trim() || tagFilter || pollOptionFilter || minimumFurnace > 0 || minimumTroopTier > 0);

  const loadPlanning = useCallback(async () => {
    if (!activeMembership) {
      setPlans([]); setGroups([]); setAssignments([]); setMembers([]); setTags([]); setAlliances([]); setPolls([]); setPollOptions([]); setPollResponses([]); setLoading(false);
      return;
    }
    setLoading(true); setMessage("");
    const stateId = activeMembership.stateId;
    const [planResult, memberResult, tagResult, allianceResult, pollResult] = await Promise.all([
      supabase.from("battle_plans").select("id, name, battle_type, scheduled_at, notes, status").eq("state_id", stateId).order("scheduled_at", { ascending: true }),
      supabase.from("state_members").select("wos_account_id, role").eq("state_id", stateId),
      supabase.from("state_tags").select("id, name, color, system_key").eq("state_id", stateId).order("name"),
      supabase.from("state_alliances").select("id, name, color, max_members").eq("state_id", stateId).order("name"),
      isAdmin ? supabase.from("state_polls").select("id, question, closes_at").eq("state_id", stateId).order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
    ]);
    const firstError = planResult.error || memberResult.error || tagResult.error || allianceResult.error || pollResult.error;
    if (firstError) { setMessage(firstError.message); setLoading(false); return; }

    const planRows = (planResult.data ?? []) as BattlePlan[];
    const memberRows = (memberResult.data ?? []) as Array<{ wos_account_id: string; role: string }>;
    const stateTags = (tagResult.data ?? []) as StateTag[];
    const pollRows = (pollResult.data ?? []) as StatePoll[];
    const planIds = planRows.map((plan) => plan.id);
    const accountIds = memberRows.map((member) => member.wos_account_id);
    const pollIds = pollRows.map((poll) => poll.id);
    const [groupResult, assignmentResult, accountResult, tagAssignmentResult, optionResult, responseResult] = await Promise.all([
      planIds.length ? supabase.from("battle_plan_groups").select("id, plan_id, name, leader_wos_account_id, alliance_id, assignment_tag_id, max_members, notes, sort_order").in("plan_id", planIds).order("sort_order") : Promise.resolve({ data: [], error: null }),
      planIds.length ? supabase.from("battle_plan_assignments").select("plan_id, group_id, wos_account_id").in("plan_id", planIds) : Promise.resolve({ data: [], error: null }),
      accountIds.length ? supabase.from("wos_accounts").select("id, user_id, wos_id, nickname, furnace_level, infantry_tier, lancer_tier, marksman_tier, infantry_fc_level, lancer_fc_level, marksman_fc_level, infantry_t12_skill, lancer_t12_skill, marksman_t12_skill").in("id", accountIds) : Promise.resolve({ data: [], error: null }),
      accountIds.length ? supabase.from("state_member_tags").select("tag_id, wos_account_id").in("wos_account_id", accountIds) : Promise.resolve({ data: [], error: null }),
      pollIds.length ? supabase.from("state_poll_options").select("id, poll_id, label, sort_order").in("poll_id", pollIds).order("sort_order") : Promise.resolve({ data: [], error: null }),
      isAdmin ? supabase.rpc("get_state_poll_admin_responses", { target_state_id: stateId }) : Promise.resolve({ data: [], error: null }),
    ]);
    const secondError = groupResult.error || assignmentResult.error || accountResult.error || tagAssignmentResult.error || optionResult.error || responseResult.error;
    if (secondError) { setMessage(secondError.message); setLoading(false); return; }

    const accountRows = (accountResult.data ?? []) as AccountRow[];
    const userIds = [...new Set(accountRows.map((account) => account.user_id))];
    const profileResult = userIds.length ? await supabase.from("profiles").select("id, username").in("id", userIds) : { data: [], error: null };
    if (profileResult.error) { setMessage(profileResult.error.message); setLoading(false); return; }
    const membershipById = new Map(memberRows.map((member) => [member.wos_account_id, member]));
    const usernameById = new Map((profileResult.data ?? []).map((profile) => [profile.id, profile.username]));
    const tagById = new Map(stateTags.map((tag) => [tag.id, tag]));
    const tagAssignments = (tagAssignmentResult.data ?? []) as Array<{ tag_id: string; wos_account_id: string }>;
    const loadedMembers = accountRows.flatMap<StateMember>((account) => {
      const membership = membershipById.get(account.id);
      if (!membership) return [];
      return [{ ...account, role: membership.role, username: usernameById.get(account.user_id) ?? null, tags: tagAssignments.filter((item) => item.wos_account_id === account.id).flatMap((item) => { const tag = tagById.get(item.tag_id); return tag ? [tag] : []; }) }];
    }).sort((first, second) => (first.nickname || first.wos_id).localeCompare(second.nickname || second.wos_id));
    setPlans(planRows); setGroups((groupResult.data ?? []) as PlanGroup[]); setAssignments((assignmentResult.data ?? []) as PlanAssignment[]); setMembers(loadedMembers); setTags(stateTags); setAlliances((allianceResult.data ?? []) as StateAlliance[]); setPolls(pollRows); setPollOptions((optionResult.data ?? []) as PollOption[]); setPollResponses((responseResult.data ?? []) as PollResponse[]); setLoading(false);
  }, [activeMembership, isAdmin, supabase]);

  useEffect(() => {
    if (!loadingStates && signedIn === false) { router.replace("/login"); return; }
    const loadId = window.setTimeout(() => void loadPlanning(), 0);
    return () => window.clearTimeout(loadId);
  }, [loadPlanning, loadingStates, router, signedIn]);

  async function createPlan() {
    if (!activeMembership || !isAdmin) return;
    const date = new Date(scheduledAt);
    if (planName.trim().length < 3 || Number.isNaN(date.getTime()) || date <= new Date()) { setMessage("Enter a plan name and choose a future battle time."); return; }
    setSaving(true); setMessage("");
    const { error } = await supabase.rpc("create_battle_plan", { target_state_id: activeMembership.stateId, plan_name: planName.trim(), selected_battle_type: battleType, plan_scheduled_at: date.toISOString(), plan_notes: planNotes.trim() || null });
    if (error) setMessage(error.message); else { setPlanName(""); setBattleType("svs"); setScheduledAt(defaultScheduledTime()); setPlanNotes(""); await loadPlanning(); setMessage("Battle plan created as a draft."); }
    setSaving(false);
  }

  function beginEditingPlan(plan: BattlePlan) { setEditingPlanId(plan.id); setEditingPlanName(plan.name); setEditingBattleType(plan.battle_type); setEditingScheduledAt(toLocalDateTime(plan.scheduled_at)); setEditingPlanNotes(plan.notes ?? ""); }
  async function savePlan() {
    if (!editingPlanId) return;
    const date = new Date(editingScheduledAt);
    if (editingPlanName.trim().length < 3 || Number.isNaN(date.getTime())) { setMessage("Enter a valid plan name and time."); return; }
    setSaving(true);
    const { error } = await supabase.rpc("update_battle_plan", { target_plan_id: editingPlanId, plan_name: editingPlanName.trim(), selected_battle_type: editingBattleType, plan_scheduled_at: date.toISOString(), plan_notes: editingPlanNotes.trim() || null });
    if (error) setMessage(error.message); else { setEditingPlanId(null); await loadPlanning(); setMessage("Battle plan updated. Republish to notify players."); }
    setSaving(false);
  }
  async function deletePlan(plan: BattlePlan) {
    if (!window.confirm(`Delete “${plan.name}” and every group in it?`)) return;
    setSaving(true); const { error } = await supabase.rpc("delete_battle_plan", { target_plan_id: plan.id });
    if (error) setMessage(error.message); else { await loadPlanning(); setMessage("Battle plan deleted."); } setSaving(false);
  }
  function openGroupForm(planId: string) { setAddingGroupToPlanId(planId); setGroupName(""); setGroupLeaderId(""); setGroupAllianceId(""); setGroupTagId(""); setGroupCapacity(10); setGroupNotes(""); }
  async function createGroup(planId: string) {
    if (!groupName.trim() || !groupLeaderId || !groupAllianceId) { setMessage("Enter a name, Rally Lead, and destination alliance."); return; }
    setSaving(true);
    const { error } = await supabase.rpc("create_battle_plan_group", { target_plan_id: planId, group_name: groupName.trim(), leader_account_id: groupLeaderId, destination_alliance_id: groupAllianceId, publish_tag_id: groupTagId || null, group_max_members: groupCapacity, group_notes: groupNotes.trim() || null });
    if (error) setMessage(error.message); else { setAddingGroupToPlanId(null); await loadPlanning(); setMessage("Rally group created and its leader assigned."); } setSaving(false);
  }
  function beginEditingGroup(group: PlanGroup) { setEditingGroupId(group.id); setEditingGroupName(group.name); setEditingGroupLeaderId(group.leader_wos_account_id); setEditingGroupAllianceId(group.alliance_id ?? ""); setEditingGroupTagId(group.assignment_tag_id ?? ""); setEditingGroupCapacity(group.max_members); setEditingGroupNotes(group.notes ?? ""); }
  async function saveGroup() {
    if (!editingGroupId || !editingGroupName.trim() || !editingGroupLeaderId || !editingGroupAllianceId) { setMessage("Enter a name, Rally Lead, and destination alliance."); return; }
    setSaving(true);
    const { error } = await supabase.rpc("update_battle_plan_group", { target_group_id: editingGroupId, group_name: editingGroupName.trim(), leader_account_id: editingGroupLeaderId, destination_alliance_id: editingGroupAllianceId, publish_tag_id: editingGroupTagId || null, group_max_members: editingGroupCapacity, group_notes: editingGroupNotes.trim() || null });
    if (error) setMessage(error.message); else { setEditingGroupId(null); await loadPlanning(); setMessage("Rally group updated. Republish to apply assignments."); } setSaving(false);
  }
  async function deleteGroup(group: PlanGroup) {
    const count = assignments.filter((item) => item.group_id === group.id).length;
    if (!window.confirm(`Delete “${group.name}”? ${count} assigned accounts will become unassigned.`)) return;
    setSaving(true); const { error } = await supabase.rpc("delete_battle_plan_group", { target_group_id: group.id });
    if (error) setMessage(error.message); else await loadPlanning(); setSaving(false);
  }
  async function assignMember(planId: string, accountId: string, groupId: string | null) {
    if (!isAdmin || saving) return;
    setSaving(true); const { error } = await supabase.rpc("set_battle_plan_assignment", { target_plan_id: planId, target_wos_account_id: accountId, target_group_id: groupId });
    if (error) setMessage(error.message); else await loadPlanning(); setSaving(false);
  }
  async function bulkAssign(planId: string, group: PlanGroup) {
    const candidates = getCandidates(planId);
    if (!candidates.length) { setMessage("No unassigned accounts match the current filters."); return; }
    if (group.max_members <= getGroupMembers(planId, group.id).length) { setMessage("That rally group is full."); return; }
    setSaving(true);
    const { data, error } = await supabase.rpc("bulk_assign_battle_plan_members", { target_plan_id: planId, target_group_id: group.id, target_wos_account_ids: candidates.map((member) => member.id) });
    if (error) setMessage(error.message); else { await loadPlanning(); setMessage(`${Number(data ?? 0)} matching accounts added to ${group.name}.`); } setSaving(false);
  }
  function dropMember(event: DragEvent<HTMLElement>, planId: string, groupId: string | null) { event.preventDefault(); const accountId = event.dataTransfer.getData("text/plain"); if (accountId) void assignMember(planId, accountId, groupId); }
  async function publishPlan(plan: BattlePlan) {
    const action = plan.status === "published" ? "Republish" : "Publish";
    if (!window.confirm(`${action} “${plan.name}”? Assigned accounts will be moved to each group’s destination alliance, optional group tags will be applied, and players will be notified.`)) return;
    setSaving(true); const { data, error } = await supabase.rpc("publish_battle_plan", { target_plan_id: plan.id });
    if (error) setMessage(error.message); else { await loadPlanning(); setMessage(`Plan published. ${Number(data ?? 0)} users notified.`); } setSaving(false);
  }

  function getPlanGroups(planId: string) { return groups.filter((group) => group.plan_id === planId); }
  function getGroupMembers(planId: string, groupId: string) { const ids = new Set(assignments.filter((item) => item.plan_id === planId && item.group_id === groupId).map((item) => item.wos_account_id)); return members.filter((member) => ids.has(member.id)); }
  function getCandidates(planId: string) {
    if (!filtersActive) return [];
    const assigned = new Set(assignments.filter((item) => item.plan_id === planId).map((item) => item.wos_account_id));
    const search = memberSearch.trim().toLowerCase();
    const votedIds = pollOptionFilter ? new Set(pollResponses.filter((response) => response.option_id === pollOptionFilter).map((response) => response.wos_account_id)) : null;
    return members.filter((member) => {
      if (assigned.has(member.id)) return false;
      if (search && ![member.nickname, member.wos_id, member.username].filter(Boolean).some((value) => value?.toLowerCase().includes(search))) return false;
      if (tagFilter && !member.tags.some((tag) => tag.id === tagFilter)) return false;
      if (votedIds && !votedIds.has(member.id)) return false;
      if ((member.furnace_level ?? 0) < minimumFurnace) return false;
      if (minimumTroopTier > 0 && [member.infantry_tier, member.lancer_tier, member.marksman_tier].some((value) => (value ?? 0) < minimumTroopTier)) return false;
      return true;
    });
  }
  function renderStats(groupMembers: StateMember[]) {
    const troopValues = groupMembers.flatMap((member) => [member.infantry_tier, member.lancer_tier, member.marksman_tier]);
    const skillValues = groupMembers.flatMap((member) => [member.infantry_t12_skill, member.lancer_t12_skill, member.marksman_t12_skill]);
    return <div className="plan-group-stats"><span>Avg furnace <strong>{formatAverage(average(groupMembers.map((member) => member.furnace_level)))}</strong></span><span>Avg troop <strong>{formatAverage(average(troopValues))}</strong></span><span>Avg T12 skill <strong>{formatAverage(average(skillValues))}</strong></span></div>;
  }
  function renderMemberCard(member: StateMember, planId: string) {
    const planGroups = getPlanGroups(planId);
    const assignedGroupId = assignments.find((item) => item.plan_id === planId && item.wos_account_id === member.id)?.group_id ?? "";
    return <div key={member.id} className="plan-member-card" draggable={isAdmin && !saving} onDragStart={(event) => { event.dataTransfer.setData("text/plain", member.id); event.dataTransfer.effectAllowed = "move"; }}>
      <div className="plan-member-main"><strong>{member.nickname || `WOS ID ${member.wos_id}`}</strong><small>{member.username ? `@${member.username} · ` : ""}WOS ID {member.wos_id}</small></div>
      <small className="plan-member-stats">FC {member.furnace_level ?? "—"} · Troops {member.infantry_tier ?? "—"}/{member.lancer_tier ?? "—"}/{member.marksman_tier ?? "—"}</small>
      <div className="plan-member-context">{member.tags.map((tag) => <span key={tag.id} className="member-tag-pill"><span style={{ backgroundColor: tag.color }} />{tag.name}</span>)}</div>
      {isAdmin && <label className="plan-assignment-select">Assignment<select value={assignedGroupId} disabled={saving} onChange={(event) => void assignMember(planId, member.id, event.target.value || null)}><option value="">Unassigned</option>{planGroups.map((group) => <option key={group.id} value={group.id}>{group.name} ({getGroupMembers(planId, group.id).length}/{group.max_members})</option>)}</select></label>}
    </div>;
  }

  if (loadingStates || signedIn === null) return <main><AppHeader /><section className="loading-panel"><p>Loading battle planning...</p></section></main>;

  return <main><AppHeader />
    {!activeMembership ? <section className="empty-state"><h2>Choose a state</h2><p>Select a state before opening battle planning.</p></section> : <>
      <section className="battle-planning-heading"><p className="section-label">{activeMembership.stateName}</p><h1>Battle planning</h1><p>Build rally groups, assign every member here, then publish the alliance roster and optional tags.</p></section>
      {isAdmin && <section><h2>Create battle plan</h2><div className="battle-plan-create-grid">
        <label>Plan name<input value={planName} maxLength={100} onChange={(event) => setPlanName(event.target.value)} placeholder="SVS vs 1501" /></label>
        <label>Type<select value={battleType} onChange={(event) => setBattleType(event.target.value as BattleType)}><option value="svs">SVS</option><option value="castle">Castle</option><option value="test">Test</option></select></label>
        <label>Scheduled start<input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} /></label>
        <label className="battle-plan-notes-field">Notes<textarea rows={3} maxLength={2000} value={planNotes} onChange={(event) => setPlanNotes(event.target.value)} /></label>
      </div><button type="button" disabled={saving} onClick={() => void createPlan()}>Create draft plan</button></section>}
      <section><div className="section-title-row"><div><p className="section-label">Scheduled operations</p><h2>{isAdmin ? "Draft and published plans" : "Published plans"}</h2></div></div>{message && <p className="page-message">{message}</p>}
      {loading ? <p>Loading battle plans...</p> : plans.length === 0 ? <div className="empty-state compact-empty-state"><h3>No battle plans yet</h3></div> : <div className="battle-plan-list">{plans.map((plan) => {
        const planGroups = getPlanGroups(plan.id); const candidates = getCandidates(plan.id); const ownAssignment = assignments.find((item) => item.plan_id === plan.id && item.wos_account_id === activeMembership.wosAccountId); const ownGroup = planGroups.find((group) => group.id === ownAssignment?.group_id); const ownAlliance = alliances.find((alliance) => alliance.id === ownGroup?.alliance_id);
        return <article key={plan.id} className="battle-plan-card">
          <div className="battle-plan-card-heading"><div><span className={`poll-status ${plan.status === "published" ? "open" : "closed"}`}>{plan.status}</span><span className="battle-type-badge">{plan.battle_type.toUpperCase()}</span><h3>{plan.name}</h3><time>{new Date(plan.scheduled_at).toLocaleString()}</time></div>{isAdmin && <div className="battle-plan-actions"><button className="secondary-link" onClick={() => beginEditingPlan(plan)}>Edit</button><button disabled={saving} onClick={() => void publishPlan(plan)}>{plan.status === "published" ? "Republish" : "Publish"}</button><button className="danger-button" disabled={saving} onClick={() => void deletePlan(plan)}>Delete</button></div>}</div>
          {plan.notes && <p className="battle-plan-notes">{plan.notes}</p>}
          {!isAdmin && ownGroup && <div className="own-plan-assignment"><span>Your assignment</span><strong>{ownGroup.name}</strong><small>Alliance: {ownAlliance?.name ?? "Not selected"}</small></div>}
          {!isAdmin && !ownGroup && <p className="unassigned-plan-warning">This WOS account has not been assigned to a rally group.</p>}
          {isAdmin && editingPlanId === plan.id && <div className="plan-inline-editor"><label>Plan name<input value={editingPlanName} onChange={(event) => setEditingPlanName(event.target.value)} /></label><label>Type<select value={editingBattleType} onChange={(event) => setEditingBattleType(event.target.value as BattleType)}><option value="svs">SVS</option><option value="castle">Castle</option><option value="test">Test</option></select></label><label>Start<input type="datetime-local" value={editingScheduledAt} onChange={(event) => setEditingScheduledAt(event.target.value)} /></label><label>Notes<textarea value={editingPlanNotes} onChange={(event) => setEditingPlanNotes(event.target.value)} /></label><div className="button-row"><button disabled={saving} onClick={() => void savePlan()}>Save plan</button><button className="secondary-link" onClick={() => setEditingPlanId(null)}>Cancel</button></div></div>}
          {isAdmin && <div className="plan-admin-toolbar"><button className="secondary-link" onClick={() => openGroupForm(plan.id)}>Add rally group</button><span>Only accounts with the permanent Rally Lead tag appear as leaders.</span></div>}
          {isAdmin && addingGroupToPlanId === plan.id && <div className="plan-group-editor"><label>Group name<input value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder="TED Rally" /></label><label>Rally Lead<select value={groupLeaderId} onChange={(event) => setGroupLeaderId(event.target.value)}><option value="">Choose tagged leader</option>{rallyLeaders.map((member) => <option key={member.id} value={member.id}>{member.nickname || member.wos_id}</option>)}</select></label><label>Destination alliance<select value={groupAllianceId} onChange={(event) => setGroupAllianceId(event.target.value)}><option value="">Choose alliance</option>{alliances.map((alliance) => <option key={alliance.id} value={alliance.id}>{alliance.name}</option>)}</select></label><label>Tag after publish<select value={groupTagId} onChange={(event) => setGroupTagId(event.target.value)}><option value="">No automatic tag</option>{regularTags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}</select></label><label>Capacity<input type="number" min="1" max="100" value={groupCapacity} onChange={(event) => setGroupCapacity(Number(event.target.value))} /></label><label>Instructions<input value={groupNotes} onChange={(event) => setGroupNotes(event.target.value)} /></label><button disabled={saving} onClick={() => void createGroup(plan.id)}>Create group</button><button className="secondary-link" onClick={() => setAddingGroupToPlanId(null)}>Cancel</button>{rallyLeaders.length === 0 && <p className="page-message">Assign Rally Lead tags from State members first.</p>}</div>}
          {isAdmin && <div className="plan-roster-filters"><div className="section-title-row"><div><p className="section-label">Candidate finder</p><h4>Find accounts worth assigning</h4></div><span className="retention-badge">{filtersActive ? `${candidates.length} matches` : "Add a filter"}</span></div><input type="search" value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder="Name, username, or WOS ID" /><select value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}><option value="">Any tag</option>{tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}</select><select value={pollFilter} onChange={(event) => { setPollFilter(event.target.value); setPollOptionFilter(""); }}><option value="">Any vote</option>{polls.map((poll) => <option key={poll.id} value={poll.id}>{poll.question}</option>)}</select><select value={pollOptionFilter} disabled={!pollFilter} onChange={(event) => setPollOptionFilter(event.target.value)}><option value="">Any answer</option>{pollOptions.filter((option) => option.poll_id === pollFilter).map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select><label>Minimum Fire Crystal Furnace<input type="number" min="0" max="10" value={minimumFurnace} onChange={(event) => setMinimumFurnace(Number(event.target.value))} /></label><label>Minimum all troop tiers<input type="number" min="0" max="12" value={minimumTroopTier} onChange={(event) => setMinimumTroopTier(Number(event.target.value))} /></label><button className="secondary-link" onClick={() => { setMemberSearch(""); setTagFilter(""); setPollFilter(""); setPollOptionFilter(""); setMinimumFurnace(0); setMinimumTroopTier(0); }}>Clear filters</button><p>{filtersActive ? "Drag individual matches into a group, or use Add matching on a group." : "The full member list stays hidden. Add at least one filter to find candidates."}</p>{filtersActive && <div className="plan-member-list candidate-result-list">{candidates.slice(0, 50).map((member) => renderMemberCard(member, plan.id))}{candidates.length > 50 && <p>Showing the first 50 of {candidates.length} matches. Narrow the filters.</p>}</div>}</div>}
          <div className="battle-plan-board">{planGroups.map((group) => { const groupMembers = getGroupMembers(plan.id, group.id); const leader = members.find((member) => member.id === group.leader_wos_account_id); const alliance = alliances.find((item) => item.id === group.alliance_id); const assignmentTag = tags.find((tag) => tag.id === group.assignment_tag_id); return <div key={group.id} className="plan-group-column" onDragOver={(event) => event.preventDefault()} onDrop={(event) => dropMember(event, plan.id, group.id)}>
            {isAdmin && editingGroupId === group.id ? <div className="plan-group-edit-panel"><label>Name<input value={editingGroupName} onChange={(event) => setEditingGroupName(event.target.value)} /></label><label>Rally Lead<select value={editingGroupLeaderId} onChange={(event) => setEditingGroupLeaderId(event.target.value)}>{rallyLeaders.map((member) => <option key={member.id} value={member.id}>{member.nickname || member.wos_id}</option>)}</select></label><label>Destination alliance<select value={editingGroupAllianceId} onChange={(event) => setEditingGroupAllianceId(event.target.value)}><option value="">Choose alliance</option>{alliances.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Tag after publish<select value={editingGroupTagId} onChange={(event) => setEditingGroupTagId(event.target.value)}><option value="">No automatic tag</option>{regularTags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}</select></label><label>Capacity<input type="number" min="1" max="100" value={editingGroupCapacity} onChange={(event) => setEditingGroupCapacity(Number(event.target.value))} /></label><label>Instructions<input value={editingGroupNotes} onChange={(event) => setEditingGroupNotes(event.target.value)} /></label><button disabled={saving} onClick={() => void saveGroup()}>Save group</button><button className="secondary-link" onClick={() => setEditingGroupId(null)}>Cancel</button></div> : <><div className="plan-group-heading"><div><h4>{group.name}</h4><small>Leader: {leader?.nickname || leader?.wos_id || "Unknown"}</small></div><span>{groupMembers.length}/{group.max_members}</span></div><p className="plan-group-notes">Alliance: <strong>{alliance?.name ?? "Select before publishing"}</strong>{assignmentTag ? ` · Publish tag: ${assignmentTag.name}` : ""}</p>{group.notes && <p className="plan-group-notes">{group.notes}</p>}{renderStats(groupMembers)}{isAdmin && <div className="plan-group-actions"><button className="secondary-link" disabled={!filtersActive || !candidates.length || saving} onClick={() => void bulkAssign(plan.id, group)}>Add matching</button><button className="secondary-link" onClick={() => beginEditingGroup(group)}>Edit</button><button className="danger-button" disabled={saving} onClick={() => void deleteGroup(group)}>Delete</button></div>}</>}
            <div className="plan-member-list">{groupMembers.length ? groupMembers.map((member) => renderMemberCard(member, plan.id)) : <p className="plan-drop-hint">Drop filtered candidates here.</p>}</div>
          </div>; })}</div>
        </article>;
      })}</div>}</section>
      {isAdmin && !rallyLeadTag && <section className="empty-state"><h2>Rally Lead tag missing</h2><p>Run the Battle Planning V2 SQL upgrade before using this page.</p></section>}
    </>}
  </main>;
}
