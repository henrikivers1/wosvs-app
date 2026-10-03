"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { createClient } from "@/lib/supabase/client";
import { BATTLE_DURATION_MS } from "@/lib/svsTime";

type SvsState = {
  game_state_number: number | null;
  svs_opponent: number | null;
  svs_battle_at: string | null;
  svs_draw_expected_at: string | null;
  svs_next_battle_at: string | null;
  oracle_checked_at: string | null;
};


function timeUntil(
  target: string,
  now: number,
  t: (key: string, values?: Record<string, string | number>) => string,
) {
  const hours = (new Date(target).getTime() - now) / 3_600_000;
  if (hours >= 24) return t("in {days} days", { days: Math.floor(hours / 24) });
  if (hours >= 1) return t("in {hours} hours", { hours: Math.floor(hours) });
  return t("within the hour");
}

// SvS countdown and draw status from the data the automation job stores.
// Admins can ask the server to check WOSOracle immediately.
export function SvsStatus({
  stateId,
  canRunCheck = false,
  onChecked,
}: {
  stateId: string;
  canRunCheck?: boolean;
  onChecked?: () => void;
}) {
  const { t, formatDateTime } = useLanguage();
  const supabase = useMemo(() => createClient(), []);
  const [state, setState] = useState<SvsState | null>(null);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(0);
  const [battleActive, setBattleActive] = useState(false);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const firstTickId = window.setTimeout(tick, 0);
    const tickId = window.setInterval(tick, 60_000);
    return () => {
      window.clearTimeout(firstTickId);
      window.clearInterval(tickId);
    };
  }, []);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("states")
      .select(
        "game_state_number, svs_opponent, svs_battle_at, svs_draw_expected_at, svs_next_battle_at, oracle_checked_at",
      )
      .eq("id", stateId)
      .maybeSingle();
    setState((data as SvsState | null) ?? null);
    const { count } = await supabase
      .from("battles")
      .select("id", { count: "exact", head: true })
      .eq("state_id", stateId)
      .eq("status", "active");
    setBattleActive((count ?? 0) > 0);
  }, [stateId, supabase]);

  useEffect(() => {
    const loadId = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(loadId);
  }, [load]);

  async function runCheck() {
    setChecking(true);
    setMessage("");
    try {
      const response = await fetch("/api/automation/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stateId }),
      });
      const result = (await response.json()) as {
        error?: string;
        errors?: string[];
      };
      if (!response.ok) setMessage(result.error || t("The check failed."));
      else if (result.errors?.length) setMessage(result.errors.join(" "));
      else setMessage(t("WOSOracle checked."));
      await load();
      onChecked?.();
    } catch {
      setMessage(t("The check failed."));
    } finally {
      setChecking(false);
    }
  }

  let headline = t("SvS status unknown");
  let detail = "";
  if (state && !state.game_state_number) {
    detail = t("Set the in-game state number on State management.");
  } else if (state?.svs_opponent && state.svs_battle_at) {
    const battleStart = new Date(state.svs_battle_at).getTime();
    // Live Battle opens an hour early (11:00 UTC); the battle is live from
    // its start at 12:00 UTC.
    const live =
      now >= battleStart &&
      (battleActive || now < battleStart + BATTLE_DURATION_MS);
    headline = live
      ? t("SvS battle vs state {opponent} is live", {
          opponent: state.svs_opponent,
        })
      : battleActive
        ? t("Live Battle is open: SvS vs state {opponent} {when}", {
            opponent: state.svs_opponent,
            when: timeUntil(state.svs_battle_at, now, t),
          })
        : t("SvS vs state {opponent} {when}", {
          opponent: state.svs_opponent,
          when: timeUntil(state.svs_battle_at, now, t),
        });
    detail = t("Battle starts {date}.", {
      date: formatDateTime(state.svs_battle_at),
    });
  } else if (state?.svs_draw_expected_at) {
    const drawDue = now >= new Date(state.svs_draw_expected_at).getTime();
    headline = drawDue
      ? t("Waiting for the SvS draw")
      : t("SvS draw {when}", {
          when: timeUntil(state.svs_draw_expected_at, now, t),
        });
    const nextBattle = state.svs_next_battle_at
      ? ` ${t("Next battle {date}.", {
          date: formatDateTime(state.svs_next_battle_at),
        })}`
      : "";
    detail = drawDue
      ? t(
          "WOSOracle expected the draw {date} but has not published it yet. Checked every hour until it appears.",
          { date: formatDateTime(state.svs_draw_expected_at) },
        ) + nextBattle
      : t("Expected draw {date}.", {
          date: formatDateTime(state.svs_draw_expected_at),
        }) + nextBattle;
  } else if (state && !state.oracle_checked_at) {
    detail = t("Not checked with WOSOracle yet.");
  }

  return (
    <section className="svs-status">
      <p className="section-label">{t("SvS")}</p>
      <h2>{headline}</h2>
      {detail && <p>{detail}</p>}
      <p>
        {t(
          "Plans and battles are created, started and ended automatically from the WOSOracle draw.",
        )}
        {state?.oracle_checked_at &&
          ` ${t("Last checked {date}.", {
            date: formatDateTime(state.oracle_checked_at),
          })}`}
      </p>
      {canRunCheck && (
        <button
          type="button"
          disabled={checking}
          onClick={() => void runCheck()}
        >
          {checking ? t("Checking...") : t("Check WOSOracle now")}
        </button>
      )}
      {message && <p className="auth-message">{message}</p>}
    </section>
  );
}
