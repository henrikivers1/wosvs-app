"use client";

import { AppHeader } from "@/components/AppHeader";
import { useBattle } from "@/components/BattleProvider";
import { useReinforcementTiming } from "@/hooks/useReinforcementTiming";
import { formatUtcTime } from "@/lib/battleDisplay";
import { calculateSendTime } from "@/lib/reinforcementTime";

export default function GarrisonPage() {
  const { rallies, currentTime } = useBattle();
  const timing = useReinforcementTiming(rallies, currentTime);

  return (
    <main>
      <AppHeader />
      <section>
        <h2>Your reinforcement setup</h2>
        <div className="reinforcement-settings">
          <label>
            Your X coordinate
            <input
              type="number"
              min="0"
              max="1199"
              value={timing.playerX}
              onChange={(event) =>
                timing.setPlayerX(Number(event.target.value))
              }
            />
          </label>
          <label>
            Your Y coordinate
            <input
              type="number"
              min="0"
              max="1199"
              value={timing.playerY}
              onChange={(event) =>
                timing.setPlayerY(Number(event.target.value))
              }
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={timing.playerPetActive}
              onChange={(event) =>
                timing.setPlayerPetActive(event.target.checked)
              }
            />
            My pet is active
          </label>
          <label>
            <input
              type="checkbox"
              checked={timing.soundEnabled}
              onChange={(event) =>
                timing.setSoundEnabled(event.target.checked)
              }
            />
            Sound alerts
          </label>
          <button type="button" onClick={timing.enableNotifications}>
            {timing.notificationsEnabled
              ? "Notifications enabled"
              : "Enable notifications"}
          </button>
        </div>
        <p>
          Your march time:{" "}
          <strong>{timing.playerMarchTime} seconds</strong>
        </p>
      </section>

      <section>
        <h2>Incoming rally schedule</h2>
        {timing.rallyWaves.length === 0 && (
          <p>No incoming rallies.</p>
        )}
        {timing.rallyWaves.map((wave, index) => (
          <article key={wave.impactSecond}>
            <h3>
              Wave {index + 1}:{" "}
              {formatUtcTime(new Date(wave.impactSecond * 1000))} UTC
              {" — "}
              {wave.rallies.length}{" "}
              {wave.rallies.length === 1 ? "rally" : "rallies"}
            </h3>
            <p>
              Send reinforcement at:{" "}
              <strong>
                {formatUtcTime(
                  calculateSendTime(
                    new Date(wave.impactSecond * 1000),
                    timing.playerMarchTime
                  )
                )}{" "}
                UTC
              </strong>
            </p>
            <p
              className={
                timing.getSecondsUntilSend(wave) === 0
                  ? "send-now"
                  : ""
              }
            >
              {timing.getSendStatus(wave)}
            </p>
            <ul>
              {wave.rallies.map((rally) => (
                <li key={rally.id}>
                  <span>
                    {rally.enemyName}
                    {rally.petActive ? " — Pet active" : ""}
                  </span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </section>
    </main>
  );
}
