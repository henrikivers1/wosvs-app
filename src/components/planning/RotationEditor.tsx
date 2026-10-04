"use client";

import { useState } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { availabilityLabel, type AttendanceRow } from "@/lib/attendance";
import { BlockTimeSelect } from "./BlockTimeSelect";
import {
  blockFits,
  blockLabel,
  DEFAULT_BLOCK_SWAPS,
  PET_BLOCKS,
  validBlockSwaps,
} from "@/lib/castle";
import { memberName, type StateAlliance, type StateMember } from "./types";

// Who leads a rally (or holds the castle) in each pet block, and when the
// blocks change (a pet lasts two hours, the battle five, so states split it
// differently). Candidates are the Rally Leads or Castle Holders; a player
// can cover more than one block. With alliances it also asks where the
// garrison holds.
export function RotationEditor({
  title,
  candidates,
  initial,
  initialSwaps,
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
  initialSwaps?: readonly number[] | null;
  answers: Map<string, AttendanceRow>;
  alliances?: StateAlliance[];
  initialAllianceId?: string | null;
  busy: boolean;
  onSave: (
    leads: Array<string | null>,
    allianceId: string | null,
    swaps: [number, number],
  ) => void;
  onCancel: () => void;
}) {
  const { t } = useLanguage();
  const [slots, setSlots] = useState<Array<string | null>>(
    PET_BLOCKS.map((block) => initial[block] ?? null),
  );
  const [allianceId, setAllianceId] = useState(initialAllianceId ?? "");
  const [swaps, setSwaps] = useState<[number, number]>(() => {
    const start = initialSwaps ?? DEFAULT_BLOCK_SWAPS;
    return [start[0], start[1]];
  });
  const swapsValid = validBlockSwaps(swaps);
  const setSwap = (index: 0 | 1, minutes: number) =>
    setSwaps((current) => {
      const next: [number, number] = [current[0], current[1]];
      next[index] = minutes;
      return next;
    });

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
        if (!swapsValid) return;
        onSave(slots, allianceId || null, swaps);
      }}
    >
      <p className="section-label">{title}</p>
      {candidates.length === 0 && (
        <p className="form-hint">
          {t("Nobody is marked yet. Use Leads & holders above the board.")}
        </p>
      )}
      <div className="rotation-swaps">
        {([0, 1] as const).map((index) => (
          <BlockTimeSelect
            key={index}
            label={index === 0 ? t("Second block starts (UTC)") : t("Third block starts (UTC)")}
            value={swaps[index]}
            onChange={(minutes) => setSwap(index, minutes)}
          />
        ))}
      </div>
      {!swapsValid && (
        <p className="form-hint rotation-warning">
          {t("Each block must start after the one before, between 12:00 and 17:00.")}
        </p>
      )}
      {swapsValid &&
        PET_BLOCKS.some((block) => {
          const length = (block === 2 ? 300 : swaps[block]) - (block === 0 ? 0 : swaps[block - 1]);
          return length > 120;
        }) && (
          <p className="form-hint">
            {t("A block is longer than 2 hours, longer than a pet lasts.")}
          </p>
        )}
      {PET_BLOCKS.map((block) => {
        const chosen = candidates.find((member) => member.id === slots[block]);
        const fits =
          !chosen ||
          blockFits(answers.get(chosen.id)?.availability, block, swaps);
        return (
          <label key={block}>
            <span>
              {swapsValid ? blockLabel(block, swaps) : "–"} UTC
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
          disabled={busy || !slots.some(Boolean) || !swapsValid}
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
