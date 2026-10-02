"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { createClient } from "@/lib/supabase/client";

type SvsState = {
  game_state_number: number | null;
  svs_opponent: number | null;
  svs_battle_at: string | null;
  svs_draw_expected_at: string | null;
  svs_next_battle_at: string | null;
  oracle_checked_at: string | null;
};

const BATTLE_DURATION_MS = 5 * 60 * 60 * 1000;

function daysUntil(target: string, now: number) {
  return Math.max(
    0,
    Math.ceil((new Date(target).getTime() - now) / 86_400_000),
  );
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
    const live =
      now >= battleStart && now < battleStart + BATTLE_DURATION_MS;
    headline = live
      ? t("SvS battle vs state {opponent} is live", {
          opponent: state.svs_opponent,
        })
      : t("SvS vs state {opponent} in {days} days", {
          opponent: state.svs_opponent,
          days: daysUntil(state.svs_battle_at, now),
        });
    detail = t("Battle starts {date}.", {
      date: formatDateTime(state.svs_battle_at),
    });
  } else if (state?.svs_draw_expected_at) {
    headline = t("SvS draw in {days} days", {
      days: daysUntil(state.svs_draw_expected_at, now),
    });
    detail = state.svs_next_battle_at
      ? t("Expected draw {draw}; next battle {battle}.", {
          draw: formatDateTime(state.svs_draw_expected_at),
          battle: formatDateTime(state.svs_next_battle_at),
        })
      : t("Expected draw {draw}.", {
          draw: formatDateTime(state.svs_draw_expected_at),
        });
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
