"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { DemoBanner } from "@/components/DemoBanner";

const BATTLE_SECTION_PATHS = [
  "/battle",
  "/admin/leaders",
  "/admin/call-rally",
  "/garrison",
];
import {
  STATE_SECTION_PATHS,
  StateSectionNav,
} from "@/components/StateSectionNav";
import { enterDemo, isDemoMode } from "@/lib/demo/mode";
import { useLanguage } from "@/components/LanguageProvider";
import { useStates } from "@/components/StateProvider";
import { canUseBattleTool } from "@/lib/battleAccess";
import { isAppLocale, LANGUAGE_OPTIONS, type AppLocale } from "@/i18n/config";
import { fetchProfileAvatarUrl } from "@/lib/profileAvatar";

export function AppHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = useMemo(() => createClient(), []);
  const { locale, setLocale, t } = useLanguage();
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
  const [userId, setUserId] = useState<string | null>(null);

  const loadIdentity = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    setUserId(user?.id ?? null);
    if (!user) {
      setIdentityLoaded(true);
      setUsername(null);
      setAvatarUrl(null);
      setUnreadCount(0);
      return;
    }

    const [{ data: profile }, { count }, gameAvatarUrl] = await Promise.all([
      supabase
        .from("profiles")
        .select("username, preferred_language")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .is("read_at", null),
      fetchProfileAvatarUrl(supabase, user.id),
    ]);

    const publicUsername = profile?.username ?? null;
    setUsername(publicUsername);
    setUnreadCount(count ?? 0);
    if (isAppLocale(profile?.preferred_language)) {
      setLocale(profile.preferred_language);
    }

    setAvatarUrl(gameAvatarUrl);
    setIdentityLoaded(true);

    if (
      !publicUsername &&
      pathname !== "/login" &&
      pathname !== "/account/setup"
    ) {
      router.replace("/account/setup");
    }
  }, [pathname, router, setLocale, supabase]);

  // Only the unread count changes while the page is open.
  const loadUnreadCount = useCallback(async () => {
    const { count } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .is("read_at", null);
    setUnreadCount(count ?? 0);
  }, [supabase]);

  useEffect(() => {
    const initialLoadId = window.setTimeout(() => {
      void loadIdentity();
    }, 0);

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setIdentityLoaded(false);
      if (!session?.user) {
        setUsername(null);
        setAvatarUrl(null);
        setUnreadCount(0);
      }

      window.setTimeout(() => {
        void loadIdentity();
      }, 0);
    });

    return () => {
      window.clearTimeout(initialLoadId);
      data.subscription.unsubscribe();
    };
  }, [loadIdentity, supabase]);

  // Realtime keeps the bell current; no polling.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`header-notifications-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => void loadUnreadCount(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadUnreadCount, supabase, userId]);

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  async function changeLanguage(nextLocale: AppLocale) {
    setLocale(nextLocale);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      await supabase
        .from("profiles")
        .update({ preferred_language: nextLocale })
        .eq("id", user.id);
    }
  }

  const canCallRallies = canUseBattleTool(activeMembership, "rally_caller");
  const canUseGarrison = canUseBattleTool(activeMembership, "garrison");
  const profileInitial = username?.charAt(0).toUpperCase() || "?";
  function navClassName(href: string) {
    return pathname === href ? "nav-link active-nav-link" : "nav-link";
  }

  function translatedRole(role: string) {
    if (role === "owner") return t("roleOwner");
    if (role === "admin") return t("roleAdmin");
    if (role === "member") return t("roleMember");
    return role.replaceAll("_", " ");
  }

  return (
    <header className="app-header">
      <DemoBanner />
      <div className="header-top">
        <Link className="brand-link" href="/">
          <span className="brand-mark">WOS</span>
          <span className="brand-copy">
            <strong>WOSOverwatch</strong>
            <small>{t("battleCoordination")}</small>
          </span>
        </Link>

        {signedIn === true ? (
          <div className="account-controls">
            <details className="header-language-menu">
              <summary
                className="language-button"
                aria-label={t("language")}
                title={t("language")}
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  width="19"
                  height="19"
                >
                  <circle cx="12" cy="12" r="9" />
                  <path d="M3 12h18M12 3c2.3 2.5 3.5 5.5 3.5 9s-1.2 6.5-3.5 9c-2.3-2.5-3.5-5.5-3.5-9S9.7 5.5 12 3Z" />
                </svg>
              </summary>
              <div className="header-language-dropdown">
                <label className="profile-language-field">
                  <span>{t("language")}</span>
                  <select
                    value={locale}
                    onChange={(event) =>
                      void changeLanguage(event.target.value as AppLocale)
                    }
                  >
                    {LANGUAGE_OPTIONS.map((language) => (
                      <option key={language.code} value={language.code}>
                        {language.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </details>

            <Link
              className="notification-button"
              href="/notifications"
              aria-label={`${unreadCount} ${t("unreadNotifications")}`}
              title={t("notifications")}
            >
              <span aria-hidden="true">🔔</span>
              {unreadCount > 0 && (
                <span className="notification-count">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </Link>

            <details className="profile-menu">
              <summary aria-label={t("openProfileMenu")}>
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
                      ? t("setupRequired")
                      : t("profile")}
                </span>
                <Link href="/profile">{t("profile")}</Link>
                <Link href="/account">{t("wosAccounts")}</Link>
                {!isDemoMode() && (
                  <button type="button" onClick={() => enterDemo()}>
                    {t("Try the private demo")}
                  </button>
                )}
                <button type="button" onClick={signOut}>
                  {t("signOut")}
                </button>
              </div>
            </details>
          </div>
        ) : signedIn === false ? (
          <Link className="nav-link header-sign-in" href="/login">
            {t("signIn")}
          </Link>
        ) : (
          <span className="header-account-placeholder" />
        )}
      </div>

      {signedIn === true && (
        <div className="header-workspace-row">
          <nav aria-label={t("mainNavigation")}>
            {activeMembership && (
              <Link
                className={navClassName("/state/overwatch")}
                href="/state/overwatch"
              >
                {t("overwatch")}
              </Link>
            )}
            {activeMembership && (
              <Link
                className={navClassName("/state/intel")}
                href="/state/intel"
              >
                {t("intel")}
              </Link>
            )}
            {(activeMembership?.role === "owner" ||
              activeMembership?.role === "admin") && (
              <Link
                className={navClassName("/state/planning")}
                href="/state/planning"
              >
                {t("planning")}
              </Link>
            )}
            {activeMembership?.battleId &&
              (canCallRallies || canUseGarrison) && (
                <Link
                  className={
                    BATTLE_SECTION_PATHS.some((path) =>
                      pathname.startsWith(path),
                    )
                      ? "nav-link active-nav-link"
                      : "nav-link"
                  }
                  href="/battle"
                >
                  {t("liveBattle")}
                </Link>
              )}
            {activeMembership && (
              <Link
                className={
                  STATE_SECTION_PATHS.some((path) => pathname.startsWith(path))
                    ? "nav-link active-nav-link"
                    : "nav-link"
                }
                href={
                  activeMembership.role === "owner" ||
                  activeMembership.role === "admin"
                    ? "/state/manage"
                    : "/state/stats"
                }
              >
                {t("state")}
              </Link>
            )}
          </nav>

          {memberships.length > 0 && (
            <label className="state-switcher">
              <span>{t("activeWorkspace")}</span>
              <select
                value={activeMembership?.key ?? ""}
                onChange={(event) => setActiveMembership(event.target.value)}
              >
                {memberships.map((membership) => (
                  <option key={membership.key} value={membership.key}>
                    {membership.stateName} —{" "}
                    {membership.wosNickname || membership.wosId}
                    {` (${translatedRole(membership.role)})`}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
      <StateSectionNav />
      {BATTLE_SECTION_PATHS.some((path) => pathname.startsWith(path)) &&
        (canCallRallies || canUseGarrison) && (
          // Live Battle sub-navigation, so callers can jump between enemy
          // leaders, calling rallies and the garrison timer directly.
          <nav className="state-section-nav" aria-label={t("Live Battle")}>
            {[
              {
                href: "/admin/leaders",
                label: t("Enemy leaders"),
                show: canCallRallies,
              },
              {
                href: "/admin/call-rally",
                label: t("Call rally"),
                show: canCallRallies,
              },
              { href: "/garrison", label: t("Garrison"), show: canUseGarrison },
            ]
              .filter((link) => link.show)
              .map((link) => (
                <Link
                  key={link.href}
                  className={navClassName(link.href)}
                  href={link.href}
                >
                  {link.label}
                </Link>
              ))}
          </nav>
        )}
      {signedIn === true && !loadingStates && memberships.length === 0 && (
        <p className="state-status">{t("noStateSelected")}</p>
      )}
    </header>
  );
}
