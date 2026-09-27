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
    removeEnemyLeader,
  } = useBattle();
  const [enemyName, setEnemyName] = useState("");
  const [x, setX] = useState(600);
  const [y, setY] = useState(606);
  const [enemyPetActive, setEnemyPetActive] = useState(false);

  function handleAddLeader() {
    const error = addEnemyLeader(
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
                <span>
                  {leader.name} — {leader.x}:{leader.y}
                </span>
                <label>
                  <input
                    type="checkbox"
                    checked={isEnemyPetActive(leader, currentTime)}
                    onChange={() => toggleEnemyLeaderPet(leader.id)}
                  />
                  Pet active
                </label>
                <span>
                  Pet remaining:{" "}
                  {getEnemyPetTimeRemaining(leader, currentTime)}
                </span>
                <button
                  type="button"
                  onClick={() => removeEnemyLeader(leader.id)}
                >
                  Remove leader
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
