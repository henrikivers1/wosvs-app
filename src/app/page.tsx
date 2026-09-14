"use client";

import { useEffect, useRef, useState } from "react";
import { calculateMarchTime } from "@/lib/marchTime";
import { calculateImpactTime } from "@/lib/rallyTime";
import {
  calculateSecondsUntil,
  calculateSendTime,
} from "@/lib/reinforcementTime";
import type {
  EnemyRally,
  RallyWave,
} from "@/types/rally";
type ViewMode = "admin" | "garrison";
export default function Home() {
  const [viewMode, setViewMode] =
    useState<ViewMode>("admin");
  const [enemyName, setEnemyName] = useState("");
  const [enemyPetActive, setEnemyPetActive] =
    useState(false);

  const [garrisonPetActive, setGarrisonPetActive] =
    useState(false);
  const [x, setX] = useState(600);
  const [y, setY] = useState(606);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [garrisonX, setGarrisonX] = useState(600);
  const [garrisonY, setGarrisonY] = useState(606);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [minutes, setMinutes] = useState(4);
  const [seconds, setSeconds] = useState(0);
  const alertedWaves = useRef<Set<number>>(new Set());
  const [impactTime, setImpactTime] = useState<Date | null>(null);
  const [rallies, setRallies] = useState<EnemyRally[]>([]);
  const marchTime = calculateMarchTime(
    x,
    y,
    enemyPetActive
  );
  const garrisonMarchTime = calculateMarchTime(
    garrisonX,
    garrisonY,
    garrisonPetActive
  );
  const [notificationsEnabled, setNotificationsEnabled] =
    useState(false);
  const rallyWaves = rallies.reduce<RallyWave[]>((waves, rally) => {
    const impactSecond = Math.floor(
      rally.impactTime.getTime() / 1000
    );
    const existingWave = waves.find(
      (wave) => wave.impactSecond === impactSecond
    );

    if (existingWave) {
      existingWave.rallies.push(rally);
    } else {
      waves.push({
        impactSecond: impactSecond,
        rallies: [rally],
      });
    }

    return waves;
  }, []);
  function syncRally() {
    const calculatedImpactTime = calculateImpactTime(
      new Date(),
      minutes,
      seconds,
      marchTime
    );
    setImpactTime(calculatedImpactTime);
    const newRally: EnemyRally = {
      id: Date.now(),
      enemyName: enemyName || "Unknown enemy",
      x: x,
      y: y,
      marchTime: marchTime,
      impactTime: calculatedImpactTime,
      petActive: enemyPetActive,
    };

    setRallies((currentRallies) =>
      [...currentRallies, newRally].sort(
        (a, b) => a.impactTime.getTime() - b.impactTime.getTime()
      )
    );
  }
  function removeRally(id: number) {
    setRallies((currentRallies) =>
      currentRallies.filter((rally) => rally.id !== id)
    );
  }
  function getSecondsUntilSend(wave: RallyWave): number {
    const waveImpactTime = new Date(
      wave.impactSecond * 1000
    );

    const sendTime = calculateSendTime(
      waveImpactTime,
      garrisonMarchTime
    );

    return calculateSecondsUntil(sendTime, currentTime);
  }
  function getSendStatus(wave: RallyWave): string {
    const secondsRemaining = getSecondsUntilSend(wave);

    if (secondsRemaining > 0) {
      return `Send in ${secondsRemaining} seconds`;
    }

    if (secondsRemaining === 0) {
      return "SEND NOW";
    }

    return "Send time passed";
  }
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCurrentTime(new Date());
    }, 100);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);
  useEffect(() => {
    rallyWaves.forEach((wave) => {
      const waveImpactTime = new Date(
        wave.impactSecond * 1000
      );

      const sendTime = calculateSendTime(
        waveImpactTime,
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
        viewMode === "garrison" &&
        secondsRemaining >= 0 &&
        secondsRemaining <= 1 &&
        !alreadyAlerted
      ) {
        alertedWaves.current.add(wave.impactSecond);

        if (soundEnabled) {
          const alert = new SpeechSynthesisUtterance("Send now");
          window.speechSynthesis.speak(alert);
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
    rallyWaves,
    notificationsEnabled,
    soundEnabled,

  ]);
  async function enableNotifications() {
    if (!("Notification" in window)) {
      alert("This browser does not support notifications.");
      return;
    }

    const permission = await Notification.requestPermission();

    setNotificationsEnabled(permission === "granted");
  }
  return (
    <main>
      <header>
        <h1>WOS Battle Planner</h1>
        <p>SVS castle rally and reinforcement timing.</p>

        <nav>
          <button
            type="button"
            onClick={() => setViewMode("admin")}
          >
            Admin
          </button>

          <button
            type="button"
            onClick={() => setViewMode("garrison")}
          >
            Garrison
          </button>
        </nav>
      </header>

      {viewMode === "admin" && (
        <section>
          <h2>Enemy rally</h2>

          <label>
            Enemy rally leader
            <input
              type="text"
              value={enemyName}
              onChange={(event) =>
                setEnemyName(event.target.value)
              }
              placeholder="Enter player name"
            />
          </label>

          <label>
            Enemy X coordinate
            <input
              type="number"
              min="0"
              max="1199"
              value={x}
              onChange={(event) =>
                setX(Number(event.target.value))
              }
            />
          </label>

          <label>
            Enemy Y coordinate
            <input
              type="number"
              min="0"
              max="1199"
              value={y}
              onChange={(event) =>
                setY(Number(event.target.value))
              }
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
            Enemy pet active
          </label>

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

          <button type="button" onClick={syncRally}>
            Sync Rally
          </button>

          <p>
            Rally timer: {minutes}:
            {seconds.toString().padStart(2, "0")}
          </p>

          <p>Enemy march time: {marchTime} seconds</p>

          {impactTime && (
            <p>
              {enemyName || "Unknown enemy"} impact:{" "}
              {impactTime.toLocaleTimeString("en-GB", {
                timeZone: "UTC",
                hour12: false,
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}{" "}
              UTC
            </p>
          )}
        </section>
      )}

      {viewMode === "garrison" && (
        <section>
          <h2>Your garrison position</h2>

          <button
            type="button"
            onClick={enableNotifications}
          >
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

          <p>
            Your march time: {garrisonMarchTime} seconds
          </p>
        </section>
      )}

      <section>
        <h2>Incoming rally schedule</h2>

        {rallyWaves.length === 0 && (
          <p>No incoming rallies.</p>
        )}

        {rallyWaves.map((wave, index) => (
          <article key={wave.impactSecond}>
            <h3>
              Wave {index + 1}:{" "}
              {new Date(
                wave.impactSecond * 1000
              ).toLocaleTimeString("en-GB", {
                timeZone: "UTC",
                hour12: false,
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}{" "}
              UTC — {wave.rallies.length}{" "}
              {wave.rallies.length === 1
                ? "rally"
                : "rallies"}
            </h3>

            {viewMode === "garrison" && (
              <>
                <p>
                  Send reinforcement at:{" "}
                  {calculateSendTime(
                    new Date(wave.impactSecond * 1000),
                    garrisonMarchTime
                  ).toLocaleTimeString("en-GB", {
                    timeZone: "UTC",
                    hour12: false,
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}{" "}
                  UTC
                </p>

                <p>{getSendStatus(wave)}</p>
              </>
            )}

            <ul>
              {wave.rallies.map((rally) => (
                <li key={rally.id}>
                  {rally.enemyName}
                  {rally.petActive
                    ? " — Pet active"
                    : ""}

                  {viewMode === "admin" && (
                    <button
                      type="button"
                      onClick={() =>
                        removeRally(rally.id)
                      }
                    >
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </section>
    </main>
  );
}