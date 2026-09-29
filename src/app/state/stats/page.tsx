"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { useStates } from "@/components/StateProvider";
import { createClient } from "@/lib/supabase/client";

type BattleHistoryRow = {
  battle_id: string;
  battle_name: string;
  battle_type: "svs" | "castle" | "test" | null;
  battle_status: "active" | "completed";
  started_at: string;
  ended_at: string | null;
  rally_count: number;
  cancelled_rally_count: number;
  leader_count: number;
};

type StateOverviewRow = {
  player_count: number;
  wos_account_count: number;
};

function formatDateTime(value: string | null): string {
  if (!value) return "In progress";
  return new Date(value).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function StateStatsPage() {
  const supabase = useMemo(() => createClient(), []);
  const { activeMembership, loadingStates } = useStates();
  const [history, setHistory] = useState<BattleHistoryRow[]>([]);
  const [playerCount, setPlayerCount] = useState(0);
  const [wosAccountCount, setWosAccountCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const loadStatistics = useCallback(async () => {
    if (loadingStates) return;
    if (!activeMembership) {
      setHistory([]);
      setPlayerCount(0);
      setWosAccountCount(0);
      setLoading(false);
      return;
    }

    setLoading(true);
    setMessage("");
    const [historyResult, overviewResult] = await Promise.all([
      supabase.rpc("get_state_battle_history", {
        target_state_id: activeMembership.stateId,
      }),
      supabase.rpc("get_state_overview", {
        target_state_id: activeMembership.stateId,
      }),
    ]);

    if (historyResult.error) {
      setMessage(historyResult.error.message);
      setHistory([]);
    } else {
      setHistory((historyResult.data ?? []) as BattleHistoryRow[]);
    }

    if (overviewResult.error) {
      setMessage(overviewResult.error.message);
      setPlayerCount(0);
      setWosAccountCount(0);
    } else {
      const overview = (overviewResult.data?.[0] ?? null) as
        | StateOverviewRow
        | null;
      setPlayerCount(Number(overview?.player_count ?? 0));
      setWosAccountCount(Number(overview?.wos_account_count ?? 0));
    }
    setLoading(false);
  }, [activeMembership, loadingStates, supabase]);

  useEffect(() => {
    const loadId = window.setTimeout(() => {
      void loadStatistics();
    }, 0);
    return () => window.clearTimeout(loadId);
  }, [loadStatistics]);

  const totalRallies = history.reduce(
    (total, battle) => total + Number(battle.rally_count),
    0
  );
  const completedBattles = history.filter(
    (battle) => battle.battle_status === "completed"
  ).length;

  return (
    <main>
      <AppHeader />
      {!activeMembership ? (
        <section>
          <h2>State stats</h2>
          <p>Select or join a state first.</p>
        </section>
      ) : (
        <>
          <section className="stats-heading">
            <div>
              <p className="section-label">State record</p>
              <h1>{activeMembership.stateName}</h1>
              <p>Battle activity retained across every battle period.</p>
            </div>
          </section>

          {message && <p className="page-message">{message}</p>}

          <section className="stat-grid">
            <div>
              <span>Players</span>
              <strong>{loading ? "—" : playerCount}</strong>
            </div>
            <div>
              <span>WOS accounts</span>
              <strong>{loading ? "—" : wosAccountCount}</strong>
            </div>
            <div>
              <span>Rallies called</span>
              <strong>{loading ? "—" : totalRallies}</strong>
            </div>
            <div>
              <span>Completed battles</span>
              <strong>{loading ? "—" : completedBattles}</strong>
            </div>
          </section>

          <section>
            <div className="section-title-row">
              <div>
                <p className="section-label">Archive</p>
                <h2>Battle history</h2>
              </div>
            </div>

            {loading ? (
              <p>Loading battle history...</p>
            ) : history.length === 0 ? (
              <p>No battle periods have been recorded yet.</p>
            ) : (
              <div className="history-list">
                {history.map((battle) => (
                  <article
                    className="history-row"
                    key={battle.battle_id}
                  >
                    <div className="history-main">
                      <div>
                        <span className="battle-type-badge">
                          {battle.battle_type
                            ? battle.battle_type.toUpperCase()
                            : "UNCLASSIFIED"}
                        </span>
                        <h3>{battle.battle_name}</h3>
                      </div>
                      <span
                        className={
                          battle.battle_status === "active"
                            ? "battle-state battle-state-active"
                            : "battle-state"
                        }
                      >
                        {battle.battle_status}
                      </span>
                    </div>
                    <dl className="history-details">
                      <div>
                        <dt>Started</dt>
                        <dd>{formatDateTime(battle.started_at)}</dd>
                      </div>
                      <div>
                        <dt>Ended</dt>
                        <dd>{formatDateTime(battle.ended_at)}</dd>
                      </div>
                      <div>
                        <dt>Rallies</dt>
                        <dd>{battle.rally_count}</dd>
                      </div>
                      <div>
                        <dt>Cancelled</dt>
                        <dd>{battle.cancelled_rally_count}</dd>
                      </div>
                      <div>
                        <dt>Leaders</dt>
                        <dd>{battle.leader_count}</dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
