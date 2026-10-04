"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { useLanguage } from "@/components/LanguageProvider";
import { useStates } from "@/components/StateProvider";
import type { UpcomingSvs } from "@/lib/attendance";
import { createClient } from "@/lib/supabase/client";
import type {
  OpponentAlliance,
  StateSummary,
  SvsRecord,
} from "@/lib/wosOracleState";

type Intel = {
  opponent_state: number;
  opponent: StateSummary;
  opponent_svs: SvsRecord;
  own: StateSummary;
  fetched_at: string;
};

const RECORD_FIELDS: { key: string; label: string }[] = [
  { key: "battle_wins", label: "Battle wins" },
  { key: "battle_losses", label: "Battle losses" },
  { key: "prep_wins", label: "Prep wins" },
  { key: "prep_losses", label: "Prep losses" },
  { key: "castles_taken", label: "Castles taken" },
  { key: "castles_lost", label: "Castles lost" },
];

function totalPower(alliances: OpponentAlliance[]) {
  return alliances.reduce((sum, alliance) => sum + alliance.power, 0);
}

export default function IntelPage() {
  const { t, formatNumber, formatDateTime } = useLanguage();
  const { activeMembership, loadingStates } = useStates();
  const supabase = useMemo(() => createClient(), []);
  const [svs, setSvs] = useState<UpcomingSvs | null>(null);
  const [intel, setIntel] = useState<Intel | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!activeMembership) return;
    setLoading(true);
    const { data } = await supabase.rpc("get_upcoming_svs", {
      target_state_id: activeMembership.stateId,
    });
    const upcoming = ((data ?? []) as UpcomingSvs[])[0] ?? null;
    setSvs(upcoming);
    if (upcoming) {
      const { data: intelRow } = await supabase
        .from("battle_intel")
        .select("opponent_state, opponent, opponent_svs, own, fetched_at")
        .eq("plan_id", upcoming.plan_id)
        .maybeSingle();
      setIntel((intelRow as Intel | null) ?? null);
    } else {
      setIntel(null);
    }
    setLoading(false);
  }, [activeMembership, supabase]);

  useEffect(() => {
    const loadId = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(loadId);
  }, [load]);

  if (loadingStates || (activeMembership && loading)) {
    return (
      <main>
        <AppHeader />
        <section className="loading-panel">
          <p>{t("Loading intel...")}</p>
        </section>
      </main>
    );
  }

  if (!activeMembership || !svs || !intel) {
    return (
      <main>
        <AppHeader />
        <section className="empty-state">
          <h2>{t("Opponent intel")}</h2>
          <p>
            {svs
              ? t(
                  "The opponent is drawn but intel has not been collected yet. It appears after the next automatic WOSOracle check.",
                )
              : t(
                  "Intel appears automatically once the SvS opponent is drawn.",
                )}
          </p>
        </section>
      </main>
    );
  }

  const { opponent, own } = intel;
  const opponentPower = totalPower(opponent.alliances);
  const ownPower = totalPower(own.alliances);
  const rows = Math.max(opponent.alliances.length, own.alliances.length);
  const hasLabyrinth = opponent.topPlayers.some(
    (player) => typeof player.labyrinthScore === "number",
  );

  return (
    <main>
      <AppHeader />
      <section className="overwatch-hero">
        <div>
          <p className="section-label">{t("Opponent intel")}</p>
          <h1>{t("State {opponent}", { opponent: intel.opponent_state })}</h1>
          <p>
            {t("Battle starts {date}.", {
              date: formatDateTime(svs.battle_at),
            })}{" "}
            {t("Data from WOSOracle, updated {date}.", {
              date: formatDateTime(intel.fetched_at),
            })}
          </p>
        </div>
      </section>

      <section>
        <h2>{t("Top alliances")}</h2>
        <p>
          {t("Combined power of the top alliances: them {them}, us {us}.", {
            them: formatNumber(opponentPower),
            us: formatNumber(ownPower),
          })}
        </p>
        <div className="intel-table-wrap">
          <table className="intel-table">
            <thead>
              <tr>
                <th>#</th>
                <th>
                  {t("State {opponent}", { opponent: opponent.stateNumber })}
                </th>
                <th>{t("Power")}</th>
                <th>{t("Our state")}</th>
                <th>{t("Power")}</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: rows }, (_, index) => {
                const theirs = opponent.alliances[index];
                const ours = own.alliances[index];
                return (
                  <tr key={index}>
                    <td>{index + 1}</td>
                    <td>{theirs ? `[${theirs.abbr}] ${theirs.name}` : "—"}</td>
                    <td>{theirs ? formatNumber(theirs.power) : "—"}</td>
                    <td>{ours ? `[${ours.abbr}] ${ours.name}` : "—"}</td>
                    <td>{ours ? formatNumber(ours.power) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>{t("Their likely rally leads")}</h2>
        {opponent.topPlayers.length === 0 ? (
          <p>{t("No player data yet.")}</p>
        ) : (
          <>
            {hasLabyrinth && (
              <p>
                {t(
                  "Their strongest players, best Labyrinth score first: the best sign of who leads their rallies.",
                )}
              </p>
            )}
            <div className="intel-table-wrap">
              <table className="intel-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{t("Player")}</th>
                    {hasLabyrinth && <th>{t("Labyrinth score")}</th>}
                    <th>{t("Power")}</th>
                  </tr>
                </thead>
                <tbody>
                  {opponent.topPlayers.map((player, index) => (
                    <tr key={player.wosId ?? player.name}>
                      <td>{index + 1}</td>
                      <td>
                        {player.allianceAbbr && `[${player.allianceAbbr}] `}
                        <strong>{player.name}</strong>
                      </td>
                      {hasLabyrinth && (
                        <td>
                          {typeof player.labyrinthScore === "number"
                            ? formatNumber(player.labyrinthScore)
                            : "—"}
                        </td>
                      )}
                      <td>{formatNumber(player.power)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section>
        <h2>{t("Their SvS record")}</h2>
        <div className="player-data-grid">
          {RECORD_FIELDS.map((field) => (
            <span key={field.key}>
              {t(field.label)}
              <strong>{intel.opponent_svs.record[field.key] ?? "—"}</strong>
            </span>
          ))}
        </div>
        {intel.opponent_svs.recent.length > 0 && (
          <ul>
            {intel.opponent_svs.recent.map((match) => (
              <li key={match.battleAt}>
                {formatDateTime(match.battleAt)} —{" "}
                {match.opponent
                  ? t("vs state {opponent}", { opponent: match.opponent })
                  : "—"}{" "}
                — {t("Prep")}{" "}
                {match.prepWon === null
                  ? "?"
                  : match.prepWon
                    ? t("won")
                    : t("lost")}
                , {t("Battle")}{" "}
                {match.battleWon === null
                  ? "?"
                  : match.battleWon
                    ? t("won")
                    : t("lost")}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
