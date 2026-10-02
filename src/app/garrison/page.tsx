"use client";

import { AppHeader } from "@/components/AppHeader";
import { useBattle } from "@/components/BattleProvider";
import { useReinforcementTiming } from "@/hooks/useReinforcementTiming";
import { formatUtcTime } from "@/lib/battleDisplay";
import { calculateSendTime } from "@/lib/reinforcementTime";
import { useLanguage } from "@/components/LanguageProvider";

export default function GarrisonPage() {
  const { t } = useLanguage();
  const { rallies, currentTime } = useBattle();
  const timing = useReinforcementTiming(rallies, currentTime);

  return (
    <main>
      <AppHeader />
      <section>
        <h2>{t("Your reinforcement setup")}</h2>
        <div className="reinforcement-settings">
          <label>
            {t("Your X coordinate")}
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
            {t("Your Y coordinate")}
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
            {t("My pet is active")}
          </label>
          <label>
            <input
              type="checkbox"
              checked={timing.soundEnabled}
              onChange={(event) => timing.setSoundEnabled(event.target.checked)}
            />
            {t("Sound alerts")}
          </label>
          <button type="button" onClick={timing.enableNotifications}>
            {timing.notificationsEnabled
              ? t("Notifications enabled")
              : t("Enable notifications")}
          </button>
        </div>
        <p>
          {t("Your march time:")}{" "}
          <strong>
            {timing.playerMarchTime} {t("seconds")}
          </strong>
        </p>
      </section>

      <section>
        <h2>{t("Incoming rally schedule")}</h2>
        {timing.rallyWaves.length === 0 && <p>{t("No incoming rallies.")}</p>}
        {timing.rallyWaves.map((wave, index) => (
          <article key={wave.impactSecond}>
            <h3>
              {t("Wave")} {index + 1}
              {t(":")} {formatUtcTime(new Date(wave.impactSecond * 1000))}{" "}
              {t("UTC")}
              {" — "}
              {wave.rallies.length}{" "}
              {wave.rallies.length === 1 ? t("rally") : t("rallies")}
            </h3>
            <p>
              {t("Send reinforcement at:")}{" "}
              <strong>
                {formatUtcTime(
                  calculateSendTime(
                    new Date(wave.impactSecond * 1000),
                    timing.playerMarchTime,
                  ),
                )}{" "}
                {t("UTC")}
              </strong>
            </p>
            <p
              className={
                timing.getSecondsUntilSend(wave) === 0 ? "send-now" : ""
              }
            >
              {timing.getSendStatus(wave)}
            </p>
            <ul>
              {wave.rallies.map((rally) => (
                <li key={rally.id}>
                  <span>
                    {rally.enemyName}
                    {rally.petActive ? t(" — Pet active") : ""}
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
