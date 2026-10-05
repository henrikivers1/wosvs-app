"use client";

import { useLanguage } from "@/components/LanguageProvider";
import { availabilityLabel, type AttendanceRow } from "@/lib/attendance";
import { furnaceLabel } from "@/lib/furnace";
import { memberName, type StateMember } from "./types";

// Mark who leads rallies and who holds the castle, from the players ranked
// by Labyrinth score. Neither ever joins a rally or the garrison.
export function RallyLeadsPanel({
  members,
  answers,
  busy,
  onToggleLead,
  onToggleHolder,
  onClose,
}: {
  members: StateMember[];
  answers: Map<string, AttendanceRow>;
  busy: boolean;
  onToggleLead: (member: StateMember, enabled: boolean) => void;
  onToggleHolder: (member: StateMember, enabled: boolean) => void;
  onClose: () => void;
}) {
  const { t, formatNumber } = useLanguage();
  const has = (member: StateMember, key: string) =>
    member.tags.some((tag) => tag.system_key === key);

  const byLabyrinth = [...members].sort(
    (first, second) => (second.labyrinth_score ?? 0) - (first.labyrinth_score ?? 0),
  );
  const top = byLabyrinth
    .filter((member) => (member.labyrinth_score ?? 0) > 0)
    .slice(0, 20);
  // Leads and holders outside the top 20 stay listed, so they can be unmarked.
  const ranked = [
    ...top,
    ...byLabyrinth.filter(
      (member) =>
        !top.includes(member) &&
        (has(member, "rally_lead") || has(member, "castle_holder")),
    ),
  ];
  const leadCount = members.filter((member) => has(member, "rally_lead")).length;
  const holderCount = members.filter((member) => has(member, "castle_holder")).length;

  return (
    <section className="rally-leads-panel">
      <div className="rally-leads-heading">
        <div>
          <p className="section-label">{t("Leads & holders")}</p>
          <h2>
            {t("{leads} Rally Leads · {holders} Castle Holders", {
              leads: leadCount,
              holders: holderCount,
            })}
          </h2>
        </div>
        <button type="button" className="secondary-link" onClick={onClose}>
          {t("Done")}
        </button>
      </div>
      <p className="form-hint">
        {t(
          "Rally Leads lead rallies and swap each pet block; Castle Holders take turns holding the castle. Neither is ever placed as a joiner.",
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
            const isLead = has(member, "rally_lead");
            const isHolder = has(member, "castle_holder");
            const answer = answers.get(member.id);
            return (
              <li
                key={member.id}
                className={isLead || isHolder ? "is-lead" : undefined}
              >
                <span className="labyrinth-rank">{index + 1}</span>
                <span className="labyrinth-player">
                  <strong>{memberName(member)}</strong>
                  <small>
                    {`${t("Lab")} ${formatNumber(member.labyrinth_score ?? 0)} · ${furnaceLabel(member.furnace_level_raw)}`}
                    {answer &&
                      ` · ${t(availabilityLabel(answer.availability))}`}
                  </small>
                </span>
                <span className="lead-toggles">
                  <button
                    type="button"
                    disabled={busy}
                    aria-pressed={isLead}
                    className={isLead ? "lead-toggle on" : "lead-toggle"}
                    onClick={() => onToggleLead(member, !isLead)}
                  >
                    {t("Rally Lead")}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    aria-pressed={isHolder}
                    className={isHolder ? "lead-toggle holder on" : "lead-toggle holder"}
                    onClick={() => onToggleHolder(member, !isHolder)}
                  >
                    {t("Castle Holder")}
                  </button>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
