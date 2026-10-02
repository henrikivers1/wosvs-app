"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/components/LanguageProvider";

export default function AcceptStateInvitePage() {
  const { t } = useLanguage();
  const params = useParams<{ token: string }>();
  const supabase = useMemo(() => createClient(), []);
  const [message, setMessage] = useState("");
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  async function acceptInvitation() {
    setAccepting(true);
    setMessage(t(""));

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setAccepting(false);
      setMessage(t("Sign in first, then reopen this invitation link."));
      return;
    }

    const { error } = await supabase.rpc("accept_state_invite", {
      invite_token: params.token,
    });
    setAccepting(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setAccepted(true);
    setMessage(
      t(
        "Invitation accepted. The state owner must now verify and approve you before you receive access.",
      ),
    );
  }

  return (
    <main>
      <AppHeader />
      <section className="auth-card">
        <h2>{t("State invitation")}</h2>
        <p>
          {t(
            "Accepting sends a membership request to the state owner. You do not receive state access until the owner verifies and approves your WOS account.",
          )}
        </p>
        {!accepted && (
          <button type="button" onClick={acceptInvitation} disabled={accepting}>
            {accepting ? t("Accepting...") : t("Accept invitation")}
          </button>
        )}
        {message && <p className="auth-message">{message}</p>}
        {accepted ? (
          <Link className="nav-link" href="/notifications">
            {t("View notifications")}
          </Link>
        ) : (
          <Link className="nav-link" href="/login">
            {t("Sign in")}
          </Link>
        )}
      </section>
    </main>
  );
}
