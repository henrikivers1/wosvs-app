"use client";

import { useEffect, useRef, useState } from "react";
import { calculateMarchTime } from "@/lib/marchTime";
import { calculateImpactTime } from "@/lib/rallyTime";
import {
  calculateSecondsUntil,
  calculateSendTime,
} from "@/lib/reinforcementTime";
import type {
  EnemyLeader,
  EnemyRally,
  RallyWave,
} from "@/types/rally";
type AdminPanel = "leaders" | "call";
type ViewMode = "admin" | "garrison";
export default function Home() {
  const [adminPanel, setAdminPanel] =
    useState<AdminPanel>("leaders");

  const [enemyLeaders, setEnemyLeaders] =
    useState<EnemyLeader[]>([]);

  const [selectedLeaderId, setSelectedLeaderId] =
    useState<number | null>(null);
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
  const [impactTime, setImpactTime] =
  useState<Date | null>(null);
  const [rallies, setRallies] = useState<EnemyRally[]>([]);
  const selectedLeader =
    enemyLeaders.find(
      (leader) => leader.id === selectedLeaderId
    ) ?? null;

  const marchTime = selectedLeader
    ? calculateMarchTime(
      selectedLeader.x,
      selectedLeader.y,
      selectedLeader.petActive
    )
    : 0;
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
  function addEnemyLeader() {
    const trimmedName = enemyName.trim();

    if (!trimmedName) {
      alert("Enter the enemy leader's name.");
      return;
    }

    if (x < 0 || x > 1199 || y < 0 || y > 1199) {
      alert("Coordinates must be between 0 and 1199.");
      return;
    }

    const nameAlreadyExists = enemyLeaders.some(
      (leader) =>
        leader.name.toLowerCase() ===
        trimmedName.toLowerCase()
    );

    if (nameAlreadyExists) {
      alert("That enemy leader already exists.");
      return;
    }

    const newLeader: EnemyLeader = {
      id: Date.now(),
      name: trimmedName,
      x,
      y,
      petActive: enemyPetActive,
    };

    setEnemyLeaders((currentLeaders) =>
      [...currentLeaders, newLeader].sort((a, b) =>
        a.name.localeCompare(b.name)
      )
    );

    setSelectedLeaderId(newLeader.id);
    setEnemyName("");
  }

  function toggleEnemyLeaderPet(id: number) {
    setEnemyLeaders((currentLeaders) =>
      currentLeaders.map((leader) =>
        leader.id === id
          ? {
            ...leader,
            petActive: !leader.petActive,
          }
          : leader
      )
    );
  }

  function removeEnemyLeader(id: number) {
    setEnemyLeaders((currentLeaders) =>
      currentLeaders.filter(
        (leader) => leader.id !== id
      )
    );

    setSelectedLeaderId((currentId) =>
      currentId === id ? null : currentId
    );
  }
  function syncRally() {
    if (!selectedLeader) {
      alert("Select an enemy rally leader.");
      return;
    }

    const calculatedImpactTime = calculateImpactTime(
      new Date(),
      minutes,
      seconds,
      marchTime
    );

    const newRally: EnemyRally = {
      id: Date.now(),
      enemyName: selectedLeader.name,
      x: selectedLeader.x,
      y: selectedLeader.y,
      marchTime,
      impactTime: calculatedImpactTime,
      petActive: selectedLeader.petActive,
    };

    setRallies((currentRallies) =>
      [...currentRallies, newRally].sort(
        (a, b) =>
          a.impactTime.getTime() -
          b.impactTime.getTime()
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
  <>
    <nav>
      <button
        type="button"
        onClick={() => setAdminPanel("leaders")}
      >
        Manage leaders
      </button>

      <button
        type="button"
        onClick={() => setAdminPanel("call")}
      >
        Call rally
      </button>
    </nav>

    {adminPanel === "leaders" && (
      <section>
        <h2>Add enemy rally leader</h2>

        <label>
          Player name
          <input
            type="text"
            value={enemyName}
            onChange={(event) =>
              setEnemyName(event.target.value)
            }
          />
        </label>

        <label>
          X coordinate
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
          Y coordinate
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
          Pet active
        </label>

        <button
          type="button"
          onClick={addEnemyLeader}
        >
          Add leader
        </button>

        <h3>Saved leaders</h3>

        {enemyLeaders.length === 0 ? (
          <p>No enemy leaders added.</p>
        ) : (
          <ul>
            {enemyLeaders.map((leader) => (
              <li key={leader.id}>
                {leader.name} — {leader.x}:{leader.y}

                <label>
                  <input
                    type="checkbox"
                    checked={leader.petActive}
                    onChange={() =>
                      toggleEnemyLeaderPet(leader.id)
                    }
                  />
                  Pet active
                </label>

                <button
                  type="button"
                  onClick={() =>
                    removeEnemyLeader(leader.id)
                  }
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    )}

    {adminPanel === "call" && (
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
            <option value="">
              Select rally leader
            </option>

            {enemyLeaders.map((leader) => (
              <option
                key={leader.id}
                value={leader.id}
              >
                {leader.name}
              </option>
            ))}
          </select>
        </label>

        {selectedLeader && (
          <p>
            Position: {selectedLeader.x}:
            {selectedLeader.y} — March:{" "}
            {marchTime} seconds
            {selectedLeader.petActive
              ? " — Pet active"
              : ""}
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
          onClick={syncRally}
          disabled={!selectedLeader}
        >
          Sync Rally
        </button>

        <p>
          Rally timer: {minutes}:
          {seconds.toString().padStart(2, "0")}
        </p>
      </section>
    )}
  </>
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