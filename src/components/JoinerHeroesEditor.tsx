"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { HEROES, LATEST_HERO_GENERATION } from "@/lib/heroes";
import { createClient } from "@/lib/supabase/client";

// "Which joiner heroes do you have at 4★ or higher?" — answered once per
// WOS account and used to give every rally member a hero they can bring.
export function JoinerHeroesEditor({
  wosAccountId,
  stateIds,
}: {
  wosAccountId: string;
  stateIds: string[];
}) {
  const { t, formatDateTime } = useLanguage();
  const supabase = useMemo(() => createClient(), []);
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [maxGeneration, setMaxGeneration] = useState(LATEST_HERO_GENERATION);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const stateKey = stateIds.join(",");

  const load = useCallback(async () => {
    const ids = stateKey ? stateKey.split(",") : [];
    const [heroResult, accountResult, stateResult] = await Promise.all([
      supabase
        .from("player_heroes")
        .select("hero")
        .eq("wos_account_id", wosAccountId),
      supabase
        .from("wos_accounts")
        .select("heroes_updated_at")
        .eq("id", wosAccountId)
        .maybeSingle(),
      ids.length
        ? supabase.from("states").select("hero_generation_max").in("id", ids)
        : Promise.resolve({ data: [], error: null }),
    ]);
    setOwned(
      new Set(
        ((heroResult.data ?? []) as { hero: string }[]).map((row) => row.hero),
      ),
    );
    setUpdatedAt(
      (accountResult.data as { heroes_updated_at: string | null } | null)
        ?.heroes_updated_at ?? null,
    );
    const generations = (
      (stateResult.data ?? []) as { hero_generation_max: number | null }[]
    )
      .map((row) => row.hero_generation_max)
      .filter((value): value is number => value !== null);
    setMaxGeneration(
      generations.length ? Math.max(...generations) : LATEST_HERO_GENERATION,
    );
  }, [stateKey, supabase, wosAccountId]);

  useEffect(() => {
    const loadId = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(loadId);
  }, [load]);

  function toggle(hero: string) {
    setOwned((current) => {
      const next = new Set(current);
      if (next.has(hero)) next.delete(hero);
      else next.add(hero);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setMessage("");
    const { error } = await supabase.rpc("set_player_heroes", {
      target_wos_account_id: wosAccountId,
      owned_heroes: [...owned],
    });
    setSaving(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage(t("Heroes saved."));
    await load();
  }

  const generations = Array.from(
    { length: maxGeneration },
    (_, index) => maxGeneration - index,
  );

  return (
    <details className="joiner-heroes-editor" open={!updatedAt}>
      <summary>
        {t("Joiner heroes at 4★ or higher")}
        {updatedAt ? (
          <small>
            {" "}
            · {t("{count} heroes", { count: owned.size })}
          </small>
        ) : (
          <small className="needs-answer"> · {t("Not filled in yet")}</small>
        )}
      </summary>
      <p className="form-hint">
        {t(
          "Tick every hero you have at 4 stars or more. Admins use this to give you a hero to join rallies with.",
        )}
      </p>
      {generations.map((generation) => (
        <div key={generation} className="hero-owned-generation">
          <small>{t("Gen {number}", { number: generation })}</small>
          <div className="hero-owned-grid">
            {HEROES.filter((hero) => hero.generation === generation).map(
              (hero) => (
                <label key={hero.name} className="hero-owned-option">
                  <input
                    type="checkbox"
                    checked={owned.has(hero.name)}
                    onChange={() => toggle(hero.name)}
                  />
                  {hero.name}
                </label>
              ),
            )}
          </div>
        </div>
      ))}
      <button
        type="button"
        className="save-button"
        disabled={saving}
        onClick={() => void save()}
      >
        {saving ? t("Saving...") : t("Save heroes")}
      </button>
      {updatedAt && (
        <small>
          {" "}
          {t("Last updated {date}", { date: formatDateTime(updatedAt) })}
        </small>
      )}
      {message && <p className="auth-message">{message}</p>}
    </details>
  );
}
