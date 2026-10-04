"use client";

import { useState } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import type { OpponentAlliance } from "@/lib/wosOracleState";

type AllianceOption = {
  id: number;
  abbr: string;
  name: string;
  memberCount: number;
  power?: number;
};

export function allianceDisplayName(alliance: { abbr: string; name: string }) {
  const label = alliance.abbr
    ? `[${alliance.abbr}] ${alliance.name || alliance.abbr}`
    : alliance.name;
  return label.slice(0, 40);
}

// Adds alliances from WOSOracle: the state's listed alliances, or any
// alliance by its id (shell alliances have no power and are never listed).
export function OracleAlliancePicker({
  stateId,
  existingNames,
  onAdd,
}: {
  stateId: string;
  existingNames: string[];
  onAdd: (name: string) => Promise<void>;
}) {
  const { t, formatNumber } = useLanguage();
  const [listed, setListed] = useState<AllianceOption[] | null>(null);
  const [allianceId, setAllianceId] = useState("");
  const [found, setFound] = useState<AllianceOption | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const existing = new Set(existingNames.map((name) => name.toLowerCase()));

  async function request<T>(url: string): Promise<T | null> {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(url);
      const result = (await response.json()) as T & { error?: string };
      if (!response.ok) {
        setMessage(result.error || t("WOSOracle could not be reached."));
        return null;
      }
      return result;
    } catch {
      setMessage(t("WOSOracle could not be reached."));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function loadListed() {
    const result = await request<{ alliances: OpponentAlliance[] }>(
      `/api/oracle/state-alliances?stateId=${stateId}`,
    );
    if (result) setListed(result.alliances);
  }

  async function lookUp() {
    if (!/^[0-9]+$/.test(allianceId.trim())) {
      setMessage(t("Enter a numeric alliance ID."));
      return;
    }
    const result = await request<{ alliance: AllianceOption }>(
      `/api/oracle/alliance?stateId=${stateId}&allianceId=${allianceId.trim()}`,
    );
    if (result) setFound(result.alliance);
  }

  function renderOption(alliance: AllianceOption) {
    const name = allianceDisplayName(alliance);
    const added = existing.has(name.toLowerCase());
    return (
      <li key={alliance.id}>
        <span>
          <strong>{name}</strong> ·{" "}
          {t("{count} members", { count: alliance.memberCount })}
          {alliance.power ? ` · ${formatNumber(alliance.power)}` : ""}
        </span>
        <button
          type="button"
          disabled={added || busy}
          onClick={() => void onAdd(name)}
        >
          {added ? t("Added") : t("Add")}
        </button>
      </li>
    );
  }

  return (
    <div className="oracle-alliance-picker">
      <h3>{t("Add from WOSOracle")}</h3>
      <div className="invite-form">
        <button type="button" disabled={busy} onClick={() => void loadListed()}>
          {t("Load your state's alliances")}
        </button>
        <label>
          {t("Alliance ID")}
          <input
            type="text"
            inputMode="numeric"
            value={allianceId}
            onChange={(event) => setAllianceId(event.target.value)}
            placeholder="9876"
          />
        </label>
        <button
          type="button"
          className="secondary-link"
          disabled={busy}
          onClick={() => void lookUp()}
        >
          {t("Look up")}
        </button>
      </div>
      <p className="form-hint">
        {t(
          "WOSOracle lists only your state's strongest alliances. Add shell alliances by their alliance ID, or type a name below.",
        )}
      </p>
      {found && <ul className="roster-list">{renderOption(found)}</ul>}
      {listed && (
        <ul className="roster-list">
          {listed.length ? (
            listed.map(renderOption)
          ) : (
            <li>{t("WOSOracle lists no alliances for your state yet.")}</li>
          )}
        </ul>
      )}
      {message && <p className="auth-message">{message}</p>}
    </div>
  );
}
