"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { calculateMarchTime } from "@/lib/marchTime";
import {
  DEFAULT_MIN_TAP_GAP_MS,
  DEFAULT_SPEEDUP_DELAY_MS,
  OLD_DEFAULT_SPEEDUP_DELAY_MS,
  planMarches,
  type PlannedMarch,
  type SpeedupMode,
} from "@/lib/marchPlan";
import {
  buildLandingWindows,
  DEFAULT_LAND_AFTER_MS,
  type LandingWindow,
} from "@/lib/reinforcementWindows";
import type { EnemyRally } from "@/types/rally";

const HIDE_AFTER_SEND_MS = 3_000;
// A send counts as done only if its time passed this recently (the clock
// ticks every 100 ms; background tabs can lag to about a second).
const SENT_GRACE_MS = 5_000;
const SETTINGS_KEY = "wosoverwatch-reinforcement-settings";

type StoredSettings = {
  x: number;
  y: number;
  sendEarlyMs: number;
  landAfterMs?: number;
  speedupMode?: SpeedupMode;
  speedupDelayMs?: number;
};

// "3, 2, 1, SEND": short ticks 3, 2 and 1 seconds before the send and a
// longer, higher tone at the send. Tapping on a beat is far more precise
// than reacting to a single cue.
const COUNTDOWN_TICKS_MS = [3000, 2000, 1000];
// Beeps are put on the audio clock this far ahead, so they keep time even
// when the page's timers are slowed down.
const SCHEDULE_AHEAD_MS = 5000;
const TICK_HZ = 880;
const SEND_HZ = 1320;
// Speedups: two short, lower beeps.
const SPEEDUP_HZ = 660;

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

// One tap the player makes: sending a march or speeding one up.
export type GarrisonTap = {
  key: string;
  windowId: string;
  // Marches are numbered in the order they are sent.
  march: number;
  kind: "send" | "speedup";
  percent?: 25 | 50;
  at: number;
};

export function useReinforcementTiming(
  rallies: EnemyRally[],
  currentTime: Date,
) {
  const { t } = useLanguage();
  const [playerX, setPlayerX] = useState(600);
  const [playerY, setPlayerY] = useState(606);
  const [sendEarlyMs, setSendEarlyMs] = useState(0);
  const [landAfterMs, setLandAfterMs] = useState(DEFAULT_LAND_AFTER_MS);
  const [speedupMode, setSpeedupMode] = useState<SpeedupMode>("25-50");
  const [speedupDelayMs, setSpeedupDelayMs] = useState(DEFAULT_SPEEDUP_DELAY_MS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [playerPetActive, setPlayerPetActive] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const alertedTaps = useRef<Set<string>>(new Set());

  // Keep coordinates, ping compensation and speedups across reloads.
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
        if (stored.speedupMode) setSpeedupMode(stored.speedupMode);
        if (
          Number.isFinite(stored.speedupDelayMs) &&
          stored.speedupDelayMs !== OLD_DEFAULT_SPEEDUP_DELAY_MS
        ) {
          setSpeedupDelayMs(stored.speedupDelayMs!);
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
        JSON.stringify({
          x: playerX,
          y: playerY,
          sendEarlyMs,
          landAfterMs,
          speedupMode,
          speedupDelayMs,
        }),
      );
    } catch {
      // Storage can be unavailable (private mode); settings stay in memory.
    }
  }, [playerX, playerY, sendEarlyMs, landAfterMs, speedupMode, speedupDelayMs, settingsLoaded]);

  const playerMarchTime = calculateMarchTime(playerX, playerY, playerPetActive);
  const now = currentTime.getTime();

  const allWindows = useMemo(
    () => buildLandingWindows(rallies, landAfterMs),
    [rallies, landAfterMs],
  );

  // One march per landing window, sped up where sends would come too close
  // together. Marches already sent keep their plan when rallies change.
  const [sentMarches, setSentMarches] = useState<Map<string, PlannedMarch>>(new Map());
  const plan = useMemo(() => {
    const fixed = new Map(
      [...sentMarches].filter(([id]) => allWindows.some((item) => item.id === id)),
    );
    return planMarches(
      allWindows.map((landingWindow) => ({
        id: landingWindow.id,
        at: landingWindow.targetTime.getTime(),
      })),
      {
        marchMs: playerMarchTime * 1000,
        speedupDelayMs,
        minGapMs: DEFAULT_MIN_TAP_GAP_MS,
        earlyMs: sendEarlyMs,
        mode: speedupMode,
      },
      fixed,
    );
  }, [allWindows, playerMarchTime, sendEarlyMs, sentMarches, speedupDelayMs, speedupMode]);
  // Remember marches as they are sent: only when the send time has just
  // passed. A plan whose send is long past (a half-typed coordinate gives a
  // huge march time) must not be locked in as sent.
  useEffect(() => {
    const newlySent = [...plan].filter(
      (entry): entry is [string, PlannedMarch] =>
        Boolean(entry[1]) &&
        entry[1]!.taps[0].at <= now &&
        entry[1]!.taps[0].at > now - SENT_GRACE_MS &&
        !sentMarches.has(entry[0]),
    );
    if (!newlySent.length) return;
    const saveId = window.setTimeout(
      () => setSentMarches((current) => new Map([...current, ...newlySent])),
      0,
    );
    return () => window.clearTimeout(saveId);
  }, [now, plan, sentMarches]);

  const taps = useMemo(() => {
    const marches = [...plan.entries()]
      .filter((entry): entry is [string, PlannedMarch] => Boolean(entry[1]))
      .sort((first, second) => first[1].taps[0].at - second[1].taps[0].at);
    return marches.flatMap(([windowId, march], index) =>
      march.taps.map((tap, tapIndex) => ({
        key: `${windowId}:${tapIndex}:${tap.at}`,
        windowId,
        march: index + 1,
        kind: tap.kind,
        percent: tap.percent,
        at: tap.at,
      })),
    ).sort((first, second) => first.at - second.at) as GarrisonTap[];
  }, [plan]);

  const marchFor = (landingWindow: LandingWindow) => plan.get(landingWindow.id) ?? null;
  const marchNumber = (landingWindow: LandingWindow) =>
    taps.find((tap) => tap.windowId === landingWindow.id)?.march ?? null;
  const lastTapAt = (landingWindow: LandingWindow) => {
    const march = marchFor(landingWindow);
    return march ? march.taps[march.taps.length - 1].at : landingWindow.targetTime.getTime();
  };

  // Windows stay on screen until a few seconds after their last tap.
  const landingWindows = allWindows.filter(
    (landingWindow) => now < lastTapAt(landingWindow) + HIDE_AFTER_SEND_MS,
  );
  const upcomingTaps = taps.filter((tap) => tap.at > now - 1500);

  const getSendTime = (landingWindow: LandingWindow) =>
    new Date(marchFor(landingWindow)?.taps[0].at ?? landingWindow.targetTime.getTime() - playerMarchTime * 1000);

  function getMsUntilSend(landingWindow: LandingWindow): number {
    return getSendTime(landingWindow).getTime() - now;
  }

  // Until the window's next tap (send or speedup), for the status colour.
  function getMsUntilNextTap(landingWindow: LandingWindow): number {
    const march = marchFor(landingWindow);
    const next = march?.taps.find((tap) => tap.at > now - 1500);
    return next ? next.at - now : -Infinity;
  }

  // The window's next tap, as "Send in 3.2 seconds" or "SPEED UP 25% NOW".
  function getSendStatus(landingWindow: LandingWindow): string {
    const march = marchFor(landingWindow);
    if (!march) return t("No time for a march here");
    const next = march.taps.find((tap) => tap.at > now - 1500);
    if (!next) return t("Send time passed");
    const msRemaining = next.at - now;
    if (next.kind === "speedup") {
      return msRemaining > 0
        ? t("Speed up {percent}% in {seconds} seconds", {
            percent: next.percent ?? 25,
            seconds: (msRemaining / 1000).toFixed(1),
          })
        : t("SPEED UP {percent}% NOW", { percent: next.percent ?? 25 });
    }
    return msRemaining > 0
      ? t("Send in {seconds} seconds", { seconds: (msRemaining / 1000).toFixed(1) })
      : t("SEND NOW");
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
    COUNTDOWN_TICKS_MS.forEach((_, index) => playTone(context, start + index * 0.5, TICK_HZ, 0.08));
    playTone(context, start + 1.5, SEND_HZ, 0.35);
    playTone(context, start + 2.2, SPEEDUP_HZ, 0.12);
    playTone(context, start + 2.4, SPEEDUP_HZ, 0.12);
  }

  // Each tap's beeps, put on the audio clock a few seconds ahead. A tap's
  // key holds its time, so a changed plan stops the old beeps.
  const scheduled = useRef<Map<string, OscillatorNode[]>>(new Map());
  useEffect(() => {
    const context = audioRef.current;
    const stop = (tones: OscillatorNode[]) =>
      tones.forEach((tone) => {
        try {
          tone.stop();
        } catch {
          // Already finished.
        }
      });
    const wanted = new Set(
      taps.filter((tap) => tap.at - now <= SCHEDULE_AHEAD_MS && tap.at - now > -500).map((tap) => tap.key),
    );
    for (const [key, tones] of scheduled.current) {
      const at = Number(key.split(":")[2]);
      if (!wanted.has(key) && at > now) {
        stop(tones);
        scheduled.current.delete(key);
      } else if (at < now - 2000) {
        scheduled.current.delete(key);
      }
    }
    if (!soundEnabled || !context || context.state !== "running") return;
    const audioNow = context.currentTime;
    taps.forEach((tap, index) => {
      if (!wanted.has(tap.key) || scheduled.current.has(tap.key)) return;
      const msUntil = tap.at - now;
      // Ticks that would fall before the previous tap are left out, so
      // close taps play "3, 2, 1, SEND, tick, tick, SPEED UP".
      const previous = index > 0 ? taps[index - 1].at : -Infinity;
      const beeps = [
        ...COUNTDOWN_TICKS_MS.filter((before) => tap.at - before > previous + 300).map((before) => ({
          at: msUntil - before,
          frequency: TICK_HZ,
          duration: 0.08,
        })),
        ...(tap.kind === "send"
          ? [{ at: msUntil, frequency: SEND_HZ, duration: 0.35 }]
          : [
              { at: msUntil, frequency: SPEEDUP_HZ, duration: 0.12 },
              { at: msUntil + 180, frequency: SPEEDUP_HZ, duration: 0.12 },
            ]),
      ].filter((beep) => beep.at > -50);
      scheduled.current.set(
        tap.key,
        beeps.map((beep) =>
          playTone(context, audioNow + Math.max(0, beep.at) / 1000, beep.frequency, beep.duration),
        ),
      );
    });
  }, [now, soundEnabled, taps]);

  // Sound off: silence beeps already on the audio clock.
  useEffect(() => {
    if (soundEnabled) return;
    for (const tones of scheduled.current.values()) {
      tones.forEach((tone) => {
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
    taps.forEach((tap) => {
      const msRemaining = tap.at - now;
      if (msRemaining > 0 || msRemaining < -1000 || alertedTaps.current.has(tap.key)) {
        return;
      }
      alertedTaps.current.add(tap.key);
      if (
        !notificationsEnabled ||
        !("Notification" in window) ||
        Notification.permission !== "granted"
      ) {
        return;
      }
      showSystemNotification(
        tap.kind === "send"
          ? t("SEND REINFORCEMENTS NOW")
          : t("SPEED UP {percent}% NOW", { percent: tap.percent ?? 25 }),
        {
          body: t("March {number}", { number: tap.march }),
          tag: `tap-${tap.key}`,
        },
      );
    });
  }, [notificationsEnabled, now, t, taps]);

  return {
    playerX,
    setPlayerX,
    playerY,
    setPlayerY,
    sendEarlyMs,
    setSendEarlyMs,
    landAfterMs,
    setLandAfterMs,
    speedupMode,
    setSpeedupMode,
    speedupDelayMs,
    setSpeedupDelayMs,
    testSound,
    playerPetActive,
    setPlayerPetActive,
    soundEnabled,
    setSoundEnabled,
    notificationsEnabled,
    enableNotifications,
    playerMarchTime,
    landingWindows,
    upcomingTaps,
    marchFor,
    marchNumber,
    getSendTime,
    getMsUntilSend,
    getMsUntilNextTap,
    getSendStatus,
  };
}

export type ReinforcementTiming = ReturnType<typeof useReinforcementTiming>;
