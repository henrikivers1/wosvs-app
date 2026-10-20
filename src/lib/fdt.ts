// Frostdragon Tyrant (FDT): planned per alliance, apart from SvS. Members
// vote, admins put players in an alliance (60 at most) with a target, and
// each target carries a rally note. The SQL uses the same limits.

export const FDT_ALLIANCE_LIMIT = 60;
// An FDT battle counts as over this long after it starts.
export const FDT_BATTLE_WINDOW_MS = 8 * 60 * 60 * 1000;

export type FdtVote = "yes" | "maybe" | "no";
export type FdtTarget = "capital" | "spires";

export type FdtEvent = {
  id: string;
  state_id: string;
  name: string;
  battle_at: string;
  capital_note: string | null;
  spires_note: string | null;
  published_at: string | null;
};

export type FdtVoteRow = {
  event_id: string;
  wos_account_id: string;
  availability: FdtVote;
  voice_call: boolean;
};

export type FdtAssignment = {
  event_id: string;
  wos_account_id: string;
  alliance_id: string;
  target: FdtTarget | null;
};

export const FDT_EVENT_COLUMNS =
  "id, state_id, name, battle_at, capital_note, spires_note, published_at";

export const FDT_VOTE_OPTIONS: { value: FdtVote; label: string }[] = [
  { value: "yes", label: "I can play" },
  { value: "maybe", label: "Maybe" },
  { value: "no", label: "Can't play" },
];

export const FDT_TARGETS: { value: FdtTarget; label: string }[] = [
  { value: "capital", label: "Capital" },
  { value: "spires", label: "Spires" },
];

export function fdtTargetLabel(target: FdtTarget | null | undefined) {
  return FDT_TARGETS.find((option) => option.value === target)?.label ?? null;
}

export function fdtRallyNote(event: FdtEvent, target: FdtTarget | null) {
  if (target === "capital") return event.capital_note;
  if (target === "spires") return event.spires_note;
  return null;
}

export function fdtEventOver(event: Pick<FdtEvent, "battle_at">, now = Date.now()) {
  return new Date(event.battle_at).getTime() + FDT_BATTLE_WINDOW_MS <= now;
}
