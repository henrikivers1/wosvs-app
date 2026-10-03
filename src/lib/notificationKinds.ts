// Notification categories (one colour per kind of action) and localized text
// for the notification types the database fills with structured data.

export type NotificationCategory =
  | "victory"
  | "defeat"
  | "battle"
  | "assignment"
  | "role"
  | "tag"
  | "alliance"
  | "membership"
  | "removal"
  | "comment"
  | "notice";

export const NOTIFICATION_CATEGORIES: Record<
  NotificationCategory,
  { label: string; icon: string }
> = {
  victory: { label: "Victory", icon: "🏆" },
  defeat: { label: "Defeat", icon: "💀" },
  battle: { label: "Battle", icon: "⚔️" },
  assignment: { label: "Rally assignment", icon: "🎯" },
  role: { label: "Role", icon: "🛡️" },
  tag: { label: "Tag", icon: "🏷️" },
  alliance: { label: "Alliance", icon: "🏰" },
  membership: { label: "Membership", icon: "👋" },
  removal: { label: "Removed", icon: "✖" },
  comment: { label: "Comment", icon: "💬" },
  notice: { label: "Notice", icon: "📣" },
};

// Inbox filters: several categories can share one chip.
export const NOTIFICATION_FILTERS: {
  key: string;
  label: string;
  categories: NotificationCategory[];
}[] = [
  { key: "all", label: "All", categories: [] },
  { key: "results", label: "Results", categories: ["victory", "defeat"] },
  {
    key: "battle",
    label: "Battles & rallies",
    categories: ["battle", "assignment"],
  },
  {
    key: "member",
    label: "Your account",
    categories: ["role", "tag", "alliance", "membership", "removal"],
  },
  {
    key: "social",
    label: "Comments & notices",
    categories: ["comment", "notice"],
  },
];

const LEGACY_TYPES: Record<string, NotificationCategory> = {
  battle_started: "battle",
  battle_completed: "battle",
  battle_cancelled: "battle",
  attendance_reminder: "battle",
  rallies_generated: "battle",
  svs_drawn: "battle",
  battle_plan_assignment: "assignment",
  battle_plan_published: "assignment",
  battle_plan_assignment_changed: "assignment",
  member_role_changed: "role",
  capability_granted: "role",
  state_tag_awarded: "tag",
  state_alliance_assigned: "alliance",
  state_invite: "membership",
  state_invite_accepted: "membership",
  state_invite_approved: "membership",
  state_join_request: "membership",
  state_join_requested: "membership",
  battle_plan_assignment_removed: "removal",
  capability_revoked: "removal",
  state_tag_removed: "removal",
  state_alliance_removed: "removal",
  member_removed: "removal",
  wos_account_released: "removal",
  state_invite_rejected: "removal",
  battle_plan_comment: "comment",
  battle_plan_comment_mention: "comment",
  state_announcement: "notice",
};

export function notificationCategory(
  type: string,
  stored: string | null | undefined,
  data: NotificationTextData = {},
): NotificationCategory {
  if (type === "battle_result") {
    return data.result === "win" ? "victory" : "defeat";
  }
  if (stored && stored in NOTIFICATION_CATEGORIES) {
    return stored as NotificationCategory;
  }
  return LEGACY_TYPES[type] ?? "notice";
}

export type NotificationTextData = {
  result?: string;
  opponent_state?: number | null;
  battle_name?: string;
  state_name?: string | null;
  player?: string;
  direction?: "up" | "down";
  new_role?: string;
  old_role?: string;
  capability?: string;
  tag_name?: string;
  rally_lead?: boolean;
  alliance_name?: string | null;
  moved?: boolean;
  plan_name?: string;
  rallies?: number;
  players?: number;
  publish_at?: string | null;
  wos_id?: string;
  state_number?: number;
  group_name?: string;
  hero?: string | null;
  formation?: string | null;
  changed?: boolean;
  leader?: boolean;
  // castle_holder | garrison | rally_lead | joiner (plans with pet blocks)
  role?: string;
  // "12:00–14:00 and 16:00–17:00": the blocks this player leads or holds.
  blocks?: string | null;
  // "Ted 12:00–14:00, Ice 14:00–16:00": the group's lead order.
  leads?: string | null;
  battle_start?: string;
};

type Translate = (key: string, values?: Record<string, string | number>) => string;

const ROLE_KEYS: Record<string, string> = {
  owner: "roleOwner",
  admin: "roleAdmin",
  member: "roleMember",
};

// Builds the title and body in the reader's language. Returns null for types
// (or older rows) without the structured data, which then show the stored text.
export function localizedNotificationText(
  type: string,
  data: NotificationTextData,
  t: Translate,
  formatDateTime: (value: string) => string,
): { title: string; body: string } | null {
  const player = data.player ?? "";
  const state = data.state_name ?? t("your state");
  const role = (value?: string) =>
    value ? t(ROLE_KEYS[value] ?? value) : "";
  const capability =
    data.capability === "rally_caller"
      ? t("Coordinator")
      : data.capability === "garrison"
        ? t("Garrison")
        : (data.capability ?? "");
  const start = data.battle_start ? formatDateTime(data.battle_start) : "";

  switch (type) {
    case "battle_result": {
      if (!data.player || !data.result) return null;
      const win = data.result === "win";
      const opponent = data.opponent_state;
      return {
        title: win
          ? opponent
            ? t("Victory! We won against State {opponent}", { opponent })
            : t("Victory! We won")
          : opponent
            ? t("Defeat against State {opponent}", { opponent })
            : t("Defeat"),
        body: win
          ? t("Hi {player}, {state} won {battle}. Thank you for fighting!", {
              player,
              state,
              battle: data.battle_name ?? "",
            })
          : t(
              "Hi {player}, {state} lost {battle}. Thank you for fighting, we regroup for the next SvS.",
              { player, state, battle: data.battle_name ?? "" },
            ),
      };
    }
    case "battle_completed":
      if (!data.battle_name) return null;
      return {
        title: t("Battle over"),
        body: t(
          "{battle} has ended. The win or loss follows as soon as the result is in.",
          { battle: data.battle_name },
        ),
      };
    case "battle_cancelled":
      if (!data.battle_name) return null;
      return {
        title: t("Battle cancelled"),
        body: t("{battle} was cancelled.", { battle: data.battle_name }),
      };
    case "member_role_changed":
      if (!data.player || !data.new_role) return null;
      return {
        title:
          data.direction === "up"
            ? t("Promoted to {role}", { role: role(data.new_role) })
            : t("Role changed to {role}", { role: role(data.new_role) }),
        body: t("{player} is now {role} of {state} (was {oldRole}).", {
          player,
          role: role(data.new_role),
          state,
          oldRole: role(data.old_role),
        }),
      };
    case "member_removed":
      if (!data.player) return null;
      return {
        title: t("Removed from {state}", { state }),
        body: t("{player} was removed from {state} by an admin.", {
          player,
          state,
        }),
      };
    case "capability_granted":
    case "capability_revoked":
      if (!data.player || !data.capability) return null;
      return type === "capability_granted"
        ? {
            title: t("New permission: {capability}", { capability }),
            body: t("{player} can now use {capability} in {state}.", {
              player,
              capability,
              state,
            }),
          }
        : {
            title: t("Permission removed: {capability}", { capability }),
            body: t("{player} can no longer use {capability} in {state}.", {
              player,
              capability,
              state,
            }),
          };
    case "state_tag_awarded":
    case "state_tag_removed": {
      if (!data.player || !data.tag_name) return null;
      const tag = data.rally_lead ? t("Rally Lead") : data.tag_name;
      return type === "state_tag_awarded"
        ? {
            title: data.rally_lead
              ? t("You are a Rally Lead")
              : t("New tag: {tag}", { tag }),
            body: t("{player} gained the {tag} tag in {state}.", {
              player,
              tag,
              state,
            }),
          }
        : {
            title: t("Tag removed: {tag}", { tag }),
            body: t("{player} lost the {tag} tag in {state}.", {
              player,
              tag,
              state,
            }),
          };
    }
    case "state_alliance_assigned":
    case "state_alliance_removed": {
      if (!data.player) return null;
      const alliance = data.alliance_name ?? t("an alliance");
      return type === "state_alliance_assigned"
        ? {
            title: data.moved
              ? t("Moved to {alliance}", { alliance })
              : t("Assigned to {alliance}", { alliance }),
            body: t("{player} is now in {alliance} in {state}.", {
              player,
              alliance,
              state,
            }),
          }
        : {
            title: t("Removed from {alliance}", { alliance }),
            body: t("{player} is no longer assigned to {alliance} in {state}.", {
              player,
              alliance,
              state,
            }),
          };
    }
    case "battle_plan_assignment":
    case "battle_plan_assignment_changed": {
      if (!data.player || !data.group_name) return null;
      const alliance = data.alliance_name ?? t("an alliance not yet selected");
      const leads = data.leads
        ? " " + t("Leads: {leads}.", { leads: data.leads })
        : "";
      if (data.role === "castle_holder") {
        return {
          title: t("You hold the castle"),
          body:
            t(
              "Hi {player}, you're a castle holder {blocks} UTC. When it's your turn, swap to the alliance holding the castle and take over the garrison.",
              { player, blocks: data.blocks ?? "" },
            ) +
            (data.leads
              ? " " + t("Holders: {leads}.", { leads: data.leads })
              : ""),
        };
      }
      if (data.role === "garrison") {
        return {
          title: t("You're in the garrison"),
          body:
            t(
              "Hi {player}, you're in the garrison holding the castle in {alliance}. Stay in the castle the whole battle.",
              { player, alliance },
            ) +
            (data.leads
              ? " " + t("Holders: {leads}.", { leads: data.leads })
              : "") +
            " " +
            t("Please be there by battle start ({start}).", { start }),
        };
      }
      if (data.leader && data.blocks) {
        return {
          title: t("You lead a rally"),
          body:
            t("Hi {player}, you lead {group} {blocks} UTC in {alliance}.", {
              player,
              group: data.group_name,
              blocks: data.blocks,
              alliance,
            }) + leads,
        };
      }
      if (data.leader) {
        return {
          title: t("You lead a rally"),
          body: t(
            "Hi {player}, you're leading {group} in {alliance}. Please be there by battle start ({start}).",
            { player, group: data.group_name, alliance, start },
          ),
        };
      }
      const joining =
        data.hero && data.formation
          ? " " +
            t("You're joining with {hero} and {formation} formation.", {
              hero: data.hero,
              formation: data.formation,
            })
          : data.hero
            ? " " + t("You're joining with {hero}.", { hero: data.hero })
            : data.formation
              ? " " +
                t("Use {formation} formation.", { formation: data.formation })
              : "";
      return {
        title: data.changed
          ? t("Your rally assignment changed")
          : t("Your rally assignment"),
        body:
          t("Hi {player}, you've been assigned to {group} in {alliance}.", {
            player,
            group: data.group_name,
            alliance,
          }) +
          joining +
          leads +
          " " +
          t("Please be there by battle start ({start}).", { start }),
      };
    }
    case "battle_plan_assignment_removed":
      if (!data.player || !data.group_name) return null;
      return {
        title: t("Removed from {group}", { group: data.group_name }),
        body: t(
          "Hi {player}, you are no longer in {group} for {plan} ({start}).",
          {
            player,
            group: data.group_name,
            plan: data.plan_name ?? "",
            start,
          },
        ),
      };
    case "battle_plan_published":
      if (!data.plan_name || !start) return null;
      return {
        title: t("Battle plan published"),
        body: t(
          "{plan} was published for {start}. This account is not assigned to a rally.",
          { plan: data.plan_name, start },
        ),
      };
    case "attendance_reminder":
      if (!data.player || !data.plan_name) return null;
      return {
        title: t("Can you join the SvS?"),
        body: t(
          "{player}: vote whether you can join {plan} so you get a rally spot.",
          { player, plan: data.plan_name },
        ),
      };
    case "rallies_generated":
      if (!data.plan_name) return null;
      return {
        title: t("Rallies are ready for review"),
        body:
          t("{rallies} rallies with {players} players were set up for {plan}.", {
            rallies: data.rallies ?? 0,
            players: data.players ?? 0,
            plan: data.plan_name,
          }) +
          " " +
          (data.publish_at
            ? t("They are published automatically at {time}.", {
                time: formatDateTime(data.publish_at),
              })
            : t("Publish them from Planning.")),
      };
    default:
      return null;
  }
}
