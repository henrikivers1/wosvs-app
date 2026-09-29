"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { groupRalliesIntoWaves } from "@/lib/battleDisplay";
import { calculateMarchTime } from "@/lib/marchTime";
import {
  calculateSecondsUntil,
  calculateSendTime,
} from "@/lib/reinforcementTime";
import type { EnemyRally, RallyWave } from "@/types/rally";

const HIDE_AFTER_SEND_MS = 3_000;

export function useReinforcementTiming(
  rallies: EnemyRally[],
  currentTime: Date
) {
  const [playerX, setPlayerX] = useState(600);
  const [playerY, setPlayerY] = useState(606);
  const [playerPetActive, setPlayerPetActive] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] =
    useState(false);
  const alertedWaves = useRef<Set<number>>(new Set());

  const playerMarchTime = calculateMarchTime(
    playerX,
    playerY,
    playerPetActive
  );
  const rallyWaves = useMemo(
    () =>
      groupRalliesIntoWaves(rallies).filter((wave) => {
        const sendTime = calculateSendTime(
          new Date(wave.impactSecond * 1000),
          playerMarchTime
        );

        return (
          currentTime.getTime() <
          sendTime.getTime() + HIDE_AFTER_SEND_MS
        );
      }),
    [currentTime, playerMarchTime, rallies]
  );

  function getSecondsUntilSend(wave: RallyWave): number {
    const sendTime = calculateSendTime(
      new Date(wave.impactSecond * 1000),
      playerMarchTime
    );
    return calculateSecondsUntil(sendTime, currentTime);
  }

  function getSendStatus(wave: RallyWave): string {
    const secondsRemaining = getSecondsUntilSend(wave);
    if (secondsRemaining > 0) {
      return `Send in ${secondsRemaining} seconds`;
    }
    if (secondsRemaining === 0) return "SEND NOW";
    return "Send time passed";
  }

  async function enableNotifications() {
    if (!("Notification" in window)) {
      window.alert("This browser does not support notifications.");
      return;
    }
    const permission = await Notification.requestPermission();
    setNotificationsEnabled(permission === "granted");
  }

  useEffect(() => {
    rallyWaves.forEach((wave) => {
      const sendTime = calculateSendTime(
        new Date(wave.impactSecond * 1000),
        playerMarchTime
      );
      const secondsRemaining = calculateSecondsUntil(
        sendTime,
        currentTime
      );
      const alreadyAlerted = alertedWaves.current.has(
        wave.impactSecond
      );

      if (
        secondsRemaining >= 0 &&
        secondsRemaining <= 1 &&
        !alreadyAlerted
      ) {
        alertedWaves.current.add(wave.impactSecond);

        if (soundEnabled) {
          const speechAlert = new SpeechSynthesisUtterance("Send now");
          window.speechSynthesis.speak(speechAlert);
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
    notificationsEnabled,
    playerMarchTime,
    rallyWaves,
    soundEnabled,
  ]);

  return {
    playerX,
    setPlayerX,
    playerY,
    setPlayerY,
    playerPetActive,
    setPlayerPetActive,
    soundEnabled,
    setSoundEnabled,
    notificationsEnabled,
    enableNotifications,
    playerMarchTime,
    rallyWaves,
    getSecondsUntilSend,
    getSendStatus,
  };
}
