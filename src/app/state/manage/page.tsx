"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { useStates } from "@/components/StateProvider";
import { createClient } from "@/lib/supabase/client";
import type { StateCapability, StateRole } from "@/types/state";
import { useLanguage } from "@/components/LanguageProvider";
import { SvsStatus } from "@/components/SvsStatus";

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
  const { t, formatDateTime } = useLanguage();
  const supabase = useMemo(() => createClient(), []);
  const { activeMembership, refreshMemberships } = useStates();
  const [members, setMembers] = useState<StateMember[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>(
    [],
  );
  const [inviteWosId, setInviteWosId] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [gameStateNumber, setGameStateNumber] = useState("");
  const [releaseWosId, setReleaseWosId] = useState("");
  const [releasingClaim, setReleasingClaim] = useState(false);
  const [alliances, setAlliances] = useState<StateAlliance[]>([]);
  const [allianceName, setAllianceName] = useState("");
  const [allianceColor, setAllianceColor] = useState("#4f8fba");
  const [allianceCapacity, setAllianceCapacity] = useState(100);
  const [editingAllianceId, setEditingAllianceId] = useState<string | null>(
    null,
  );
  const [editingAllianceName, setEditingAllianceName] = useState("");
  const [editingAllianceColor, setEditingAllianceColor] = useState("#4f8fba");
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
    ] = await Promise.all([
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
      supabase.from("state_member_tags").select("tag_id, wos_account_id"),
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

    const { data: stateRow } = await supabase
      .from("states")
      .select("game_state_number")
      .eq("id", activeMembership.stateId)
      .maybeSingle();
    setGameStateNumber(
      stateRow?.game_state_number ? String(stateRow.game_state_number) : "",
    );

    const loadError = memberError || allianceError || allianceAssignmentError;
    if (loadError || !memberRows) {
      setMessage(loadError?.message ?? "Could not load state management.");
      return;
    }

    const assignmentCountByAlliance = new Map<string, number>();
    (allianceAssignmentRows ?? []).forEach((assignment) => {
      assignmentCountByAlliance.set(
        assignment.alliance_id,
        (assignmentCountByAlliance.get(assignment.alliance_id) ?? 0) + 1,
      );
    });
    setAlliances(
      (allianceRows ?? []).map((alliance) => ({
        ...alliance,
        memberCount: assignmentCountByAlliance.get(alliance.id) ?? 0,
      })),
    );

    const memberAccountIds = memberRows.map((row) => row.wos_account_id);
    const pendingAccountIds = (inviteRows ?? []).map(
      (row) => row.invited_wos_account_id,
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
          .map((account) => account.user_id),
      ),
    ];
    const { data: profiles } = memberUserIds.length
      ? await supabase
          .from("profiles")
          .select("id, username")
          .in("id", memberUserIds)
      : { data: [] };

    const accountById = new Map(
      (accounts ?? []).map((account) => [account.id, account]),
    );
    const usernameByUserId = new Map(
      (profiles ?? []).map((profile) => [profile.id, profile.username]),
    );
    const rallyLeadTagId = (tagRows ?? []).find(
      (tag) => tag.system_key === "rally_lead",
    )?.id;
    const rallyLeadAccountIds = new Set(
      (tagAssignmentRows ?? [])
        .filter((assignment) => assignment.tag_id === rallyLeadTagId)
        .map((assignment) => assignment.wos_account_id),
    );

    setMembers(
      memberRows.flatMap((row) => {
        const account = accountById.get(row.wos_account_id);
        if (!account) return [];
        return [
          {
            wosAccountId: account.id,
            wosId: account.wos_id,
            nickname: account.nickname,
            username: usernameByUserId.get(account.user_id) ?? null,
            role: row.role as StateRole,
            capabilities: (capabilityRows ?? [])
              .filter((capability) => capability.wos_account_id === account.id)
              .map((capability) => capability.capability as StateCapability),
            isRallyLead: rallyLeadAccountIds.has(account.id),
          },
        ];
      }),
    );

    setPendingApprovals(
      (inviteRows ?? []).flatMap((invite) => {
        const account = accountById.get(invite.invited_wos_account_id);
        if (!account) return [];
        return [
          {
            inviteId: invite.id,
            wosId: account.wos_id,
            nickname: account.nickname,
            expiresAt: invite.expires_at,
          },
        ];
      }),
    );
  }, [activeMembership, supabase]);

  useEffect(() => {
    const loadId = window.setTimeout(() => {
      void loadStateManagement();
    }, 0);
    return () => window.clearTimeout(loadId);
  }, [loadStateManagement]);

  function validateAlliance(name: string, color: string, capacity: number) {
    if (!name.trim()) {
      setMessage(t("Enter an alliance name."));
      return false;
    }
    if (!HEX_COLOR.test(color)) {
      setMessage(t("Use a six-digit color code such as #4f8fba."));
      return false;
    }
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100) {
      setMessage(t("Alliance capacity must be between 1 and 100."));
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
    setMessage(t(""));
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
      setMessage(
        t("Alliance created. It can now be selected in Battle Planning."),
      );
    }
    setSavingAlliance(false);
  }

  function beginEditingAlliance(alliance: StateAlliance) {
    setEditingAllianceId(alliance.id);
    setEditingAllianceName(alliance.name);
    setEditingAllianceColor(alliance.color);
    setEditingAllianceCapacity(alliance.max_members);
    setMessage(t(""));
  }

  async function saveAlliance() {
    if (
      !editingAllianceId ||
      !validateAlliance(
        editingAllianceName,
        editingAllianceColor,
        editingAllianceCapacity,
      )
    ) {
      return;
    }

    setSavingAlliance(true);
    setMessage(t(""));
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
      setMessage(t("Alliance updated."));
    }
    setSavingAlliance(false);
  }

  async function deleteAlliance(alliance: StateAlliance) {
    const confirmed = window.confirm(
      `Delete “${alliance.name}”?\n\nIt is currently assigned to ${alliance.memberCount} ${alliance.memberCount === 1 ? "account" : "accounts"}. Those accounts will become unassigned, but no state members will be deleted.`,
    );
    if (!confirmed) return;

    setSavingAlliance(true);
    setMessage(t(""));
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
      setMessage(t("Alliance deleted. No state members were removed."));
    }
    setSavingAlliance(false);
  }

  async function createInvitation() {
    if (!activeMembership || !inviteWosId.trim()) return;
    setMessage(t(""));
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
      t(
        "Invitation delivered in the player's notification inbox. The link below is an optional backup.",
      ),
    );
  }

  async function saveGameStateNumber() {
    if (!activeMembership) return;
    const trimmed = gameStateNumber.trim();
    if (trimmed && !/^[1-9][0-9]*$/.test(trimmed)) {
      setMessage(t("Enter a valid state number."));
      return;
    }
    const { data, error } = await supabase
      .from("states")
      .update({ game_state_number: trimmed ? Number(trimmed) : null })
      .eq("id", activeMembership.stateId)
      .select("id");
    if (error || !data || data.length === 0) {
      setMessage(error?.message ?? t("Only the state owner can change this."));
      return;
    }
    setMessage(t("In-game state number saved."));
  }

  async function releaseClaim() {
    const wosId = releaseWosId.trim();
    if (!activeMembership || !/^[0-9]+$/.test(wosId)) {
      setMessage(t("Enter a numeric WOS ID."));
      return;
    }
    if (
      !window.confirm(
        t(
          "Release WOS ID {wosId}? It is removed from the login that claimed it, including all state memberships, so the real player can register it.",
          { wosId },
        ),
      )
    ) {
      return;
    }

    setReleasingClaim(true);
    setMessage(t(""));
    try {
      const response = await fetch("/api/accounts/release-claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stateId: activeMembership.stateId,
          actorAccountId: activeMembership.wosAccountId,
          wosId,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setMessage(result.error || t("The WOS ID could not be released."));
        return;
      }
      setReleaseWosId("");
      setMessage(t("WOS ID {wosId} was released.", { wosId }));
      await loadStateManagement();
    } catch {
      setMessage(t("The WOS ID could not be released."));
    } finally {
      setReleasingClaim(false);
    }
  }

  async function copyInviteLink() {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setMessage(t("Backup invitation link copied."));
  }

  async function reviewInvitation(inviteId: string, approveInvite: boolean) {
    setMessage(t(""));
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
        : "Membership request rejected.",
    );
    await loadStateManagement();
    await refreshMemberships();
  }

  async function changeRole(
    wosAccountId: string,
    role: Exclude<StateRole, "owner">,
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
    enabled: boolean,
  ) {
    if (!activeMembership) return;
    const { error } = await supabase.rpc("set_state_member_capability", {
      target_state_id: activeMembership.stateId,
      target_wos_account_id: wosAccountId,
      target_capability: capability,
      capability_enabled: enabled,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    await loadStateManagement();
    await refreshMemberships();
  }

  async function setRallyLead(wosAccountId: string, enabled: boolean) {
    if (!activeMembership) return;
    setMessage(t(""));
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
    setMessage(
      enabled ? "Rally Lead tag assigned." : "Rally Lead tag removed.",
    );
  }

  async function removeMember(wosAccountId: string) {
    if (!activeMembership) return;
    const member = members.find(
      (stateMember) => stateMember.wosAccountId === wosAccountId,
    );
    const memberName = member?.nickname || member?.wosId || "this member";
    const confirmed = window.confirm(
      `Remove ${memberName} from ${activeMembership.stateName}?\n\nThey will immediately lose state access, their role, capabilities, and tags. They will need a new invitation to join again.`,
    );

    if (!confirmed) return;

    setMessage(t(""));
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
          <h2>{t("Manage state")}</h2>
          <p>{t("Select or join a state first.")}</p>
        </section>
      </main>
    );
  }

  if (!["owner", "admin"].includes(activeMembership.role)) {
    return (
      <main>
        <AppHeader />
        <section>
          <h2>{t("Manage state")}</h2>
          <p>{t("Only state owners and admins can manage this page.")}</p>
        </section>
      </main>
    );
  }

  return (
    <main>
      <AppHeader />
      {message && <p className="page-message">{message}</p>}
      <nav className="state-section-nav" aria-label={t("State administration")}>
        <span className="nav-link active-nav-link">{t("Members & setup")}</span>
        <Link className="nav-link" href="/state/announcements">
          {t("Send notices")}
        </Link>
        <Link className="nav-link" href="/state/tags">
          {t("Manage tags")}
        </Link>
        <Link className="nav-link" href="/state/stats">
          {t("Stats & history")}
        </Link>
      </nav>
      <SvsStatus
        stateId={activeMembership.stateId}
        canRunCheck
        onChecked={() => void refreshMemberships()}
      />

      <section>
        <div className="section-title-row">
          <div>
            <p className="section-label">{t("Battle structure")}</p>
            <h2>{t("Alliance setup")}</h2>
          </div>
          <span className="retention-badge">
            {alliances.length}{" "}
            {alliances.length === 1 ? t("alliance") : t("alliances")}
          </span>
        </div>
        <p>
          {t(
            "Create the alliances available to battle planners. Member assignments are managed only from Battle Planning and become visible in Alliance Overview after publishing.",
          )}
        </p>

        <div className="alliance-management-create">
          <label>
            {t("Alliance name")}
            <input
              type="text"
              maxLength={40}
              value={allianceName}
              onChange={(event) => setAllianceName(event.target.value)}
              placeholder={t("TED")}
            />
          </label>
          <label>
            {t("Color")}
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
            {t("Capacity")}
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
            {savingAlliance ? t("Saving...") : t("Create alliance")}
          </button>
        </div>

        {alliances.length === 0 ? (
          <div className="empty-state compact-empty-state">
            <h3>{t("No alliances configured")}</h3>
            <p>{t("Create the first destination for your battle plans.")}</p>
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
                      {t("Alliance name")}
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
                      {t("Color")}
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
                      {t("Capacity")}
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
                        {t("Save")}
                      </button>
                      <button
                        type="button"
                        className="secondary-link"
                        onClick={() => setEditingAllianceId(null)}
                      >
                        {t("Cancel")}
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
                        {alliance.memberCount}
                        {t("/")}
                        {alliance.max_members} {t("published assignments")}
                      </small>
                    </div>
                    <div className="tag-row-actions">
                      <button
                        type="button"
                        className="secondary-link"
                        onClick={() => beginEditingAlliance(alliance)}
                      >
                        {t("Edit")}
                      </button>
                      <button
                        type="button"
                        className="danger-button"
                        disabled={savingAlliance}
                        onClick={() => void deleteAlliance(alliance)}
                      >
                        {t("Delete")}
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
        <h2>
          {t("Manage")} {activeMembership.stateName}
        </h2>
        <h3>{t("Invite a WOS account")}</h3>
        <p>
          {t(
            "Enter the player's registered WOS ID. They receive an in-app invitation and must accept it. You then verify the player before they receive state access.",
          )}
        </p>
        <div className="invite-form">
          <label>
            {t("WOS ID")}
            <input
              type="text"
              inputMode="numeric"
              value={inviteWosId}
              onChange={(event) => setInviteWosId(event.target.value)}
              placeholder={t("Player's WOS ID")}
            />
          </label>
          <button type="button" onClick={createInvitation}>
            {t("Send invitation")}
          </button>
        </div>
        {inviteLink && (
          <div className="invite-link-box">
            <label className="invite-link-field">
              {t("Optional backup link")}
              <input
                value={inviteLink}
                readOnly
                onFocus={(event) => event.target.select()}
              />
            </label>
            <button type="button" onClick={copyInviteLink}>
              {t("Copy link")}
            </button>
          </div>
        )}
      </section>

      <section>
        <h2>{t("In-game state")}</h2>
        <p>
          {t(
            "Used to look up your SvS opponent and battle time on WOSOracle. Only the owner can change it.",
          )}
        </p>
        <div className="invite-form">
          <label>
            {t("State number")}
            <input
              type="text"
              inputMode="numeric"
              value={gameStateNumber}
              disabled={activeMembership.role !== "owner"}
              onChange={(event) => setGameStateNumber(event.target.value)}
            />
          </label>
          {activeMembership.role === "owner" && (
            <button type="button" onClick={() => void saveGameStateNumber()}>
              {t("Save")}
            </button>
          )}
        </div>
      </section>

      <section>
        <h2>{t("Release a claimed WOS ID")}</h2>
        <p>
          {t(
            "If someone registered a WOS ID that is not theirs, release it so the real player can add it. Works for members of this state and for players WOSOracle lists in your in-game state.",
          )}
        </p>
        <div className="invite-form">
          <label>
            {t("WOS ID")}
            <input
              type="text"
              inputMode="numeric"
              value={releaseWosId}
              onChange={(event) => setReleaseWosId(event.target.value)}
              placeholder={t("Claimed WOS ID")}
            />
          </label>
          <button
            type="button"
            onClick={() => void releaseClaim()}
            disabled={releasingClaim}
          >
            {releasingClaim ? t("Releasing...") : t("Release WOS ID")}
          </button>
        </div>
      </section>

      <section>
        <h2>{t("Waiting for your verification")}</h2>
        <p>
          {t(
            "These players accepted an invitation. Confirm their identity outside the app before approving them.",
          )}
        </p>
        {pendingApprovals.length === 0 ? (
          <p>{t("No players are waiting for approval.")}</p>
        ) : (
          <ul>
            {pendingApprovals.map((approval) => (
              <li key={approval.inviteId}>
                <span>
                  <strong>
                    {approval.nickname || t("Unnamed WOS account")}
                  </strong>
                  {" — WOS ID " + approval.wosId}
                  <small>
                    {t(" — expires {date}", {
                      date: formatDateTime(approval.expiresAt),
                    })}
                  </small>
                </span>
                <div className="member-actions">
                  <button
                    type="button"
                    onClick={() =>
                      void reviewInvitation(approval.inviteId, true)
                    }
                  >
                    {t("Verify and approve")}
                  </button>
                  <button
                    type="button"
                    className="danger-button"
                    onClick={() =>
                      void reviewInvitation(approval.inviteId, false)
                    }
                  >
                    {t("Reject")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>{t("State members")}</h2>
        {members.length === 0 ? (
          <p>{t("No members found.")}</p>
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
                  <div className="member-actions">
                    <span className="role-badge">{t("Owner")}</span>
                    <label className="capability-toggle">
                      <input
                        type="checkbox"
                        checked={member.isRallyLead}
                        onChange={(event) =>
                          void setRallyLead(
                            member.wosAccountId,
                            event.target.checked,
                          )
                        }
                      />
                      <span>{t("Rally Lead")}</span>
                    </label>
                  </div>
                ) : (
                  <div className="member-actions">
                    {activeMembership.role === "owner" ? (
                      <label>
                        {t("Permission role")}
                        <select
                          value={member.role}
                          onChange={(event) =>
                            void changeRole(
                              member.wosAccountId,
                              event.target.value as Exclude<StateRole, "owner">,
                            )
                          }
                        >
                          <option value="member">{t("Member")}</option>
                          <option value="admin">{t("Admin")}</option>
                        </select>
                      </label>
                    ) : (
                      <span className="role-badge">{member.role}</span>
                    )}
                    <label className="capability-toggle">
                      <input
                        type="checkbox"
                        checked={member.capabilities.includes("rally_caller")}
                        onChange={(event) =>
                          void setCapability(
                            member.wosAccountId,
                            "rally_caller",
                            event.target.checked,
                          )
                        }
                      />
                      <span>{t("Coordinator")}</span>
                    </label>
                    <label className="capability-toggle">
                      <input
                        type="checkbox"
                        checked={member.capabilities.includes("garrison")}
                        onChange={(event) =>
                          void setCapability(
                            member.wosAccountId,
                            "garrison",
                            event.target.checked,
                          )
                        }
                      />
                      <span>{t("Garrison")}</span>
                    </label>
                    <label className="capability-toggle">
                      <input
                        type="checkbox"
                        checked={member.isRallyLead}
                        onChange={(event) =>
                          void setRallyLead(
                            member.wosAccountId,
                            event.target.checked,
                          )
                        }
                      />
                      <span>{t("Rally Lead")}</span>
                    </label>
                    {(activeMembership.role === "owner" ||
                      member.role === "member") && (
                      <button
                        type="button"
                        className="danger-button"
                        onClick={() => void removeMember(member.wosAccountId)}
                      >
                        {t("Remove")}
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
