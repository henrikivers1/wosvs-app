"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { AUTOFILL_CRITERIA, type AutofillCriterion } from "@/lib/autofill";

const STORAGE_KEY = "wosoverwatch-autofill-priorities";
const DEFAULT_PRIORITIES: AutofillCriterion[] = [
  "hero_match",
  "equal_power",
  "fc",
];

// The admin picks which criteria count and in which order; auto-fill then
// drafts every rally for review before publishing.
export function AutoFillPanel({
  disabled,
  onRun,
}: {
  disabled: boolean;
  onRun: (
    priorities: AutofillCriterion[],
    replaceExisting: boolean,
    requireHero: boolean,
  ) => void;
}) {
  const { t } = useLanguage();
  const [priorities, setPriorities] =
    useState<AutofillCriterion[]>(DEFAULT_PRIORITIES);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [requireHero, setRequireHero] = useState(false);

  useEffect(() => {
    const loadId = window.setTimeout(() => {
      try {
        const stored = JSON.parse(
          window.localStorage.getItem(STORAGE_KEY) ?? "null",
        ) as AutofillCriterion[] | null;
        if (Array.isArray(stored) && stored.length) setPriorities(stored);
      } catch {
        // Keep the defaults.
      }
    }, 0);
    return () => window.clearTimeout(loadId);
  }, []);

  function update(next: AutofillCriterion[]) {
    setPriorities(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Preference only lives for this visit.
    }
  }

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
