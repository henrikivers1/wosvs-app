"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { calculateMarchTime } from "@/lib/marchTime";
import {
  buildLandingWindows,
  DEFAULT_LAND_AFTER_MS,
  windowSendTime,
  type LandingWindow,
} from "@/lib/reinforcementWindows";
import type { EnemyRally } from "@/types/rally";

const HIDE_AFTER_SEND_MS = 3_000;
const SETTINGS_KEY = "wosoverwatch-reinforcement-settings";

type StoredSettings = {
  x: number;
  y: number;
  sendEarlyMs: number;
  landAfterMs?: number;
};

// "3, 2, 1, SEND": short ticks 3, 2 and 1 seconds before the send and a
// longer, higher tone at the send. Tapping on a beat is far more precise
// than reacting to a single cue.
const COUNTDOWN_TICKS_MS = [3000, 2000, 1000];
// Beeps are put on the audio clock this far ahead, so they keep time even
// when the page's timers are slowed down.
const SCHEDULE_AHEAD_MS = 5000;

function playTone(
  context: AudioContext,
  at: number,
  frequency: number,
  duration: number,
) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "square";
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.25, at + 0.005);
  gain.gain.setValueAtTime(0.25, at + duration - 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(at);
  oscillator.stop(at + duration);
  return oscillator;
}

function readStoredSettings(): StoredSettings | null {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    return raw ? (JSON.parse(raw) as StoredSettings) : null;
  } catch {
    return null;
  }
}

// Android Chrome has no `new Notification()` (it throws "Illegal
// constructor"); it only shows notifications through a service worker.
// Never let an alert take down the garrison page at send time.
function showSystemNotification(title: string, options: NotificationOptions) {
  try {
    new Notification(title, options);
  } catch {
    void navigator.serviceWorker?.getRegistration().then((registration) =>
      registration?.showNotification(title, options),
    );
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
  const [landAfterMs, setLandAfterMs] = useState(DEFAULT_LAND_AFTER_MS);
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
        if (Number.isFinite(stored.landAfterMs)) {
          setLandAfterMs(stored.landAfterMs!);
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
        JSON.stringify({ x: playerX, y: playerY, sendEarlyMs, landAfterMs }),
      );
    } catch {
      // Storage can be unavailable (private mode); settings stay in memory.
    }
  }, [playerX, playerY, sendEarlyMs, landAfterMs, settingsLoaded]);

  const playerMarchTime = calculateMarchTime(playerX, playerY, playerPetActive);

  const getSendTime = (landingWindow: LandingWindow) =>
    windowSendTime(landingWindow, playerMarchTime, sendEarlyMs);

  const landingWindows = useMemo(
    () =>
      buildLandingWindows(rallies, landAfterMs).filter(
        (landingWindow) =>
          currentTime.getTime() <
          windowSendTime(
            landingWindow,
            playerMarchTime,
            sendEarlyMs,
          ).getTime() +
            HIDE_AFTER_SEND_MS,
      ),
    [currentTime, landAfterMs, playerMarchTime, rallies, sendEarlyMs],
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

  // Browsers only start audio after a tap, so the first tap anywhere on the
  // page (or Test sound) unlocks it.
  const audioRef = useRef<AudioContext | null>(null);
  const audioContext = () => {
    if (!audioRef.current) {
      const Context =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Context) return null;
      audioRef.current = new Context();
    }
    if (audioRef.current.state === "suspended") void audioRef.current.resume();
    return audioRef.current;
  };
  useEffect(() => {
    const unlock = () => audioContext();
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      void audioRef.current?.close();
      audioRef.current = null;
    };
  }, []);

  function testSound() {
    const context = audioContext();
    if (!context) return;
    const start = context.currentTime + 0.1;
    COUNTDOWN_TICKS_MS.forEach((_, index) => playTone(context, start + index * 0.5, 880, 0.08));
    playTone(context, start + COUNTDOWN_TICKS_MS.length * 0.5, 1320, 0.35);
  }

  // Each window's beeps, keyed by its send time so they are moved when the
  // send time changes (new coordinates, a rally called or cancelled).
  const scheduled = useRef<Map<string, { sendAt: number; tones: OscillatorNode[] }>>(new Map());
  useEffect(() => {
    const context = audioRef.current;
    const live = new Set<string>();
    const sendTimes = landingWindows
      .map((landingWindow) => windowSendTime(landingWindow, playerMarchTime, sendEarlyMs).getTime())
      .sort((first, second) => first - second);
    landingWindows.forEach((landingWindow) => {
      const sendAt = windowSendTime(landingWindow, playerMarchTime, sendEarlyMs).getTime();
      // Ticks that would fall before the previous window's send tone are
      // left out, so close windows play "3, 2, 1, SEND, SEND".
      const previous = sendTimes.filter((time) => time < sendAt).pop() ?? -Infinity;
      const msUntil = sendAt - currentTime.getTime();
      if (msUntil < -500 || msUntil > SCHEDULE_AHEAD_MS) return;
      live.add(landingWindow.id);
      const existing = scheduled.current.get(landingWindow.id);
      if (existing && existing.sendAt === sendAt) return;
      existing?.tones.forEach((tone) => {
        try {
          tone.stop();
        } catch {
          // Already finished.
        }
      });
      scheduled.current.delete(landingWindow.id);
      if (!soundEnabled || !context || context.state !== "running") return;
      // The audio clock and the battle clock tick together; place each beep
      // at its offset from now.
      const now = context.currentTime;
      const tones = [
        ...COUNTDOWN_TICKS_MS.filter((before) => sendAt - before > previous + 300).map((before) => ({
          at: msUntil - before,
          frequency: 880,
          duration: 0.08,
        })),
        { at: msUntil, frequency: 1320, duration: 0.35 },
      ]
        .filter((beep) => beep.at > -50)
        .map((beep) => playTone(context, now + Math.max(0, beep.at) / 1000, beep.frequency, beep.duration));
      scheduled.current.set(landingWindow.id, { sendAt, tones });
    });
    for (const [id, entry] of scheduled.current) {
      if (!live.has(id) && entry.sendAt < currentTime.getTime() - 500) scheduled.current.delete(id);
    }
  }, [currentTime, landingWindows, playerMarchTime, sendEarlyMs, soundEnabled]);

  // Sound off: silence beeps already on the audio clock.
  useEffect(() => {
    if (soundEnabled) return;
    for (const entry of scheduled.current.values()) {
      entry.tones.forEach((tone) => {
        try {
          tone.stop();
        } catch {
          // Already finished.
        }
      });
    }
    scheduled.current.clear();
  }, [soundEnabled]);

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

      if (
        notificationsEnabled &&
        "Notification" in window &&
        Notification.permission === "granted"
      ) {
        showSystemNotification(t("SEND REINFORCEMENTS NOW"), {
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
    landAfterMs,
    setLandAfterMs,
    testSound,
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
