"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { useStates } from "@/components/StateProvider";
import { createClient } from "@/lib/supabase/client";
import type { StateCapability, StateRole } from "@/types/state";
import { AutomationSettingsCard } from "@/components/AutomationSettingsCard";
import { useLanguage } from "@/components/LanguageProvider";
import { SvsStatus } from "@/components/SvsStatus";
import { OracleAlliancePicker } from "@/components/OracleAlliancePicker";
import { LATEST_HERO_GENERATION } from "@/lib/heroes";
import { JoinLinkCard } from "@/components/JoinLinkCard";

type StateMember = {
  wosAccountId: string;
  wosId: string;
  nickname: string | null;
  role: StateRole;
  capabilities: StateCapability[];
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
  const { t } = useLanguage();
  const supabase = useMemo(() => createClient(), []);
  const { activeMembership, memberships, refreshMemberships } = useStates();
  const [members, setMembers] = useState<StateMember[]>([]);
  // The one-time PIN just given to a member, shown until dismissed.
  const [resetPin, setResetPin] = useState<{ name: string; pin: string } | null>(
    null,
  );
  const [gameStateNumber, setGameStateNumber] = useState("");
  const [heroGeneration, setHeroGeneration] = useState<number | null>(null);
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
      setAlliances([]);
      return;
    }

    const [
      { data: memberRows, error: memberError },
      { data: capabilityRows },
      { data: allianceRows, error: allianceError },
      { data: allianceAssignmentRows, error: allianceAssignmentError },
    ] = await Promise.all([
      supabase
        .from("state_members")
        .select("wos_account_id, role")
        .eq("state_id", activeMembership.stateId),
      supabase
        .from("state_member_capabilities")
        .select("wos_account_id, capability")
        .eq("state_id", activeMembership.stateId),
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
      .select("game_state_number, hero_generation_max")
      .eq("id", activeMembership.stateId)
      .maybeSingle();
    setGameStateNumber(
      stateRow?.game_state_number ? String(stateRow.game_state_number) : "",
    );
    setHeroGeneration(stateRow?.hero_generation_max ?? null);

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
    const { data: accounts } = memberAccountIds.length
      ? await supabase
          .from("wos_accounts")
          .select("id, user_id, wos_id, nickname")
          .in("id", memberAccountIds)
      : { data: [] };
    const accountById = new Map(
      (accounts ?? []).map((account) => [account.id, account]),
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
            role: row.role as StateRole,
            capabilities: (capabilityRows ?? [])
              .filter((capability) => capability.wos_account_id === account.id)
              .map((capability) => capability.capability as StateCapability),
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

  async function addOracleAlliance(name: string) {
    if (!activeMembership) return;
    setSavingAlliance(true);
    setMessage("");
    const { error } = await supabase.rpc("create_state_alliance", {
      target_state_id: activeMembership.stateId,
      alliance_name: name,
      alliance_color: allianceColor,
      alliance_max_members: 100,
    });
    setSavingAlliance(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    await loadStateManagement();
    setMessage(t("Alliance added. It can now be selected in Battle Planning."));
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
    setMessage("");
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
      setMessage(t("Alliance deleted. No state members were removed."));
    }
    setSavingAlliance(false);
  }

  async function saveHeroGeneration(value: number | null) {
    if (!activeMembership) return;
    setHeroGeneration(value);
    const { error } = await supabase.rpc("set_state_hero_generation", {
      target_state_id: activeMembership.stateId,
      max_generation: value,
    });
    setMessage(error ? error.message : t("Hero generation saved."));
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

  async function resetMemberPin(member: StateMember) {
    if (!activeMembership) return;
    const name = member.nickname || member.wosId;
    if (
      !window.confirm(
        t(
          "Give {player} a one-time PIN? Their current PIN stops working and they are signed out.",
          { player: name },
        ),
      )
    ) {
      return;
    }
    setMessage("");
    try {
      const response = await fetch("/api/auth/reset-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stateId: activeMembership.stateId,
          wosAccountId: member.wosAccountId,
        }),
      });
      const result = (await response.json()) as { pin?: string; error?: string };
      if (!response.ok || !result.pin) {
        setMessage(t(result.error ?? "The PIN could not be reset."));
        return;
      }
      setResetPin({ name, pin: result.pin });
    } catch {
      setMessage(t("The PIN could not be reset."));
    }
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
    // Only my own memberships change when the action hits my account.
    if (memberships.some((item) => item.wosAccountId === wosAccountId)) {
      await refreshMemberships();
    }
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
    // Only my own memberships change when the action hits my account.
    if (memberships.some((item) => item.wosAccountId === wosAccountId)) {
      await refreshMemberships();
    }
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
    // Only my own memberships change when the action hits my account.
    if (memberships.some((item) => item.wosAccountId === wosAccountId)) {
      await refreshMemberships();
    }
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
      <section className="page-heading">
        <p className="section-label">{activeMembership.stateName}</p>
        <h1>{t("State management")}</h1>
        <p>
          {t(
            "Members, alliances and how the automation prepares each SvS. Planning and battles run by themselves.",
          )}
        </p>
      </section>
      {message && <p className="page-message">{message}</p>}
      <SvsStatus
        stateId={activeMembership.stateId}
        canRunCheck
        onChecked={() => void refreshMemberships()}
      />
      <JoinLinkCard
        stateId={activeMembership.stateId}
        stateName={activeMembership.stateName}
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

        <OracleAlliancePicker
          stateId={activeMembership.stateId}
          existingNames={alliances.map((alliance) => alliance.name)}
          onAdd={addOracleAlliance}
        />
        <h3>{t("Add manually")}</h3>
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
                        {"/"}
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
        <h2>{t("In-game state")}</h2>
        <p>
          {t(
            "Filled in from the owner's WOS account; used to look up your SvS opponent and battle time on WOSOracle. Only the owner can change it.",
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
        <div className="invite-form">
          <label>
            {t("Hero generation")}
            <select
              value={heroGeneration ?? ""}
              onChange={(event) =>
                void saveHeroGeneration(
                  event.target.value ? Number(event.target.value) : null,
                )
              }
            >
              <option value="">{t("Not set (show all heroes)")}</option>
              {Array.from(
                { length: LATEST_HERO_GENERATION },
                (_, index) => index + 1,
              ).map((generation) => (
                <option key={generation} value={generation}>
                  {t("Gen {number}", { number: generation })}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p>
          {t(
            "The newest hero generation your state has unlocked. Heroes from later generations are hidden in Tags.",
          )}
        </p>
      </section>

      <AutomationSettingsCard
        stateId={activeMembership.stateId}
        heroGeneration={heroGeneration}
      />

      <section>
        <h2>{t("State members")}</h2>
        {resetPin && (
          <div className="pin-reveal" role="status">
            <p>
              {t(
                "One-time PIN for {player}. Send it to them privately; they choose their own PIN when they sign in.",
                { player: resetPin.name },
              )}
            </p>
            <strong className="pin-code">{resetPin.pin}</strong>
            <button
              type="button"
              className="text-button"
              onClick={() => setResetPin(null)}
            >
              {t("Done")}
            </button>
          </div>
        )}
        {members.length === 0 ? (
          <p>{t("No members found.")}</p>
        ) : (
          <ul>
            {members.map((member) => (
              <li key={member.wosAccountId} className="member-row">
                <span className="member-identity">
                  <strong>{member.nickname || member.wosId}</strong>
                  <small>
                    {"WOS ID " + member.wosId}
                  </small>
                </span>
                {member.role === "owner" ? (
                  <div className="member-actions">
                    <span className="role-badge">{t("Owner")}</span>
                  </div>
                ) : (
                  <div className="member-actions">
                    {activeMembership.role === "owner" ? (
                      <label>
                        <span className="visually-hidden">
                          {t("Permission role")}
                        </span>
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
                    {(activeMembership.role === "owner" ||
                      member.role === "member") &&
                      member.wosAccountId !== activeMembership.wosAccountId && (
                      <button
                        type="button"
                        className="secondary-link"
                        onClick={() => void resetMemberPin(member)}
                      >
                        {t("Reset PIN")}
                      </button>
                    )}
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
