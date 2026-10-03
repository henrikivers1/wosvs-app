import type { Availability } from "@/lib/attendance";

export type AutofillCriterion =
  | "equal_power"
  | "fc"
  | "troop"
  | "labyrinth"
  | "power"
  | "voice";

export const AUTOFILL_CRITERIA: { value: AutofillCriterion; label: string }[] =
  [
    { value: "equal_power", label: "Equal power across rallies" },
    { value: "fc", label: "Highest FC" },
    { value: "troop", label: "Highest troop tier" },
    { value: "labyrinth", label: "Highest Labyrinth" },
    { value: "power", label: "Highest power" },
    { value: "voice", label: "Voice call first" },
  ];

export type GroupShift = "whole" | "first_half" | "second_half";

export type AutofillMember = {
  id: string;
  power: number;
  fc: number;
  troop: number;
  labyrinth: number;
  voice: boolean;
  availability: Availability | null;
  heroes: string[];
};

export type AutofillGroup = {
  id: string;
  maxMembers: number;
  memberIds: string[];
  shift: GroupShift;
  joinerHeroes: string[];
  // Heroes already brought by current members, for spreading the slots.
  heroUsage: Record<string, number>;
  totalPower: number;
};

export type AutofillDraft = {
  group_id: string;
  wos_account_id: string;
  hero: string | null;
};

// Players who said they can play the half this group fights in.
export function canPlayShift(
  availability: Availability | null,
  shift: GroupShift,
) {
  if (availability === "whole") return true;
  if (shift === "first_half") return availability === "first_half";
  if (shift === "second_half") return availability === "second_half";
  return false;
}

// The rally's joiner hero this player should bring: one they own at 4★,
// preferring the slot fewest members already cover.
export function pickHero(
  joinerHeroes: string[],
  ownedHeroes: string[],
  usage: Record<string, number>,
) {
  const owned = new Set(ownedHeroes.map((hero) => hero.toLowerCase()));
  const candidates = joinerHeroes.filter((hero) =>
    owned.has(hero.toLowerCase()),
  );
  if (!candidates.length) return null;
  return candidates.reduce((best, hero) =>
    (usage[hero] ?? 0) < (usage[best] ?? 0) ? hero : best,
  );
}

function score(member: AutofillMember, criterion: AutofillCriterion) {
  switch (criterion) {
    case "fc":
      return member.fc;
    case "troop":
      return member.troop;
    case "labyrinth":
      return member.labyrinth;
    case "power":
      return member.power;
    case "voice":
      return member.voice ? 1 : 0;
    default:
      return 0;
  }
}

// Drafts assignments for unassigned players. Players are ranked by the
// admin's priorities in order; "Equal power across rallies" sends each
// player to the eligible rally with the least power so far, otherwise the
// best players fill the first rallies. Only players who voted they can play
// that rally's half are used.
export function computeAutofill(
  groups: AutofillGroup[],
  candidates: AutofillMember[],
  priorities: AutofillCriterion[],
): AutofillDraft[] {
  const working = groups.map((group) => ({
    ...group,
    count: group.memberIds.length,
    heroUsage: { ...group.heroUsage },
  }));
  const ranking = priorities.filter((value) => value !== "equal_power");
  const balance = priorities.includes("equal_power");

  const ranked = candidates
    .filter(
      (member) => member.availability && member.availability !== "unavailable",
    )
    .sort((first, second) => {
      for (const criterion of ranking) {
        const difference = score(second, criterion) - score(first, criterion);
        if (difference !== 0) return difference;
      }
      return second.power - first.power;
    });

  const drafts: AutofillDraft[] = [];
  for (const member of ranked) {
    const eligible = working.filter(
      (group) =>
        group.count < group.maxMembers &&
        canPlayShift(member.availability, group.shift),
    );
    if (!eligible.length) continue;

    // Prefer a rally where the player covers one of its joiner heroes. When
    // balancing, only rallies within 15% of the weakest one qualify, so
    // hero coverage never undoes the balance.
    const weakest = Math.min(...eligible.map((group) => group.totalPower));
    const candidatesForPlayer = balance
      ? eligible.filter((group) => group.totalPower <= weakest * 1.15)
      : eligible;
    const withHero = candidatesForPlayer.filter(
      (group) =>
        pickHero(group.joinerHeroes, member.heroes, group.heroUsage) !== null,
    );
    const pool = withHero.length ? withHero : candidatesForPlayer;
    const target = balance
      ? pool.reduce((lowest, group) =>
          group.totalPower < lowest.totalPower ? group : lowest,
        )
      : pool[0];

    const hero = pickHero(target.joinerHeroes, member.heroes, target.heroUsage);
    if (hero) target.heroUsage[hero] = (target.heroUsage[hero] ?? 0) + 1;
    target.count += 1;
    target.totalPower += member.power;
    drafts.push({ group_id: target.id, wos_account_id: member.id, hero });
  }
  return drafts;
}
