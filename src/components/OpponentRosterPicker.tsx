"use client";

import { useState } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import type {
  OpponentAlliance,
  RosterMember,
  StateSummary,
} from "@/lib/wosOracleState";

export type PickedEnemy = {
  member: RosterMember;
  alliance: OpponentAlliance;
};

type OpponentResponse = {
  error?: string;
  opponent?: number;
  source?: "plan" | "draw" | "manual";
  alliances?: OpponentAlliance[];
  topPlayers?: StateSummary["topPlayers"];
};

// Lets rally callers choose enemy leaders from the opponent state's alliance
// rosters on WOSOracle instead of typing names.
export function OpponentRosterPicker({
  stateId,
  onPick,
}: {
  stateId: string;
  onPick: (picked: PickedEnemy) => void;
}) {
  const { t, formatNumber } = useLanguage();
  const [opponentInput, setOpponentInput] = useState("");
  const [opponent, setOpponent] = useState<number | null>(null);
  const [source, setSource] = useState<OpponentResponse["source"]>();
  const [alliances, setAlliances] = useState<OpponentAlliance[]>([]);
  const [topPlayers, setTopPlayers] = useState<StateSummary["topPlayers"]>([]);
  const [selectedAlliance, setSelectedAlliance] =
    useState<OpponentAlliance | null>(null);
  const [members, setMembers] = useState<RosterMember[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadOpponent() {
    setLoading(true);
    setError("");
    setSelectedAlliance(null);
    setMembers([]);
    try {
      const params = new URLSearchParams({ stateId });
      if (/^[0-9]+$/.test(opponentInput.trim())) {
        params.set("opponent", opponentInput.trim());
      }
      const response = await fetch(`/api/oracle/opponent?${params}`);
      const result = (await response.json()) as OpponentResponse;
      if (!response.ok || !result.opponent) {
        setError(result.error || t("The opponent could not be loaded."));
        return;
      }
      setOpponent(result.opponent);
      setOpponentInput(String(result.opponent));
      setSource(result.source);
      setAlliances(result.alliances ?? []);
      setTopPlayers(result.topPlayers ?? []);
    } catch {
      setError(t("The opponent could not be loaded."));
    } finally {
      setLoading(false);
    }
  }

  async function loadRoster(alliance: OpponentAlliance) {
    if (!opponent) return;
    setSelectedAlliance(alliance);
    setMembers([]);
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        stateId,
        allianceId: String(alliance.id),
        stateNumber: String(opponent),
      });
      const response = await fetch(`/api/oracle/roster?${params}`);
      const result = (await response.json()) as {
        error?: string;
        members?: RosterMember[];
      };
      if (!response.ok) {
        setError(result.error || t("The roster could not be loaded."));
        return;
      }
      setMembers(result.members ?? []);
    } catch {
      setError(t("The roster could not be loaded."));
    } finally {
      setLoading(false);
    }
  }

  const query = search.trim().toLowerCase();
  const visibleMembers = members.filter(
    (member) =>
      !query ||
      member.name.toLowerCase().includes(query) ||
      member.wosId?.includes(query),
  );

  return (
    <div className="opponent-roster-picker">
      <h3>{t("Pick an enemy rally leader")}</h3>
      <div className="invite-form">
        <label>
          {t("Opponent state")}
          <input
            type="text"
            inputMode="numeric"
            value={opponentInput}
            onChange={(event) => setOpponentInput(event.target.value)}
            placeholder={t("Auto from battle plan")}
          />
        </label>
        <button
          type="button"
          disabled={loading}
          onClick={() => void loadOpponent()}
        >
          {t("Load their top players")}
        </button>
      </div>
      {opponent && (
        <p>
          {t("State {opponent}", { opponent })}
          {source === "plan" && t(" — from the battle plan")}
          {source === "draw" && t(" — from the SvS draw")}
        </p>
      )}
      {error && <p className="auth-message">{error}</p>}

      {topPlayers.length > 0 && (
        <>
          <p>
            {t("Their {count} strongest players", {
              count: topPlayers.length,
            })}
          </p>
          <ul className="roster-list">
            {topPlayers.map((player, index) => (
              <li key={player.wosId ?? player.name}>
                <span>
                  {index + 1}.{" "}
                  {player.allianceAbbr && `[${player.allianceAbbr}] `}
                  <strong>{player.name}</strong> — {formatNumber(player.power)}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onPick({
                      member: {
                        wosId:
                          player.wosId && /^[0-9]+$/.test(player.wosId)
                            ? player.wosId
                            : null,
                        name: player.name,
                        power: player.power,
                        furnaceLevel: player.furnaceLevel,
                        rank: 0,
                      },
                      alliance: alliances.find(
                        (alliance) => alliance.abbr === player.allianceAbbr,
                      ) ?? {
                        id: 0,
                        abbr: player.allianceAbbr,
                        name: player.allianceAbbr,
                        power: 0,
                        memberCount: 0,
                      },
                    })
                  }
                >
                  {t("Use")}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {alliances.length > 0 && (
        <details className="roster-search">
          <summary>
            {t("Not in the top {count}? Search an alliance roster", {
              count: topPlayers.length || 20,
            })}
          </summary>
          <label>
            {t("Alliance")}
            <select
              value={selectedAlliance?.id ?? ""}
              onChange={(event) => {
                const alliance = alliances.find(
                  (item) => item.id === Number(event.target.value),
                );
                if (alliance) void loadRoster(alliance);
              }}
            >
              <option value="">{t("Select alliance")}</option>
              {alliances.map((alliance) => (
                <option key={alliance.id} value={alliance.id}>
                  [{alliance.abbr}] {alliance.name} —{" "}
                  {formatNumber(alliance.power)}
                </option>
              ))}
            </select>
          </label>
          {selectedAlliance && members.length > 0 && (
            <>
              <label>
                {t("Search player")}
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              <ul className="roster-list">
                {visibleMembers.slice(0, 50).map((member) => (
                  <li key={member.wosId ?? member.name}>
                    <span>
                      <strong>{member.name}</strong>{" "}
                      {member.rank === 5 && t("(Leader)")} —{" "}
                      {formatNumber(member.power)}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        onPick({ member, alliance: selectedAlliance })
                      }
                    >
                      {t("Use")}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </details>
      )}
      {loading && <p>{t("Loading...")}</p>}
    </div>
  );
}
