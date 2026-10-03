"use client";

import { useLanguage } from "@/components/LanguageProvider";
import { availabilityLabel, type AttendanceRow } from "@/lib/attendance";
import { furnaceLabel } from "@/lib/furnace";
import { memberName, type StateMember } from "./types";

// Labyrinth score is the best strength signal WOSOracle offers, so the
// strongest Labyrinth players are the natural Rally Lead candidates.
export function RallyLeadsPanel({
  members,
  answers,
  busy,
  onToggle,
  onClose,
}: {
  members: StateMember[];
  answers: Map<string, AttendanceRow>;
  busy: boolean;
  onToggle: (member: StateMember, enabled: boolean) => void;
  onClose: () => void;
}) {
  const { t, formatNumber } = useLanguage();
  const ranked = members
    .filter((member) => (member.labyrinth_score ?? 0) > 0)
    .sort(
      (first, second) =>
        (second.labyrinth_score ?? 0) - (first.labyrinth_score ?? 0),
    )
    .slice(0, 20);

  return (
    <section className="rally-leads-panel">
      <div className="rally-leads-heading">
        <div>
          <p className="section-label">{t("Rally Leads")}</p>
          <h2>{t("Top 20 Labyrinth in your state")}</h2>
        </div>
        <button type="button" className="secondary-link" onClick={onClose}>
          {t("Done")}
        </button>
      </div>
      <p className="form-hint">
        {t(
          "Ranked from your members' synced WOSOracle data. Mark the players who lead rallies; only Rally Leads can lead a group.",
        )}
      </p>
      {ranked.length === 0 ? (
        <p>
          {t(
            "No Labyrinth scores yet. They appear after members' accounts are synced.",
          )}
        </p>
      ) : (
        <ol className="labyrinth-leaders">
          {ranked.map((member, index) => {
            const isLead = member.tags.some(
              (tag) => tag.system_key === "rally_lead",
            );
            const answer = answers.get(member.id);
            return (
              <li key={member.id} className={isLead ? "is-lead" : undefined}>
                <span className="labyrinth-rank">{index + 1}</span>
                <span className="labyrinth-player">
                  <strong>{memberName(member)}</strong>
                  <small>
                    {t("Lab")} {formatNumber(member.labyrinth_score ?? 0)} ·{" "}
                    {furnaceLabel(member.furnace_level_raw)} ·{" "}
                    {member.power === null ? "—" : formatNumber(member.power)}
                    {answer &&
                      ` · ${t(availabilityLabel(answer.availability))}${
                        answer.voice_call ? ` · ${t("Voice")}` : ""
                      }`}
                  </small>
                </span>
                <button
                  type="button"
                  disabled={busy}
                  aria-pressed={isLead}
                  className={isLead ? "lead-toggle on" : "lead-toggle"}
                  onClick={() => onToggle(member, !isLead)}
                >
                  {isLead ? t("Rally Lead") : t("Make Rally Lead")}
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
