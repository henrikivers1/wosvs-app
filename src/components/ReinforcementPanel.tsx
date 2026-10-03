"use client";

import { useBattle } from "@/components/BattleProvider";
import { useLanguage } from "@/components/LanguageProvider";
import type { ReinforcementTiming } from "@/hooks/useReinforcementTiming";
import { formatUtcTimePrecise } from "@/lib/battleDisplay";
import type { EnemyRally } from "@/types/rally";

export function ReinforcementSettings({
  timing,
}: {
  timing: ReinforcementTiming;
}) {
  const { t } = useLanguage();
  const { clockSync, resyncClock } = useBattle();

  return (
    <>
      <div className="reinforcement-settings">
        <label>
          {t("Your X coordinate")}
          <input
            type="number"
            min="0"
            max="1199"
            value={timing.playerX}
            onChange={(event) => timing.setPlayerX(Number(event.target.value))}
          />
        </label>
        <label>
          {t("Your Y coordinate")}
          <input
            type="number"
            min="0"
            max="1199"
            value={timing.playerY}
            onChange={(event) => timing.setPlayerY(Number(event.target.value))}
          />
        </label>
        <label>
          {t("Send early (ms)")}
          <input
            type="number"
            min="0"
            max="2000"
            step="10"
            value={timing.sendEarlyMs}
            onChange={(event) =>
              timing.setSendEarlyMs(
                Math.max(0, Math.min(2000, Number(event.target.value) || 0)),
              )
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
      <p>
        {clockSync
          ? t("Battle clock synchronized (±{accuracy} ms).", {
              accuracy: clockSync.accuracyMs,
            })
          : t(
              "Battle clock not synchronized yet — using this device's clock.",
            )}{" "}
        <button type="button" onClick={() => void resyncClock()}>
          {t("Resync clock")}
        </button>
      </p>
      <p>
        {t(
          "Send early compensates for your game ping: if the game lags on your connection, add your ping here.",
        )}
      </p>
    </>
  );
}

export function IncomingRallies({
  rallies,
  onCancelRally,
}: {
  rallies: EnemyRally[];
  onCancelRally?: (rally: EnemyRally) => void;
}) {
  const { t } = useLanguage();
  const ordered = [...rallies].sort(
    (first, second) => first.impactTime.getTime() - second.impactTime.getTime(),
  );

  if (ordered.length === 0) return <p>{t("No incoming rallies.")}</p>;

  return (
    <ul>
      {ordered.map((rally, index) => (
        <li key={rally.id}>
          <span>
            {index + 1}. {rally.enemyName} — {t("impact")}{" "}
            {formatUtcTimePrecise(rally.impactTime)} {t("UTC")}
            {rally.petActive ? t(" — Pet active") : ""}
          </span>
          {onCancelRally && (
            <button type="button" onClick={() => onCancelRally(rally)}>
              {t("Cancel rally")}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

export function ReinforcementSchedule({
  timing,
}: {
  timing: ReinforcementTiming;
}) {
  const { t } = useLanguage();

  if (timing.landingWindows.length === 0) {
    return (
      <p>
        {t(
          "No landing windows yet. A window appears as soon as an enemy rally is called.",
        )}
      </p>
    );
  }

  return (
    <>
      {timing.landingWindows.map((landingWindow, index) => {
        const windowMs = landingWindow.closesAt
          ? landingWindow.closesAt.getTime() - landingWindow.opensAt.getTime()
          : null;
        const msUntilSend = timing.getMsUntilSend(landingWindow);

        return (
          <article key={landingWindow.id}>
            <h3>
              {t("Window {number}", { number: index + 1 })}
              {":"} {landingWindow.after.enemyName}
              {landingWindow.before
                ? ` → ${landingWindow.before.enemyName}`
                : ` → ${t("after the last rally")}`}
            </h3>
            <p>
              {landingWindow.closesAt && windowMs !== null
                ? t(
                    "Land between {opens} and {closes} UTC ({seconds} s gap).",
                    {
                      opens: formatUtcTimePrecise(landingWindow.opensAt),
                      closes: formatUtcTimePrecise(landingWindow.closesAt),
                      seconds: (windowMs / 1000).toFixed(1),
                    },
                  )
                : t("Land right after {name} hits at {impact} UTC.", {
                    name: landingWindow.after.enemyName,
                    impact: formatUtcTimePrecise(landingWindow.opensAt),
                  })}
            </p>
            {windowMs !== null && windowMs < 1000 && (
              <p className="auth-message">
                {t(
                  "Under one second between these rallies — very hard to hit.",
                )}
              </p>
            )}
            <p>
              {t("Send reinforcement at:")}{" "}
              <strong>
                {formatUtcTimePrecise(timing.getSendTime(landingWindow))}{" "}
                {t("UTC")}
              </strong>
            </p>
            <p
              className={
                msUntilSend <= 0 && msUntilSend > -1500
                  ? "send-status send-now"
                  : msUntilSend > 0 && msUntilSend <= 10_000
                    ? "send-status send-soon"
                    : msUntilSend > 0
                      ? "send-status"
                      : "send-status send-passed"
              }
            >
              {timing.getSendStatus(landingWindow)}
            </p>
          </article>
        );
      })}
    </>
  );
}
