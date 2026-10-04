"use client";

import { useLanguage } from "@/components/LanguageProvider";
import { AUTOFILL_CRITERIA, type AutofillCriterion } from "@/lib/autofill";

// The order in which auto-fill weighs players. A state setting: the
// automatic planning, "Fill open seats" and "Rebuild all rallies" use it.
export function AutofillPriorityEditor({
  priorities,
  onChange,
}: {
  priorities: AutofillCriterion[];
  onChange: (next: AutofillCriterion[]) => void;
}) {
  const { t } = useLanguage();

  function move(index: number, direction: -1 | 1) {
    const next = [...priorities];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  const unused = AUTOFILL_CRITERIA.filter(
    (criterion) => !priorities.includes(criterion.value),
  );
  const label = (value: AutofillCriterion) =>
    t(AUTOFILL_CRITERIA.find((criterion) => criterion.value === value)!.label);

  return (
    <div className="autofill-panel">
      <ol className="autofill-priorities">
        {priorities.map((value, index) => (
          <li key={value}>
            <span>
              {index + 1}. {label(value)}
            </span>
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
                onChange(priorities.filter((criterion) => criterion !== value))
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
          aria-label={t("Add a priority")}
          onChange={(event) =>
            event.target.value &&
            onChange([...priorities, event.target.value as AutofillCriterion])
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
    </div>
  );
}
