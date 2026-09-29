"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/client";

export default function AcceptStateInvitePage() {
  const params = useParams<{ token: string }>();
  const supabase = useMemo(() => createClient(), []);
  const [message, setMessage] = useState("");
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  async function acceptInvitation() {
    setAccepting(true);
    setMessage("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setAccepting(false);
      setMessage("Sign in first, then reopen this invitation link.");
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
      "Invitation accepted. The state owner must now verify and approve you before you receive access."
    );
  }

  return (
    <main>
      <AppHeader />
      <section className="auth-card">
        <h2>State invitation</h2>
        <p>
          Accepting sends a membership request to the state owner. You do
          not receive state access until the owner verifies and approves
          your WOS account.
        </p>
        {!accepted && (
          <button
            type="button"
            onClick={acceptInvitation}
            disabled={accepting}
          >
            {accepting ? "Accepting..." : "Accept invitation"}
          </button>
        )}
        {message && <p className="auth-message">{message}</p>}
        {accepted ? (
          <Link className="nav-link" href="/notifications">
            View notifications
          </Link>
        ) : (
          <Link className="nav-link" href="/login">
            Sign in
          </Link>
        )}
      </section>
    </main>
  );
}
