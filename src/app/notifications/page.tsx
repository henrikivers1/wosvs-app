"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { useStates } from "@/components/StateProvider";
import { createClient } from "@/lib/supabase/client";

type NotificationData = {
  invite_id?: string;
  state_id?: string;
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

  const loadNotifications = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.replace("/login");
      return;
    }

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
          State invitations and membership decisions appear here. Friend
          requests can use this same inbox when that feature is added.
        </p>
        {message && <p className="auth-message">{message}</p>}

        {loading ? (
          <p>Loading notifications...</p>
        ) : notifications.length === 0 ? (
          <p>You do not have any notifications yet.</p>
        ) : (
          <div className="notification-list">
            {notifications.map((notification) => {
              const inviteId = notification.data?.invite_id;
              const inviteStatus = inviteId
                ? inviteStatuses[inviteId]
                : undefined;

              return (
                <article key={notification.id} className="notification-card">
                  <div className="notification-card-heading">
                    <h3>{notification.title}</h3>
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
