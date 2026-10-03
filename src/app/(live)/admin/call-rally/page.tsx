"use client";

import { useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { useBattle } from "@/components/BattleProvider";
import { useReinforcementTiming } from "@/hooks/useReinforcementTiming";
import {
  getEnemyPetTimeRemaining,
  isEnemyPetActive,
} from "@/lib/battleDisplay";
import { calculateMarchTime } from "@/lib/marchTime";
import { calculateImpactTime } from "@/lib/rallyTime";
import { useLanguage } from "@/components/LanguageProvider";
import {
  IncomingRallies,
  ReinforcementSchedule,
  ReinforcementSettings,
} from "@/components/ReinforcementPanel";

export default function CallRallyPage() {
  const { t } = useLanguage();
  const { enemyLeaders, rallies, currentTime, now, addRally, removeRally } =
    useBattle();
  const [selectedLeaderId, setSelectedLeaderId] = useState<number | null>(null);
  const [minutes, setMinutes] = useState(4);
  const [seconds, setSeconds] = useState(0);
  // Confirmation of the last call, shown under the button.
  const [called, setCalled] = useState<string | null>(null);

  const selectedLeader =
    enemyLeaders.find((leader) => leader.id === selectedLeaderId) ?? null;
  const petActive = selectedLeader
    ? isEnemyPetActive(selectedLeader, currentTime)
    : false;
  const marchTime = selectedLeader
    ? calculateMarchTime(selectedLeader.x, selectedLeader.y, petActive)
    : 0;
  const reinforcement = useReinforcementTiming(rallies, currentTime);

  async function callRally() {
    if (!selectedLeader) {
      window.alert(t("Select an enemy rally leader."));
      return;
    }

    // The exact synced time of the tap, not the last 100 ms clock tick.
    const impactTime = calculateImpactTime(
      now(),
      minutes,
      seconds,
      marchTime,
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
      selectedLeader.id,
    );
    if (error) window.alert(error);
    else setCalled(selectedLeader.name);
  }

  return (
    <main>
      <AppHeader />
      <section>
        <h2>{t("Call enemy rally")}</h2>
        <label>
          {t("Rally leader")}
          <select
            value={selectedLeaderId ?? ""}
            onChange={(event) =>
              setSelectedLeaderId(
                event.target.value ? Number(event.target.value) : null,
              )
            }
          >
            <option value="">{t("Select rally leader")}</option>
            {enemyLeaders.map((leader) => (
              <option key={leader.id} value={leader.id}>
                {leader.name}
              </option>
            ))}
          </select>
        </label>

        {selectedLeader && (
          <p>
            {t("Position:")} {selectedLeader.x}
            {":"}
            {selectedLeader.y} {t("— March:")} {marchTime} {t("seconds")}
            {petActive
              ? t(" — Pet remaining: {time}", {
                  time: getEnemyPetTimeRemaining(selectedLeader, currentTime),
                })
              : t(" — Pet inactive")}
          </p>
        )}

        <label>
          {t("Rally minutes remaining")}
          <input
            type="number"
            min="0"
            max="5"
            value={minutes}
            onChange={(event) => setMinutes(Number(event.target.value))}
          />
        </label>
        <label>
          {t("Rally seconds remaining")}
          <input
            type="number"
            min="0"
            max="59"
            value={seconds}
            onChange={(event) => setSeconds(Number(event.target.value))}
          />
        </label>
        <p>
          {t(
            "Enter the time shown in game, then press Call rally the moment the in-game timer changes to that value. Every second of delay shifts the whole schedule.",
          )}
        </p>
        <button type="button" onClick={callRally} disabled={!selectedLeader}>
          {t("Call rally")}
        </button>
        {called && (
          <p className="status-badge" role="status">
            {t("Rally from {name} called.", { name: called })}
          </p>
        )}
        <p>
          {t("Rally timer:")} {minutes}
          {":"}
          {seconds.toString().padStart(2, "0")}
        </p>
      </section>

      <section>
        <h2>{t("Your reinforcement timing")}</h2>
        <p>
          {t(
            "Enter your own position to see when you must send after calling the enemy rallies.",
          )}
        </p>
        <ReinforcementSettings timing={reinforcement} />
      </section>

      <section>
        <h2>{t("When to send")}</h2>
        <ReinforcementSchedule timing={reinforcement} />
      </section>

      <section>
        <h2>{t("Incoming rally schedule")}</h2>
        <IncomingRallies
          rallies={rallies}
          onCancelRally={async (rally) => {
            if (
              !window.confirm(
                t("Cancel the rally from {name} for everyone?", {
                  name: rally.enemyName,
                }),
              )
            ) {
              return;
            }
            const error = await removeRally(rally.id);
            if (error) window.alert(error);
          }}
        />
      </section>
    </main>
  );
}
