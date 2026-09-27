"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { useBattle } from "@/components/BattleProvider";
import {
  formatUtcTime,
  groupRalliesIntoWaves,
} from "@/lib/battleDisplay";
import { calculateMarchTime } from "@/lib/marchTime";
import {
  calculateSecondsUntil,
  calculateSendTime,
} from "@/lib/reinforcementTime";
import type { RallyWave } from "@/types/rally";

export default function GarrisonPage() {
  const { rallies, currentTime } = useBattle();
  const [garrisonX, setGarrisonX] = useState(600);
  const [garrisonY, setGarrisonY] = useState(606);
  const [garrisonPetActive, setGarrisonPetActive] =
    useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] =
    useState(false);
  const alertedWaves = useRef<Set<number>>(new Set());

  const garrisonMarchTime = calculateMarchTime(
    garrisonX,
    garrisonY,
    garrisonPetActive
  );
  const rallyWaves = useMemo(
    () => groupRalliesIntoWaves(rallies),
    [rallies]
  );

  function getSecondsUntilSend(wave: RallyWave): number {
    const sendTime = calculateSendTime(
      new Date(wave.impactSecond * 1000),
      garrisonMarchTime
    );
    return calculateSecondsUntil(sendTime, currentTime);
  }

  function getSendStatus(wave: RallyWave): string {
    const secondsRemaining = getSecondsUntilSend(wave);
    if (secondsRemaining > 0) {
      return `Send in ${secondsRemaining} seconds`;
    }
    if (secondsRemaining === 0) return "SEND NOW";
    return "Send time passed";
  }

  async function enableNotifications() {
    if (!("Notification" in window)) {
      window.alert("This browser does not support notifications.");
      return;
    }
    const permission = await Notification.requestPermission();
    setNotificationsEnabled(permission === "granted");
  }

  useEffect(() => {
    rallyWaves.forEach((wave) => {
      const sendTime = calculateSendTime(
        new Date(wave.impactSecond * 1000),
        garrisonMarchTime
      );
      const secondsRemaining = calculateSecondsUntil(
        sendTime,
        currentTime
      );
      const alreadyAlerted = alertedWaves.current.has(
        wave.impactSecond
      );

      if (
        secondsRemaining >= 0 &&
        secondsRemaining <= 1 &&
        !alreadyAlerted
      ) {
        alertedWaves.current.add(wave.impactSecond);

        if (soundEnabled) {
          const speechAlert = new SpeechSynthesisUtterance(
            "Send now"
          );
          window.speechSynthesis.speak(speechAlert);
        }

        if (
          notificationsEnabled &&
          "Notification" in window &&
          Notification.permission === "granted"
        ) {
          new Notification("SEND REINFORCEMENTS NOW", {
            body: `${wave.rallies.length} enemy rallies are incoming.`,
            tag: `wave-${wave.impactSecond}`,
          });
        }
      }
    });
  }, [
    currentTime,
    garrisonMarchTime,
    notificationsEnabled,
    rallyWaves,
    soundEnabled,
  ]);

  return (
    <main>
      <AppHeader />
      <section>
        <h2>Your garrison position</h2>
        <button type="button" onClick={enableNotifications}>
          {notificationsEnabled
            ? "Notifications enabled"
            : "Enable notifications"}
        </button>
        <label>
          <input
            type="checkbox"
            checked={soundEnabled}
            onChange={(event) =>
              setSoundEnabled(event.target.checked)
            }
          />
          Sound alerts
        </label>
        <label>
          Your X coordinate
          <input
            type="number"
            min="0"
            max="1199"
            value={garrisonX}
            onChange={(event) =>
              setGarrisonX(Number(event.target.value))
            }
          />
        </label>
        <label>
          Your Y coordinate
          <input
            type="number"
            min="0"
            max="1199"
            value={garrisonY}
            onChange={(event) =>
              setGarrisonY(Number(event.target.value))
            }
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={garrisonPetActive}
            onChange={(event) =>
              setGarrisonPetActive(event.target.checked)
            }
          />
          My pet is active
        </label>
        <p>Your march time: {garrisonMarchTime} seconds</p>
      </section>

      <section>
        <h2>Incoming rally schedule</h2>
        {rallyWaves.length === 0 && <p>No incoming rallies.</p>}
        {rallyWaves.map((wave, index) => (
          <article key={wave.impactSecond}>
            <h3>
              Wave {index + 1}: {formatUtcTime(
                new Date(wave.impactSecond * 1000)
              )}{" "}
              UTC — {wave.rallies.length}{" "}
              {wave.rallies.length === 1 ? "rally" : "rallies"}
            </h3>
            <p>
              Send reinforcement at:{" "}
              {formatUtcTime(
                calculateSendTime(
                  new Date(wave.impactSecond * 1000),
                  garrisonMarchTime
                )
              )}{" "}
              UTC
            </p>
            <p className={getSecondsUntilSend(wave) === 0 ? "send-now" : ""}>
              {getSendStatus(wave)}
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
