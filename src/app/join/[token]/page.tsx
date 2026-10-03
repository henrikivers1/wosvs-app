"use client";

import Image from "next/image";
import Link from "next/link";
import { type FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { useLanguage } from "@/components/LanguageProvider";
import { PinField } from "@/components/PinField";

type Checked = { status: "new" | "existing"; nickname: string };

// Joining a state with the link and first-time PIN from its leader.
export default function JoinPage() {
  const { t } = useLanguage();
  const router = useRouter();
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<{ stateName: string } | null>(null);
  const [linkError, setLinkError] = useState("");
  const [wosId, setWosId] = useState("");
  const [linkPin, setLinkPin] = useState("");
  const [checked, setChecked] = useState<Checked | null>(null);
  const [pin, setPin] = useState("");
  const [pinAgain, setPinAgain] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch(`/api/auth/join?token=${encodeURIComponent(token)}`)
      .then(async (response) => {
        const result = (await response.json()) as {
          stateName?: string;
          error?: string;
        };
        if (!active) return;
        if (response.ok && result.stateName) {
          setState({ stateName: result.stateName });
        } else {
          setLinkError(
            response.status === 404
              ? t("This join link no longer works. Ask your state leader for the new one.")
              : t(result.error ?? "This join link could not be opened."),
          );
        }
      })
      .catch(() => active && setLinkError(t("This join link could not be opened.")));
    return () => {
      active = false;
    };
  }, [t, token]);

  async function send(withPin: boolean) {
    const response = await fetch("/api/auth/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        linkPin,
        wosId: wosId.trim(),
        ...(withPin ? { pin } : {}),
      }),
    });
    const result = (await response.json()) as Partial<Checked> & {
      error?: string;
      lockedMinutes?: number;
      ok?: boolean;
    };
    if (!response.ok) {
      setMessage(
        result.lockedMinutes
          ? t("Too many wrong PINs. Try again in {minutes} minutes.", {
              minutes: result.lockedMinutes,
            })
          : t(result.error ?? "Joining failed. Try again."),
      );
    }
    return response.ok ? result : null;
  }

  async function check(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const result = await send(false);
      if (result?.status) {
        setChecked({ status: result.status, nickname: result.nickname ?? "" });
      }
    } catch {
      setMessage(t("Joining failed. Try again."));
    }
    setLoading(false);
  }

  async function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if (checked?.status === "new" && pin !== pinAgain) {
      setMessage(t("The two PINs are different."));
      return;
    }
    setLoading(true);
    try {
      const result = await send(true);
      if (result?.ok) {
        router.push("/");
        router.refresh();
        return;
      }
    } catch {
      setMessage(t("Joining failed. Try again."));
    }
    setLoading(false);
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
          <h1>
            {state
              ? t("Join {state}", { state: state.stateName })
              : t("Join your state")}
          </h1>
          {!checked && state && (
            <p>
              {t(
                "Enter your WOS ID and the first-time PIN your state leader shared. We check with WOSOracle that you are in this state.",
              )}
            </p>
          )}
        </div>

        {linkError && <p className="auth-message">{linkError}</p>}

        {state && !checked && (
          <form className="auth-form" onSubmit={check}>
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
              label={t("First-time PIN")}
              value={linkPin}
              onChange={setLinkPin}
              autoComplete="off"
            />
            <button className="primary-button" type="submit" disabled={loading}>
              {loading ? t("Checking...") : t("Continue")}
            </button>
          </form>
        )}

        {state && checked && (
          <form className="auth-form" onSubmit={join}>
            <p>
              {checked.status === "new"
                ? t(
                    "Welcome, {player}! Choose your own PIN. You sign in with your WOS ID and this PIN from now on.",
                    { player: checked.nickname },
                  )
                : t(
                    "Welcome back, {player}! You already have a login. Enter your PIN to join.",
                    { player: checked.nickname },
                  )}
            </p>
            <PinField
              label={checked.status === "new" ? t("Your new PIN") : t("Your PIN")}
              value={pin}
              onChange={setPin}
              autoComplete={checked.status === "new" ? "new-password" : "current-password"}
            />
            {checked.status === "new" && (
              <PinField
                label={t("PIN again")}
                value={pinAgain}
                onChange={setPinAgain}
                autoComplete="new-password"
              />
            )}
            <p className="form-hint">
              {t("6 to 12 digits. Don't reuse the first-time PIN or share yours.")}
            </p>
            <button className="primary-button" type="submit" disabled={loading}>
              {loading ? t("Please wait...") : t("Join")}
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setChecked(null);
                setPin("");
                setPinAgain("");
                setMessage("");
              }}
            >
              {t("Back")}
            </button>
          </form>
        )}

        {message && <p className="auth-message">{message}</p>}

        <p className="form-hint">
          {t("Your in-game name and public game data come from your WOS ID.")}{" "}
          <Link href="/privacy">{t("How we use your data")}</Link>
        </p>
      </section>
    </main>
  );
}
