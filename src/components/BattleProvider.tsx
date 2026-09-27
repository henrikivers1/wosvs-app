"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { PET_DURATION_MS } from "@/lib/battleDisplay";
import type { EnemyLeader, EnemyRally } from "@/types/rally";

type BattleContextValue = {
  enemyLeaders: EnemyLeader[];
  rallies: EnemyRally[];
  currentTime: Date;
  addEnemyLeader: (
    name: string,
    x: number,
    y: number,
    petActive: boolean
  ) => string | null;
  toggleEnemyLeaderPet: (id: number) => void;
  updateEnemyLeader: (
    id: number,
    name: string,
    x: number,
    y: number
  ) => string | null;
  removeEnemyLeader: (id: number) => void;
  addRally: (rally: Omit<EnemyRally, "id">) => void;
  removeRally: (id: number) => void;
};

const BattleContext = createContext<BattleContextValue | null>(
  null
);

export function BattleProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [enemyLeaders, setEnemyLeaders] = useState<
    EnemyLeader[]
  >([]);
  const [rallies, setRallies] = useState<EnemyRally[]>([]);
  const [nextLeaderId, setNextLeaderId] = useState(1);
  const [nextRallyId, setNextRallyId] = useState(1);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const now = new Date();
      setCurrentTime(now);
      setRallies((currentRallies) => {
        const activeRallies = currentRallies.filter(
          (rally) =>
            rally.impactTime.getTime() >= now.getTime() - 15_000
        );

        return activeRallies.length === currentRallies.length
          ? currentRallies
          : activeRallies;
      });
    }, 100);

    return () => window.clearInterval(intervalId);
  }, []);

  function addEnemyLeader(
    name: string,
    x: number,
    y: number,
    petActive: boolean
  ): string | null {
    const trimmedName = name.trim();

    if (!trimmedName) return "Enter the enemy leader's name.";
    if (x < 0 || x > 1199 || y < 0 || y > 1199) {
      return "Coordinates must be between 0 and 1199.";
    }
    if (
      enemyLeaders.some(
        (leader) =>
          leader.name.toLowerCase() === trimmedName.toLowerCase()
      )
    ) {
      return "That enemy leader already exists.";
    }

    const newLeader: EnemyLeader = {
      id: nextLeaderId,
      name: trimmedName,
      x,
      y,
      petExpiresAt: petActive
        ? currentTime.getTime() + PET_DURATION_MS
        : null,
    };

    setEnemyLeaders((leaders) =>
      [...leaders, newLeader].sort((a, b) =>
        a.name.localeCompare(b.name)
      )
    );
    setNextLeaderId((id) => id + 1);
    return null;
  }

  function toggleEnemyLeaderPet(id: number) {
    const now = currentTime.getTime();
    setEnemyLeaders((leaders) =>
      leaders.map((leader) => {
        if (leader.id !== id) return leader;
        const active =
          leader.petExpiresAt !== null &&
          leader.petExpiresAt > now;
        return {
          ...leader,
          petExpiresAt: active ? null : now + PET_DURATION_MS,
        };
      })
    );
  }

  function updateEnemyLeader(
    id: number,
    name: string,
    x: number,
    y: number
  ): string | null {
    const trimmedName = name.trim();

    if (!trimmedName) return "Enter the enemy leader's name.";
    if (x < 0 || x > 1199 || y < 0 || y > 1199) {
      return "Coordinates must be between 0 and 1199.";
    }
    if (
      enemyLeaders.some(
        (leader) =>
          leader.id !== id &&
          leader.name.toLowerCase() === trimmedName.toLowerCase()
      )
    ) {
      return "That enemy leader already exists.";
    }

    setEnemyLeaders((leaders) =>
      leaders
        .map((leader) =>
          leader.id === id
            ? { ...leader, name: trimmedName, x, y }
            : leader
        )
        .sort((a, b) => a.name.localeCompare(b.name))
    );
    return null;
  }

  function removeEnemyLeader(id: number) {
    setEnemyLeaders((leaders) =>
      leaders.filter((leader) => leader.id !== id)
    );
  }

  function addRally(rally: Omit<EnemyRally, "id">) {
    const newRally: EnemyRally = {
      ...rally,
      id: nextRallyId,
    };
    setRallies((currentRallies) =>
      [...currentRallies, newRally].sort(
        (a, b) =>
          a.impactTime.getTime() - b.impactTime.getTime()
      )
    );
    setNextRallyId((id) => id + 1);
  }

  function removeRally(id: number) {
    setRallies((currentRallies) =>
      currentRallies.filter((rally) => rally.id !== id)
    );
  }

  return (
    <BattleContext.Provider
      value={{
        enemyLeaders,
        rallies,
        currentTime,
        addEnemyLeader,
        toggleEnemyLeaderPet,
        updateEnemyLeader,
        removeEnemyLeader,
        addRally,
        removeRally,
      }}
    >
      {children}
    </BattleContext.Provider>
  );
}

export function useBattle() {
  const context = useContext(BattleContext);
  if (!context) {
    throw new Error("useBattle must be used inside BattleProvider");
  }
  return context;
}
