"use client";

import { battleClock, BATTLE_MINUTES } from "@/lib/castle";

// A pet block start between 12:15 and 16:45 UTC, in 24-hour time (a time
// input would show the browser's 12-hour clock). Value: minutes after the
// 12:00 battle start.
const OPTIONS = Array.from(
  { length: BATTLE_MINUTES / 15 - 1 },
  (_, index) => (index + 1) * 15,
);

export function BlockTimeSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (minutes: number) => void;
}) {
  const options = OPTIONS.includes(value) ? OPTIONS : [...OPTIONS, value].sort((a, b) => a - b);
  return (
    <label>
      {label}
      <select value={value} onChange={(event) => onChange(Number(event.target.value))}>
        {options.map((minutes) => (
          <option key={minutes} value={minutes}>
            {battleClock(minutes)}
          </option>
        ))}
      </select>
    </label>
  );
}
