"use client";

import { useMemo, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { useBattle } from "@/components/BattleProvider";
import {
  getEnemyPetTimeRemaining,
  isEnemyPetActive,
} from "@/lib/battleDisplay";
import { useLanguage } from "@/components/LanguageProvider";
import {
  OpponentRosterPicker,
  type PickedEnemy,
} from "@/components/OpponentRosterPicker";
import { useStates } from "@/components/StateProvider";
import { createClient } from "@/lib/supabase/client";

export default function ManageLeadersPage() {
  const { t, formatNumber } = useLanguage();
  const {
    enemyLeaders,
    currentTime,
    addEnemyLeader,
    toggleEnemyLeaderPet,
    updateEnemyLeader,
    removeEnemyLeader,
  } = useBattle();
  const { activeMembership } = useStates();
  const [enemyName, setEnemyName] = useState("");
  const [picked, setPicked] = useState<PickedEnemy | null>(null);
  const [x, setX] = useState(600);
  const [y, setY] = useState(606);
  const [enemyPetActive, setEnemyPetActive] = useState(false);
  const [remembered, setRemembered] = useState(false);
  const supabase = useMemo(() => createClient(), []);
  const [editingLeaderId, setEditingLeaderId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editX, setEditX] = useState(0);
  const [editY, setEditY] = useState(0);
  const [editPetActive, setEditPetActive] = useState(false);

  // Enemy cities rarely move: reuse the coordinates from the last battle
  // this player was a rally leader in.
  async function pickLeader(selection: PickedEnemy) {
    setPicked(selection);
    setEnemyName(selection.member.name);
    setRemembered(false);
    if (!activeMembership || !selection.member.wosId) return;
    const { data } = await supabase
      .from("enemy_leaders")
      .select("x, y")
      .eq("state_id", activeMembership.stateId)
      .eq("wos_id", selection.member.wosId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) {
      setX(data.x);
      setY(data.y);
      setRemembered(true);
    }
  }

  async function handleAddLeader() {
    const error = await addEnemyLeader(
      enemyName,
      x,
      y,
      enemyPetActive,
      picked
        ? {
            wosId: picked.member.wosId,
            power: picked.member.power,
            allianceAbbr: picked.alliance.abbr || null,
          }
        : undefined,
    );
    if (error) {
      window.alert(error);
      return;
    }
    setEnemyName("");
    setPicked(null);
    setEnemyPetActive(false);
    setRemembered(false);
  }

  function startEditing(
    id: number,
    name: string,
    leaderX: number,
    leaderY: number,
  ) {
    setEditingLeaderId(id);
    setEditName(name);
    setEditX(leaderX);
    setEditY(leaderY);
    const leader = enemyLeaders.find((savedLeader) => savedLeader.id === id);
    setEditPetActive(leader ? isEnemyPetActive(leader, currentTime) : false);
  }

  function cancelEditing() {
    setEditingLeaderId(null);
  }

  async function saveLeader() {
    if (editingLeaderId === null) return;

    const error = await updateEnemyLeader(
      editingLeaderId,
      editName,
      editX,
      editY,
      editPetActive,
    );
    if (error) {
      window.alert(error);
      return;
    }
    setEditingLeaderId(null);
  }

  return (
    <main>
      <AppHeader />
      <section>
        <h2>{t("Manage enemy rally leaders")}</h2>
        <p>
          {t(
            "Pick the opponent's players below. Their coordinates are remembered: next battle they are prefilled, and leaders you added before are listed automatically when the battle starts.",
          )}
        </p>
        {activeMembership && (
          <OpponentRosterPicker
            stateId={activeMembership.stateId}
            onPick={(selection) => void pickLeader(selection)}
          />
        )}
        <label>
          {t("Player name")}
          <input
            type="text"
            value={enemyName}
            onChange={(event) => {
              setEnemyName(event.target.value);
              setPicked(null);
            }}
          />
        </label>
        {picked && (
          <p>
            {t(
              "Picked from WOSOracle: [{abbr}] {name}. Enter their coordinates below.",
              {
                abbr: picked.alliance.abbr,
                name: picked.member.name,
              },
            )}
          </p>
        )}
        <label>
          {t("X coordinate")}
          <input
            type="number"
            min="0"
            max="1199"
            value={x}
            onChange={(event) => setX(Number(event.target.value))}
          />
        </label>
        <label>
          {t("Y coordinate")}
          <input
            type="number"
            min="0"
            max="1199"
            value={y}
            onChange={(event) => setY(Number(event.target.value))}
          />
        </label>
        {remembered && (
          <p className="form-hint">
            {t("Coordinates from the last battle against this player.")}
          </p>
        )}
        <label>
          <input
            type="checkbox"
            checked={enemyPetActive}
            onChange={(event) => setEnemyPetActive(event.target.checked)}
          />
          {t("Pet active now")}
        </label>
        <button type="button" onClick={handleAddLeader}>
          {t("Add leader")}
        </button>

        <h3>{t("Saved leaders")}</h3>
        {enemyLeaders.length === 0 ? (
          <p>{t("No enemy leaders added.")}</p>
        ) : (
          <ul>
            {enemyLeaders.map((leader) => (
              <li key={leader.id}>
                {editingLeaderId === leader.id ? (
                  <div className="edit-leader-form">
                    <label>
                      {t("Player name")}
                      <input
                        type="text"
                        value={editName}
                        onChange={(event) => setEditName(event.target.value)}
                      />
                    </label>
                    <label>
                      {t("X coordinate")}
                      <input
                        type="number"
                        min="0"
                        max="1199"
                        value={editX}
                        onChange={(event) =>
                          setEditX(Number(event.target.value))
                        }
                      />
                    </label>
                    <label>
                      {t("Y coordinate")}
                      <input
                        type="number"
                        min="0"
                        max="1199"
                        value={editY}
                        onChange={(event) =>
                          setEditY(Number(event.target.value))
                        }
                      />
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={editPetActive}
                        onChange={(event) =>
                          setEditPetActive(event.target.checked)
                        }
                      />
                      {t("Pet active")}
                    </label>
                    <button
                      className="save-button"
                      type="button"
                      onClick={saveLeader}
                    >
                      {t("Save")}
                    </button>
                    <button
                      className="cancel-edit-button"
                      type="button"
                      onClick={cancelEditing}
                    >
                      {t("Cancel")}
                    </button>
                  </div>
                ) : (
                  <>
                    <span>
                      {leader.allianceAbbr && `[${leader.allianceAbbr}] `}
                      {leader.name} {"—"} {leader.x}
                      {":"}
                      {leader.y}
                      {leader.power !== null &&
                        ` — ${formatNumber(leader.power)}`}
                    </span>
                    <label>
                      <input
                        type="checkbox"
                        checked={isEnemyPetActive(leader, currentTime)}
                        onChange={async () => {
                          const error = await toggleEnemyLeaderPet(leader.id);
                          if (error) window.alert(error);
                        }}
                      />
                      {t("Pet active")}
                    </label>
                    <span>
                      {t("Pet remaining:")}{" "}
                      {t(getEnemyPetTimeRemaining(leader, currentTime))}
                    </span>
                    <button
                      className="edit-button"
                      type="button"
                      onClick={() =>
                        startEditing(leader.id, leader.name, leader.x, leader.y)
                      }
                    >
                      {t("Edit")}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const error = await removeEnemyLeader(leader.id);
                        if (error) window.alert(error);
                      }}
                    >
                      {t("Remove leader")}
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
