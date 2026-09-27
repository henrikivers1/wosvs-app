"use client";

import { useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { useBattle } from "@/components/BattleProvider";
import {
  getEnemyPetTimeRemaining,
  isEnemyPetActive,
} from "@/lib/battleDisplay";

export default function ManageLeadersPage() {
  const {
    enemyLeaders,
    currentTime,
    addEnemyLeader,
    toggleEnemyLeaderPet,
    updateEnemyLeader,
    removeEnemyLeader,
  } = useBattle();
  const [enemyName, setEnemyName] = useState("");
  const [x, setX] = useState(600);
  const [y, setY] = useState(606);
  const [enemyPetActive, setEnemyPetActive] = useState(false);
  const [editingLeaderId, setEditingLeaderId] = useState<
    number | null
  >(null);
  const [editName, setEditName] = useState("");
  const [editX, setEditX] = useState(0);
  const [editY, setEditY] = useState(0);
  const [editPetActive, setEditPetActive] = useState(false);

  async function handleAddLeader() {
    const error = await addEnemyLeader(
      enemyName,
      x,
      y,
      enemyPetActive
    );
    if (error) {
      window.alert(error);
      return;
    }
    setEnemyName("");
    setEnemyPetActive(false);
  }

  function startEditing(
    id: number,
    name: string,
    leaderX: number,
    leaderY: number
  ) {
    setEditingLeaderId(id);
    setEditName(name);
    setEditX(leaderX);
    setEditY(leaderY);
    const leader = enemyLeaders.find(
      (savedLeader) => savedLeader.id === id
    );
    setEditPetActive(
      leader ? isEnemyPetActive(leader, currentTime) : false
    );
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
      editPetActive
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
        <h2>Manage enemy rally leaders</h2>
        <label>
          Player name
          <input
            type="text"
            value={enemyName}
            onChange={(event) => setEnemyName(event.target.value)}
          />
        </label>
        <label>
          X coordinate
          <input
            type="number"
            min="0"
            max="1199"
            value={x}
            onChange={(event) => setX(Number(event.target.value))}
          />
        </label>
        <label>
          Y coordinate
          <input
            type="number"
            min="0"
            max="1199"
            value={y}
            onChange={(event) => setY(Number(event.target.value))}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={enemyPetActive}
            onChange={(event) =>
              setEnemyPetActive(event.target.checked)
            }
          />
          Pet active now
        </label>
        <button type="button" onClick={handleAddLeader}>
          Add leader
        </button>

        <h3>Saved leaders</h3>
        {enemyLeaders.length === 0 ? (
          <p>No enemy leaders added.</p>
        ) : (
          <ul>
            {enemyLeaders.map((leader) => (
              <li key={leader.id}>
                {editingLeaderId === leader.id ? (
                  <div className="edit-leader-form">
                    <label>
                      Player name
                      <input
                        type="text"
                        value={editName}
                        onChange={(event) =>
                          setEditName(event.target.value)
                        }
                      />
                    </label>
                    <label>
                      X coordinate
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
                      Y coordinate
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
                      Pet active
                    </label>
                    <button
                      className="save-button"
                      type="button"
                      onClick={saveLeader}
                    >
                      Save
                    </button>
                    <button
                      className="cancel-edit-button"
                      type="button"
                      onClick={cancelEditing}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <span>
                      {leader.name} — {leader.x}:{leader.y}
                    </span>
                    <label>
                      <input
                        type="checkbox"
                        checked={isEnemyPetActive(
                          leader,
                          currentTime
                        )}
                        onChange={async () => {
                          const error =
                            await toggleEnemyLeaderPet(leader.id);
                          if (error) window.alert(error);
                        }}
                      />
                      Pet active
                    </label>
                    <span>
                      Pet remaining:{" "}
                      {getEnemyPetTimeRemaining(
                        leader,
                        currentTime
                      )}
                    </span>
                    <button
                      className="edit-button"
                      type="button"
                      onClick={() =>
                        startEditing(
                          leader.id,
                          leader.name,
                          leader.x,
                          leader.y
                        )
                      }
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const error = await removeEnemyLeader(
                          leader.id
                        );
                        if (error) window.alert(error);
                      }}
                    >
                      Remove leader
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
