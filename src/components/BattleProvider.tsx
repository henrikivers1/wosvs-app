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
import { createClient } from "@/lib/supabase/client";
import type { EnemyLeader, EnemyRally } from "@/types/rally";

const DEVELOPMENT_STATE_ID =
  "00000000-0000-0000-0000-000000000001";
const DEVELOPMENT_BATTLE_ID =
  "00000000-0000-0000-0000-000000000002";

type NewRally = Omit<EnemyRally, "id">;

type BattleContextValue = {
  enemyLeaders: EnemyLeader[];
  rallies: EnemyRally[];
  currentTime: Date;
  loading: boolean;
  addEnemyLeader: (
    name: string,
    x: number,
    y: number,
    petActive: boolean
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
  const [enemyLeaders, setEnemyLeaders] = useState<
    EnemyLeader[]
  >([]);
  const [rallies, setRallies] = useState<EnemyRally[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [loading, setLoading] = useState(true);

  const loadBattleData = useCallback(async () => {
    const [leadersResult, ralliesResult] = await Promise.all([
      supabase
        .from("enemy_leaders")
        .select("id, name, x, y, pet_expires_at")
        .eq("state_id", DEVELOPMENT_STATE_ID)
        .order("name"),
      supabase
        .from("rallies")
        .select(
          "id, enemy_name, x, y, march_time, impact_time, pet_active"
        )
        .eq("battle_id", DEVELOPMENT_BATTLE_ID)
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
  }, [supabase]);

  useEffect(() => {
    const initialLoadId = window.setTimeout(() => {
      void loadBattleData();
    }, 0);

    const channel = supabase
      .channel("wosvs-battle-data")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "enemy_leaders",
        },
        () => void loadBattleData()
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "rallies",
        },
        () => void loadBattleData()
      )
      .subscribe();

    return () => {
      window.clearTimeout(initialLoadId);
      void supabase.removeChannel(channel);
    };
  }, [loadBattleData, supabase]);

  useEffect(() => {
    const clockId = window.setInterval(() => {
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

    const cleanupId = window.setInterval(() => {
      const cutoff = new Date(
        new Date().getTime() - 15_000
      ).toISOString();
      void supabase
        .from("rallies")
        .delete()
        .eq("battle_id", DEVELOPMENT_BATTLE_ID)
        .lt("impact_time", cutoff);
    }, 5_000);

    return () => {
      window.clearInterval(clockId);
      window.clearInterval(cleanupId);
    };
  }, [supabase]);

  async function addEnemyLeader(
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

    const petExpiresAt = petActive
      ? new Date(
          currentTime.getTime() + PET_DURATION_MS
        ).toISOString()
      : null;
    const { error } = await supabase.from("enemy_leaders").insert({
      state_id: DEVELOPMENT_STATE_ID,
      name: trimmedName,
      x,
      y,
      pet_expires_at: petExpiresAt,
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
    const { error } = await supabase.from("rallies").insert({
      battle_id: DEVELOPMENT_BATTLE_ID,
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
      .delete()
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
