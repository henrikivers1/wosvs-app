"use client";

import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { availabilityLabel, type AttendanceRow } from "@/lib/attendance";
import { furnaceLabel } from "@/lib/furnace";
import { memberName, type StateMember } from "./types";

// Who leads rallies in this SvS. Not every Rally Lead can play every battle,
// and a Labyrinth score can be inflated, so admins pick before the rallies
// are set up. Leads who are not picked join rallies like everyone else.
export function PlanLeadsPicker({
  members,
  answers,
  picked,
  rallyCount,
  busy,
  onSave,
  onClose,
}: {
  members: StateMember[];
  answers: Map<string, AttendanceRow>;
  // Saved picks, or null when nobody has picked yet.
  picked: string[] | null;
  rallyCount: number;
  busy: boolean;
  onSave: (ids: string[], generate: boolean) => void;
  onClose: () => void;
}) {
  const { t, formatNumber } = useLanguage();
  const isTagged = (member: StateMember, key: string) =>
    member.tags.some((tag) => tag.system_key === key);
  const canPlay = (member: StateMember) =>
    answers.get(member.id)?.availability !== "unavailable";

  const [selected, setSelected] = useState<Set<string>>(
    () =>
      new Set(
        picked ??
          members
            .filter((member) => isTagged(member, "rally_lead") && canPlay(member))
            .map((member) => member.id),
      ),
  );
  const [showAll, setShowAll] = useState(false);
  const panel = useRef<HTMLElement>(null);
  // It opens below the checklist; bring it into view.
  useEffect(() => {
    panel.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // Rally Leads first, then the best Labyrinth scores; players who can't
  // join this SvS only when picked before.
  const ranked = [...members]
    .filter((member) => canPlay(member) || selected.has(member.id))
    .sort(
      (first, second) =>
        Number(isTagged(second, "rally_lead")) - Number(isTagged(first, "rally_lead")) ||
        (second.labyrinth_score ?? 0) - (first.labyrinth_score ?? 0) ||
        (second.power ?? 0) - (first.power ?? 0),
    );
  const shown = showAll ? ranked : ranked.slice(0, 25);

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section ref={panel} className="rally-leads-panel">
      <div className="rally-leads-heading">
        <div>
          <p className="section-label">{t("Rally Leads for this SvS")}</p>
          <h2>
            {t("{picked} picked · {rallies} rallies", {
              picked: selected.size,
              rallies: rallyCount,
            })}
          </h2>
        </div>
        <button type="button" className="secondary-link" onClick={onClose}>
          {t("Cancel")}
        </button>
      </div>
      <p className="form-hint">
        {t(
          "Pick who leads rallies in this SvS. The best Labyrinth scores among them start a rally each; the others take over when pets run out. Leads you don't pick join rallies like everyone else.",
        )}
      </p>
      <ol className="labyrinth-leaders">
        {shown.map((member, index) => {
          const on = selected.has(member.id);
          const answer = answers.get(member.id);
          return (
            <li key={member.id} className={on ? "is-lead" : undefined}>
              <span className="labyrinth-rank">{index + 1}</span>
              <span className="labyrinth-player">
                <strong>{memberName(member)}</strong>
                <small>
                  {`${t("Lab")} ${formatNumber(member.labyrinth_score ?? 0)} · ${furnaceLabel(member.furnace_level_raw)}`}
                  {` · ${answer ? t(availabilityLabel(answer.availability)) : t("No vote yet")}`}
                  {isTagged(member, "rally_lead") && ` · ${t("Rally Lead")}`}
                  {isTagged(member, "castle_holder") && ` · ${t("Castle Holder")}`}
                </small>
              </span>
              <span className="lead-toggles">
                <button
                  type="button"
                  disabled={busy}
                  aria-pressed={on}
                  className={on ? "lead-toggle on" : "lead-toggle"}
                  onClick={() => toggle(member.id)}
                >
                  {on ? t("Leads") : t("Pick")}
                </button>
              </span>
            </li>
          );
        })}
      </ol>
      {ranked.length > shown.length && (
        <button type="button" className="text-button" onClick={() => setShowAll(true)}>
          {t("Show all {count} players", { count: ranked.length })}
        </button>
      )}
      {selected.size > 0 && selected.size < rallyCount && (
        <p className="form-hint">
          {t("Fewer leads than rallies: only {count} rallies will be set up.", {
            count: selected.size,
          })}
        </p>
      )}
      <div className="button-row">
        <button
          type="button"
          className="primary-button"
          disabled={busy || selected.size === 0}
          onClick={() => onSave([...selected], true)}
        >
          {t("Save and generate rallies")}
        </button>
        <button
          type="button"
          className="secondary-link"
          disabled={busy || selected.size === 0}
          onClick={() => onSave([...selected], false)}
        >
          {t("Save Rally Leads")}
        </button>
      </div>
    </section>
  );
}
