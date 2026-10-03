"use client";

import { useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { AutofillPriorityEditor } from "@/components/planning/AutofillPriorityEditor";
import { FORMATION_PRESETS } from "@/components/planning/RallySetupEditor";
import { AUTOFILL_CRITERIA, type AutofillCriterion } from "@/lib/autofill";
import { HEROES, LATEST_HERO_GENERATION } from "@/lib/heroes";
import { createClient } from "@/lib/supabase/client";

type Settings = {
  auto_plan: boolean;
  auto_publish: boolean;
  rally_count: number;
  rally_size: number;
  default_formation: string | null;
  default_joiner_heroes: string[];
  autofill_priorities: string[] | null;
};

const FORMATION = /^(\d{1,3})\/(\d{1,3})\/(\d{1,3})$/;

// How the automation prepares each SvS for this state (State management).
export function AutomationSettingsCard({
  stateId,
  heroGeneration,
}: {
  stateId: string;
  heroGeneration: number | null;
}) {
  const { t } = useLanguage();
  const supabase = useMemo(() => createClient(), []);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [formation, setFormation] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    void supabase
      .from("states")
      .select(
        "auto_plan, auto_publish, rally_count, rally_size, default_formation, default_joiner_heroes, autofill_priorities",
      )
      .eq("id", stateId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setMessage(
            error.code === "42703"
              ? t("Run the latest database migration to use automatic planning.")
              : error.message,
          );
          return;
        }
        if (data) {
          setSettings(data as Settings);
          setFormation(data.default_formation ?? "");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [stateId, supabase, t]);

  const heroes = HEROES.filter(
    (hero) => hero.generation <= (heroGeneration ?? LATEST_HERO_GENERATION),
  ).sort(
    (first, second) =>
      second.generation - first.generation ||
      first.name.localeCompare(second.name),
  );

  async function save(patch: Partial<Settings>) {
    if (!settings) return;
    setSettings({ ...settings, ...patch });
    const { error } = await supabase.rpc("set_state_automation", {
      target_state_id: stateId,
      settings: patch,
    });
    setMessage(error ? error.message : t("Automation saved."));
  }

  function saveFormation(value: string) {
    const trimmed = value.trim();
    const match = FORMATION.exec(trimmed);
    if (
      trimmed &&
      (!match || Number(match[1]) + Number(match[2]) + Number(match[3]) !== 100)
    ) {
      setMessage(
        t(
          "Use Infantry/Lancer/Marksman percentages that add up to 100, like 50/20/30.",
        ),
      );
      return;
    }
    void save({ default_formation: trimmed || null });
  }

  if (!settings) {
    return (
      <section>
        <h2>{t("SvS automation")}</h2>
        {message && <p className="page-message">{message}</p>}
      </section>
    );
  }

  const slots = Array.from(
    { length: 4 },
    (_, index) => settings.default_joiner_heroes[index] ?? "",
  );

  return (
    <section>
      <h2>{t("SvS automation")}</h2>
      <p>
        {t(
          "After the draw, the app reminds members to vote 30 hours before the battle, sets up and fills the rallies 24 hours before, adds late voters every hour and publishes 6 hours before. You can change anything by hand in Planning.",
        )}
      </p>
      <div className="automation-grid">
        <label className="capability-toggle">
          <input
            type="checkbox"
            checked={settings.auto_plan}
            onChange={(event) => void save({ auto_plan: event.target.checked })}
          />
          <span>{t("Set up and fill rallies automatically")}</span>
        </label>
        <label className="capability-toggle">
          <input
            type="checkbox"
            checked={settings.auto_publish}
            onChange={(event) =>
              void save({ auto_publish: event.target.checked })
            }
          />
          <span>{t("Publish automatically 6 hours before the battle")}</span>
        </label>
        <label>
          {t("Number of rallies")}
          <input
            type="number"
            min={1}
            max={30}
            value={settings.rally_count}
            onChange={(event) =>
              setSettings({ ...settings, rally_count: Number(event.target.value) })
            }
            onBlur={(event) =>
              void save({
                rally_count: Math.min(30, Math.max(1, Number(event.target.value) || 1)),
              })
            }
          />
        </label>
        <label>
          {t("Players per rally (with leader)")}
          <input
            type="number"
            min={2}
            max={100}
            value={settings.rally_size}
            onChange={(event) =>
              setSettings({ ...settings, rally_size: Number(event.target.value) })
            }
            onBlur={(event) =>
              void save({
                rally_size: Math.min(100, Math.max(2, Number(event.target.value) || 2)),
              })
            }
          />
        </label>
        <label>
          {t("Default formation (Inf/Lan/Mark %)")}
          <input
            type="text"
            list="automation-formations"
            placeholder="50/20/30"
            value={formation}
            onChange={(event) => setFormation(event.target.value)}
            onBlur={(event) => saveFormation(event.target.value)}
          />
          <datalist id="automation-formations">
            {FORMATION_PRESETS.map((preset) => (
              <option key={preset} value={preset} />
            ))}
          </datalist>
        </label>
      </div>
      <p className="form-hint">{t("Default joiner heroes for every rally")}</p>
      <div className="automation-grid">
        {slots.map((value, index) => (
          <select
            key={index}
            aria-label={t("Joiner hero {number}", { number: index + 1 })}
            value={value}
            onChange={(event) => {
              const next = [...slots];
              next[index] = event.target.value;
              const unique = next.filter(
                (hero, position) => hero && next.indexOf(hero) === position,
              );
              void save({ default_joiner_heroes: unique });
            }}
          >
            <option value="">{t("None")}</option>
            {heroes.map((hero) => (
              <option key={hero.name} value={hero.name}>
                {hero.name}
              </option>
            ))}
          </select>
        ))}
      </div>
      <h3>{t("Who goes in which rally")}</h3>
      <p className="form-hint">
        {t(
          "Auto-fill only places players who can play the rally's half, and gives each a joiner hero they have at 4★. Then it weighs players in this order:",
        )}
      </p>
      <AutofillPriorityEditor
        priorities={(
          settings.autofill_priorities ?? ["hero_match", "equal_power", "fc"]
        ).filter((value): value is AutofillCriterion =>
          AUTOFILL_CRITERIA.some((criterion) => criterion.value === value),
        )}
        onChange={(next) => void save({ autofill_priorities: next })}
      />
      {message && <p className="page-message">{message}</p>}
    </section>
  );
}
