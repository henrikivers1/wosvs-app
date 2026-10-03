"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { calculateMarchTime } from "@/lib/marchTime";
import {
  buildLandingWindows,
  windowSendTime,
  type LandingWindow,
} from "@/lib/reinforcementWindows";
import type { EnemyRally } from "@/types/rally";

const HIDE_AFTER_SEND_MS = 3_000;
const SETTINGS_KEY = "wosoverwatch-reinforcement-settings";

type StoredSettings = { x: number; y: number; sendEarlyMs: number };

function readStoredSettings(): StoredSettings | null {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    return raw ? (JSON.parse(raw) as StoredSettings) : null;
  } catch {
    return null;
  }
}

export function useReinforcementTiming(
  rallies: EnemyRally[],
  currentTime: Date,
) {
  const { t } = useLanguage();
  const [playerX, setPlayerX] = useState(600);
  const [playerY, setPlayerY] = useState(606);
  const [sendEarlyMs, setSendEarlyMs] = useState(0);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [playerPetActive, setPlayerPetActive] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const alertedWindows = useRef<Set<string>>(new Set());

  // Keep coordinates and ping compensation across reloads during a battle.
  useEffect(() => {
    const loadId = window.setTimeout(() => {
      const stored = readStoredSettings();
      if (stored) {
        if (Number.isFinite(stored.x)) setPlayerX(stored.x);
        if (Number.isFinite(stored.y)) setPlayerY(stored.y);
        if (Number.isFinite(stored.sendEarlyMs)) {
          setSendEarlyMs(stored.sendEarlyMs);
        }
      }
      setSettingsLoaded(true);
    }, 0);
    return () => window.clearTimeout(loadId);
  }, []);

  useEffect(() => {
    if (!settingsLoaded) return;
    try {
      window.localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify({ x: playerX, y: playerY, sendEarlyMs }),
      );
    } catch {
      // Storage can be unavailable (private mode); settings stay in memory.
    }
  }, [playerX, playerY, sendEarlyMs, settingsLoaded]);

  const playerMarchTime = calculateMarchTime(playerX, playerY, playerPetActive);

  const getSendTime = (landingWindow: LandingWindow) =>
    windowSendTime(landingWindow, playerMarchTime, sendEarlyMs);

  const landingWindows = useMemo(
    () =>
      buildLandingWindows(rallies).filter(
        (landingWindow) =>
          currentTime.getTime() <
          windowSendTime(
            landingWindow,
            playerMarchTime,
            sendEarlyMs,
          ).getTime() +
            HIDE_AFTER_SEND_MS,
      ),
    [currentTime, playerMarchTime, rallies, sendEarlyMs],
  );

  function getMsUntilSend(landingWindow: LandingWindow): number {
    return getSendTime(landingWindow).getTime() - currentTime.getTime();
  }

  function getSendStatus(landingWindow: LandingWindow): string {
    const msRemaining = getMsUntilSend(landingWindow);
    if (msRemaining > 0) {
      return t("Send in {seconds} seconds", {
        seconds: (msRemaining / 1000).toFixed(1),
      });
    }
    if (msRemaining > -1500) return t("SEND NOW");
    return t("Send time passed");
  }

  async function enableNotifications() {
    const notificationsSupported = "Notification" in window;
    if (!notificationsSupported) {
      window.alert(t("This browser does not support notifications."));
      return;
    }
    const permission = await Notification.requestPermission();
    setNotificationsEnabled(permission === "granted");
  }

  useEffect(() => {
    landingWindows.forEach((landingWindow) => {
      const msRemaining =
        windowSendTime(landingWindow, playerMarchTime, sendEarlyMs).getTime() -
        currentTime.getTime();
      if (
        msRemaining > 0 ||
        msRemaining < -1000 ||
        alertedWindows.current.has(landingWindow.id)
      ) {
        return;
      }
      alertedWindows.current.add(landingWindow.id);

      if (soundEnabled) {
        window.speechSynthesis.speak(
          new SpeechSynthesisUtterance(t("Send now")),
        );
      }

      if (
        notificationsEnabled &&
        "Notification" in window &&
        Notification.permission === "granted"
      ) {
        new Notification(t("SEND REINFORCEMENTS NOW"), {
          body: landingWindow.before
            ? t("Land between {first} and {second}.", {
                first: landingWindow.after.enemyName,
                second: landingWindow.before.enemyName,
              })
            : t("Land right after {name} hits.", {
                name: landingWindow.after.enemyName,
              }),
          tag: `window-${landingWindow.id}`,
        });
      }
    });
  }, [
    currentTime,
    landingWindows,
    notificationsEnabled,
    playerMarchTime,
    sendEarlyMs,
    soundEnabled,
    t,
  ]);

  return {
    playerX,
    setPlayerX,
    playerY,
    setPlayerY,
    sendEarlyMs,
    setSendEarlyMs,
    playerPetActive,
    setPlayerPetActive,
    soundEnabled,
    setSoundEnabled,
    notificationsEnabled,
    enableNotifications,
    playerMarchTime,
    landingWindows,
    getSendTime,
    getMsUntilSend,
    getSendStatus,
  };
}

export type ReinforcementTiming = ReturnType<typeof useReinforcementTiming>;
