"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/components/LanguageProvider";

export default function AccountSetupPage() {
  const { t } = useLanguage();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [username, setUsername] = useState("");
  const [wosId, setWosId] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function checkSetup() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }

      const [{ data: profile }, { data: accounts }] = await Promise.all([
        supabase
          .from("profiles")
          .select("username")
          .eq("id", user.id)
          .maybeSingle(),
        supabase
          .from("wos_accounts")
          .select("id")
          .eq("user_id", user.id)
          .eq("is_configured", true)
          .limit(1),
      ]);

      if (profile?.username && accounts && accounts.length > 0) {
        router.replace("/account");
      }
    }

    void checkSetup();
  }, [router, supabase]);

  async function completeSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    const { error } = await supabase.rpc("complete_account_setup", {
      chosen_username: username.trim(),
      chosen_wos_id: wosId.trim(),
      chosen_wos_nickname: null,
    });

    setSaving(false);

    if (error) {
      setMessage(
        error.code === "23505"
          ? "That username or WOS ID is already registered."
          : error.message,
      );
      return;
    }

    router.push("/account");
    router.refresh();
  }

  return (
    <main>
      <AppHeader />
      <section className="auth-card">
        <h2>{t("Complete your account")}</h2>
        <p>
          {t(
            "Your username is public. Your email remains private and is only used to sign in.",
          )}
        </p>
        <form className="auth-form" onSubmit={completeSetup}>
          <label>
            {t("Public username")}
            <input
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
              minLength={3}
              maxLength={24}
              pattern="[A-Za-z0-9_]+"
              placeholder={t("Henrik")}
            />
          </label>
          <label>
            {t("WOS ID")}
            <input
              type="text"
              inputMode="numeric"
              value={wosId}
              onChange={(event) => setWosId(event.target.value)}
              required
              pattern="[0-9]+"
              placeholder={t("Your numeric WOS ID")}
            />
          </label>
          <p className="form-hint">
            {t(
              "Your in-game name and public game data will be synchronized automatically from your WOS ID.",
            )}
          </p>
          <button className="primary-button" type="submit" disabled={saving}>
            {saving ? t("Saving...") : t("Complete setup")}
          </button>
        </form>
        {message && <p className="auth-message">{message}</p>}
      </section>
    </main>
  );
}
