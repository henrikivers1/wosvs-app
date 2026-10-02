"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/components/LanguageProvider";

const MAX_AVATAR_SIZE = 2 * 1024 * 1024;
const ACCEPTED_AVATAR_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

export default function ProfilePage() {
  const { t } = useLanguage();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

  const loadProfile = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.replace("/login");
      return;
    }

    setUserId(user.id);
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("username, avatar_path")
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      setMessage(error.message);
      return;
    }

    setUsername(profile?.username ?? "");
    if (profile?.avatar_path) {
      const { data } = supabase.storage
        .from("avatars")
        .getPublicUrl(profile.avatar_path);
      setAvatarUrl(data.publicUrl + "?v=" + new Date().getTime().toString());
    } else {
      setAvatarUrl(null);
    }
  }, [router, supabase]);

  useEffect(() => {
    const loadId = window.setTimeout(() => {
      void loadProfile();
    }, 0);
    return () => window.clearTimeout(loadId);
  }, [loadProfile]);

  async function uploadAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !userId) return;

    if (!ACCEPTED_AVATAR_TYPES.includes(file.type)) {
      setMessage(t("Choose a JPG, PNG, WebP, or GIF image."));
      event.target.value = "";
      return;
    }

    if (file.size > MAX_AVATAR_SIZE) {
      setMessage(t("The profile picture must be 2 MB or smaller."));
      event.target.value = "";
      return;
    }

    setUploading(true);
    setMessage(t(""));
    const avatarPath = `${userId}/avatar`;
    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(avatarPath, file, {
        upsert: true,
        contentType: file.type,
        cacheControl: "3600",
      });

    if (uploadError) {
      setUploading(false);
      setMessage(uploadError.message);
      return;
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .update({ avatar_path: avatarPath })
      .eq("id", userId);

    setUploading(false);
    event.target.value = "";
    if (profileError) {
      setMessage(profileError.message);
      return;
    }

    setMessage(t("Profile picture updated."));
    await loadProfile();
    router.refresh();
  }

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

        <label className="avatar-upload">
          {t("Profile picture")}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={(event) => void uploadAvatar(event)}
            disabled={uploading}
          />
          <span>{t("JPG, PNG, WebP, or GIF. Maximum 2 MB.")}</span>
        </label>
        {uploading && <p>{t("Uploading profile picture...")}</p>}
        {message && <p className="auth-message">{message}</p>}

        <Link className="nav-link" href="/account">
          {t("Manage WOS accounts")}
        </Link>
      </section>
    </main>
  );
}
