"use client";

import { useState } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { availabilityLabel, type AttendanceRow } from "@/lib/attendance";
import { blockFits, blockLabel, PET_BLOCKS } from "@/lib/castle";
import { memberName, type StateAlliance, type StateMember } from "./types";

// Who leads a rally (or holds the castle) in each pet block. Candidates are
// the state's Rally Leads or Castle Holders; a player can cover more than
// one block. With alliances it also asks where the garrison holds.
export function RotationEditor({
  title,
  candidates,
  initial,
  answers,
  alliances,
  initialAllianceId,
  busy,
  onSave,
  onCancel,
}: {
  title: string;
  candidates: StateMember[];
  initial: Array<string | null>;
  answers: Map<string, AttendanceRow>;
  alliances?: StateAlliance[];
  initialAllianceId?: string | null;
  busy: boolean;
  onSave: (leads: Array<string | null>, allianceId: string | null) => void;
  onCancel: () => void;
}) {
  const { t } = useLanguage();
  const [slots, setSlots] = useState<Array<string | null>>(
    PET_BLOCKS.map((_, block) => initial[block] ?? null),
  );
  const [allianceId, setAllianceId] = useState(initialAllianceId ?? "");

  const label = (member: StateMember) => {
    const answer = answers.get(member.id);
    return `${memberName(member)} · ${
      answer ? t(availabilityLabel(answer.availability)) : t("Not answered")
    }`;
  };

  return (
    <form
      className="rotation-editor"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(slots, allianceId || null);
      }}
    >
      <p className="section-label">{title}</p>
      {candidates.length === 0 && (
        <p className="form-hint">
          {t("Nobody is marked yet. Use Leads & holders above the board.")}
        </p>
      )}
      {PET_BLOCKS.map((_, block) => {
        const chosen = candidates.find((member) => member.id === slots[block]);
        const fits =
          !chosen || blockFits(answers.get(chosen.id)?.availability, block);
        return (
          <label key={block}>
            <span>
              {blockLabel(block)} UTC
              {!fits && (
                <span className="rotation-warning">
                  {" "}
                  · {t("hasn't voted for this time")}
                </span>
              )}
            </span>
            <select
              value={slots[block] ?? ""}
              onChange={(event) =>
                setSlots((current) =>
                  current.map((value, index) =>
                    index === block ? event.target.value || null : value,
                  ),
                )
              }
            >
              <option value="">{t("Nobody")}</option>
              {candidates.map((member) => (
                <option key={member.id} value={member.id}>
                  {label(member)}
                </option>
              ))}
            </select>
          </label>
        );
      })}
      {alliances && (
        <label>
          {t("Alliance holding the castle")}
          <select
            value={allianceId}
            onChange={(event) => setAllianceId(event.target.value)}
          >
            <option value="">{t("Choose alliance")}</option>
            {alliances.map((alliance) => (
              <option key={alliance.id} value={alliance.id}>
                {alliance.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="button-row">
        <button
          type="submit"
          className="primary-button"
          disabled={busy || !slots.some(Boolean)}
        >
          {t("Save")}
        </button>
        <button type="button" className="secondary-link" onClick={onCancel}>
          {t("Cancel")}
        </button>
      </div>
    </form>
  );
}
