"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { useLanguage } from "@/components/LanguageProvider";
import { PinField } from "@/components/PinField";
import { createClient } from "@/lib/supabase/client";

// Choose a new PIN. After a one-time PIN (from a leader or a reset) the
// current PIN is not asked again.
export default function ChangePinPage() {
  const { t } = useLanguage();
  const router = useRouter();
  const [mustChange, setMustChange] = useState<boolean | null>(null);
  const [currentPin, setCurrentPin] = useState("");
  const [pin, setPin] = useState("");
  const [pinAgain, setPinAgain] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("must_change_pin")
        .eq("id", user.id)
        .maybeSingle();
      setMustChange(Boolean(data?.must_change_pin));
    })();
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if (pin !== pinAgain) {
      setMessage(t("The two PINs are different."));
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/auth/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPin, newPin: pin }),
      });
      const result = (await response.json()) as {
        error?: string;
        lockedMinutes?: number;
      };
      if (!response.ok) {
        setMessage(
          result.lockedMinutes
            ? t("Too many wrong PINs. Try again in {minutes} minutes.", {
                minutes: result.lockedMinutes,
              })
            : t(result.error ?? "Your PIN could not be changed."),
        );
        setLoading(false);
        return;
      }
      router.push(mustChange ? "/" : "/account");
      router.refresh();
    } catch {
      setMessage(t("Your PIN could not be changed."));
      setLoading(false);
    }
  }

  return (
    <main>
      <AppHeader />
      <section className="auth-card">
        <div className="auth-brand">
          <h1>{mustChange ? t("Choose your PIN") : t("Change PIN")}</h1>
          <p>
            {mustChange
              ? t(
                  "You signed in with a one-time PIN. Choose your own PIN; you sign in with your WOS ID and this PIN from now on.",
                )
              : t("You sign in with your WOS ID and this PIN.")}
          </p>
        </div>
        {mustChange !== null && (
          <form className="auth-form" onSubmit={submit}>
            {!mustChange && (
              <PinField
                label={t("Current PIN")}
                value={currentPin}
                onChange={setCurrentPin}
                autoComplete="current-password"
              />
            )}
            <PinField
              label={t("Your new PIN")}
              value={pin}
              onChange={setPin}
              autoComplete="new-password"
            />
            <PinField
              label={t("PIN again")}
              value={pinAgain}
              onChange={setPinAgain}
              autoComplete="new-password"
            />
            <p className="form-hint">{t("6 to 12 digits.")}</p>
            <button className="primary-button" type="submit" disabled={loading}>
              {loading ? t("Please wait...") : t("Save PIN")}
            </button>
            {!mustChange && (
              <Link className="secondary-link" href="/account">
                {t("Cancel")}
              </Link>
            )}
          </form>
        )}
        {message && <p className="auth-message">{message}</p>}
      </section>
    </main>
  );
}
