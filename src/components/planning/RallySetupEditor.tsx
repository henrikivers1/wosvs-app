"use client";

import { useMemo, useState } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import type { GroupShift } from "@/lib/autofill";
import { HEROES, LATEST_HERO_GENERATION } from "@/lib/heroes";
import { createClient } from "@/lib/supabase/client";

const FORMATION_PRESETS = ["50/20/30", "40/20/40", "60/20/20", "34/33/33"];
const FORMATION = /^(\d{1,3})\/(\d{1,3})\/(\d{1,3})$/;

export type RallySetup = {
  id: string;
  formation: string | null;
  joiner_heroes: string[];
  shift: GroupShift;
};

// Formation, battle half and the four unique joiner heroes of one rally.
export function RallySetupEditor({
  group,
  heroGeneration,
  onSaved,
  onCancel,
}: {
  group: RallySetup;
  heroGeneration: number | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { t } = useLanguage();
  const supabase = useMemo(() => createClient(), []);
  const [formation, setFormation] = useState(group.formation ?? "");
  const [shift, setShift] = useState<GroupShift>(group.shift);
  const [slots, setSlots] = useState<string[]>(
    Array.from({ length: 4 }, (_, index) => group.joiner_heroes[index] ?? ""),
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const heroes = HEROES.filter(
    (hero) => hero.generation <= (heroGeneration ?? LATEST_HERO_GENERATION),
  ).sort(
    (first, second) =>
      second.generation - first.generation ||
      first.name.localeCompare(second.name),
  );

  async function save() {
    const trimmed = formation.trim();
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
    const chosen = slots.filter(Boolean);
    if (
      new Set(chosen.map((hero) => hero.toLowerCase())).size !== chosen.length
    ) {
      setMessage(t("Each joiner hero can only be used once per rally."));
      return;
    }
    setSaving(true);
    setMessage("");
    const { error } = await supabase.rpc("set_battle_plan_group_setup", {
      target_group_id: group.id,
      group_formation: trimmed || null,
      group_joiner_heroes: chosen,
      group_shift: shift,
    });
    setSaving(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    onSaved();
  }

  return (
    <div className="rally-setup-editor">
      <label>
        {t("Formation (Inf/Lan/Mark %)")}
        <input
          value={formation}
          placeholder="50/20/30"
          onChange={(event) => setFormation(event.target.value)}
        />
      </label>
      <div className="formation-presets">
        {FORMATION_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            className="secondary-link"
            onClick={() => setFormation(preset)}
          >
            {preset}
          </button>
        ))}
      </div>
      <label>
        {t("Battle half")}
        <select
          value={shift}
          onChange={(event) => setShift(event.target.value as GroupShift)}
        >
          <option value="whole">{t("Whole battle")}</option>
          <option value="first_half">{t("First half")}</option>
          <option value="second_half">{t("Second half")}</option>
        </select>
      </label>
      <p className="form-hint">
        {t("Four unique joiner heroes. Each member brings one of them.")}
      </p>
      <div className="joiner-slots">
        {slots.map((slot, index) => (
          <select
            key={index}
            value={slot}
            onChange={(event) =>
              setSlots((current) =>
                current.map((value, position) =>
                  position === index ? event.target.value : value,
                ),
              )
            }
          >
            <option value="">
              {t("Joiner hero {number}", { number: index + 1 })}
            </option>
            {heroes.map((hero) => (
              <option
                key={hero.name}
                value={hero.name}
                disabled={slots.includes(hero.name) && slot !== hero.name}
              >
                {hero.name} · {t("Gen {number}", { number: hero.generation })}
              </option>
            ))}
          </select>
        ))}
      </div>
      <div className="button-row">
        <button type="button" disabled={saving} onClick={() => void save()}>
          {saving ? t("Saving...") : t("Save rally setup")}
        </button>
        <button type="button" className="secondary-link" onClick={onCancel}>
          {t("Cancel")}
        </button>
      </div>
      {message && <p className="auth-message">{message}</p>}
    </div>
  );
}
