import type { AttendanceRow, Availability } from "@/lib/attendance";
import { canPlayShift } from "@/lib/autofill";
import type { PlanAssignment, PlanGroup, StateMember } from "./types";

// Everything in a plan an admin should look at before publishing, each with
// the fix the page can apply. An empty list means the plan is ready.
export type PlanIssue =
  // Rallies with the same gap share one line.
  | { kind: "missing_alliance"; groups: PlanGroup[] }
  | { kind: "no_joiner_heroes"; groups: PlanGroup[] }
  | {
      kind: "wrong_half";
      member: StateMember;
      group: PlanGroup;
      availability: Availability | null;
      target: PlanGroup | null;
    }
  | {
      kind: "no_matching_hero";
      member: StateMember;
      group: PlanGroup;
      target: PlanGroup | null;
    }
  | { kind: "heroes_missing"; group: PlanGroup; members: StateMember[] }
  // Players no rally has a hero for; they still join, without a hero.
  | { kind: "no_hero_anywhere"; members: StateMember[] }
  | { kind: "heroes_unknown"; members: StateMember[] }
  | { kind: "open_slots"; openSlots: number; waiting: number };

export type IssueSeverity = "blocker" | "warning" | "info";

export function issueSeverity(issue: PlanIssue): IssueSeverity {
  if (issue.kind === "missing_alliance") return "blocker";
  if (issue.kind === "heroes_unknown" || issue.kind === "no_hero_anywhere") {
    return "info";
  }
  return "warning";
}

function ownsOneOf(member: StateMember, heroes: string[]) {
  const owned = new Set(member.heroes.map((hero) => hero.toLowerCase()));
  return heroes.some((hero) => owned.has(hero.toLowerCase()));
}

export function findPlanIssues({
  groups,
  assignments,
  members,
  attendance,
}: {
  groups: PlanGroup[];
  assignments: PlanAssignment[];
  members: StateMember[];
  attendance: AttendanceRow[];
}): PlanIssue[] {
  if (!groups.length) return [];
  const issues: PlanIssue[] = [];
  const memberById = new Map(members.map((member) => [member.id, member]));
  const answerById = new Map(
    attendance.map((row) => [row.wos_account_id, row.availability]),
  );
  const leaderIds = new Set(groups.map((group) => group.leader_wos_account_id));
  // Seats taken, counting the moves suggested so far.
  const taken = new Map(
    groups.map((group) => [
      group.id,
      assignments.filter((item) => item.group_id === group.id).length,
    ]),
  );

  // The best other rally for a player: their half, a free seat, and one of
  // its joiner heroes if possible.
  function betterRally(member: StateMember, current: PlanGroup) {
    const availability = answerById.get(member.id) ?? null;
    const options = groups.filter(
      (group) =>
        group.id !== current.id &&
        canPlayShift(availability, group.shift ?? "whole") &&
        (taken.get(group.id) ?? 0) < group.max_members,
    );
    const target =
      options.find((group) => ownsOneOf(member, group.joiner_heroes ?? [])) ??
      null;
    if (target) {
      taken.set(target.id, (taken.get(target.id) ?? 0) + 1);
      taken.set(current.id, (taken.get(current.id) ?? 1) - 1);
    }
    return target;
  }

  const withoutAlliance = groups.filter((group) => !group.alliance_id);
  if (withoutAlliance.length) {
    issues.push({ kind: "missing_alliance", groups: withoutAlliance });
  }
  const withoutHeroes = groups.filter(
    (group) => !(group.joiner_heroes ?? []).length,
  );
  if (withoutHeroes.length) {
    issues.push({ kind: "no_joiner_heroes", groups: withoutHeroes });
  }

  const unknown: StateMember[] = [];
  const noHeroAnywhere: StateMember[] = [];
  for (const group of groups) {
    const joinerHeroes = group.joiner_heroes ?? [];
    const withoutHero: StateMember[] = [];
    for (const item of assignments.filter((row) => row.group_id === group.id)) {
      const member = memberById.get(item.wos_account_id);
      if (!member || leaderIds.has(member.id)) continue;
      const availability = answerById.get(member.id) ?? null;
      if (!canPlayShift(availability, group.shift ?? "whole")) {
        const target = groups.find(
          (other) =>
            other.id !== group.id &&
            canPlayShift(availability, other.shift ?? "whole") &&
            (taken.get(other.id) ?? 0) < other.max_members,
        );
        if (target) {
          taken.set(target.id, (taken.get(target.id) ?? 0) + 1);
          taken.set(group.id, (taken.get(group.id) ?? 1) - 1);
        }
        issues.push({
          kind: "wrong_half",
          member,
          group,
          availability,
          target: target ?? null,
        });
        continue;
      }
      if (!joinerHeroes.length) continue;
      if (!member.heroes_updated_at) {
        unknown.push(member);
        continue;
      }
      if (!ownsOneOf(member, joinerHeroes)) {
        const target = betterRally(member, group);
        if (target) {
          issues.push({ kind: "no_matching_hero", member, group, target });
        } else {
          noHeroAnywhere.push(member);
        }
      } else if (!item.hero) {
        withoutHero.push(member);
      }
    }
    if (withoutHero.length) {
      issues.push({ kind: "heroes_missing", group, members: withoutHero });
    }
  }

  const assigned = new Set(assignments.map((item) => item.wos_account_id));
  const waiting = members.filter(
    (member) =>
      !assigned.has(member.id) &&
      groups.some((group) =>
        canPlayShift(answerById.get(member.id) ?? null, group.shift ?? "whole"),
      ),
  ).length;
  const openSlots = groups.reduce(
    (sum, group) =>
      sum +
      Math.max(
        0,
        group.max_members -
          assignments.filter((item) => item.group_id === group.id).length,
      ),
    0,
  );
  if (openSlots > 0 && waiting > 0) {
    issues.push({ kind: "open_slots", openSlots, waiting });
  }
  if (noHeroAnywhere.length) {
    issues.push({ kind: "no_hero_anywhere", members: noHeroAnywhere });
  }
  if (unknown.length) issues.push({ kind: "heroes_unknown", members: unknown });

  const order: Record<IssueSeverity, number> = {
    blocker: 0,
    warning: 1,
    info: 2,
  };
  return issues.sort(
    (first, second) =>
      order[issueSeverity(first)] - order[issueSeverity(second)],
  );
}
