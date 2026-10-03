import type { Availability } from "@/lib/attendance";
import {
  computeAutofill,
  type AutofillCriterion,
  type AutofillDraft,
  type AutofillGroup,
  type AutofillMember,
} from "@/lib/autofill";

// How a castle battle is played, shared by the automation and Planning:
//
// * Three pet blocks: 12–14, 14–16 and 16–17 UTC. Rally leads and castle
//   holders swap when their pets run out, one per block.
// * The garrison holds the castle all battle and is filled first, with the
//   strongest defenders (troop FC, troop tier, troop skill).
// * Rally Leads and Castle Holders only lead or hold; they never join.

export const PET_BLOCKS = [
  { start: 0, end: 2 },
  { start: 2, end: 4 },
  { start: 4, end: 5 },
] as const;

// Halves are 12:00–14:30 and 14:30–17:00, so 12–14 is first half and the
// two later blocks count as second half.
export function blockFits(availability: Availability | null | undefined, block: number) {
  if (availability === "whole") return true;
  if (availability === "first_half") return block === 0;
  if (availability === "second_half") return block > 0;
  return false;
}

export function blockLabel(block: number) {
  const { start, end } = PET_BLOCKS[block];
  const hour = (offset: number) => `${String(12 + offset).padStart(2, "0")}:00`;
  return `${hour(start)}–${hour(end)}`;
}

export type DefenseStats = {
  power: number | null;
  furnace_level_raw: number | null;
  infantry_tier: number | null;
  lancer_tier: number | null;
  marksman_tier: number | null;
  infantry_fc_level: number | null;
  lancer_fc_level: number | null;
  marksman_fc_level: number | null;
  infantry_t12_skill: number | null;
  lancer_t12_skill: number | null;
  marksman_t12_skill: number | null;
};

function mean(values: Array<number | null>) {
  const numbers = values.filter((value): value is number => value !== null);
  return numbers.length
    ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length
    : 0;
}

// Strongest defender first: troop FC level, then troop tier, then troop
// skill, then Furnace and power to break ties.
export function defenseKey(member: DefenseStats) {
  return [
    mean([member.infantry_fc_level, member.lancer_fc_level, member.marksman_fc_level]),
    mean([member.infantry_tier, member.lancer_tier, member.marksman_tier]),
    mean([member.infantry_t12_skill, member.lancer_t12_skill, member.marksman_t12_skill]),
    member.furnace_level_raw ?? 0,
    member.power ?? 0,
  ];
}

export function compareDefense(first: DefenseStats, second: DefenseStats) {
  const a = defenseKey(first);
  const b = defenseKey(second);
  for (let index = 0; index < a.length; index += 1) {
    if (b[index] !== a[index]) return b[index] - a[index];
  }
  return 0;
}

// One lead per pet block from the given candidates (best first), using a
// different player each block where possible. null when nobody fits.
export function planRotation(
  candidates: string[],
  availabilityOf: (id: string) => Availability | null | undefined,
): Array<string | null> {
  const used = new Map<string, number>();
  return PET_BLOCKS.map((_, block) => {
    const fitting = candidates.filter((id) => blockFits(availabilityOf(id), block));
    if (!fitting.length) return null;
    const pick = [...fitting].sort(
      (first, second) => (used.get(first) ?? 0) - (used.get(second) ?? 0),
    )[0];
    used.set(pick, (used.get(pick) ?? 0) + 1);
    return pick;
  });
}

export type FillGroup = AutofillGroup & {
  kind: "rally" | "garrison";
};

export type FillMember = AutofillMember & {
  defense: DefenseStats;
};

// Seats in use: joiners plus one for whoever leads at the moment.
export function seatMemberIds(
  leaderId: string,
  rotation: Array<string | null>,
  memberIds: string[],
) {
  const leads = new Set([leaderId, ...rotation.filter(Boolean)]);
  return [leaderId, ...memberIds.filter((id) => !leads.has(id))];
}

// Fills open seats: the garrison first with the strongest defenders who can
// play the whole battle, then the rallies by the state's priorities. Rally
// Leads and Castle Holders (leadIds) are never placed.
export function fillPlan(
  groups: FillGroup[],
  candidates: FillMember[],
  priorities: AutofillCriterion[],
  leadIds: Set<string>,
): AutofillDraft[] {
  const pool = candidates.filter((member) => !leadIds.has(member.id));
  const drafts: AutofillDraft[] = [];
  const placed = new Set<string>();

  for (const garrison of groups.filter((group) => group.kind === "garrison")) {
    let open = garrison.maxMembers - garrison.memberIds.length;
    const defenders = pool
      .filter((member) => member.availability === "whole")
      .sort((first, second) => compareDefense(first.defense, second.defense));
    for (const member of defenders) {
      if (open <= 0) break;
      if (placed.has(member.id)) continue;
      drafts.push({ group_id: garrison.id, wos_account_id: member.id, hero: null });
      placed.add(member.id);
      open -= 1;
    }
  }

  const rallies = groups.filter((group) => group.kind === "rally");
  if (rallies.length) {
    drafts.push(
      ...computeAutofill(
        rallies,
        pool.filter((member) => !placed.has(member.id)),
        priorities,
      ),
    );
  }
  return drafts;
}
