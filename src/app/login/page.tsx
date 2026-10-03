"use client";

import Image from "next/image";
import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { useLanguage } from "@/components/LanguageProvider";
import { PinField } from "@/components/PinField";
import { enterDemo } from "@/lib/demo/mode";

export default function LoginPage() {
  const { t } = useLanguage();
  const router = useRouter();
  const [wosId, setWosId] = useState("");
  const [pin, setPin] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wosId: wosId.trim(), pin }),
      });
      const result = (await response.json()) as {
        error?: string;
        lockedMinutes?: number;
        mustChangePin?: boolean;
      };
      if (!response.ok) {
        setMessage(
          result.lockedMinutes
            ? t("Too many wrong PINs. Try again in {minutes} minutes.", {
                minutes: result.lockedMinutes,
              })
            : response.status === 401 || response.status === 400
              ? t("Wrong WOS ID or PIN.")
              : t(result.error ?? "Sign-in failed. Try again."),
        );
        setLoading(false);
        return;
      }
      router.push(result.mustChangePin ? "/account/pin" : "/");
      router.refresh();
    } catch {
      setMessage(t("Sign-in failed. Try again."));
      setLoading(false);
    }
  }

  return (
    <main>
      <AppHeader />
      <section className="auth-card">
        <div className="auth-brand">
          <Image
            src="/brand/overwatch-mark-on-dark.svg"
            width={64}
            height={64}
            alt=""
            priority
          />
          <h1>{t("Welcome back")}</h1>
          <p>{t("Sign in to see your SvS, your rally and your send times.")}</p>
        </div>
        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            {t("WOS ID")}
            <input
              type="text"
              inputMode="numeric"
              value={wosId}
              onChange={(event) => setWosId(event.target.value)}
              required
              pattern="[0-9]+"
              autoComplete="username"
              placeholder={t("Your numeric WOS ID")}
            />
          </label>
          <PinField
            label={t("PIN")}
            value={pin}
            onChange={setPin}
            autoComplete="current-password"
          />
          <button className="primary-button" type="submit" disabled={loading}>
            {loading ? t("Please wait...") : t("Sign in")}
          </button>
        </form>

        {message && <p className="auth-message">{message}</p>}

        <p className="form-hint">
          {t(
            "New here? Ask your state leader for the join link and first-time PIN. Forgot your PIN? Your state leader can give you a new one.",
          )}
        </p>

        <div className="demo-entry">
          <p>
            {t(
              "Want to look around first? The private demo has fake players and a fake SvS, lives only in your browser and never touches real data.",
            )}
          </p>
          <button
            type="button"
            className="secondary-link"
            onClick={() => enterDemo()}
          >
            {t("Try the private demo")}
          </button>
        </div>
      </section>
    </main>
  );
}
