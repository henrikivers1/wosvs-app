"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/components/LanguageProvider";
import { fetchProfileAvatarUrl } from "@/lib/profileAvatar";

export default function ProfilePage() {
  const { t } = useLanguage();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [username, setUsername] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const loadProfile = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.replace("/login");
      return;
    }

    const [{ data: profile, error }, gameAvatarUrl] = await Promise.all([
      supabase
        .from("profiles")
        .select("username")
        .eq("id", user.id)
        .maybeSingle(),
      fetchProfileAvatarUrl(supabase, user.id),
    ]);

    if (error) {
      setMessage(error.message);
      return;
    }

    setUsername(profile?.username ?? "");
    setAvatarUrl(gameAvatarUrl);
  }, [router, supabase]);

  useEffect(() => {
    const loadId = window.setTimeout(() => {
      void loadProfile();
    }, 0);
    return () => window.clearTimeout(loadId);
  }, [loadProfile]);

  return (
    <main>
      <AppHeader />
      <section className="profile-card">
        <h2>{t("Your profile")}</h2>
        <div className="profile-editor">
          <span
            className="avatar-preview"
            style={
              avatarUrl ? { backgroundImage: `url(${avatarUrl})` } : undefined
            }
          >
            {!avatarUrl && (username.charAt(0).toUpperCase() || "?")}
          </span>
          <div>
            <p>
              {t("Public username:")}{" "}
              <strong>
                {t("@")}
                {username}
              </strong>
            </p>
            <p>
              {t(
                "Your email remains private. Your username and profile picture may be shown to players who share a state with you.",
              )}
            </p>
          </div>
        </div>

        <p>
          {t(
            "Your profile picture is the in-game avatar of your highest-power WOS account.",
          )}
        </p>
        {message && <p className="auth-message">{message}</p>}

        <Link className="nav-link" href="/account">
          {t("Manage WOS accounts")}
        </Link>
      </section>
    </main>
  );
}
