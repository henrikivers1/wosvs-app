"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/components/LanguageProvider";

export default function LoginPage() {
  const { t } = useLanguage();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [wosId, setWosId] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(t(""));
    const supabase = createClient();

    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username: username.trim(),
            wos_id: wosId.trim(),
            wos_nickname: "",
          },
        },
      });
      setLoading(false);

      if (error) {
        setMessage(
          error.message.includes("Database error")
            ? "That username or WOS ID may already be registered."
            : error.message,
        );
        return;
      }
      if (!data.session) {
        setMessage(t("Check your email to confirm your account."));
        return;
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      setLoading(false);

      if (error) {
        setMessage(error.message);
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data: profile } = user
        ? await supabase
            .from("profiles")
            .select("username")
            .eq("id", user.id)
            .maybeSingle()
        : { data: null };

      if (!profile?.username) {
        router.push("/account/setup");
        router.refresh();
        return;
      }
    }

    router.push("/");
    router.refresh();
  }

  return (
    <main>
      <AppHeader />
      <section className="auth-card">
        <h2>{mode === "login" ? t("Sign in") : t("Create account")}</h2>
        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            {t("Email")}
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
            />
          </label>
          <label>
            {t("Password")}
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={6}
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
            />
          </label>
          {mode === "signup" && (
            <>
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
                  autoComplete="username"
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
            </>
          )}
          <button type="submit" disabled={loading}>
            {loading
              ? t("Please wait...")
              : mode === "login"
                ? t("Sign in")
                : t("Create account")}
          </button>
        </form>

        {message && <p className="auth-message">{message}</p>}

        <button
          className="text-button"
          type="button"
          onClick={() => {
            setMode(mode === "login" ? "signup" : "login");
            setMessage(t(""));
          }}
        >
          {mode === "login"
            ? t("Need an account? Sign up")
            : t("Already have an account? Sign in")}
        </button>
      </section>
    </main>
  );
}
