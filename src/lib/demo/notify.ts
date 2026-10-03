import { DEMO_USER_ID } from "@/lib/demo/seed";
import {
  demoTable,
  newNumericId,
  nowIso,
  type Row,
} from "@/lib/demo/store";
import { notificationCategory } from "@/lib/notificationKinds";

// The demo version of the database notification triggers. Every demo action
// is diffed against a snapshot taken before it, and each change to one of
// the demo user's own WOS accounts becomes a notification, as it would for a
// member in a real state.

export function notifyDemoUser(
  type: string,
  title: string,
  body: string,
  data: Row,
  stateId: unknown,
  accountId: unknown = null,
) {
  demoTable("notifications").push({
    id: newNumericId(),
    user_id: DEMO_USER_ID,
    type,
    title,
    body,
    data: { ...data, state_id: stateId, wos_account_id: accountId },
    read_at: null,
    created_at: nowIso(),
    state_id: stateId,
    wos_account_id: accountId,
    category: notificationCategory(type, null, data),
  });
}

const TRACKED = [
  "state_members",
  "state_member_capabilities",
  "state_member_tags",
  "state_alliance_members",
  "battle_plan_assignments",
  "battles",
] as const;

type Snapshot = Record<(typeof TRACKED)[number], Row[]>;

export function snapshotDemoMembers(): Snapshot {
  return Object.fromEntries(
    TRACKED.map((table) => [table, demoTable(table).map((row) => ({ ...row }))]),
  ) as Snapshot;
}

const find = (table: string, id: unknown) =>
  demoTable(table).find((row) => row.id === id);

function playerName(accountId: unknown) {
  const account = find("wos_accounts", accountId);
  return (account?.nickname as string) || `WOS ID ${account?.wos_id ?? ""}`;
}

function stateName(stateId: unknown) {
  return (find("states", stateId)?.name as string) ?? null;
}

function isMine(accountId: unknown) {
  return find("wos_accounts", accountId)?.user_id === DEMO_USER_ID;
}

function diff(before: Row[], after: Row[], key: (row: Row) => string) {
  const old = new Map(before.map((row) => [key(row), row]));
  const now = new Map(after.map((row) => [key(row), row]));
  return {
    added: [...now].filter(([id]) => !old.has(id)).map(([, row]) => row),
    removed: [...old].filter(([id]) => !now.has(id)).map(([, row]) => row),
    changed: [...now]
      .filter(([id]) => old.has(id))
      .map(([id, row]) => ({ before: old.get(id)!, after: row })),
  };
}

const ROLE_RANK: Record<string, number> = { member: 0, admin: 1, owner: 2 };

export function emitDemoMemberNotifications(
  before: Snapshot,
  { muted = false }: { muted?: boolean } = {},
) {
  const memberKey = (row: Row) => `${row.state_id}:${row.wos_account_id}`;
  const stillMember = (stateId: unknown, accountId: unknown) =>
    demoTable("state_members").some(
      (row) => row.state_id === stateId && row.wos_account_id === accountId,
    );

  // Battle results: every member of the state, Victory or Defeat.
  for (const { before: old, after: battle } of diff(
    before.battles,
    demoTable("battles"),
    (row) => String(row.id),
  ).changed) {
    const state = stateName(battle.state_id);
    if (battle.status === "completed" && battle.result && battle.result !== old.result) {
      const plan = find("battle_plans", battle.plan_id);
      const opponent = (plan?.opponent_state_number as number) ?? null;
      for (const member of demoTable("state_members")) {
        if (member.state_id !== battle.state_id || !isMine(member.wos_account_id))
          continue;
        const win = battle.result === "win";
        const player = playerName(member.wos_account_id);
        notifyDemoUser(
          "battle_result",
          win ? "Victory! We won" : "Defeat",
          win
            ? `Hi ${player}, ${state} won ${battle.name}. Thank you for fighting!`
            : `Hi ${player}, ${state} lost ${battle.name}. Thank you for fighting, we regroup for the next SvS.`,
          {
            battle_id: battle.id,
            plan_id: battle.plan_id,
            result: battle.result,
            opponent_state: opponent,
            battle_name: battle.name,
            state_name: state,
            player,
          },
          battle.state_id,
          member.wos_account_id,
        );
      }
    }
  }

  if (muted) return;

  // Role changes and removal from the state.
  const members = diff(before.state_members, demoTable("state_members"), memberKey);
  for (const { before: old, after: row } of members.changed) {
    if (old.role === row.role || !isMine(row.wos_account_id)) continue;
    const up = ROLE_RANK[String(row.role)] > ROLE_RANK[String(old.role)];
    notifyDemoUser(
      "member_role_changed",
      `${up ? "Promoted to" : "Role changed to"} ${row.role}`,
      `${playerName(row.wos_account_id)} is now ${row.role} of ${stateName(row.state_id)}.`,
      {
        old_role: old.role,
        new_role: row.role,
        direction: up ? "up" : "down",
        state_name: stateName(row.state_id),
        player: playerName(row.wos_account_id),
      },
      row.state_id,
      row.wos_account_id,
    );
  }
  for (const row of members.removed) {
    if (!isMine(row.wos_account_id)) continue;
    notifyDemoUser(
      "member_removed",
      `Removed from ${stateName(row.state_id)}`,
      `${playerName(row.wos_account_id)} was removed by an admin.`,
      {
        role: row.role,
        state_name: stateName(row.state_id),
        player: playerName(row.wos_account_id),
      },
      row.state_id,
      row.wos_account_id,
    );
  }

  // Capabilities.
  const capabilities = diff(
    before.state_member_capabilities,
    demoTable("state_member_capabilities"),
    (row) => `${memberKey(row)}:${row.capability}`,
  );
  for (const [rows, granted] of [
    [capabilities.added, true],
    [capabilities.removed, false],
  ] as const) {
    for (const row of rows) {
      if (!isMine(row.wos_account_id)) continue;
      if (!granted && !stillMember(row.state_id, row.wos_account_id)) continue;
      notifyDemoUser(
        granted ? "capability_granted" : "capability_revoked",
        granted ? "New permission" : "Permission removed",
        String(row.capability),
        {
          capability: row.capability,
          state_name: stateName(row.state_id),
          player: playerName(row.wos_account_id),
        },
        row.state_id,
        row.wos_account_id,
      );
    }
  }

  // Tags (plan tags are covered by the publish message).
  const tags = diff(
    before.state_member_tags,
    demoTable("state_member_tags"),
    (row) => `${row.tag_id}:${row.wos_account_id}`,
  );
  for (const [rows, awarded] of [
    [tags.added, true],
    [tags.removed, false],
  ] as const) {
    for (const row of rows) {
      const tag = find("state_tags", row.tag_id);
      if (!tag || row.source === "battle_plan" || !isMine(row.wos_account_id))
        continue;
      if (!stillMember(tag.state_id, row.wos_account_id)) continue;
      notifyDemoUser(
        awarded ? "state_tag_awarded" : "state_tag_removed",
        `${awarded ? "New tag" : "Tag removed"}: ${tag.name}`,
        `${playerName(row.wos_account_id)} · ${tag.name}`,
        {
          tag_id: tag.id,
          tag_color: tag.color,
          tag_name: tag.name,
          rally_lead: tag.system_key === "rally_lead",
          source: row.source,
          state_name: stateName(tag.state_id),
          player: playerName(row.wos_account_id),
        },
        tag.state_id,
        row.wos_account_id,
      );
    }
  }

  // Alliance moves.
  const alliances = diff(
    before.state_alliance_members,
    demoTable("state_alliance_members"),
    memberKey,
  );
  const allianceMoves = [
    ...alliances.added.map((row) => ({ row, moved: false })),
    ...alliances.changed
      .filter(({ before: old, after }) => old.alliance_id !== after.alliance_id)
      .map(({ after }) => ({ row: after, moved: true })),
  ];
  for (const { row, moved } of allianceMoves) {
    if (!isMine(row.wos_account_id)) continue;
    const alliance = find("state_alliances", row.alliance_id);
    notifyDemoUser(
      "state_alliance_assigned",
      `${moved ? "Moved to" : "Assigned to"} ${alliance?.name ?? "an alliance"}`,
      playerName(row.wos_account_id),
      {
        alliance_id: row.alliance_id,
        alliance_name: alliance?.name ?? null,
        moved,
        state_name: stateName(row.state_id),
        player: playerName(row.wos_account_id),
      },
      row.state_id,
      row.wos_account_id,
    );
  }
  for (const row of alliances.removed) {
    const alliance = find("state_alliances", row.alliance_id);
    if (!alliance || !isMine(row.wos_account_id)) continue;
    if (!stillMember(row.state_id, row.wos_account_id)) continue;
    notifyDemoUser(
      "state_alliance_removed",
      `Removed from ${alliance.name}`,
      playerName(row.wos_account_id),
      {
        alliance_id: alliance.id,
        alliance_name: alliance.name,
        state_name: stateName(row.state_id),
        player: playerName(row.wos_account_id),
      },
      row.state_id,
      row.wos_account_id,
    );
  }

  // Rally assignments on a published plan.
  const assignments = diff(
    before.battle_plan_assignments,
    demoTable("battle_plan_assignments"),
    (row) => `${row.plan_id}:${row.wos_account_id}`,
  );
  const assignmentChanges = [
    ...assignments.added.map((row) => ({ row, changed: false })),
    ...assignments.changed
      .filter(
        ({ before: old, after }) =>
          old.group_id !== after.group_id ||
          (old.hero ?? null) !== (after.hero ?? null) ||
          (old.formation ?? null) !== (after.formation ?? null),
      )
      .map(({ after }) => ({ row: after, changed: true })),
  ];
  const publishedPlan = (planId: unknown) => {
    const plan = find("battle_plans", planId);
    return plan?.status === "published" ? plan : null;
  };
  const clearPrevious = (planId: unknown, accountId: unknown) => {
    const rows = demoTable("notifications");
    for (let index = rows.length - 1; index >= 0; index -= 1) {
      const row = rows[index];
      const data = (row.data ?? {}) as Row;
      if (
        !row.read_at &&
        (row.type === "battle_plan_assignment_changed" ||
          row.type === "battle_plan_assignment_removed") &&
        data.plan_id === planId &&
        row.wos_account_id === accountId
      ) {
        rows.splice(index, 1);
      }
    }
  };
  for (const row of assignments.removed) {
    const plan = publishedPlan(row.plan_id);
    const group = find("battle_plan_groups", row.group_id);
    if (!plan || !group || !isMine(row.wos_account_id)) continue;
    if (!stillMember(row.state_id, row.wos_account_id)) continue;
    clearPrevious(plan.id, row.wos_account_id);
    notifyDemoUser(
      "battle_plan_assignment_removed",
      `Removed from ${group.name}`,
      `${playerName(row.wos_account_id)} · ${plan.name}`,
      {
        plan_id: plan.id,
        plan_name: plan.name,
        group_id: group.id,
        group_name: group.name,
        battle_start: plan.scheduled_at,
        player: playerName(row.wos_account_id),
      },
      plan.state_id,
      row.wos_account_id,
    );
  }
  for (const { row, changed } of assignmentChanges) {
    const plan = publishedPlan(row.plan_id);
    const group = find("battle_plan_groups", row.group_id);
    if (!plan || !group || !isMine(row.wos_account_id)) continue;
    clearPrevious(plan.id, row.wos_account_id);
    const alliance = find("state_alliances", group.alliance_id);
    notifyDemoUser(
      "battle_plan_assignment_changed",
      changed ? "Your rally assignment changed" : "Your rally assignment",
      `${playerName(row.wos_account_id)} · ${group.name}`,
      {
        plan_id: plan.id,
        group_id: group.id,
        group_name: group.name,
        alliance_id: group.alliance_id,
        alliance_name: alliance?.name ?? null,
        hero: row.hero ?? null,
        formation: row.formation ?? group.formation ?? null,
        changed,
        battle_start: plan.scheduled_at,
        player: playerName(row.wos_account_id),
      },
      plan.state_id,
      row.wos_account_id,
    );
  }
}
