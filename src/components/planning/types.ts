import type { GroupShift } from "@/lib/autofill";

// Shapes shared by the Planning page and its components.

export type BattlePlan = {
  id: string;
  name: string;
  battle_type: "svs" | "castle" | "test";
  scheduled_at: string;
  notes: string | null;
  status: "draft" | "published";
  opponent_state_number: number | null;
  auto_created: boolean;
  attendance_reminder_sent_at: string | null;
  auto_planned_at: string | null;
};

export type PlanGroup = {
  id: string;
  plan_id: string;
  name: string;
  leader_wos_account_id: string;
  alliance_id: string | null;
  assignment_tag_id: string | null;
  max_members: number;
  notes: string | null;
  sort_order: number;
  formation: string | null;
  joiner_heroes: string[];
  shift: GroupShift;
};

export type PlanAssignment = {
  plan_id: string;
  group_id: string;
  wos_account_id: string;
  hero: string | null;
};

export type StateTag = {
  id: string;
  name: string;
  color: string;
  system_key: string | null;
  kind?: "custom" | "rally" | "hero";
};

export type StateAlliance = {
  id: string;
  name: string;
  color: string;
  max_members: number;
};

export type AccountRow = {
  id: string;
  user_id: string;
  wos_id: string;
  nickname: string | null;
  furnace_level: number | null;
  furnace_level_raw: number | null;
  power: number | null;
  labyrinth_score: number | null;
  heroes_updated_at: string | null;
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

export type StateMember = AccountRow & {
  role: string;
  username: string | null;
  tags: StateTag[];
  // Joiner heroes the player has at 4★ or higher.
  heroes: string[];
};

export function memberName(member: Pick<StateMember, "nickname" | "wos_id">) {
  return member.nickname || member.wos_id;
}

export function averageTroopTier(member: StateMember) {
  const tiers = [
    member.infantry_tier,
    member.lancer_tier,
    member.marksman_tier,
  ].filter((value): value is number => value !== null);
  return tiers.length
    ? tiers.reduce((sum, value) => sum + value, 0) / tiers.length
    : 0;
}
