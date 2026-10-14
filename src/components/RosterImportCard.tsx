"use client";

import { type ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { parseRoster, type RosterParse } from "@/lib/rosterImport";
import { createClient } from "@/lib/supabase/client";

// Admins import troop details and 4★ joiner heroes from another planning
// tool's roster CSV. Members are filled in now and as they join; what a
// player entered themselves is never overwritten.
export function RosterImportCard({ stateId }: { stateId: string }) {
  const { t } = useLanguage();
  const supabase = useMemo(() => createClient(), []);
  const [count, setCount] = useState<number | null>(null);
  const [preview, setPreview] = useState<RosterParse | null>(null);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const { data } = await supabase.rpc("state_roster_import_count", {
      target_state_id: stateId,
    });
    setCount(typeof data === "number" ? data : null);
  }, [stateId, supabase]);

  useEffect(() => {
    const loadId = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(loadId);
  }, [load]);

  async function pick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setMessage("");
    setPreview(null);
    if (!file) return;
    if (file.size > 5_000_000) {
      setMessage(t("The file is too large (over 5 MB)."));
      return;
    }
    setFileName(file.name);
    setPreview(parseRoster(await file.text()));
  }

  async function importRows() {
    if (!preview?.rows.length) return;
    setBusy(true);
    setMessage("");
    const { data, error } = await supabase.rpc("import_state_roster", {
      target_state_id: stateId,
      rows: preview.rows,
    });
    setBusy(false);
    if (error) {
      setMessage(t(error.message));
      return;
    }
    const result = (data ?? {}) as { saved?: number; filled?: number };
    setMessage(
      t("Saved {saved} players. {filled} members were filled in now; the rest are filled in when they join.", {
        saved: result.saved ?? 0,
        filled: result.filled ?? 0,
      }),
    );
    setPreview(null);
    setFileName("");
    void load();
  }

  return (
    <section className="roster-import-card">
      <h2>{t("Import player data")}</h2>
      <p>
        {t(
          "Moving from another planning tool? Import its roster CSV. Troop tiers, troop FC, T12 skill and 4★ joiner heroes are matched by WOS ID and filled in for members now and when they join. Anything a player entered themselves is kept.",
        )}
      </p>
      {count !== null && count > 0 && (
        <p className="form-hint">{t("{count} players imported so far.", { count })}</p>
      )}
      <label className="roster-import-file">
        {t("Roster CSV")}
        <input type="file" accept=".csv,text/csv" disabled={busy} onChange={(event) => void pick(event)} />
      </label>
      {preview?.error && <p className="form-hint">{t(preview.error)}</p>}
      {preview && !preview.error && (
        <div className="roster-import-preview">
          <p>
            <strong>{fileName}</strong>
            {" · "}
            {t("{players} players, {troops} with troop details, {heroes} with joiner heroes.", {
              players: preview.rows.length,
              troops: preview.withTroops,
              heroes: preview.withHeroes,
            })}
          </p>
          {preview.skipped > 0 && (
            <p className="form-hint">
              {t("{count} rows were skipped: no valid WOS ID.", { count: preview.skipped })}
            </p>
          )}
          {preview.unknownHeroes.length > 0 && (
            <p className="form-hint">
              {t("Unknown heroes left out: {names}", { names: preview.unknownHeroes.join(", ") })}
            </p>
          )}
          <button
            type="button"
            className="primary-button"
            disabled={busy || !preview.rows.length}
            onClick={() => void importRows()}
          >
            {busy ? t("Importing...") : t("Import {count} players", { count: preview.rows.length })}
          </button>
        </div>
      )}
      {message && <p className="form-hint">{message}</p>}
    </section>
  );
}
