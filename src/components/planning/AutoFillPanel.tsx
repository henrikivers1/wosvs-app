"use client";

import { useState } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { AUTOFILL_CRITERIA, type AutofillCriterion } from "@/lib/autofill";

// The admin picks which criteria count and in which order. The order is a
// state setting: the automatic planning uses the same priorities.
export function AutoFillPanel({
  disabled,
  priorities,
  onPrioritiesChange,
  onRun,
}: {
  disabled: boolean;
  priorities: AutofillCriterion[];
  onPrioritiesChange: (next: AutofillCriterion[]) => void;
  onRun: (
    priorities: AutofillCriterion[],
    replaceExisting: boolean,
    requireHero: boolean,
  ) => void;
}) {
  const { t } = useLanguage();
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [requireHero, setRequireHero] = useState(false);
  const update = onPrioritiesChange;

  function move(index: number, direction: -1 | 1) {
    const next = [...priorities];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    update(next);
  }

  const unused = AUTOFILL_CRITERIA.filter(
    (criterion) => !priorities.includes(criterion.value),
  );
  const label = (value: AutofillCriterion) =>
    t(AUTOFILL_CRITERIA.find((criterion) => criterion.value === value)!.label);

  return (
    <div className="autofill-panel">
      <p className="section-label">{t("Auto-fill")}</p>
      <h4>{t("Fill the rallies for me")}</h4>
      <p className="form-hint">
        {t(
          "Uses players who voted they can play each rally's half, and gives each one a joiner hero they have at 4★. Nothing is sent until you publish.",
        )}
      </p>
      <ol className="autofill-priorities">
        {priorities.map((value, index) => (
          <li key={value}>
            <span>{label(value)}</span>
            <button
              type="button"
              className="secondary-link"
              disabled={index === 0}
              onClick={() => move(index, -1)}
              aria-label={t("Move up")}
            >
              ↑
            </button>
            <button
              type="button"
              className="secondary-link"
              disabled={index === priorities.length - 1}
              onClick={() => move(index, 1)}
              aria-label={t("Move down")}
            >
              ↓
            </button>
            <button
              type="button"
              className="secondary-link"
              disabled={priorities.length === 1}
              onClick={() =>
                update(priorities.filter((criterion) => criterion !== value))
              }
            >
              {t("Remove")}
            </button>
          </li>
        ))}
      </ol>
      {unused.length > 0 && (
        <select
          value=""
          onChange={(event) =>
            event.target.value &&
            update([...priorities, event.target.value as AutofillCriterion])
          }
        >
          <option value="">{t("Add a priority")}</option>
          {unused.map((criterion) => (
            <option key={criterion.value} value={criterion.value}>
              {t(criterion.label)}
            </option>
          ))}
        </select>
      )}
      <label>
        <input
          type="checkbox"
          checked={replaceExisting}
          onChange={(event) => setReplaceExisting(event.target.checked)}
        />
        {t("Start from empty rallies (keeps the leaders)")}
      </label>
      <label>
        <input
          type="checkbox"
          checked={requireHero}
          onChange={(event) => setRequireHero(event.target.checked)}
        />
        {t("Only players who have one of the rally's joiner heroes at 4★")}
      </label>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onRun(priorities, replaceExisting, requireHero)}
      >
        {t("Auto-fill rallies")}
      </button>
    </div>
  );
}
