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
          {t("Land after the hit (ms)")}
          <input
            type="number"
            min="0"
            max="1000"
            step="10"
            value={timing.landAfterMs}
            onChange={(event) =>
              timing.setLandAfterMs(
                Math.max(0, Math.min(1000, Number(event.target.value) || 0)),
              )
            }
          />
        </label>
        <label>
          {t("Speedups for close rallies")}
          <select
            value={timing.speedupMode}
            onChange={(event) =>
              timing.setSpeedupMode(event.target.value as typeof timing.speedupMode)
            }
          >
            <option value="25-50">{t("25% and 50%")}</option>
            <option value="25-25x2">{t("25% only (two for a third march)")}</option>
            <option value="off">{t("Off: one send per rally")}</option>
          </select>
        </label>
        <label>
          {t("Seconds before you can tap a speedup")}
          <input
            type="number"
            min="1"
            max="10"
            step="0.5"
            value={timing.speedupDelayMs / 1000}
            onChange={(event) =>
              timing.setSpeedupDelayMs(
                Math.round(Math.max(1, Math.min(10, Number(event.target.value) || 3)) * 1000),
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
        <button type="button" onClick={timing.testSound}>
          {t("Test sound")}
        </button>
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
      <p>
        {t(
          "Your reinforcements land this long after the enemy rally hits (default 100 ms), never later than halfway to the next hit. With sound on you hear 3, 2, 1 and a high tone: tap Send on the tone. Tap Test sound once so your phone allows the beeps.",
        )}
      </p>
      <p>
        {t(
          "Rallies that hit close together each get their own march. When there is no time to send them one after another, a march is sent later and sped up with a March Accelerator: two short low beeps mean tap the speedup. A speedup takes 25% or 50% off the time that is left, and tapping it a little late barely moves the landing.",
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
      {timing.upcomingTaps.length > 0 && (
        <ol className="garrison-taps" aria-label={t("Your taps")}>
          {timing.upcomingTaps.slice(0, 8).map((tap, index) => (
            <li key={tap.key} className={index === 0 ? "is-next" : undefined}>
              <time>{formatUtcTimePrecise(new Date(tap.at))}</time>
              <strong>
                {tap.kind === "send"
                  ? t("Send march {number}", { number: tap.march })
                  : t("Speed up march {number} by {percent}%", {
                      number: tap.march,
                      percent: tap.percent ?? 25,
                    })}
              </strong>
            </li>
          ))}
        </ol>
      )}
      {timing.landingWindows.map((landingWindow, index) => {
        const march = timing.marchFor(landingWindow);
        const marchNumber = timing.marchNumber(landingWindow);
        const windowMs = landingWindow.closesAt
          ? landingWindow.closesAt.getTime() - landingWindow.opensAt.getTime()
          : null;
        const msUntilSend = timing.getMsUntilNextTap(landingWindow);

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
            {windowMs !== null && windowMs < timing.landAfterMs * 2 && (
              <p className="auth-message">
                {t(
                  "Under {ms} ms between these rallies: aiming for the middle of the gap.",
                  { ms: timing.landAfterMs * 2 },
                )}
              </p>
            )}
            {march ? (
              <p>
                {marchNumber !== null && `${t("March {number}", { number: marchNumber })} · `}
                {t("Send reinforcement at:")}{" "}
                <strong>
                  {formatUtcTimePrecise(timing.getSendTime(landingWindow))}{" "}
                  {t("UTC")}
                </strong>
                {march.taps
                  .filter((tap) => tap.kind === "speedup")
                  .map((tap, tapIndex) => (
                    <span key={tapIndex}>
                      {" · "}
                      {t("speed up {percent}% at {time}", {
                        percent: tap.percent ?? 25,
                        time: formatUtcTimePrecise(new Date(tap.at)),
                      })}
                    </span>
                  ))}
              </p>
            ) : (
              <p className="auth-message">
                {t("No time for a march here: it would come too close to your other taps.")}
              </p>
            )}
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
