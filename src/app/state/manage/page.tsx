"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { useStates } from "@/components/StateProvider";
import { createClient } from "@/lib/supabase/client";
import type { StateCapability, StateRole } from "@/types/state";

type StateMember = {
  wosAccountId: string;
  wosId: string;
  nickname: string | null;
  username: string | null;
  role: StateRole;
  capabilities: StateCapability[];
  isRallyLead: boolean;
};

type PendingApproval = {
  inviteId: string;
  wosId: string;
  nickname: string | null;
  expiresAt: string;
};

type StateAlliance = {
  id: string;
  name: string;
  color: string;
  max_members: number;
  memberCount: number;
};

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export default function ManageStatePage() {
  const supabase = useMemo(() => createClient(), []);
  const { activeMembership, refreshMemberships } = useStates();
  const [members, setMembers] = useState<StateMember[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [inviteWosId, setInviteWosId] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [battleName, setBattleName] = useState("");
  const [battleType, setBattleType] = useState("svs");
  const [battleResult, setBattleResult] = useState("win");
  const [alliances, setAlliances] = useState<StateAlliance[]>([]);
  const [allianceName, setAllianceName] = useState("");
  const [allianceColor, setAllianceColor] = useState("#4f8fba");
  const [allianceCapacity, setAllianceCapacity] = useState(100);
  const [editingAllianceId, setEditingAllianceId] = useState<string | null>(
    null
  );
  const [editingAllianceName, setEditingAllianceName] = useState("");
  const [editingAllianceColor, setEditingAllianceColor] =
    useState("#4f8fba");
  const [editingAllianceCapacity, setEditingAllianceCapacity] = useState(100);
  const [savingAlliance, setSavingAlliance] = useState(false);
  const [message, setMessage] = useState("");

  const loadStateManagement = useCallback(async () => {
    if (
      !activeMembership ||
      !["owner", "admin"].includes(activeMembership.role)
    ) {
      setMembers([]);
      setPendingApprovals([]);
      setAlliances([]);
      return;
    }

    const [
      { data: memberRows, error: memberError },
      { data: inviteRows },
      { data: capabilityRows },
      { data: tagRows },
      { data: tagAssignmentRows },
      { data: allianceRows, error: allianceError },
      { data: allianceAssignmentRows, error: allianceAssignmentError },
    ] =
      await Promise.all([
        supabase
          .from("state_members")
          .select("wos_account_id, role")
          .eq("state_id", activeMembership.stateId),
        supabase
          .from("state_invites")
          .select("id, invited_wos_account_id, expires_at")
          .eq("state_id", activeMembership.stateId)
          .eq("status", "pending_owner")
          .order("created_at"),
        supabase
          .from("state_member_capabilities")
          .select("wos_account_id, capability")
          .eq("state_id", activeMembership.stateId),
        supabase
          .from("state_tags")
          .select("id, system_key")
          .eq("state_id", activeMembership.stateId),
        supabase
          .from("state_member_tags")
          .select("tag_id, wos_account_id"),
        supabase
          .from("state_alliances")
          .select("id, name, color, max_members")
          .eq("state_id", activeMembership.stateId)
          .order("name"),
        supabase
          .from("state_alliance_members")
          .select("alliance_id")
          .eq("state_id", activeMembership.stateId),
      ]);

    const loadError =
      memberError || allianceError || allianceAssignmentError;
    if (loadError || !memberRows) {
      setMessage(loadError?.message ?? "Could not load state management.");
      return;
    }

    const assignmentCountByAlliance = new Map<string, number>();
    (allianceAssignmentRows ?? []).forEach((assignment) => {
      assignmentCountByAlliance.set(
        assignment.alliance_id,
        (assignmentCountByAlliance.get(assignment.alliance_id) ?? 0) + 1
      );
    });
    setAlliances(
      (allianceRows ?? []).map((alliance) => ({
        ...alliance,
        memberCount: assignmentCountByAlliance.get(alliance.id) ?? 0,
      }))
    );

    const memberAccountIds = memberRows.map((row) => row.wos_account_id);
    const pendingAccountIds = (inviteRows ?? []).map(
      (row) => row.invited_wos_account_id
    );
    const accountIds = [
      ...new Set([...memberAccountIds, ...pendingAccountIds]),
    ];
    const { data: accounts } = accountIds.length
      ? await supabase
          .from("wos_accounts")
          .select("id, user_id, wos_id, nickname")
          .in("id", accountIds)
      : { data: [] };
    const memberUserIds = [
      ...new Set(
        (accounts ?? [])
          .filter((account) => memberAccountIds.includes(account.id))
          .map((account) => account.user_id)
      ),
    ];
    const { data: profiles } = memberUserIds.length
      ? await supabase
          .from("profiles")
          .select("id, username")
          .in("id", memberUserIds)
      : { data: [] };

    const accountById = new Map(
      (accounts ?? []).map((account) => [account.id, account])
    );
    const usernameByUserId = new Map(
      (profiles ?? []).map((profile) => [profile.id, profile.username])
    );
    const rallyLeadTagId = (tagRows ?? []).find(
      (tag) => tag.system_key === "rally_lead"
    )?.id;
    const rallyLeadAccountIds = new Set(
      (tagAssignmentRows ?? [])
        .filter((assignment) => assignment.tag_id === rallyLeadTagId)
        .map((assignment) => assignment.wos_account_id)
    );

    setMembers(
      memberRows.flatMap((row) => {
        const account = accountById.get(row.wos_account_id);
        if (!account) return [];
        return [{
          wosAccountId: account.id,
          wosId: account.wos_id,
          nickname: account.nickname,
          username: usernameByUserId.get(account.user_id) ?? null,
          role: row.role as StateRole,
          capabilities: (capabilityRows ?? [])
            .filter(
              (capability) =>
                capability.wos_account_id === account.id
            )
            .map(
              (capability) =>
                capability.capability as StateCapability
            ),
          isRallyLead: rallyLeadAccountIds.has(account.id),
        }];
      })
    );

    setPendingApprovals(
      (inviteRows ?? []).flatMap((invite) => {
        const account = accountById.get(invite.invited_wos_account_id);
        if (!account) return [];
        return [{
          inviteId: invite.id,
          wosId: account.wos_id,
          nickname: account.nickname,
          expiresAt: invite.expires_at,
        }];
      })
    );
  }, [activeMembership, supabase]);

  useEffect(() => {
    const loadId = window.setTimeout(() => {
      void loadStateManagement();
    }, 0);
    return () => window.clearTimeout(loadId);
  }, [loadStateManagement]);

  async function startBattlePeriod() {
    if (!activeMembership) return;
    const trimmedBattleName = battleName.trim();
    if (!trimmedBattleName) {
      setMessage("Enter a battle period name, for example SVS vs 1501.");
      return;
    }
    setMessage("");
    const { error } = await supabase.rpc("start_state_battle", {
      target_state_id: activeMembership.stateId,
      battle_name: trimmedBattleName,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Battle period started. Battle tools are now available.");
    setBattleName("");
    await refreshMemberships();
  }

  async function endBattlePeriod() {
    if (!activeMembership?.battleId) return;
    const confirmed = window.confirm(
      `End this battle period as a ${battleResult.toUpperCase()} and save it as ${battleType.toUpperCase()}? Battle tools will be hidden for every member.`
    );
    if (!confirmed) return;

    setMessage("");
    const { error } = await supabase.rpc("end_state_battle", {
      target_battle_id: activeMembership.battleId,
      selected_battle_type: battleType,
      selected_result: battleResult,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Battle period ended and its result was saved permanently.");
    await refreshMemberships();
  }

  function validateAlliance(
    name: string,
    color: string,
    capacity: number
  ) {
    if (!name.trim()) {
      setMessage("Enter an alliance name.");
      return false;
    }
    if (!HEX_COLOR.test(color)) {
      setMessage("Use a six-digit color code such as #4f8fba.");
      return false;
    }
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100) {
      setMessage("Alliance capacity must be between 1 and 100.");
      return false;
    }
    return true;
  }

  async function createAlliance() {
    if (
      !activeMembership ||
      !validateAlliance(allianceName, allianceColor, allianceCapacity)
    ) {
      return;
    }

    setSavingAlliance(true);
    setMessage("");
    const { error } = await supabase.rpc("create_state_alliance", {
      target_state_id: activeMembership.stateId,
      alliance_name: allianceName.trim(),
      alliance_color: allianceColor,
      alliance_max_members: allianceCapacity,
    });

    if (error) {
      setMessage(error.message);
    } else {
      setAllianceName("");
      setAllianceColor("#4f8fba");
      setAllianceCapacity(100);
      await loadStateManagement();
      setMessage("Alliance created. It can now be selected in Battle Planning.");
    }
    setSavingAlliance(false);
  }

  function beginEditingAlliance(alliance: StateAlliance) {
    setEditingAllianceId(alliance.id);
    setEditingAllianceName(alliance.name);
    setEditingAllianceColor(alliance.color);
    setEditingAllianceCapacity(alliance.max_members);
    setMessage("");
  }

  async function saveAlliance() {
    if (
      !editingAllianceId ||
      !validateAlliance(
        editingAllianceName,
        editingAllianceColor,
        editingAllianceCapacity
      )
    ) {
      return;
    }

    setSavingAlliance(true);
    setMessage("");
    const { error } = await supabase.rpc("update_state_alliance", {
      target_alliance_id: editingAllianceId,
      alliance_name: editingAllianceName.trim(),
      alliance_color: editingAllianceColor,
      alliance_max_members: editingAllianceCapacity,
    });

    if (error) {
      setMessage(error.message);
    } else {
      setEditingAllianceId(null);
      await loadStateManagement();
      setMessage("Alliance updated.");
    }
    setSavingAlliance(false);
  }

  async function deleteAlliance(alliance: StateAlliance) {
    const confirmed = window.confirm(
      `Delete “${alliance.name}”?\n\nIt is currently assigned to ${alliance.memberCount} ${alliance.memberCount === 1 ? "account" : "accounts"}. Those accounts will become unassigned, but no state members will be deleted.`
    );
    if (!confirmed) return;

    setSavingAlliance(true);
    setMessage("");
    const { error } = await supabase.rpc("delete_state_alliance", {
      target_alliance_id: alliance.id,
    });

    if (error) {
      setMessage(error.message);
    } else {
      if (editingAllianceId === alliance.id) {
        setEditingAllianceId(null);
      }
      await loadStateManagement();
      setMessage("Alliance deleted. No state members were removed.");
    }
    setSavingAlliance(false);
  }

  async function createInvitation() {
    if (!activeMembership || !inviteWosId.trim()) return;
    setMessage("");
    setInviteLink("");

    const { data, error } = await supabase.rpc("create_state_join_invite", {
      target_state_id: activeMembership.stateId,
      target_wos_id: inviteWosId.trim(),
      valid_for_hours: 72,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setInviteLink(window.location.origin + "/invite/" + data);
    setInviteWosId("");
    setMessage(
      "Invitation delivered in the player's notification inbox. The link below is an optional backup."
    );
  }

  async function copyInviteLink() {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setMessage("Backup invitation link copied.");
  }

  async function reviewInvitation(inviteId: string, approveInvite: boolean) {
    setMessage("");
    const { error } = await supabase.rpc("review_state_invite", {
      target_invite_id: inviteId,
      approve_invite: approveInvite,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage(
      approveInvite
        ? "Player verified and added as a regular member."
        : "Membership request rejected."
    );
    await loadStateManagement();
    await refreshMemberships();
  }

  async function changeRole(
    wosAccountId: string,
    role: Exclude<StateRole, "owner">
  ) {
    if (!activeMembership) return;
    const { error } = await supabase.rpc("set_state_member_role", {
      target_state_id: activeMembership.stateId,
      target_wos_account_id: wosAccountId,
      new_role: role,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    await loadStateManagement();
    await refreshMemberships();
  }

  async function setCapability(
    wosAccountId: string,
    capability: StateCapability,
    enabled: boolean
  ) {
    if (!activeMembership) return;
    const { error } = await supabase.rpc(
      "set_state_member_capability",
      {
        target_state_id: activeMembership.stateId,
        target_wos_account_id: wosAccountId,
        target_capability: capability,
        capability_enabled: enabled,
      }
    );

    if (error) {
      setMessage(error.message);
      return;
    }

    await loadStateManagement();
    await refreshMemberships();
  }

  async function setRallyLead(wosAccountId: string, enabled: boolean) {
    if (!activeMembership) return;
    setMessage("");
    const { error } = await supabase.rpc("set_state_rally_lead", {
      target_state_id: activeMembership.stateId,
      target_wos_account_id: wosAccountId,
      enabled,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    await loadStateManagement();
    setMessage(enabled ? "Rally Lead tag assigned." : "Rally Lead tag removed.");
  }

  async function removeMember(wosAccountId: string) {
    if (!activeMembership) return;
    const member = members.find(
      (stateMember) =>
        stateMember.wosAccountId === wosAccountId
    );
    const memberName =
      member?.nickname || member?.wosId || "this member";
    const confirmed = window.confirm(
      `Remove ${memberName} from ${activeMembership.stateName}?\n\nThey will immediately lose state access, their role, capabilities, and tags. They will need a new invitation to join again.`
    );

    if (!confirmed) return;

    setMessage("");
    const { error } = await supabase.rpc("remove_state_member", {
      target_state_id: activeMembership.stateId,
      target_wos_account_id: wosAccountId,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage(`${memberName} was removed from the state.`);
    await loadStateManagement();
    await refreshMemberships();
  }

  if (!activeMembership) {
    return (
      <main>
        <AppHeader />
        <section>
          <h2>Manage state</h2>
          <p>Select or join a state first.</p>
        </section>
      </main>
    );
  }

  if (!["owner", "admin"].includes(activeMembership.role)) {
    return (
      <main>
        <AppHeader />
        <section>
          <h2>Manage state</h2>
          <p>Only state owners and admins can manage this page.</p>
        </section>
      </main>
    );
  }

  return (
    <main>
      <AppHeader />
      {message && <p className="page-message">{message}</p>}
      <section>
        <div className="section-title-row">
          <div>
            <p className="section-label">Battle access</p>
            <h2>Battle period</h2>
          </div>
          <span
            className={
              activeMembership.battleId
                ? "battle-state battle-state-active"
                : "battle-state"
            }
          >
            {activeMembership.battleId ? "Active" : "Inactive"}
          </span>
        </div>
        {activeMembership.battleId ? (
          <div className="battle-control-row">
            <div>
              <p>
                <strong>
                  {activeMembership.battleName || "Active battle"}
                </strong>
                {" — "}battle tools are available to assigned coordinators
                and garrison players.
              </p>
              <label>
                Save this battle as
                <select
                  value={battleType}
                  onChange={(event) =>
                    setBattleType(event.target.value)
                  }
                >
                  <option value="svs">SVS</option>
                  <option value="castle">Castle</option>
                  <option value="test">Test</option>
                </select>
              </label>
              <label>
                Battle result
                <select
                  value={battleResult}
                  onChange={(event) => setBattleResult(event.target.value)}
                >
                  <option value="win">Win</option>
                  <option value="loss">Loss</option>
                </select>
              </label>
            </div>
            <button
              type="button"
              className="danger-button"
              onClick={endBattlePeriod}
            >
              End and save battle
            </button>
          </div>
        ) : (
          <>
            <p>
              Start a battle period when your state is preparing, testing,
              or actively coordinating an event.
            </p>
            <div className="battle-start-form">
              <label>
                Battle name
                <input
                  type="text"
                  value={battleName}
                  onChange={(event) =>
                    setBattleName(event.target.value)
                  }
                  maxLength={80}
                  placeholder="e.g. SVS vs 1501"
                />
              </label>
              <button type="button" onClick={startBattlePeriod}>
                Start battle period
              </button>
            </div>
          </>
        )}
      </section>

      <section>
        <div className="section-title-row">
          <div>
            <p className="section-label">Battle structure</p>
            <h2>Alliance setup</h2>
          </div>
          <span className="retention-badge">
            {alliances.length} {alliances.length === 1 ? "alliance" : "alliances"}
          </span>
        </div>
        <p>
          Create the alliances available to battle planners. Member
          assignments are managed only from Battle Planning and become visible
          in Alliance Overview after publishing.
        </p>

        <div className="alliance-management-create">
          <label>
            Alliance name
            <input
              type="text"
              maxLength={40}
              value={allianceName}
              onChange={(event) => setAllianceName(event.target.value)}
              placeholder="TED"
            />
          </label>
          <label>
            Color
            <span className="color-input-row">
              <input
                type="color"
                value={
                  HEX_COLOR.test(allianceColor) ? allianceColor : "#4f8fba"
                }
                onChange={(event) => setAllianceColor(event.target.value)}
              />
              <input
                className="hex-color-input"
                type="text"
                maxLength={7}
                value={allianceColor}
                onChange={(event) => setAllianceColor(event.target.value)}
              />
            </span>
          </label>
          <label>
            Capacity
            <input
              type="number"
              min="1"
              max="100"
              value={allianceCapacity}
              onChange={(event) =>
                setAllianceCapacity(Number(event.target.value))
              }
            />
          </label>
          <button
            type="button"
            disabled={savingAlliance}
            onClick={() => void createAlliance()}
          >
            {savingAlliance ? "Saving..." : "Create alliance"}
          </button>
        </div>

        {alliances.length === 0 ? (
          <div className="empty-state compact-empty-state">
            <h3>No alliances configured</h3>
            <p>Create the first destination for your battle plans.</p>
          </div>
        ) : (
          <div className="alliance-management-list">
            {alliances.map((alliance) => (
              <article
                key={alliance.id}
                className="alliance-management-row"
                style={{ borderLeftColor: alliance.color }}
              >
                {editingAllianceId === alliance.id ? (
                  <div className="alliance-management-editor">
                    <label>
                      Alliance name
                      <input
                        type="text"
                        maxLength={40}
                        value={editingAllianceName}
                        onChange={(event) =>
                          setEditingAllianceName(event.target.value)
                        }
                      />
                    </label>
                    <label>
                      Color
                      <span className="color-input-row">
                        <input
                          type="color"
                          value={
                            HEX_COLOR.test(editingAllianceColor)
                              ? editingAllianceColor
                              : "#4f8fba"
                          }
                          onChange={(event) =>
                            setEditingAllianceColor(event.target.value)
                          }
                        />
                        <input
                          className="hex-color-input"
                          type="text"
                          maxLength={7}
                          value={editingAllianceColor}
                          onChange={(event) =>
                            setEditingAllianceColor(event.target.value)
                          }
                        />
                      </span>
                    </label>
                    <label>
                      Capacity
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={editingAllianceCapacity}
                        onChange={(event) =>
                          setEditingAllianceCapacity(Number(event.target.value))
                        }
                      />
                    </label>
                    <div className="tag-row-actions">
                      <button
                        type="button"
                        disabled={savingAlliance}
                        onClick={() => void saveAlliance()}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className="secondary-link"
                        onClick={() => setEditingAllianceId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <span
                      className="tag-swatch alliance-swatch"
                      style={{ backgroundColor: alliance.color }}
                    />
                    <div className="alliance-management-identity">
                      <strong>{alliance.name}</strong>
                      <small>
                        {alliance.memberCount}/{alliance.max_members} published
                        assignments
                      </small>
                    </div>
                    <div className="tag-row-actions">
                      <button
                        type="button"
                        className="secondary-link"
                        onClick={() => beginEditingAlliance(alliance)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="danger-button"
                        disabled={savingAlliance}
                        onClick={() => void deleteAlliance(alliance)}
                      >
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2>Manage {activeMembership.stateName}</h2>
        <h3>Invite a WOS account</h3>
        <p>
          Enter the player&apos;s registered WOS ID. They receive an in-app
          invitation and must accept it. You then verify the player before
          they receive state access.
        </p>
        <div className="invite-form">
          <label>
            WOS ID
            <input
              type="text"
              inputMode="numeric"
              value={inviteWosId}
              onChange={(event) => setInviteWosId(event.target.value)}
              placeholder="Player's WOS ID"
            />
          </label>
          <button type="button" onClick={createInvitation}>
            Send invitation
          </button>
        </div>
        {inviteLink && (
          <div className="invite-link-box">
            <label className="invite-link-field">
              Optional backup link
              <input
                value={inviteLink}
                readOnly
                onFocus={(event) => event.target.select()}
              />
            </label>
            <button type="button" onClick={copyInviteLink}>
              Copy link
            </button>
          </div>
        )}
      </section>

      <section>
        <h2>Waiting for your verification</h2>
        <p>
          These players accepted an invitation. Confirm their identity
          outside the app before approving them.
        </p>
        {pendingApprovals.length === 0 ? (
          <p>No players are waiting for approval.</p>
        ) : (
          <ul>
            {pendingApprovals.map((approval) => (
              <li key={approval.inviteId}>
                <span>
                  <strong>{approval.nickname || "Unnamed WOS account"}</strong>
                  {" — WOS ID " + approval.wosId}
                  <small>
                    {" — expires " +
                      new Date(approval.expiresAt).toLocaleString()}
                  </small>
                </span>
                <div className="member-actions">
                  <button
                    type="button"
                    onClick={() =>
                      void reviewInvitation(approval.inviteId, true)
                    }
                  >
                    Verify and approve
                  </button>
                  <button
                    type="button"
                    className="danger-button"
                    onClick={() =>
                      void reviewInvitation(approval.inviteId, false)
                    }
                  >
                    Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>State members</h2>
        {members.length === 0 ? (
          <p>No members found.</p>
        ) : (
          <ul>
            {members.map((member) => (
              <li key={member.wosAccountId}>
                <span>
                  <strong>{member.nickname || member.wosId}</strong>
                  {" — WOS ID " + member.wosId}
                  {member.username ? " — @" + member.username : ""}
                </span>
                {member.role === "owner" ? (
                  <span className="role-badge">Owner</span>
                ) : (
                  <div className="member-actions">
                    {activeMembership.role === "owner" ? (
                      <label>
                        Permission role
                        <select
                          value={member.role}
                          onChange={(event) =>
                            void changeRole(
                              member.wosAccountId,
                              event.target.value as Exclude<
                                StateRole,
                                "owner"
                              >
                            )
                          }
                        >
                          <option value="member">Member</option>
                          <option value="admin">Admin</option>
                        </select>
                      </label>
                    ) : (
                      <span className="role-badge">
                        {member.role}
                      </span>
                    )}
                    <label className="capability-toggle">
                      <input
                        type="checkbox"
                        checked={member.capabilities.includes(
                          "rally_caller"
                        )}
                        onChange={(event) =>
                          void setCapability(
                            member.wosAccountId,
                            "rally_caller",
                            event.target.checked
                          )
                        }
                      />
                      <span>Coordinator</span>
                    </label>
                    <label className="capability-toggle">
                      <input
                        type="checkbox"
                        checked={member.capabilities.includes(
                          "garrison"
                        )}
                        onChange={(event) =>
                          void setCapability(
                            member.wosAccountId,
                            "garrison",
                            event.target.checked
                          )
                        }
                      />
                      <span>Garrison</span>
                    </label>
                    <label className="capability-toggle">
                      <input
                        type="checkbox"
                        checked={member.isRallyLead}
                        onChange={(event) =>
                          void setRallyLead(
                            member.wosAccountId,
                            event.target.checked
                          )
                        }
                      />
                      <span>Rally Lead</span>
                    </label>
                    {(activeMembership.role === "owner" ||
                      member.role === "member") && (
                      <button
                        type="button"
                        className="danger-button"
                        onClick={() =>
                          void removeMember(member.wosAccountId)
                        }
                      >
                        Remove
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
