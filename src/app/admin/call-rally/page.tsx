"use client";

import { useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { useBattle } from "@/components/BattleProvider";
import { useReinforcementTiming } from "@/hooks/useReinforcementTiming";
import {
  formatUtcTime,
  getEnemyPetTimeRemaining,
  isEnemyPetActive,
} from "@/lib/battleDisplay";
import { calculateMarchTime } from "@/lib/marchTime";
import { calculateImpactTime } from "@/lib/rallyTime";
import { calculateSendTime } from "@/lib/reinforcementTime";

export default function CallRallyPage() {
  const {
    enemyLeaders,
    rallies,
    currentTime,
    addRally,
    removeRally,
  } = useBattle();
  const [selectedLeaderId, setSelectedLeaderId] = useState<
    number | null
  >(null);
  const [minutes, setMinutes] = useState(4);
  const [seconds, setSeconds] = useState(0);

  const selectedLeader =
    enemyLeaders.find(
      (leader) => leader.id === selectedLeaderId
    ) ?? null;
  const petActive = selectedLeader
    ? isEnemyPetActive(selectedLeader, currentTime)
    : false;
  const marchTime = selectedLeader
    ? calculateMarchTime(
        selectedLeader.x,
        selectedLeader.y,
        petActive
      )
    : 0;
  const reinforcement = useReinforcementTiming(
    rallies,
    currentTime
  );

  async function callRally() {
    if (!selectedLeader) {
      window.alert("Select an enemy rally leader.");
      return;
    }

    const impactTime = calculateImpactTime(
      currentTime,
      minutes,
      seconds,
      marchTime
    );
    const error = await addRally(
      {
        enemyName: selectedLeader.name,
        x: selectedLeader.x,
        y: selectedLeader.y,
        marchTime,
        impactTime,
        petActive,
      },
      selectedLeader.id
    );
    if (error) window.alert(error);
  }

  return (
    <main>
      <AppHeader />
      <section>
        <h2>Call enemy rally</h2>
        <label>
          Rally leader
          <select
            value={selectedLeaderId ?? ""}
            onChange={(event) =>
              setSelectedLeaderId(
                event.target.value
                  ? Number(event.target.value)
                  : null
              )
            }
          >
            <option value="">Select rally leader</option>
            {enemyLeaders.map((leader) => (
              <option key={leader.id} value={leader.id}>
                {leader.name}
              </option>
            ))}
          </select>
        </label>

        {selectedLeader && (
          <p>
            Position: {selectedLeader.x}:{selectedLeader.y} — March:{" "}
            {marchTime} seconds
            {petActive
              ? ` — Pet remaining: ${getEnemyPetTimeRemaining(
                  selectedLeader,
                  currentTime
                )}`
              : " — Pet inactive"}
          </p>
        )}

        <label>
          Rally minutes remaining
          <input
            type="number"
            min="0"
            max="5"
            value={minutes}
            onChange={(event) =>
              setMinutes(Number(event.target.value))
            }
          />
        </label>
        <label>
          Rally seconds remaining
          <input
            type="number"
            min="0"
            max="59"
            value={seconds}
            onChange={(event) =>
              setSeconds(Number(event.target.value))
            }
          />
        </label>
        <button
          type="button"
          onClick={callRally}
          disabled={!selectedLeader}
        >
          Call rally
        </button>
        <p>
          Rally timer: {minutes}:
          {seconds.toString().padStart(2, "0")}
        </p>
      </section>

      <section>
        <h2>Your reinforcement timing</h2>
        <p>
          Enter your own position to see when you must send after calling
          the enemy rallies.
        </p>
        <div className="reinforcement-settings">
          <label>
            Your X coordinate
            <input
              type="number"
              min="0"
              max="1199"
              value={reinforcement.playerX}
              onChange={(event) =>
                reinforcement.setPlayerX(
                  Number(event.target.value)
                )
              }
            />
          </label>
          <label>
            Your Y coordinate
            <input
              type="number"
              min="0"
              max="1199"
              value={reinforcement.playerY}
              onChange={(event) =>
                reinforcement.setPlayerY(
                  Number(event.target.value)
                )
              }
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={reinforcement.playerPetActive}
              onChange={(event) =>
                reinforcement.setPlayerPetActive(
                  event.target.checked
                )
              }
            />
            My pet is active
          </label>
          <label>
            <input
              type="checkbox"
              checked={reinforcement.soundEnabled}
              onChange={(event) =>
                reinforcement.setSoundEnabled(event.target.checked)
              }
            />
            Sound alerts
          </label>
          <button
            type="button"
            onClick={reinforcement.enableNotifications}
          >
            {reinforcement.notificationsEnabled
              ? "Notifications enabled"
              : "Enable notifications"}
          </button>
        </div>
        <p>
          Your march time:{" "}
          <strong>
            {reinforcement.playerMarchTime} seconds
          </strong>
        </p>
      </section>

      <section>
        <h2>Incoming rally schedule</h2>
        {reinforcement.rallyWaves.length === 0 && (
          <p>No incoming rallies.</p>
        )}
        {reinforcement.rallyWaves.map((wave, index) => (
          <article key={wave.impactSecond}>
            <h3>
              Wave {index + 1}: {formatUtcTime(
                new Date(wave.impactSecond * 1000)
              )}{" "}
              UTC — {wave.rallies.length}{" "}
              {wave.rallies.length === 1 ? "rally" : "rallies"}
            </h3>
            <p>
              Your reinforcement send time:{" "}
              <strong>
                {formatUtcTime(
                  calculateSendTime(
                    new Date(wave.impactSecond * 1000),
                    reinforcement.playerMarchTime
                  )
                )}{" "}
                UTC
              </strong>
            </p>
            <p
              className={
                reinforcement.getSecondsUntilSend(wave) === 0
                  ? "send-now"
                  : ""
              }
            >
              {reinforcement.getSendStatus(wave)}
            </p>
            <ul>
              {wave.rallies.map((rally) => (
                <li key={rally.id}>
                  <span>
                    {rally.enemyName}
                    {rally.petActive ? " — Pet active" : ""}
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      const error = await removeRally(rally.id);
                      if (error) window.alert(error);
                    }}
                  >
                    Cancel rally
                  </button>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </section>
    </main>
  );
}
