"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useStates } from "@/components/StateProvider";

export function AppHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = useMemo(() => createClient(), []);
  const {
    memberships,
    activeMembership,
    loadingStates,
    setActiveMembership,
  } = useStates();
  const [signedIn, setSignedIn] = useState(false);
  const [identityLoaded, setIdentityLoaded] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadIdentity = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setSignedIn(false);
      setIdentityLoaded(true);
      setUsername(null);
      setAvatarUrl(null);
      setUnreadCount(0);
      return;
    }

    setSignedIn(true);
    const [{ data: profile }, { count }] = await Promise.all([
      supabase
        .from("profiles")
        .select("username, avatar_path")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .is("read_at", null),
    ]);

    const publicUsername = profile?.username ?? null;
    setUsername(publicUsername);
    setUnreadCount(count ?? 0);

    if (profile?.avatar_path) {
      const { data } = supabase.storage
        .from("avatars")
        .getPublicUrl(profile.avatar_path);
      setAvatarUrl(data.publicUrl);
    } else {
      setAvatarUrl(null);
    }
    setIdentityLoaded(true);

    if (
      !publicUsername &&
      pathname !== "/login" &&
      pathname !== "/account/setup"
    ) {
      router.replace("/account/setup");
    }
  }, [pathname, router, supabase]);

  useEffect(() => {
    const initialLoadId = window.setTimeout(() => {
      void loadIdentity();
    }, 0);
    const notificationPollId = window.setInterval(() => {
      void loadIdentity();
    }, 15000);

    const { data } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSignedIn(Boolean(session?.user));
        setIdentityLoaded(false);
        if (!session?.user) {
          setUsername(null);
          setAvatarUrl(null);
          setUnreadCount(0);
        }

        window.setTimeout(() => {
          void loadIdentity();
        }, 0);
      }
    );

    return () => {
      window.clearTimeout(initialLoadId);
      window.clearInterval(notificationPollId);
      data.subscription.unsubscribe();
    };
  }, [loadIdentity, supabase]);

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const canCallRallies =
    activeMembership?.role === "owner" ||
    activeMembership?.role === "rally_caller";
  const canUseGarrison =
    activeMembership?.role === "owner" ||
    activeMembership?.role === "garrison";
  const profileInitial = username?.charAt(0).toUpperCase() || "?";

  return (
    <header>
      <div className="header-top">
        <div>
          <h1>WOS Battle Planner</h1>
          <p>SVS castle rally and reinforcement timing.</p>
        </div>

        {signedIn ? (
          <div className="account-controls">
            <Link
              className="notification-button"
              href="/notifications"
              aria-label={`${unreadCount} unread notifications`}
              title="Notifications"
            >
              <span aria-hidden="true">🔔</span>
              {unreadCount > 0 && (
                <span className="notification-count">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </Link>

            <details className="profile-menu">
              <summary aria-label="Open profile menu">
                <span
                  className="profile-avatar"
                  style={
                    avatarUrl
                      ? { backgroundImage: `url(${avatarUrl})` }
                      : undefined
                  }
                >
                  {!avatarUrl && profileInitial}
                </span>
              </summary>
              <div className="profile-dropdown">
                <span className="profile-username">
                  {username
                    ? `@${username}`
                    : identityLoaded
                      ? "Setup required"
                      : "Profile"}
                </span>
                <Link href="/profile">Profile</Link>
                <Link href="/account">WOS accounts</Link>
                <button type="button" onClick={signOut}>
                  Sign out
                </button>
              </div>
            </details>
          </div>
        ) : (
          <Link className="nav-link header-sign-in" href="/login">
            Sign in
          </Link>
        )}
      </div>

      {signedIn && memberships.length > 0 && (
        <div className="state-selector-row">
          <label>
            Active state and WOS account
            <select
              value={activeMembership?.key ?? ""}
              onChange={(event) =>
                setActiveMembership(event.target.value)
              }
            >
              {memberships.map((membership) => (
                <option key={membership.key} value={membership.key}>
                  {membership.stateName} —{" "}
                  {membership.wosNickname || membership.wosId}
                  {` (${membership.role.replace("_", " ")})`}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {signedIn && !loadingStates && memberships.length === 0 && (
        <p className="state-status">You have not joined a state yet.</p>
      )}
      <nav>
        {canCallRallies && (
          <>
            <Link className="nav-link" href="/admin/leaders">
              Manage leaders
            </Link>
            <Link className="nav-link" href="/admin/call-rally">
              Call rally
            </Link>
          </>
        )}
        {canUseGarrison && (
          <Link className="nav-link" href="/garrison">
            Garrison
          </Link>
        )}
        {activeMembership?.role === "owner" && (
          <Link className="nav-link" href="/state/manage">
            Manage state
          </Link>
        )}
      </nav>
    </header>
  );
}
