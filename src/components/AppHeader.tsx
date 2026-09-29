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
    signedIn,
    loadingStates,
    setActiveMembership,
  } = useStates();
  const [identityLoaded, setIdentityLoaded] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadIdentity = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setIdentityLoaded(true);
      setUsername(null);
      setAvatarUrl(null);
      setUnreadCount(0);
      return;
    }

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
    Boolean(activeMembership?.battleId) &&
    (activeMembership?.role === "owner" ||
      activeMembership?.role === "admin" ||
      activeMembership?.capabilities.includes("rally_caller"));
  const canUseGarrison =
    Boolean(activeMembership?.battleId) &&
    (activeMembership?.role === "owner" ||
      activeMembership?.role === "admin" ||
      activeMembership?.capabilities.includes("garrison"));
  const profileInitial = username?.charAt(0).toUpperCase() || "?";
  function navClassName(href: string) {
    return pathname === href ? "nav-link active-nav-link" : "nav-link";
  }

  return (
    <header className="app-header">
      <div className="header-top">
        <Link className="brand-link" href="/">
          <span className="brand-mark">WOS</span>
          <span className="brand-copy">
            <strong>WOSOverwatch</strong>
            <small>Battle coordination</small>
          </span>
        </Link>

        {signedIn === true ? (
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
        ) : signedIn === false ? (
          <Link className="nav-link header-sign-in" href="/login">
            Sign in
          </Link>
        ) : (
          <span className="header-account-placeholder" />
        )}
      </div>

      {signedIn === true && (
        <div className="header-workspace-row">
          <nav aria-label="Main navigation">
            <Link className={navClassName("/")} href="/">
              Dashboard
            </Link>
            {canCallRallies && (
              <>
                <Link
                  className={navClassName("/admin/leaders")}
                  href="/admin/leaders"
                >
                  Leaders
                </Link>
                <Link
                  className={navClassName("/admin/call-rally")}
                  href="/admin/call-rally"
                >
                  Call rally
                </Link>
              </>
            )}
            {canUseGarrison && (
              <Link
                className={navClassName("/garrison")}
                href="/garrison"
              >
                Garrison
              </Link>
            )}
            {activeMembership && (
              <Link
                className={navClassName("/state/stats")}
                href="/state/stats"
              >
                Stats &amp; history
              </Link>
            )}
            {(activeMembership?.role === "owner" ||
              activeMembership?.role === "admin") && (
              <Link
                className={navClassName("/state/manage")}
                href="/state/manage"
              >
                Manage state
              </Link>
            )}
          </nav>

          {memberships.length > 0 && (
            <label className="state-switcher">
              <span>Active workspace</span>
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
          )}
        </div>
      )}
      {signedIn === true && !loadingStates && memberships.length === 0 && (
        <p className="state-status">
          No state selected. Check your notifications for an invitation.
        </p>
      )}
    </header>
  );
}
