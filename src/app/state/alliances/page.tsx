"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { useStates } from "@/components/StateProvider";
import { createClient } from "@/lib/supabase/client";

type Alliance = {
  id: string;
  name: string;
  color: string;
  max_members: number;
  created_at: string;
};

type AllianceAssignment = {
  alliance_id: string;
  wos_account_id: string;
};

type MemberRow = {
  wos_account_id: string;
  role: string;
};

type AccountRow = {
  id: string;
  user_id: string;
  wos_id: string;
  nickname: string | null;
};

type ProfileRow = {
  id: string;
  username: string | null;
};

type StateTag = {
  id: string;
  name: string;
  color: string;
  bulk_move_limit: number;
};

type TagAssignment = {
  tag_id: string;
  wos_account_id: string;
};

type StateMember = MemberRow & AccountRow & {
  username: string | null;
  tags: StateTag[];
  allianceId: string | null;
};

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export default function AlliancesPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { activeMembership, signedIn, loadingStates } = useStates();
  const [alliances, setAlliances] = useState<Alliance[]>([]);
  const [members, setMembers] = useState<StateMember[]>([]);
  const [tags, setTags] = useState<StateTag[]>([]);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#4f8fba");
  const [maxMembers, setMaxMembers] = useState(100);
  const [editingAllianceId, setEditingAllianceId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingColor, setEditingColor] = useState("#4f8fba");
  const [editingMaxMembers, setEditingMaxMembers] = useState(100);
  const [bulkTagId, setBulkTagId] = useState("");
  const [bulkAllianceId, setBulkAllianceId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const isAdmin =
    activeMembership?.role === "owner" ||
    activeMembership?.role === "admin";

  const loadAlliances = useCallback(async () => {
    if (!activeMembership) {
      setAlliances([]);
      setMembers([]);
      setTags([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const [allianceResult, assignmentResult, memberResult, tagResult] =
      await Promise.all([
        supabase
          .from("state_alliances")
          .select("id, name, color, max_members, created_at")
          .eq("state_id", activeMembership.stateId)
          .order("name"),
        supabase
          .from("state_alliance_members")
          .select("alliance_id, wos_account_id")
          .eq("state_id", activeMembership.stateId),
        supabase
          .from("state_members")
          .select("wos_account_id, role")
          .eq("state_id", activeMembership.stateId),
        supabase
          .from("state_tags")
          .select("id, name, color, bulk_move_limit")
          .eq("state_id", activeMembership.stateId)
          .order("name"),
      ]);

    const firstError =
      allianceResult.error ||
      assignmentResult.error ||
      memberResult.error ||
      tagResult.error;
    if (firstError) {
      setMessage(firstError.message);
      setLoading(false);
      return;
    }

    const stateAlliances = (allianceResult.data ?? []) as Alliance[];
    const assignments = (assignmentResult.data ?? []) as AllianceAssignment[];
    const memberRows = (memberResult.data ?? []) as MemberRow[];
    const stateTags = (tagResult.data ?? []) as StateTag[];
    const accountIds = memberRows.map((member) => member.wos_account_id);

    if (accountIds.length === 0) {
      setAlliances(stateAlliances);
      setMembers([]);
      setTags(stateTags);
      setLoading(false);
      return;
    }

    const [accountResult, tagAssignmentResult] = await Promise.all([
      supabase
        .from("wos_accounts")
        .select("id, user_id, wos_id, nickname")
        .in("id", accountIds),
      supabase
        .from("state_member_tags")
        .select("tag_id, wos_account_id")
        .in("wos_account_id", accountIds),
    ]);

    if (accountResult.error || tagAssignmentResult.error) {
      setMessage(
        accountResult.error?.message || tagAssignmentResult.error?.message || "Unable to load members."
      );
      setLoading(false);
      return;
    }

    const accounts = (accountResult.data ?? []) as AccountRow[];
    const userIds = [...new Set(accounts.map((account) => account.user_id))];
    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("id, username")
      .in("id", userIds);

    if (profileError) {
      setMessage(profileError.message);
      setLoading(false);
      return;
    }

    const profiles = (profileData ?? []) as ProfileRow[];
    const tagAssignments = (tagAssignmentResult.data ?? []) as TagAssignment[];
    const memberByAccountId = new Map(
      memberRows.map((member) => [member.wos_account_id, member])
    );
    const profileByUserId = new Map(
      profiles.map((profile) => [profile.id, profile])
    );
    const allianceByAccountId = new Map(
      assignments.map((assignment) => [
        assignment.wos_account_id,
        assignment.alliance_id,
      ])
    );
    const tagById = new Map(stateTags.map((tag) => [tag.id, tag]));

    const stateMembers = accounts
      .flatMap<StateMember>((account) => {
        const membership = memberByAccountId.get(account.id);
        if (!membership) return [];

        return [
          {
            ...membership,
            ...account,
            username: profileByUserId.get(account.user_id)?.username ?? null,
            allianceId: allianceByAccountId.get(account.id) ?? null,
            tags: tagAssignments
              .filter((assignment) => assignment.wos_account_id === account.id)
              .flatMap((assignment) => {
                const tag = tagById.get(assignment.tag_id);
                return tag ? [tag] : [];
              }),
          },
        ];
      })
      .sort((first, second) =>
        (first.nickname || first.wos_id).localeCompare(
          second.nickname || second.wos_id
        )
      );

    setAlliances(stateAlliances);
    setMembers(stateMembers);
    setTags(stateTags);
    setLoading(false);
  }, [activeMembership, supabase]);

  useEffect(() => {
    if (!loadingStates && signedIn === false) {
      router.replace("/login");
      return;
    }

    const loadId = window.setTimeout(() => {
      void loadAlliances();
    }, 0);
    return () => window.clearTimeout(loadId);
  }, [loadAlliances, loadingStates, router, signedIn]);

  function validateAlliance(
    allianceName: string,
    allianceColor: string,
    allianceMaxMembers: number
  ) {
    if (!allianceName.trim()) {
      setMessage("Enter an alliance name.");
      return false;
    }
    if (!HEX_COLOR.test(allianceColor)) {
      setMessage("Use a six-digit color code such as #4f8fba.");
      return false;
    }
    if (
      !Number.isInteger(allianceMaxMembers) ||
      allianceMaxMembers < 1 ||
      allianceMaxMembers > 100
    ) {
      setMessage("Alliance capacity must be between 1 and 100.");
      return false;
    }
    return true;
  }

  async function createAlliance() {
    if (
      !activeMembership ||
      !isAdmin ||
      !validateAlliance(name, color, maxMembers)
    ) {
      return;
    }

    setSaving(true);
    setMessage("");
    const { error } = await supabase.rpc("create_state_alliance", {
      target_state_id: activeMembership.stateId,
      alliance_name: name,
      alliance_color: color,
      alliance_max_members: maxMembers,
    });

    if (error) {
      setMessage(error.message);
    } else {
      setName("");
      setColor("#4f8fba");
      setMaxMembers(100);
      await loadAlliances();
      setMessage("Alliance created.");
    }
    setSaving(false);
  }

  function beginEditing(alliance: Alliance) {
    setEditingAllianceId(alliance.id);
    setEditingName(alliance.name);
    setEditingColor(alliance.color);
    setEditingMaxMembers(alliance.max_members);
    setMessage("");
  }

  async function saveAlliance() {
    if (
      !editingAllianceId ||
      !validateAlliance(
        editingName,
        editingColor,
        editingMaxMembers
      )
    ) {
      return;
    }

    setSaving(true);
    setMessage("");
    const { error } = await supabase.rpc("update_state_alliance", {
      target_alliance_id: editingAllianceId,
      alliance_name: editingName,
      alliance_color: editingColor,
      alliance_max_members: editingMaxMembers,
    });

    if (error) {
      setMessage(error.message);
    } else {
      setEditingAllianceId(null);
      await loadAlliances();
      setMessage("Alliance updated.");
    }
    setSaving(false);
  }

  async function deleteAlliance(alliance: Alliance) {
    const memberCount = members.filter(
      (member) => member.allianceId === alliance.id
    ).length;
    if (
      !window.confirm(
        `Delete “${alliance.name}”? ${memberCount} ${memberCount === 1 ? "member" : "members"} will become unassigned. No state members will be deleted.`
      )
    ) {
      return;
    }

    setSaving(true);
    setMessage("");
    const { error } = await supabase.rpc("delete_state_alliance", {
      target_alliance_id: alliance.id,
    });

    if (error) {
      setMessage(error.message);
    } else {
      if (editingAllianceId === alliance.id) setEditingAllianceId(null);
      await loadAlliances();
      setMessage("Alliance deleted. Its members are now unassigned.");
    }
    setSaving(false);
  }

  async function moveMember(wosAccountId: string, allianceId: string) {
    if (!activeMembership || !isAdmin) return;

    setSaving(true);
    setMessage("");
    const { error } = await supabase.rpc("set_state_alliance_member", {
      target_state_id: activeMembership.stateId,
      target_wos_account_id: wosAccountId,
      target_alliance_id: allianceId || null,
    });

    if (error) {
      setMessage(error.message);
    } else {
      await loadAlliances();
      setMessage(allianceId ? "Member moved." : "Member marked as unassigned.");
    }
    setSaving(false);
  }

  async function assignByTag() {
    if (!bulkAllianceId || !bulkTagId) {
      setMessage("Choose both a tag and a destination alliance.");
      return;
    }

    setSaving(true);
    setMessage("");
    const { data, error } = await supabase.rpc(
      "assign_tagged_members_to_alliance",
      {
        target_alliance_id: bulkAllianceId,
        target_tag_id: bulkTagId,
      }
    );

    if (error) {
      setMessage(error.message);
    } else {
      await loadAlliances();
      const count = Number(data ?? 0);
      setMessage(
        count === 0
          ? "No accounts were moved. The tag limit or alliance capacity may already be reached."
          : `${count} tagged ${count === 1 ? "account was" : "accounts were"} assigned or moved.`
      );
    }
    setSaving(false);
  }

  function renderMember(member: StateMember) {
    return (
      <li key={member.wos_account_id} className="alliance-member-row">
        <div className="alliance-member-identity">
          <strong>{member.nickname || `WOS ID ${member.wos_id}`}</strong>
          <small>
            {member.username ? `@${member.username} · ` : ""}
            WOS ID {member.wos_id} · {member.role}
          </small>
          {member.tags.length > 0 && (
            <span className="member-tag-list">
              {member.tags.map((tag) => (
                <span key={tag.id} className="member-tag-pill">
                  <span style={{ backgroundColor: tag.color }} />
                  {tag.name}
                </span>
              ))}
            </span>
          )}
        </div>
        {isAdmin && (
          <label className="alliance-move-field">
            Alliance
            <select
              value={member.allianceId ?? ""}
              disabled={saving}
              onChange={(event) =>
                void moveMember(member.wos_account_id, event.target.value)
              }
            >
              <option value="">Unassigned</option>
              {alliances.map((alliance) => (
                <option
                  key={alliance.id}
                  value={alliance.id}
                  disabled={
                    member.allianceId !== alliance.id &&
                    members.filter(
                      (candidate) => candidate.allianceId === alliance.id
                    ).length >= alliance.max_members
                  }
                >
                  {alliance.name} ({members.filter(
                    (candidate) => candidate.allianceId === alliance.id
                  ).length}/{alliance.max_members})
                </option>
              ))}
            </select>
          </label>
        )}
      </li>
    );
  }

  if (loadingStates || signedIn === null) {
    return (
      <main>
        <AppHeader />
        <section className="loading-panel"><p>Loading alliances...</p></section>
      </main>
    );
  }

  return (
    <main>
      <AppHeader />

      {!activeMembership ? (
        <section className="empty-state">
          <h2>Join a state to view alliances</h2>
          <p>Alliance assignments become visible after membership approval.</p>
        </section>
      ) : (
        <>
          <section className="alliances-heading">
            <div>
              <p className="section-label">{activeMembership.stateName}</p>
              <h1>Alliances</h1>
              <p>
                Battle-day groups controlled by state Owners and Admins.
                Members can view assignments but cannot move themselves.
              </p>
            </div>
          </section>

          {isAdmin && (
            <section>
              <p className="section-label">Owner and admin tools</p>
              <h2>Create alliance</h2>
              <div className="tag-create-form">
                <label>
                  Alliance name
                  <input
                    type="text"
                    maxLength={40}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="TED"
                  />
                </label>
                <label>
                  Color
                  <span className="color-input-row">
                    <input
                      type="color"
                      value={HEX_COLOR.test(color) ? color : "#4f8fba"}
                      onChange={(event) => setColor(event.target.value)}
                    />
                    <input
                      className="hex-color-input"
                      type="text"
                      maxLength={7}
                      value={color}
                      onChange={(event) => setColor(event.target.value)}
                    />
                  </span>
                </label>
                <label>
                  Member capacity
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={maxMembers}
                    onChange={(event) =>
                      setMaxMembers(Number(event.target.value))
                    }
                  />
                </label>
                <button type="button" disabled={saving} onClick={() => void createAlliance()}>
                  {saving ? "Saving..." : "Create alliance"}
                </button>
              </div>
            </section>
          )}

          {isAdmin && alliances.length > 0 && tags.length > 0 && (
            <section>
              <p className="section-label">Tag automation</p>
              <h2>Assign a tagged group</h2>
              <p>
                Every account with the selected tag will be assigned or moved
                into the destination alliance.
              </p>
              <div className="bulk-alliance-form">
                <label>
                  Member tag
                  <select value={bulkTagId} onChange={(event) => setBulkTagId(event.target.value)}>
                    <option value="">Choose tag</option>
                    {tags.map((tag) => (
                      <option key={tag.id} value={tag.id}>
                        {tag.name} (max {tag.bulk_move_limit})
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Destination alliance
                  <select value={bulkAllianceId} onChange={(event) => setBulkAllianceId(event.target.value)}>
                    <option value="">Choose alliance</option>
                    {alliances.map((alliance) => (
                      <option key={alliance.id} value={alliance.id}>
                        {alliance.name} ({members.filter(
                          (member) => member.allianceId === alliance.id
                        ).length}/{alliance.max_members})
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" disabled={saving} onClick={() => void assignByTag()}>
                  Assign tagged members
                </button>
              </div>
            </section>
          )}

          <section>
            <div className="section-title-row">
              <div>
                <p className="section-label">State roster</p>
                <h2>Alliance assignments</h2>
              </div>
              <span className="retention-badge">
                {members.length} {members.length === 1 ? "account" : "accounts"}
              </span>
            </div>
            {message && <p className="page-message">{message}</p>}

            {loading ? (
              <p>Loading alliances...</p>
            ) : alliances.length === 0 ? (
              <div className="empty-state compact-empty-state">
                <h3>No alliances yet</h3>
                <p>An Owner or Admin can create the first alliance above.</p>
              </div>
            ) : (
              <div className="alliance-grid">
                {alliances.map((alliance) => {
                  const allianceMembers = members.filter(
                    (member) => member.allianceId === alliance.id
                  );
                  return (
                    <article
                      key={alliance.id}
                      className="alliance-card"
                      style={{ borderTopColor: alliance.color }}
                    >
                      {editingAllianceId === alliance.id ? (
                        <div className="tag-create-form">
                          <label>
                            Alliance name
                            <input
                              type="text"
                              maxLength={40}
                              value={editingName}
                              onChange={(event) => setEditingName(event.target.value)}
                            />
                          </label>
                          <label>
                            Color
                            <span className="color-input-row">
                              <input
                                type="color"
                                value={HEX_COLOR.test(editingColor) ? editingColor : "#4f8fba"}
                                onChange={(event) => setEditingColor(event.target.value)}
                              />
                              <input
                                className="hex-color-input"
                                type="text"
                                maxLength={7}
                                value={editingColor}
                                onChange={(event) => setEditingColor(event.target.value)}
                              />
                            </span>
                          </label>
                          <label>
                            Member capacity
                            <input
                              type="number"
                              min="1"
                              max="100"
                              value={editingMaxMembers}
                              onChange={(event) =>
                                setEditingMaxMembers(
                                  Number(event.target.value)
                                )
                              }
                            />
                          </label>
                          <button type="button" disabled={saving} onClick={() => void saveAlliance()}>
                            Save
                          </button>
                          <button type="button" className="secondary-link" onClick={() => setEditingAllianceId(null)}>
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="alliance-card-heading">
                          <div>
                            <span className="tag-swatch alliance-swatch" style={{ backgroundColor: alliance.color }} />
                            <div>
                              <h3>{alliance.name}</h3>
                              <small>
                                {allianceMembers.length}/{alliance.max_members}{" "}
                                accounts
                              </small>
                            </div>
                          </div>
                          {isAdmin && (
                            <div className="tag-row-actions">
                              <button type="button" className="secondary-link" onClick={() => beginEditing(alliance)}>
                                Edit
                              </button>
                              <button type="button" className="danger-button" disabled={saving} onClick={() => void deleteAlliance(alliance)}>
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {allianceMembers.length === 0 ? (
                        <p className="alliance-empty">No members assigned.</p>
                      ) : (
                        <ul>{allianceMembers.map(renderMember)}</ul>
                      )}
                    </article>
                  );
                })}

                <article className="alliance-card unassigned-alliance-card">
                  <div className="alliance-card-heading">
                    <div>
                      <span className="tag-swatch alliance-swatch unassigned-swatch" />
                      <div>
                        <h3>Unassigned</h3>
                        <small>
                          {members.filter((member) => !member.allianceId).length} accounts
                        </small>
                      </div>
                    </div>
                  </div>
                  {members.every((member) => member.allianceId) ? (
                    <p className="alliance-empty">Everyone has an alliance.</p>
                  ) : (
                    <ul>
                      {members
                        .filter((member) => !member.allianceId)
                        .map(renderMember)}
                    </ul>
                  )}
                </article>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
