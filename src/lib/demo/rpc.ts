import type { DemoResult } from "@/lib/demo/query";
import { DEMO_USER_ID } from "@/lib/demo/seed";
import {
  emitDemoMemberNotifications,
  notifyDemoUser,
  snapshotDemoMembers,
} from "@/lib/demo/notify";
import {
  demoTable,
  newUuid,
  nowIso,
  saveDemoTables,
  type Row,
} from "@/lib/demo/store";

type Args = Record<string, unknown>;
const BATTLE_WINDOW_MS = 5 * 60 * 60 * 1000;

const ok = (data: unknown = null): DemoResult => ({ data, error: null });
const fail = (message: string): DemoResult => ({
  data: null,
  error: { message },
});

const byId = (table: string, value: unknown) =>
  demoTable(table).find((row) => row.id === value);

function remove(table: string, predicate: (row: Row) => boolean) {
  const rows = demoTable(table);
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    if (predicate(rows[index])) rows.splice(index, 1);
  }
}

function accountName(accountId: unknown) {
  const account = byId("wos_accounts", accountId);
  return (account?.nickname as string) || `WOS ${account?.wos_id ?? ""}`;
}

// Same rule as the database trigger: every group gets "<leader> rally".
function rallyTagFor(stateId: unknown, leaderId: unknown) {
  const name = `${accountName(leaderId).slice(0, 26)} rally`;
  const tags = demoTable("state_tags");
  let tag = tags.find(
    (row) =>
      row.state_id === stateId &&
      String(row.name).toLowerCase() === name.toLowerCase(),
  );
  if (!tag) {
    tag = {
      id: newUuid(),
      state_id: stateId,
      name,
      color: "#4f8fba",
      system_key: null,
      kind: "rally",
      hero_generation: null,
      created_at: nowIso(),
    };
    tags.push(tag);
  }
  return tag.id;
}

function isRallyLead(stateId: unknown, accountId: unknown) {
  const tag = demoTable("state_tags").find(
    (row) => row.state_id === stateId && row.system_key === "rally_lead",
  );
  return demoTable("state_member_tags").some(
    (row) => row.tag_id === tag?.id && row.wos_account_id === accountId,
  );
}

function assign(planId: unknown, groupId: unknown, accountId: unknown) {
  const group = byId("battle_plan_groups", groupId);
  remove(
    "battle_plan_assignments",
    (row) => row.plan_id === planId && row.wos_account_id === accountId,
  );
  if (!group) return null;
  const count = demoTable("battle_plan_assignments").filter(
    (row) => row.group_id === groupId,
  ).length;
  if (count >= (group.max_members as number)) {
    return "This rally group is full.";
  }
  demoTable("battle_plan_assignments").push({
    plan_id: planId,
    group_id: groupId,
    state_id: group.state_id,
    wos_account_id: accountId,
    assigned_at: nowIso(),
  });
  return null;
}

function nextSundayEnd() {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() + ((7 - end.getUTCDay()) % 7));
  end.setUTCHours(23, 59, 59, 0);
  return end.toISOString();
}

const handlers: Record<string, (args: Args) => DemoResult> = {
  create_svs_plan: ({ target_state_id, opponent_number, battle_date }) => {
    if (!opponent_number) return fail("Enter the opponent state number.");
    if (!battle_date) return fail("Choose the battle date.");
    const start = new Date(`${battle_date}T12:00:00Z`);
    if (start.getTime() + BATTLE_WINDOW_MS <= Date.now()) {
      return fail("That battle is already over. Choose a future date.");
    }
    if (
      demoTable("battle_plans").some(
        (plan) =>
          plan.state_id === target_state_id &&
          new Date(plan.scheduled_at as string).getTime() + BATTLE_WINDOW_MS >
            Date.now(),
      )
    ) {
      return fail("This state already has an upcoming battle plan.");
    }
    const id = newUuid();
    const name = `SvS vs ${opponent_number}`;
    demoTable("battle_plans").push({
      id,
      state_id: target_state_id,
      name,
      battle_type: "svs",
      scheduled_at: start.toISOString(),
      notes: null,
      status: "draft",
      opponent_state_number: opponent_number,
      auto_created: true,
      created_at: nowIso(),
      updated_at: nowIso(),
    });
    demoTable("battles").push({
      id: newUuid(),
      state_id: target_state_id,
      name,
      status: "scheduled",
      battle_type: "svs",
      scheduled_at: start.toISOString(),
      plan_id: id,
      result: null,
      created_at: nowIso(),
    });
    return ok(id);
  },

  set_player_heroes: ({ target_wos_account_id, owned_heroes }) => {
    remove(
      "player_heroes",
      (row) => row.wos_account_id === target_wos_account_id,
    );
    [...new Set((owned_heroes as string[]) ?? [])].forEach((hero) =>
      demoTable("player_heroes").push({
        wos_account_id: target_wos_account_id,
        hero,
        updated_at: nowIso(),
      }),
    );
    const account = byId("wos_accounts", target_wos_account_id);
    if (account) account.heroes_updated_at = nowIso();
    return ok();
  },

  set_battle_plan_group_setup: (args) => {
    const group = byId("battle_plan_groups", args.target_group_id);
    if (!group) return fail("Rally group not found.");
    const heroes = [...new Set((args.group_joiner_heroes as string[]) ?? [])];
    if (heroes.length > 4)
      return fail("A rally can have at most four joiner heroes.");
    Object.assign(group, {
      formation: args.group_formation ?? null,
      joiner_heroes: heroes,
      shift: args.group_shift ?? "whole",
    });
    return ok();
  },

  set_assignment_details: (args) => {
    const assignment = demoTable("battle_plan_assignments").find(
      (row) =>
        row.plan_id === args.target_plan_id &&
        row.wos_account_id === args.target_wos_account_id,
    );
    if (assignment) {
      assignment.hero = args.assigned_hero ?? null;
      assignment.formation = args.assigned_formation ?? null;
    }
    return ok();
  },

  apply_battle_plan_autofill: (args) => {
    const planId = args.target_plan_id;
    const plan = byId("battle_plans", planId);
    if (!plan) return fail("Battle plan not found.");
    const groups = demoTable("battle_plan_groups").filter(
      (row) => row.plan_id === planId,
    );
    const leaders = new Set(groups.map((group) => group.leader_wos_account_id));
    if (args.replace_existing) {
      remove(
        "battle_plan_assignments",
        (row) => row.plan_id === planId && !leaders.has(row.wos_account_id),
      );
    }
    let applied = 0;
    for (const draft of (args.new_assignments as Row[]) ?? []) {
      if (leaders.has(draft.wos_account_id)) continue;
      if (!groups.some((group) => group.id === draft.group_id)) continue;
      remove(
        "battle_plan_assignments",
        (row) =>
          row.plan_id === planId && row.wos_account_id === draft.wos_account_id,
      );
      demoTable("battle_plan_assignments").push({
        plan_id: planId,
        group_id: draft.group_id,
        state_id: plan.state_id,
        wos_account_id: draft.wos_account_id,
        hero: draft.hero ?? null,
        formation: null,
        assigned_at: nowIso(),
      });
      applied += 1;
    }
    const full = groups.find(
      (group) =>
        demoTable("battle_plan_assignments").filter(
          (row) => row.group_id === group.id,
        ).length > (group.max_members as number),
    );
    if (full) return fail(`Rally group ${full.name} would be over capacity.`);
    return ok(applied);
  },

  get_upcoming_svs: ({ target_state_id }) =>
    ok(
      demoTable("battle_plans")
        .filter(
          (plan) =>
            plan.state_id === target_state_id &&
            plan.auto_created &&
            new Date(plan.scheduled_at as string).getTime() + BATTLE_WINDOW_MS >
              Date.now(),
        )
        .map((plan) => ({
          plan_id: plan.id,
          opponent_state: plan.opponent_state_number,
          battle_at: plan.scheduled_at,
        })),
    ),

  set_battle_attendance: (args) => {
    const plan = byId("battle_plans", args.target_plan_id);
    if (!plan) return fail("Battle plan not found.");
    remove(
      "battle_attendance",
      (row) =>
        row.plan_id === plan.id &&
        row.wos_account_id === args.target_wos_account_id,
    );
    demoTable("battle_attendance").push({
      plan_id: plan.id,
      state_id: plan.state_id,
      wos_account_id: args.target_wos_account_id,
      availability: args.selected_availability,
      voice_call: Boolean(args.joins_voice),
      updated_at: nowIso(),
    });
    return ok();
  },

  get_battle_plan_comments: ({ target_state_id }) =>
    ok(
      demoTable("battle_plan_comments").filter(
        (row) => row.state_id === target_state_id,
      ),
    ),

  create_battle_plan_comment: (args) => {
    const plan = byId("battle_plans", args.target_plan_id);
    const body = String(args.comment_body ?? "").trim();
    if (!plan || !body) return fail("Write a comment first.");
    const id = newUuid();
    demoTable("battle_plan_comments").push({
      id,
      plan_id: plan.id,
      state_id: plan.state_id,
      author_wos_account_id: args.commenter_wos_account_id,
      author_user_id: DEMO_USER_ID,
      visibility: args.comment_visibility ?? "public",
      body,
      created_at: nowIso(),
    });
    return ok(id);
  },

  delete_battle_plan_comment: ({ target_comment_id }) => {
    remove("battle_plan_comments", (row) => row.id === target_comment_id);
    return ok();
  },

  set_state_rally_lead: ({
    target_state_id,
    target_wos_account_id,
    enabled,
  }) => {
    const tag = demoTable("state_tags").find(
      (row) =>
        row.state_id === target_state_id && row.system_key === "rally_lead",
    );
    if (!tag) return fail("The Rally Lead system tag is missing.");
    remove(
      "state_member_tags",
      (row) =>
        row.tag_id === tag.id && row.wos_account_id === target_wos_account_id,
    );
    if (enabled) {
      demoTable("state_member_tags").push({
        tag_id: tag.id,
        wos_account_id: target_wos_account_id,
        source: "manual",
        assigned_at: nowIso(),
      });
    }
    return ok();
  },

  create_battle_plan_group: (args) => {
    const plan = byId("battle_plans", args.target_plan_id);
    if (!plan) return fail("Battle plan not found.");
    if (!isRallyLead(plan.state_id, args.leader_account_id)) {
      return fail("Only accounts with the Rally Lead tag can lead a group.");
    }
    if (!byId("state_alliances", args.destination_alliance_id)) {
      return fail("Choose a destination alliance from this state.");
    }
    if (
      demoTable("battle_plan_groups").some(
        (row) =>
          row.plan_id === plan.id &&
          row.leader_wos_account_id === args.leader_account_id,
      )
    ) {
      return fail("That player already leads a rally group in this plan.");
    }
    const groups = demoTable("battle_plan_groups");
    const group = {
      id: newUuid(),
      plan_id: plan.id,
      state_id: plan.state_id,
      name: String(args.group_name ?? "").trim() || "Rally group",
      leader_wos_account_id: args.leader_account_id,
      alliance_id: args.destination_alliance_id,
      assignment_tag_id:
        args.publish_tag_id ??
        rallyTagFor(plan.state_id, args.leader_account_id),
      max_members: Number(args.group_max_members ?? 10),
      notes: args.group_notes ?? null,
      sort_order: groups.filter((row) => row.plan_id === plan.id).length,
      created_at: nowIso(),
    };
    groups.push(group);
    assign(plan.id, group.id, args.leader_account_id);
    return ok(group.id);
  },

  update_battle_plan_group: (args) => {
    const group = byId("battle_plan_groups", args.target_group_id);
    if (!group) return fail("Rally group not found.");
    const leaderChanged =
      group.leader_wos_account_id !== args.leader_account_id;
    const oldTag = byId("state_tags", group.assignment_tag_id);
    Object.assign(group, {
      name: String(args.group_name ?? group.name),
      leader_wos_account_id: args.leader_account_id,
      alliance_id: args.destination_alliance_id,
      max_members: Number(args.group_max_members ?? group.max_members),
      notes: args.group_notes ?? null,
      assignment_tag_id:
        !args.publish_tag_id ||
        (leaderChanged &&
          args.publish_tag_id === group.assignment_tag_id &&
          oldTag?.kind === "rally")
          ? rallyTagFor(group.state_id, args.leader_account_id)
          : args.publish_tag_id,
    });
    if (leaderChanged) assign(group.plan_id, group.id, args.leader_account_id);
    return ok();
  },

  delete_battle_plan_group: ({ target_group_id }) => {
    remove(
      "battle_plan_assignments",
      (row) => row.group_id === target_group_id,
    );
    remove("battle_plan_groups", (row) => row.id === target_group_id);
    return ok();
  },

  set_battle_plan_assignment: (args) => {
    if (!args.target_group_id) {
      remove(
        "battle_plan_assignments",
        (row) =>
          row.plan_id === args.target_plan_id &&
          row.wos_account_id === args.target_wos_account_id,
      );
      return ok();
    }
    const error = assign(
      args.target_plan_id,
      args.target_group_id,
      args.target_wos_account_id,
    );
    return error ? fail(error) : ok();
  },

  update_battle_plan: (args) => {
    const plan = byId("battle_plans", args.target_plan_id);
    if (!plan) return fail("Battle plan not found.");
    Object.assign(plan, {
      name: args.plan_name,
      scheduled_at: args.plan_scheduled_at,
      notes: args.plan_notes ?? null,
      updated_at: nowIso(),
    });
    demoTable("battles")
      .filter(
        (battle) => battle.plan_id === plan.id && battle.status === "scheduled",
      )
      .forEach((battle) =>
        Object.assign(battle, {
          name: plan.name,
          scheduled_at: plan.scheduled_at,
        }),
      );
    return ok();
  },

  set_battle_plan_opponent: ({ target_plan_id, opponent_number }) => {
    const plan = byId("battle_plans", target_plan_id);
    if (!plan) return fail("Battle plan not found.");
    plan.opponent_state_number = opponent_number ?? null;
    return ok();
  },

  delete_battle_plan: ({ target_plan_id }) => {
    if (
      demoTable("battles").some(
        (battle) =>
          battle.plan_id === target_plan_id && battle.status === "active",
      )
    ) {
      return fail("This battle is live. End it from the demo bar first.");
    }
    remove("battle_plan_assignments", (row) => row.plan_id === target_plan_id);
    remove("battle_plan_groups", (row) => row.plan_id === target_plan_id);
    remove("battle_attendance", (row) => row.plan_id === target_plan_id);
    remove(
      "battles",
      (row) =>
        row.plan_id === target_plan_id &&
        (row.status === "scheduled" || row.status === "cancelled"),
    );
    remove("battle_plans", (row) => row.id === target_plan_id);
    return ok();
  },

  publish_battle_plan_with_notifications: ({ target_plan_id }) => {
    const plan = byId("battle_plans", target_plan_id);
    if (!plan) return fail("Battle plan not found.");
    const groups = demoTable("battle_plan_groups").filter(
      (row) => row.plan_id === plan.id,
    );
    if (!groups.length)
      return fail("Add at least one rally group before publishing.");
    if (groups.some((group) => !group.alliance_id)) {
      return fail(
        "Every rally group needs a destination alliance before publishing.",
      );
    }
    const assignments = demoTable("battle_plan_assignments").filter(
      (row) => row.plan_id === plan.id,
    );
    for (const assignment of assignments) {
      const group = groups.find((row) => row.id === assignment.group_id);
      if (!group) continue;
      remove(
        "state_alliance_members",
        (row) =>
          row.state_id === plan.state_id &&
          row.wos_account_id === assignment.wos_account_id,
      );
      demoTable("state_alliance_members").push({
        state_id: plan.state_id,
        wos_account_id: assignment.wos_account_id,
        alliance_id: group.alliance_id,
        assigned_at: nowIso(),
      });
      if (group.assignment_tag_id) {
        remove(
          "state_member_tags",
          (row) =>
            row.tag_id === group.assignment_tag_id &&
            row.wos_account_id === assignment.wos_account_id,
        );
        demoTable("state_member_tags").push({
          tag_id: group.assignment_tag_id,
          wos_account_id: assignment.wos_account_id,
          source: "battle_plan",
          source_plan_id: plan.id,
          assigned_at: nowIso(),
        });
      }
    }
    Object.assign(plan, { status: "published", published_at: nowIso() });
    if (!demoTable("battles").some((battle) => battle.plan_id === plan.id)) {
      demoTable("battles").push({
        id: newUuid(),
        state_id: plan.state_id,
        name: plan.name,
        status: "scheduled",
        battle_type: "svs",
        scheduled_at: plan.scheduled_at,
        plan_id: plan.id,
        result: null,
        created_at: nowIso(),
      });
    }
    // One message per member account of the demo user, like the database.
    const myMembers = demoTable("state_members").filter(
      (member) =>
        member.state_id === plan.state_id &&
        demoTable("wos_accounts").some(
          (account) =>
            account.id === member.wos_account_id &&
            account.user_id === DEMO_USER_ID,
        ),
    );
    for (const member of myMembers) {
      const accountId = member.wos_account_id;
      const player = accountName(accountId);
      const mine = assignments.find((row) => row.wos_account_id === accountId);
      const myGroup = groups.find((group) => group.id === mine?.group_id);
      const ledGroup = groups.find(
        (group) => group.leader_wos_account_id === accountId,
      );
      const base = {
        plan_id: plan.id,
        plan_name: plan.name,
        battle_start: plan.scheduled_at,
        player,
      };
      if (ledGroup) {
        const alliance = byId("state_alliances", ledGroup.alliance_id);
        notifyDemoUser(
          "battle_plan_assignment",
          "You lead a rally",
          `Hi ${player}, you're leading ${ledGroup.name}.`,
          {
            ...base,
            group_id: ledGroup.id,
            group_name: ledGroup.name,
            alliance_name: alliance?.name ?? null,
            leader: true,
          },
          plan.state_id,
          accountId,
        );
      } else if (mine && myGroup) {
        const alliance = byId("state_alliances", myGroup.alliance_id);
        notifyDemoUser(
          "battle_plan_assignment",
          "Your rally assignment",
          `Hi ${player}, you've been assigned to ${myGroup.name}.`,
          {
            ...base,
            group_id: myGroup.id,
            group_name: myGroup.name,
            alliance_name: alliance?.name ?? null,
            hero: mine.hero ?? null,
            formation: mine.formation ?? myGroup.formation ?? null,
          },
          plan.state_id,
          accountId,
        );
      } else {
        notifyDemoUser(
          "battle_plan_published",
          "Battle plan published",
          `${plan.name} was published.`,
          base,
          plan.state_id,
          accountId,
        );
      }
    }
    return ok(assignments.length);
  },

  create_state_tag: (args) => {
    const name = String(args.tag_name ?? "").trim();
    if (!name) return fail("Enter a tag name.");
    if (
      demoTable("state_tags").some(
        (row) =>
          row.state_id === args.target_state_id &&
          String(row.name).toLowerCase() === name.toLowerCase(),
      )
    ) {
      return fail("A tag with that name already exists in this state.");
    }
    const id = newUuid();
    demoTable("state_tags").push({
      id,
      state_id: args.target_state_id,
      name,
      color: args.tag_color,
      system_key: null,
      kind: "custom",
      hero_generation: null,
      created_at: nowIso(),
    });
    return ok(id);
  },

  update_state_tag: (args) => {
    const tag = byId("state_tags", args.target_tag_id);
    if (!tag) return fail("Tag not found.");
    Object.assign(tag, {
      name: args.tag_name,
      color: args.tag_color,
    });
    return ok();
  },

  delete_state_tag: ({ target_tag_id }) => {
    const tag = byId("state_tags", target_tag_id);
    if (tag?.system_key)
      return fail("System tags are permanent and cannot be deleted.");
    remove("state_member_tags", (row) => row.tag_id === target_tag_id);
    remove("state_tags", (row) => row.id === target_tag_id);
    return ok();
  },

  set_state_automation: ({ target_state_id, settings }) => {
    const state = byId("states", target_state_id);
    if (!state) return fail("State not found.");
    Object.assign(state, settings as Row);
    return ok();
  },

  set_state_hero_generation: ({ target_state_id, max_generation }) => {
    const state = byId("states", target_state_id);
    if (state) state.hero_generation_max = max_generation ?? null;
    return ok();
  },

  create_state_alliance: (args) => {
    const id = newUuid();
    demoTable("state_alliances").push({
      id,
      state_id: args.target_state_id,
      name: args.alliance_name,
      color: args.alliance_color,
      max_members: args.alliance_max_members ?? 100,
      created_at: nowIso(),
    });
    return ok(id);
  },

  update_state_alliance: (args) => {
    const alliance = byId("state_alliances", args.target_alliance_id);
    if (!alliance) return fail("Alliance not found.");
    Object.assign(alliance, {
      name: args.alliance_name,
      color: args.alliance_color,
      max_members: args.alliance_max_members,
    });
    return ok();
  },

  delete_state_alliance: ({ target_alliance_id }) => {
    remove(
      "state_alliance_members",
      (row) => row.alliance_id === target_alliance_id,
    );
    remove("state_alliances", (row) => row.id === target_alliance_id);
    return ok();
  },

  create_state_announcement: (args) => {
    const stateId = args.target_state_id;
    const members = demoTable("state_members").filter(
      (row) => row.state_id === stateId,
    );
    const type = args.target_audience_type;
    const recipients = members.filter((member) => {
      if (type === "alliance") {
        return demoTable("state_alliance_members").some(
          (row) =>
            row.wos_account_id === member.wos_account_id &&
            row.alliance_id === args.target_audience_id,
        );
      }
      if (type === "tag") {
        return demoTable("state_member_tags").some(
          (row) =>
            row.wos_account_id === member.wos_account_id &&
            row.tag_id === args.target_audience_id,
        );
      }
      if (type === "role") return member.role === args.target_audience_value;
      if (type === "capability") {
        return demoTable("state_member_capabilities").some(
          (row) =>
            row.wos_account_id === member.wos_account_id &&
            row.capability === args.target_audience_value,
        );
      }
      return true;
    });
    const id = newUuid();
    demoTable("state_announcements").push({
      id,
      state_id: stateId,
      title: args.announcement_title,
      body: args.announcement_body,
      audience_type: type,
      audience_id: args.target_audience_id ?? null,
      audience_value: args.target_audience_value ?? null,
      sender_wos_account_id: args.sender_wos_account_id,
      expires_at: nextSundayEnd(),
      created_at: nowIso(),
    });
    recipients.forEach((member) =>
      demoTable("state_announcement_recipients").push({
        announcement_id: id,
        state_id: stateId,
        wos_account_id: member.wos_account_id,
      }),
    );
    return ok(id);
  },

  delete_state_announcement: ({ target_announcement_id }) => {
    remove(
      "state_announcement_recipients",
      (row) => row.announcement_id === target_announcement_id,
    );
    remove("state_announcements", (row) => row.id === target_announcement_id);
    return ok();
  },


  get_state_overview: ({ target_state_id }) => {
    const members = demoTable("state_members").filter(
      (row) => row.state_id === target_state_id,
    );
    const users = new Set(
      members.map(
        (member) => byId("wos_accounts", member.wos_account_id)?.user_id,
      ),
    );
    return ok([
      { player_count: users.size, wos_account_count: members.length },
    ]);
  },

  get_state_battle_history_v2: ({ target_state_id }) =>
    ok(
      demoTable("battles")
        .filter((battle) => battle.state_id === target_state_id)
        .map((battle) => ({
          battle_id: battle.id,
          battle_name: battle.name,
          battle_type: battle.battle_type,
          battle_status: battle.status,
          battle_result: battle.result ?? null,
          scheduled_at: battle.scheduled_at ?? null,
          started_at: battle.started_at ?? null,
          ended_at: battle.ended_at ?? null,
          plan_id: battle.plan_id ?? null,
          rally_count: demoTable("rallies").filter(
            (row) => row.battle_id === battle.id,
          ).length,
          cancelled_rally_count: demoTable("rallies").filter(
            (row) => row.battle_id === battle.id && row.cancelled_at,
          ).length,
          leader_count: demoTable("enemy_leaders").filter(
            (row) => row.battle_id === battle.id,
          ).length,
        })),
    ),

  set_state_member_role: ({
    target_state_id,
    target_wos_account_id,
    new_role,
  }) => {
    const member = demoTable("state_members").find(
      (row) =>
        row.state_id === target_state_id &&
        row.wos_account_id === target_wos_account_id,
    );
    if (!member) return fail("Member not found.");
    if (member.role === "owner") return fail("The owner's role cannot change.");
    member.role = new_role;
    return ok();
  },

  set_state_member_capability: (args) => {
    remove(
      "state_member_capabilities",
      (row) =>
        row.state_id === args.target_state_id &&
        row.wos_account_id === args.target_wos_account_id &&
        row.capability === args.target_capability,
    );
    if (args.capability_enabled) {
      demoTable("state_member_capabilities").push({
        state_id: args.target_state_id,
        wos_account_id: args.target_wos_account_id,
        capability: args.target_capability,
      });
    }
    return ok();
  },

  remove_state_member: ({ target_state_id, target_wos_account_id }) => {
    const matches = (row: Row) =>
      row.state_id === target_state_id &&
      row.wos_account_id === target_wos_account_id;
    for (const table of [
      "state_members",
      "state_member_capabilities",
      "state_alliance_members",
      "battle_plan_assignments",
      "battle_attendance",
      "state_announcement_recipients",
    ]) {
      remove(table, matches);
    }
    return ok();
  },
};

const NOT_IN_DEMO = new Set([
  "create_state_join_invite",
  "review_state_invite",
  "respond_to_state_invite",
  "complete_account_setup",
]);

export function runDemoRpc(name: string, args: Args = {}): DemoResult {
  const handler = handlers[name];
  if (!handler) {
    return fail(
      NOT_IN_DEMO.has(name)
        ? "Invitations and account setup are not available in the demo."
        : "This action is not available in the demo.",
    );
  }
  const before = snapshotDemoMembers();
  const result = handler(args);
  if (!result.error) {
    emitDemoMemberNotifications(before, {
      // Publishing sends its own message per member.
      muted: name === "publish_battle_plan_with_notifications",
    });
    saveDemoTables();
  }
  return result;
}
