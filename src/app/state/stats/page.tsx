"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { useStates } from "@/components/StateProvider";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/components/LanguageProvider";

type BattleHistoryRow = {
  battle_id: string;
  battle_name: string;
  battle_type: "svs" | "castle" | "test" | null;
  battle_status: "scheduled" | "active" | "completed" | "cancelled";
  battle_result: "win" | "loss" | null;
  scheduled_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  plan_id: string | null;
  rally_count: number;
  cancelled_rally_count: number;
  leader_count: number;
};

type StateOverviewRow = {
  player_count: number;
  wos_account_count: number;
};

export default function StateStatsPage() {
  const { t, formatDateTime } = useLanguage();
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
      supabase.rpc("get_state_battle_history_v2", {
        target_state_id: activeMembership.stateId,
        viewer_wos_account_id: activeMembership.wosAccountId,
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
      const overview = (overviewResult.data?.[0] ??
        null) as StateOverviewRow | null;
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
    0,
  );
  const completedBattles = history.filter(
    (battle) => battle.battle_status === "completed",
  ).length;

  return (
    <main>
      <AppHeader />
      {!activeMembership ? (
        <section>
          <h2>{t("State stats")}</h2>
          <p>{t("Select or join a state first.")}</p>
        </section>
      ) : (
        <>
          <section className="stats-heading">
            <div>
              <p className="section-label">{t("State record")}</p>
              <h1>{activeMembership.stateName}</h1>
              <p>{t("Battle activity retained across every battle period.")}</p>
            </div>
          </section>

          {message && <p className="page-message">{message}</p>}

          <section className="stat-grid">
            <div>
              <span>{t("Players")}</span>
              <strong>{loading ? "—" : playerCount}</strong>
            </div>
            <div>
              <span>{t("WOS accounts")}</span>
              <strong>{loading ? "—" : wosAccountCount}</strong>
            </div>
            <div>
              <span>{t("Rallies called")}</span>
              <strong>{loading ? "—" : totalRallies}</strong>
            </div>
            <div>
              <span>{t("Completed battles")}</span>
              <strong>{loading ? "—" : completedBattles}</strong>
            </div>
          </section>

          <section>
            <div className="section-title-row">
              <div>
                <p className="section-label">{t("Archive")}</p>
                <h2>{t("Battle history")}</h2>
              </div>
            </div>

            {loading ? (
              <p>{t("Loading battle history...")}</p>
            ) : history.length === 0 ? (
              <p>{t("No battle periods have been recorded yet.")}</p>
            ) : (
              <div className="history-list">
                {history.map((battle) => (
                  <article className="history-row" key={battle.battle_id}>
                    <div className="history-main">
                      <div>
                        <span className="battle-type-badge">
                          {battle.battle_type
                            ? battle.battle_type.toUpperCase()
                            : t("UNCLASSIFIED")}
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
                        {t(
                          battle.battle_status.charAt(0).toUpperCase() +
                            battle.battle_status.slice(1),
                        )}
                        {battle.battle_result &&
                          ` · ${t(
                            battle.battle_result.charAt(0).toUpperCase() +
                              battle.battle_result.slice(1),
                          )}`}
                      </span>
                    </div>
                    <dl className="history-details">
                      <div>
                        <dt>{t("Scheduled")}</dt>
                        <dd>
                          {battle.scheduled_at
                            ? formatDateTime(battle.scheduled_at)
                            : t("Not scheduled")}
                        </dd>
                      </div>
                      <div>
                        <dt>{t("Started")}</dt>
                        <dd>
                          {battle.started_at
                            ? formatDateTime(battle.started_at)
                            : t("Not started")}
                        </dd>
                      </div>
                      <div>
                        <dt>{t("Ended")}</dt>
                        <dd>
                          {battle.ended_at
                            ? formatDateTime(battle.ended_at)
                            : t("In progress")}
                        </dd>
                      </div>
                      <div>
                        <dt>{t("Rallies")}</dt>
                        <dd>{battle.rally_count}</dd>
                      </div>
                      <div>
                        <dt>{t("Cancelled")}</dt>
                        <dd>{battle.cancelled_rally_count}</dd>
                      </div>
                      <div>
                        <dt>{t("Leaders")}</dt>
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
