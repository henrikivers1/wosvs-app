export type Availability =
  | "whole"
  | "first_half"
  | "second_half"
  | "unavailable";

export type AttendanceRow = {
  plan_id: string;
  wos_account_id: string;
  availability: Availability;
  voice_call: boolean;
};

export type UpcomingSvs = {
  plan_id: string;
  opponent_state: number | null;
  battle_at: string;
};

export const BATTLE_DURATION_MS = 5 * 60 * 60 * 1000;

export const AVAILABILITY_OPTIONS: {
  value: Availability;
  label: string;
  // Offsets from battle start in hours, for the time hint.
  window: [number, number] | null;
}[] = [
  { value: "whole", label: "Whole battle", window: [0, 5] },
  { value: "first_half", label: "First half", window: [0, 2.5] },
  { value: "second_half", label: "Second half", window: [2.5, 5] },
  { value: "unavailable", label: "Can't join", window: null },
];

export function availabilityLabel(value: Availability) {
  return (
    AVAILABILITY_OPTIONS.find((option) => option.value === value)?.label ??
    value
  );
}

// SvS castle battles always run 12:00–17:00 UTC on battle day.
export const SVS_START_HOUR_UTC = 12;

export function svsBattleStart(battleAt: string) {
  const start = new Date(battleAt);
  start.setUTCHours(SVS_START_HOUR_UTC, 0, 0, 0);
  return start;
}

// "12:00–14:30 UTC" for a window relative to the official battle start.
export function windowLabel(battleAt: string, window: [number, number]) {
  const start = svsBattleStart(battleAt).getTime();
  const format = (offsetHours: number) =>
    new Date(start + offsetHours * 3_600_000).toLocaleTimeString("en-GB", {
      timeZone: "UTC",
      hour: "2-digit",
      minute: "2-digit",
    });
  return `${format(window[0])}–${format(window[1])} UTC`;
}
