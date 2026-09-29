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
import { createClient } from "@/lib/supabase/client";
import type { StateMembership, StateRole } from "@/types/state";

const ACTIVE_MEMBERSHIP_KEY = "wosvs-active-membership";

type StateContextValue = {
  memberships: StateMembership[];
  activeMembership: StateMembership | null;
  loadingStates: boolean;
  setActiveMembership: (key: string) => void;
  refreshMemberships: () => Promise<void>;
};

const StateContext = createContext<StateContextValue | null>(null);

export function StateProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const [memberships, setMemberships] = useState<StateMembership[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [loadingStates, setLoadingStates] = useState(true);

  const refreshMemberships = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setMemberships([]);
      setActiveKey(null);
      setLoadingStates(false);
      return;
    }

    const { data: accounts, error: accountsError } = await supabase
      .from("wos_accounts")
      .select("id, wos_id, nickname")
      .eq("user_id", user.id)
      .eq("is_configured", true);

    if (accountsError || !accounts || accounts.length === 0) {
      setMemberships([]);
      setActiveKey(null);
      setLoadingStates(false);
      return;
    }

    const accountIds = accounts.map((account) => account.id);
    const { data: memberRows, error: membershipsError } = await supabase
      .from("state_members")
      .select("state_id, wos_account_id, role")
      .in("wos_account_id", accountIds);

    if (membershipsError || !memberRows || memberRows.length === 0) {
      setMemberships([]);
      setActiveKey(null);
      setLoadingStates(false);
      return;
    }

    const stateIds = [...new Set(memberRows.map((row) => row.state_id))];
    const [{ data: states }, { data: battles }] = await Promise.all([
      supabase.from("states").select("id, name").in("id", stateIds),
      supabase
        .from("battles")
        .select("id, state_id")
        .in("state_id", stateIds)
        .eq("status", "active")
        .order("created_at", { ascending: false }),
    ]);

    const accountById = new Map(
      accounts.map((account) => [account.id, account])
    );
    const stateById = new Map(
      (states ?? []).map((state) => [state.id, state])
    );
    const battleByStateId = new Map<string, string>();
    (battles ?? []).forEach((battle) => {
      if (!battleByStateId.has(battle.state_id)) {
        battleByStateId.set(battle.state_id, battle.id);
      }
    });

    const nextMemberships = memberRows.flatMap((row) => {
      const account = accountById.get(row.wos_account_id);
      const state = stateById.get(row.state_id);
      if (!account || !state) return [];

      return [
        {
          key: `${row.state_id}:${row.wos_account_id}`,
          stateId: row.state_id,
          stateName: state.name,
          wosAccountId: row.wos_account_id,
          wosId: account.wos_id,
          wosNickname: account.nickname,
          role: row.role as StateRole,
          battleId: battleByStateId.get(row.state_id) ?? null,
        },
      ];
    });

    const savedKey = window.localStorage.getItem(ACTIVE_MEMBERSHIP_KEY);
    const matchingMembership = nextMemberships.find(
      (membership) => membership.key === savedKey
    );
    const nextKey = matchingMembership?.key ?? nextMemberships[0]?.key ?? null;

    setMemberships(nextMemberships);
    setActiveKey(nextKey);
    if (nextKey) {
      window.localStorage.setItem(ACTIVE_MEMBERSHIP_KEY, nextKey);
    } else {
      window.localStorage.removeItem(ACTIVE_MEMBERSHIP_KEY);
    }
    setLoadingStates(false);
  }, [supabase]);

  useEffect(() => {
    const initialLoadId = window.setTimeout(() => {
      void refreshMemberships();
    }, 0);

    const { data } = supabase.auth.onAuthStateChange(() => {
      window.setTimeout(() => {
        void refreshMemberships();
      }, 0);
    });

    return () => {
      window.clearTimeout(initialLoadId);
      data.subscription.unsubscribe();
    };
  }, [refreshMemberships, supabase]);

  function setActiveMembership(key: string) {
    if (!memberships.some((membership) => membership.key === key)) return;
    window.localStorage.setItem(ACTIVE_MEMBERSHIP_KEY, key);
    setActiveKey(key);
  }

  const activeMembership =
    memberships.find((membership) => membership.key === activeKey) ?? null;

  return (
    <StateContext.Provider
      value={{
        memberships,
        activeMembership,
        loadingStates,
        setActiveMembership,
        refreshMemberships,
      }}
    >
      {children}
    </StateContext.Provider>
  );
}

export function useStates() {
  const context = useContext(StateContext);
  if (!context) {
    throw new Error("useStates must be used inside StateProvider");
  }
  return context;
}
