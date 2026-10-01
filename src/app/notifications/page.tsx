"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { useStates } from "@/components/StateProvider";
import { createClient } from "@/lib/supabase/client";

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
};

type NotificationItem = {
  id: number;
  type: string;
  title: string;
  body: string;
  data: NotificationData;
  read_at: string | null;
  created_at: string;
};

type InviteStatus = {
  id: string;
  status: string;
};

function notificationCategory(type: string) {
  if (type === "state_invite" || type === "state_invite_accepted") {
    return { label: "Membership", className: "membership" };
  }
  if (type === "state_poll_created") {
    return { label: "Vote", className: "vote" };
  }
  if (type === "state_announcement") {
    return { label: "Notice", className: "notice" };
  }
  if (type === "state_tag_awarded") {
    return { label: "New tag", className: "tag" };
  }
  if (
    type === "battle_plan_comment" ||
    type === "battle_plan_comment_mention"
  ) {
    return { label: "Plan comment", className: "comment" };
  }
  if (
    type === "battle_plan_assignment" ||
    type === "battle_plan_published"
  ) {
    return { label: "Battle plan", className: "plan" };
  }
  return { label: "Update", className: "general" };
}

export default function NotificationsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { refreshMemberships } = useStates();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [inviteStatuses, setInviteStatuses] = useState<
    Record<string, string>
  >({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [userId, setUserId] = useState<string | null>(null);

  const loadNotifications = useCallback(async () => {
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
      .select("id, type, title, body, data, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    const items = (data ?? []) as NotificationItem[];
    setNotifications(items);
    const inviteIds = [
      ...new Set(
        items
          .map((item) => item.data?.invite_id)
          .filter((id): id is string => Boolean(id))
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
          {}
        )
      );
    } else {
      setInviteStatuses({});
    }

    const unreadIds = items
      .filter((item) => !item.read_at)
      .map((item) => item.id);
    if (unreadIds.length > 0) {
      await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .in("id", unreadIds);
    }

    setLoading(false);
  }, [router, supabase]);

  useEffect(() => {
    const loadId = window.setTimeout(() => {
      void loadNotifications();
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
        () => void loadNotifications()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadNotifications, supabase, userId]);

  async function respondToInvitation(
    inviteId: string,
    acceptInvite: boolean
  ) {
    setMessage("");
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
        : "Invitation declined."
    );
    await loadNotifications();
    await refreshMemberships();
  }

  return (
    <main>
      <AppHeader />
      <section>
        <h2>Notifications</h2>
        <p>
          Battle plans, comments, mentions, tags, votes, notices, and state
          membership updates appear here.
        </p>
        {message && <p className="auth-message">{message}</p>}

        {loading ? (
          <p>Loading notifications...</p>
        ) : notifications.length === 0 ? (
          <p>You do not have any notifications yet.</p>
        ) : (
          <div className="notification-list">
            {notifications.map((notification) => {
              const category = notificationCategory(notification.type);
              const inviteId = notification.data?.invite_id;
              const inviteStatus = inviteId
                ? inviteStatuses[inviteId]
                : undefined;

              return (
                <article
                  key={notification.id}
                  className={`notification-card notification-${category.className}${notification.read_at ? "" : " notification-unread"}`}
                  style={
                    notification.type === "state_tag_awarded" &&
                    notification.data?.tag_color
                      ? { borderLeftColor: notification.data.tag_color }
                      : undefined
                  }
                >
                  <div className="notification-card-heading">
                    <div>
                      <span className="notification-category">
                        {category.label}
                      </span>
                      <h3>{notification.title}</h3>
                    </div>
                    <time dateTime={notification.created_at}>
                      {new Date(notification.created_at).toLocaleString()}
                    </time>
                  </div>
                  <p>{notification.body}</p>

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
                          Accept
                        </button>
                        <button
                          type="button"
                          className="danger-button"
                          onClick={() =>
                            void respondToInvitation(inviteId, false)
                          }
                        >
                          Decline
                        </button>
                      </div>
                    )}

                  {notification.type === "state_invite" &&
                    inviteStatus === "pending_owner" && (
                      <p className="status-badge">
                        Waiting for owner verification
                      </p>
                    )}
                  {notification.type === "state_invite_accepted" && (
                    <Link className="nav-link" href="/state/manage">
                      Review request
                    </Link>
                  )}
                  {notification.type === "state_poll_created" && (
                    <Link className="nav-link" href="/state/votes">
                      Open vote
                    </Link>
                  )}
                  {notification.type === "state_announcement" && (
                    <Link className="nav-link" href="/state/announcements">
                      Open notice
                    </Link>
                  )}
                  {notification.type === "battle_plan_assignment" && (
                    <Link className="nav-link" href={`/state/planning${notification.data?.plan_id ? `#plan-${notification.data.plan_id}` : ""}`}>
                      Open battle plan
                    </Link>
                  )}
                  {notification.type === "battle_plan_published" && (
                    <Link className="nav-link" href={`/state/planning${notification.data?.plan_id ? `#plan-${notification.data.plan_id}` : ""}`}>
                      Open battle plan
                    </Link>
                  )}
                  {(notification.type === "battle_plan_comment" ||
                    notification.type === "battle_plan_comment_mention") && (
                    <Link className="nav-link" href={`/state/planning${notification.data?.plan_id ? `#plan-${notification.data.plan_id}` : ""}`}>
                      Open comments
                    </Link>
                  )}
                  {notification.type === "state_tag_awarded" && (
                    <Link className="nav-link" href="/">
                      Open dashboard
                    </Link>
                  )}
                  {inviteStatus &&
                    !["pending_recipient", "pending_owner"].includes(
                      inviteStatus
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
