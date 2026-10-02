"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { PET_DURATION_MS } from "@/lib/battleDisplay";
import { syncServerClock, type ClockSync } from "@/lib/serverClock";
import { createClient } from "@/lib/supabase/client";
import { useStates } from "@/components/StateProvider";
import type {
  EnemyLeader,
  EnemyLeaderDetails,
  EnemyRally,
} from "@/types/rally";

type NewRally = Omit<EnemyRally, "id">;

type BattleContextValue = {
  enemyLeaders: EnemyLeader[];
  rallies: EnemyRally[];
  currentTime: Date;
  clockSync: ClockSync | null;
  resyncClock: () => Promise<void>;
  loading: boolean;
  addEnemyLeader: (
    name: string,
    x: number,
    y: number,
    petActive: boolean,
    details?: EnemyLeaderDetails
  ) => Promise<string | null>;
  toggleEnemyLeaderPet: (id: number) => Promise<string | null>;
  updateEnemyLeader: (
    id: number,
    name: string,
    x: number,
    y: number,
    petActive: boolean
  ) => Promise<string | null>;
  removeEnemyLeader: (id: number) => Promise<string | null>;
  addRally: (
    rally: NewRally,
    enemyLeaderId: number
  ) => Promise<string | null>;
  removeRally: (id: number) => Promise<string | null>;
};

const BattleContext = createContext<BattleContextValue | null>(
  null
);

export function BattleProvider({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = useMemo(() => createClient(), []);
  const { activeMembership, loadingStates } = useStates();
  const activeStateId = activeMembership?.stateId ?? null;
  const activeBattleId = activeMembership?.battleId ?? null;
  const [enemyLeaders, setEnemyLeaders] = useState<
    EnemyLeader[]
  >([]);
  const [rallies, setRallies] = useState<EnemyRally[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [clockSync, setClockSync] = useState<ClockSync | null>(null);
  const clockOffsetMs = clockSync?.offsetMs ?? 0;
  const [loading, setLoading] = useState(true);

  const loadBattleData = useCallback(async () => {
    if (loadingStates) return;

    if (!activeStateId || !activeBattleId) {
      setEnemyLeaders([]);
      setRallies([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const [leadersResult, ralliesResult] = await Promise.all([
      supabase
        .from("enemy_leaders")
        .select(
          "id, name, x, y, pet_expires_at, wos_id, power, alliance_abbr"
        )
        .eq("battle_id", activeBattleId)
        .order("name"),
      supabase
        .from("rallies")
        .select(
          "id, enemy_name, x, y, march_time, impact_time, pet_active"
        )
        .eq("battle_id", activeBattleId)
        .is("cancelled_at", null)
        .order("impact_time"),
    ]);

    if (leadersResult.error) {
      console.error(leadersResult.error);
    } else {
      setEnemyLeaders(
        leadersResult.data.map((leader) => ({
          id: leader.id,
          name: leader.name,
          x: leader.x,
          y: leader.y,
          petExpiresAt: leader.pet_expires_at
            ? new Date(leader.pet_expires_at).getTime()
            : null,
          wosId: leader.wos_id ?? null,
          power: leader.power ?? null,
          allianceAbbr: leader.alliance_abbr ?? null,
        }))
      );
    }

    if (ralliesResult.error) {
      console.error(ralliesResult.error);
    } else {
      setRallies(
        ralliesResult.data
          .map((rally) => ({
            id: rally.id,
            enemyName: rally.enemy_name,
            x: rally.x,
            y: rally.y,
            marchTime: rally.march_time,
            impactTime: new Date(rally.impact_time),
            petActive: rally.pet_active,
          }))
      );
    }

    setLoading(false);
  }, [activeBattleId, activeStateId, loadingStates, supabase]);

  useEffect(() => {
    const initialLoadId = window.setTimeout(() => {
      void loadBattleData();
    }, 0);

    if (!activeStateId || !activeBattleId) {
      return () => window.clearTimeout(initialLoadId);
    }

    const channel = supabase
      .channel(`wosvs-battle-data-${activeStateId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "enemy_leaders",
          filter: `battle_id=eq.${activeBattleId}`,
        },
        () => void loadBattleData()
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "rallies",
          filter: `battle_id=eq.${activeBattleId}`,
        },
        () => void loadBattleData()
      )
      .subscribe();

    return () => {
      window.clearTimeout(initialLoadId);
      void supabase.removeChannel(channel);
    };
  }, [activeBattleId, activeStateId, loadBattleData, supabase]);

  const resyncClock = useCallback(async () => {
    const result = await syncServerClock();
    if (result) setClockSync(result);
  }, []);

  // Every device times against the same server clock instead of its own,
  // so a phone that is a few seconds off still sends at the right moment.
  useEffect(() => {
    const initialSyncId = window.setTimeout(() => void resyncClock(), 0);
    const resyncId = window.setInterval(
      () => void resyncClock(),
      10 * 60 * 1000,
    );
    const resyncWhenVisible = () => {
      if (document.visibilityState === "visible") void resyncClock();
    };
    document.addEventListener("visibilitychange", resyncWhenVisible);
    window.addEventListener("online", resyncWhenVisible);

    return () => {
      window.clearTimeout(initialSyncId);
      window.clearInterval(resyncId);
      document.removeEventListener("visibilitychange", resyncWhenVisible);
      window.removeEventListener("online", resyncWhenVisible);
    };
  }, [resyncClock]);

  useEffect(() => {
    const clockId = window.setInterval(() => {
      setCurrentTime(new Date(Date.now() + clockOffsetMs));
    }, 100);

    return () => {
      window.clearInterval(clockId);
    };
  }, [clockOffsetMs]);

  async function addEnemyLeader(
    name: string,
    x: number,
    y: number,
    petActive: boolean,
    details?: EnemyLeaderDetails
  ): Promise<string | null> {
    if (!activeStateId) return "Select a state first.";
    if (!activeBattleId) return "Start a battle period first.";
    const trimmedName = name.trim();
    if (!trimmedName) return "Enter the enemy leader's name.";
    if (x < 0 || x > 1199 || y < 0 || y > 1199) {
      return "Coordinates must be between 0 and 1199.";
    }

    const petExpiresAt = petActive
      ? new Date(
          currentTime.getTime() + PET_DURATION_MS
        ).toISOString()
      : null;
    const { error } = await supabase.from("enemy_leaders").insert({
      state_id: activeStateId,
      battle_id: activeBattleId,
      name: trimmedName,
      x,
      y,
      pet_expires_at: petExpiresAt,
      wos_id: details?.wosId ?? null,
      power: details?.power ?? null,
      alliance_abbr: details?.allianceAbbr ?? null,
    });

    if (error) {
      return error.code === "23505"
        ? "That enemy leader already exists."
        : error.message;
    }
    await loadBattleData();
    return null;
  }

  async function toggleEnemyLeaderPet(
    id: number
  ): Promise<string | null> {
    const leader = enemyLeaders.find((item) => item.id === id);
    if (!leader) return "Enemy leader not found.";

    const currentlyActive =
      leader.petExpiresAt !== null &&
      leader.petExpiresAt > currentTime.getTime();
    const petExpiresAt = currentlyActive
      ? null
      : new Date(
          currentTime.getTime() + PET_DURATION_MS
        ).toISOString();
    const { error } = await supabase
      .from("enemy_leaders")
      .update({ pet_expires_at: petExpiresAt })
      .eq("id", id);

    if (error) return error.message;
    await loadBattleData();
    return null;
  }

  async function updateEnemyLeader(
    id: number,
    name: string,
    x: number,
    y: number,
    petActive: boolean
  ): Promise<string | null> {
    const trimmedName = name.trim();
    if (!trimmedName) return "Enter the enemy leader's name.";
    if (x < 0 || x > 1199 || y < 0 || y > 1199) {
      return "Coordinates must be between 0 and 1199.";
    }

    const leader = enemyLeaders.find((item) => item.id === id);
    if (!leader) return "Enemy leader not found.";
    const existingPetActive =
      leader.petExpiresAt !== null &&
      leader.petExpiresAt > currentTime.getTime();
    const petExpiresAt = petActive
      ? existingPetActive
        ? new Date(leader.petExpiresAt!).toISOString()
        : new Date(
            currentTime.getTime() + PET_DURATION_MS
          ).toISOString()
      : null;
    const { error } = await supabase
      .from("enemy_leaders")
      .update({
        name: trimmedName,
        x,
        y,
        pet_expires_at: petExpiresAt,
      })
      .eq("id", id);

    if (error) {
      return error.code === "23505"
        ? "That enemy leader already exists."
        : error.message;
    }
    await loadBattleData();
    return null;
  }

  async function removeEnemyLeader(
    id: number
  ): Promise<string | null> {
    const { error } = await supabase
      .from("enemy_leaders")
      .delete()
      .eq("id", id);
    if (error) return error.message;
    await loadBattleData();
    return null;
  }

  async function addRally(
    rally: NewRally,
    enemyLeaderId: number
  ): Promise<string | null> {
    if (!activeBattleId) return "This state has no active battle.";
    const { error } = await supabase.from("rallies").insert({
      battle_id: activeBattleId,
      enemy_leader_id: enemyLeaderId,
      enemy_name: rally.enemyName,
      x: rally.x,
      y: rally.y,
      march_time: rally.marchTime,
      impact_time: rally.impactTime.toISOString(),
      pet_active: rally.petActive,
    });
    if (error) return error.message;
    await loadBattleData();
    return null;
  }

  async function removeRally(
    id: number
  ): Promise<string | null> {
    const { error } = await supabase
      .from("rallies")
      .update({ cancelled_at: currentTime.toISOString() })
      .eq("id", id);
    if (error) return error.message;
    await loadBattleData();
    return null;
  }

  return (
    <BattleContext.Provider
      value={{
        enemyLeaders,
        rallies,
        currentTime,
        clockSync,
        resyncClock,
        loading,
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
