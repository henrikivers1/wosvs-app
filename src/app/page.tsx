"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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

type ViewMode = "admin" | "garrison";
type AdminPanel = "leaders" | "call";

const PET_DURATION_MS = 2 * 60 * 60 * 1000;

function formatUtcTime(date: Date): string {
  return date.toLocaleTimeString("en-GB", {
    timeZone: "UTC",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function isEnemyPetActive(
  leader: EnemyLeader,
  currentTime: Date
): boolean {
  return (
    leader.petExpiresAt !== null &&
    leader.petExpiresAt > currentTime.getTime()
  );
}

function getEnemyPetTimeRemaining(
  leader: EnemyLeader,
  currentTime: Date
): string {
  if (!isEnemyPetActive(leader, currentTime)) {
    return "Inactive";
  }

  const totalSeconds = Math.ceil(
    (leader.petExpiresAt! - currentTime.getTime()) /
    1000
  );

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor(
    (totalSeconds % 3600) / 60
  );
  const seconds = totalSeconds % 60;

  return `${hours}:${minutes
    .toString()
    .padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;
}

export default function Home() {
  const [viewMode, setViewMode] =
    useState<ViewMode>("admin");

  const [adminPanel, setAdminPanel] =
    useState<AdminPanel>("leaders");

  const [enemyName, setEnemyName] = useState("");
  const [x, setX] = useState(600);
  const [y, setY] = useState(606);
  const [enemyPetActive, setEnemyPetActive] =
    useState(false);

  const [enemyLeaders, setEnemyLeaders] = useState<
    EnemyLeader[]
  >([]);

  const [selectedLeaderId, setSelectedLeaderId] =
    useState<number | null>(null);

  const [nextLeaderId, setNextLeaderId] = useState(1);
  const [nextRallyId, setNextRallyId] = useState(1);

  const [minutes, setMinutes] = useState(4);
  const [seconds, setSeconds] = useState(0);

  const [garrisonX, setGarrisonX] = useState(600);
  const [garrisonY, setGarrisonY] = useState(606);
  const [garrisonPetActive, setGarrisonPetActive] =
    useState(false);

  const [rallies, setRallies] = useState<EnemyRally[]>(
    []
  );

  const [currentTime, setCurrentTime] = useState(
    new Date()
  );

  const [notificationsEnabled, setNotificationsEnabled] =
    useState(false);

  const [soundEnabled, setSoundEnabled] = useState(true);

  const alertedWaves = useRef<Set<number>>(new Set());

  const selectedLeader =
    enemyLeaders.find(
      (leader) => leader.id === selectedLeaderId
    ) ?? null;

  const selectedLeaderPetActive = selectedLeader
    ? isEnemyPetActive(selectedLeader, currentTime)
    : false;

  const marchTime = selectedLeader
    ? calculateMarchTime(
      selectedLeader.x,
      selectedLeader.y,
      selectedLeaderPetActive
    )
    : 0;

  const garrisonMarchTime = calculateMarchTime(
    garrisonX,
    garrisonY,
    garrisonPetActive
  );

  const rallyWaves = useMemo(() => {
    return rallies.reduce<RallyWave[]>(
      (waves, rally) => {
        const impactSecond = Math.floor(
          rally.impactTime.getTime() / 1000
        );

        const existingWave = waves.find(
          (wave) =>
            wave.impactSecond === impactSecond
        );

        if (existingWave) {
          existingWave.rallies.push(rally);
        } else {
          waves.push({
            impactSecond,
            rallies: [rally],
          });
        }

        return waves;
      },
      []
    );
  }, [rallies]);

  function addEnemyLeader() {
    const trimmedName = enemyName.trim();

    if (!trimmedName) {
      window.alert("Enter the enemy leader's name.");
      return;
    }

    if (x < 0 || x > 1199 || y < 0 || y > 1199) {
      window.alert(
        "Coordinates must be between 0 and 1199."
      );
      return;
    }

    const nameAlreadyExists = enemyLeaders.some(
      (leader) =>
        leader.name.toLowerCase() ===
        trimmedName.toLowerCase()
    );

    if (nameAlreadyExists) {
      window.alert("That enemy leader already exists.");
      return;
    }

    const newLeader: EnemyLeader = {
      id: nextLeaderId,
      name: trimmedName,
      x,
      y,
      petExpiresAt: enemyPetActive
        ? currentTime.getTime() + PET_DURATION_MS
        : null,
    };

    setEnemyLeaders((currentLeaders) =>
      [...currentLeaders, newLeader].sort((a, b) =>
        a.name.localeCompare(b.name)
      )
    );

    setSelectedLeaderId(newLeader.id);
    setNextLeaderId((currentId) => currentId + 1);
    setEnemyName("");
    setEnemyPetActive(false);
  }

  function toggleEnemyLeaderPet(id: number) {
    const now = currentTime.getTime();

    setEnemyLeaders((currentLeaders) =>
      currentLeaders.map((leader) => {
        if (leader.id !== id) {
          return leader;
        }

        const currentlyActive =
          leader.petExpiresAt !== null &&
          leader.petExpiresAt > now;

        return {
          ...leader,
          petExpiresAt: currentlyActive
            ? null
            : now + PET_DURATION_MS,
        };
      })
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
      window.alert("Select an enemy rally leader.");
      return;
    }

    const calculatedImpactTime = calculateImpactTime(
      currentTime,
      minutes,
      seconds,
      marchTime
    );

    const newRally: EnemyRally = {
      id: nextRallyId,
      enemyName: selectedLeader.name,
      x: selectedLeader.x,
      y: selectedLeader.y,
      marchTime,
      impactTime: calculatedImpactTime,
      petActive: selectedLeaderPetActive,
    };

    setRallies((currentRallies) =>
      [...currentRallies, newRally].sort(
        (a, b) =>
          a.impactTime.getTime() -
          b.impactTime.getTime()
      )
    );

    setNextRallyId((currentId) => currentId + 1);
  }

  function removeRally(id: number) {
    setRallies((currentRallies) =>
      currentRallies.filter(
        (rally) => rally.id !== id
      )
    );
  }

  function getSecondsUntilSend(
    wave: RallyWave
  ): number {
    const waveImpactTime = new Date(
      wave.impactSecond * 1000
    );

    const sendTime = calculateSendTime(
      waveImpactTime,
      garrisonMarchTime
    );

    return calculateSecondsUntil(
      sendTime,
      currentTime
    );
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

  async function enableNotifications() {
    if (!("Notification" in window)) {
      window.alert(
        "This browser does not support notifications."
      );
      return;
    }

    const permission =
      await Notification.requestPermission();

    setNotificationsEnabled(
      permission === "granted"
    );
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
          const speechAlert =
            new SpeechSynthesisUtterance("Send now");

          window.speechSynthesis.speak(speechAlert);
        }

        if (
          notificationsEnabled &&
          "Notification" in window &&
          Notification.permission === "granted"
        ) {
          new Notification(
            "SEND REINFORCEMENTS NOW",
            {
              body: `${wave.rallies.length} enemy rallies are incoming.`,
              tag: `wave-${wave.impactSecond}`,
            }
          );
        }
      }
    });
  }, [
    currentTime,
    garrisonMarchTime,
    rallyWaves,
    notificationsEnabled,
    soundEnabled,
    viewMode,
  ]);

  return (
    <main>
      <header>
        <h1>WOS Battle Planner</h1>
        <p>
          SVS castle rally and reinforcement timing.
        </p>

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
              onClick={() =>
                setAdminPanel("leaders")
              }
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
              <h2>Manage enemy rally leaders</h2>

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
                    setEnemyPetActive(
                      event.target.checked
                    )
                  }
                />
                Pet Activation
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
                      <span>
                        {leader.name} — {leader.x}:
                        {leader.y}
                      </span>{" "}
                      <label>
                        <input
                          type="checkbox"
                          checked={isEnemyPetActive(
                            leader,
                            currentTime
                          )}
                          onChange={() =>
                            toggleEnemyLeaderPet(
                              leader.id
                            )
                          }
                        />
                        Pet active
                      </label>{" "}
                      <span>
                        Pet remaining:{" "}
                        {getEnemyPetTimeRemaining(
                          leader,
                          currentTime
                        )}
                      </span>{" "}
                      <button
                        type="button"
                        onClick={() =>
                          removeEnemyLeader(
                            leader.id
                          )
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
                  {selectedLeaderPetActive
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
                    setMinutes(
                      Number(event.target.value)
                    )
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
                    setSeconds(
                      Number(event.target.value)
                    )
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
                {seconds
                  .toString()
                  .padStart(2, "0")}
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
                setSoundEnabled(
                  event.target.checked
                )
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
                setGarrisonX(
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
              value={garrisonY}
              onChange={(event) =>
                setGarrisonY(
                  Number(event.target.value)
                )
              }
            />
          </label>

          <label>
            <input
              type="checkbox"
              checked={garrisonPetActive}
              onChange={(event) =>
                setGarrisonPetActive(
                  event.target.checked
                )
              }
            />
            My pet is active
          </label>

          <p>
            Your march time: {garrisonMarchTime}{" "}
            seconds
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
              {formatUtcTime(
                new Date(wave.impactSecond * 1000)
              )}{" "}
              UTC — {wave.rallies.length}{" "}
              {wave.rallies.length === 1
                ? "rally"
                : "rallies"}
            </h3>

            {viewMode === "garrison" && (
              <>
                <p>
                  Send reinforcement at:{" "}
                  {formatUtcTime(
                    calculateSendTime(
                      new Date(
                        wave.impactSecond * 1000
                      ),
                      garrisonMarchTime
                    )
                  )}{" "}
                  UTC
                </p>

                <p>{getSendStatus(wave)}</p>
              </>
            )}

            <ul>
              {wave.rallies.map((rally) => (
                <li key={rally.id}>
                  <span>
                    {rally.enemyName}
                    {rally.petActive ? " — Pet active" : ""}
                  </span>

                  {viewMode === "admin" && (
                    <button
                      type="button"
                      onClick={() => removeRally(rally.id)}
                    >
                      Cancel rally
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