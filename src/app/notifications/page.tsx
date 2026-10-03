"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { useStates } from "@/components/StateProvider";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/components/LanguageProvider";
import {
  localizedNotificationText,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_FILTERS,
  notificationCategory,
  type NotificationTextData,
} from "@/lib/notificationKinds";

type NotificationData = {
  announcement_id?: string;
  invite_id?: string;
  plan_id?: string;
  poll_id?: string;
  state_id?: string;
  comment_id?: string;
  tag_id?: string;
  tag_color?: string;
  token?: string;
} & NotificationTextData;

type NotificationItem = {
  id: number;
  state_id: string | null;
  wos_account_id: string | null;
  category: string;
  type: string;
  title: string;
  body: string;
  data: NotificationData;
  read_at: string | null;
  created_at: string;
};

type AccountLabel = { id: string; nickname: string | null; wos_id: string };
type StateLabel = { id: string; name: string };

type InviteStatus = {
  id: string;
  status: string;
};

export default function NotificationsPage() {
  const { t, formatDateTime } = useLanguage();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { refreshMemberships } = useStates();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [inviteStatuses, setInviteStatuses] = useState<Record<string, string>>(
    {},
  );
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [accountLabels, setAccountLabels] = useState<Record<string, string>>(
    {},
  );
  const [stateLabels, setStateLabels] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState("all");

  // Marks what was there when the page opened as read; notifications that
  // arrive while it is open stay unread (highlighted) until the next visit.
  const loadNotifications = useCallback(async (markRead = false) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.replace("/login");
      return;
    }

    setUserId(user.id);

    const { data, error } = await supabase
      .from("notifications")
      .select(
        "id, state_id, wos_account_id, category, type, title, body, data, read_at, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    const items = (data ?? []) as NotificationItem[];
    setNotifications(items);
    const accountIds = [
      ...new Set(
        items
          .map((item) => item.wos_account_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const stateIds = [
      ...new Set(
        items
          .map((item) => item.state_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const [accountResult, stateResult] = await Promise.all([
      accountIds.length
        ? supabase
            .from("wos_accounts")
            .select("id, nickname, wos_id")
            .in("id", accountIds)
        : Promise.resolve({ data: [], error: null }),
      stateIds.length
        ? supabase.from("states").select("id, name").in("id", stateIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    setAccountLabels(
      ((accountResult.data ?? []) as AccountLabel[]).reduce<
        Record<string, string>
      >((labels, account) => {
        labels[account.id] = account.nickname || `WOS ID ${account.wos_id}`;
        return labels;
      }, {}),
    );
    setStateLabels(
      ((stateResult.data ?? []) as StateLabel[]).reduce<Record<string, string>>(
        (labels, state) => {
          labels[state.id] = state.name;
          return labels;
        },
        {},
      ),
    );
    const inviteIds = [
      ...new Set(
        items
          .map((item) => item.data?.invite_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    if (inviteIds.length > 0) {
      const { data: invites } = await supabase
        .from("state_invites")
        .select("id, status")
        .in("id", inviteIds);
      setInviteStatuses(
        ((invites ?? []) as InviteStatus[]).reduce<Record<string, string>>(
          (statuses, invite) => {
            statuses[invite.id] = invite.status;
            return statuses;
          },
          {},
        ),
      );
    } else {
      setInviteStatuses({});
    }

    const unreadIds = items
      .filter((item) => !item.read_at)
      .map((item) => item.id);
    if (markRead && unreadIds.length > 0) {
      await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .in("id", unreadIds);
    }

    setLoading(false);
  }, [router, supabase]);

  useEffect(() => {
    const loadId = window.setTimeout(() => {
      void loadNotifications(true);
    }, 0);
    return () => window.clearTimeout(loadId);
  }, [loadNotifications]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`notification-inbox-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => void loadNotifications(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadNotifications, supabase, userId]);

  async function respondToInvitation(inviteId: string, acceptInvite: boolean) {
    setMessage(t(""));
    const { error } = await supabase.rpc("respond_to_state_invite", {
      target_invite_id: inviteId,
      accept_invite: acceptInvite,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage(
      acceptInvite
        ? "Invitation accepted. The state owner must now verify and approve you."
        : "Invitation declined.",
    );
    await loadNotifications();
    await refreshMemberships();
  }

  const activeFilter =
    NOTIFICATION_FILTERS.find((item) => item.key === filter) ??
    NOTIFICATION_FILTERS[0];
  const visibleNotifications = activeFilter.categories.length
    ? notifications.filter((notification) =>
        activeFilter.categories.includes(
          notificationCategory(
            notification.type,
            notification.category,
            notification.data,
          ),
        ),
      )
    : notifications;

  return (
    <main>
      <AppHeader />
      <section>
        <h2>{t("Notifications")}</h2>
        <p>
          {t(
            "Battle results, rally assignments and everything an admin changes on your accounts appear here, colour-coded by action.",
          )}
        </p>
        {message && <p className="auth-message">{message}</p>}
        {notifications.length > 0 && (
          <div className="notification-filters" role="tablist">
            {NOTIFICATION_FILTERS.map((item) => (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={filter === item.key}
                className={
                  filter === item.key
                    ? "notification-filter active"
                    : "notification-filter"
                }
                onClick={() => setFilter(item.key)}
              >
                {t(item.label)}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <p>{t("Loading notifications...")}</p>
        ) : notifications.length === 0 ? (
          <p>{t("You do not have any notifications yet.")}</p>
        ) : (
          <div className="notification-list">
            {visibleNotifications.length === 0 && (
              <p>{t("No notifications in this filter.")}</p>
            )}
            {visibleNotifications.map((notification) => {
              const category = notificationCategory(
                notification.type,
                notification.category,
                notification.data,
              );
              const categoryInfo = NOTIFICATION_CATEGORIES[category];
              const text = localizedNotificationText(
                notification.type,
                notification.data ?? {},
                t,
                formatDateTime,
              ) ?? { title: t(notification.title), body: notification.body };
              const inviteId = notification.data?.invite_id;
              const inviteStatus = inviteId
                ? inviteStatuses[inviteId]
                : undefined;

              return (
                <article
                  key={notification.id}
                  className={`notification-card notification-${category}${notification.read_at ? "" : " notification-unread"}`}
                  style={
                    category === "tag" && notification.data?.tag_color
                      ? ({
                          "--notification-color": notification.data.tag_color,
                        } as CSSProperties)
                      : undefined
                  }
                >
                  <div className="notification-card-heading">
                    <div>
                      <span className="notification-category">
                        <span aria-hidden="true">{categoryInfo.icon}</span>{" "}
                        {t(categoryInfo.label)}
                      </span>
                      <h3>{text.title}</h3>
                      {(notification.state_id ||
                        notification.wos_account_id) && (
                        <small className="notification-context">
                          {[
                            notification.state_id
                              ? stateLabels[notification.state_id]
                              : null,
                            notification.wos_account_id
                              ? accountLabels[notification.wos_account_id]
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </small>
                      )}
                    </div>
                    <time dateTime={notification.created_at}>
                      {formatDateTime(notification.created_at)}
                    </time>
                  </div>
                  <p>{text.body}</p>

                  {notification.type === "state_invite" &&
                    inviteId &&
                    inviteStatus === "pending_recipient" && (
                      <div className="notification-actions">
                        <button
                          type="button"
                          onClick={() =>
                            void respondToInvitation(inviteId, true)
                          }
                        >
                          {t("Accept")}
                        </button>
                        <button
                          type="button"
                          className="danger-button"
                          onClick={() =>
                            void respondToInvitation(inviteId, false)
                          }
                        >
                          {t("Decline")}
                        </button>
                      </div>
                    )}

                  {notification.type === "state_invite" &&
                    inviteStatus === "pending_owner" && (
                      <p className="status-badge">
                        {t("Waiting for owner verification")}
                      </p>
                    )}
                  {(notification.type === "state_invite_accepted" ||
                    notification.type === "state_join_request") && (
                    <Link className="nav-link" href="/state/manage">
                      {t("Review request")}
                    </Link>
                  )}
                  {notification.type === "svs_drawn" && (
                    <Link className="nav-link" href="/state/overwatch">
                      {t("Open Overwatch")}
                    </Link>
                  )}
                  {notification.type === "state_announcement" && (
                    <Link className="nav-link" href="/state/overwatch">
                      {t("Open Overwatch")}
                    </Link>
                  )}
                  {(notification.type === "battle_plan_assignment" ||
                    notification.type === "battle_plan_assignment_changed") && (
                    <Link className="nav-link" href="/state/overwatch">
                      {t("Open Overwatch")}
                    </Link>
                  )}
                  {notification.type === "battle_plan_published" && (
                    <Link className="nav-link" href="/state/overwatch">
                      {t("Open Overwatch")}
                    </Link>
                  )}
                  {(notification.type === "battle_plan_comment" ||
                    notification.type === "battle_plan_comment_mention") && (
                    <Link className="nav-link" href="/state/overwatch">
                      {t("Open comments")}
                    </Link>
                  )}
                  {notification.type === "state_tag_awarded" && (
                    <Link className="nav-link" href="/state/overwatch">
                      {t("Open Overwatch")}
                    </Link>
                  )}
                  {notification.type === "state_alliance_assigned" && (
                    <Link className="nav-link" href="/state/overwatch">
                      {t("Open Overwatch")}
                    </Link>
                  )}
                  {notification.type === "battle_started" && (
                    <Link className="nav-link" href="/battle">
                      {t("Open Live Battle")}
                    </Link>
                  )}
                  {(notification.type === "battle_completed" ||
                    notification.type === "battle_result" ||
                    notification.type === "battle_cancelled") && (
                    <Link className="nav-link" href="/state/stats">
                      {t("Open battle history")}
                    </Link>
                  )}
                  {inviteStatus &&
                    !["pending_recipient", "pending_owner"].includes(
                      inviteStatus,
                    ) && (
                      <p className="status-badge">
                        {inviteStatus.replace("_", " ")}
                      </p>
                    )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
