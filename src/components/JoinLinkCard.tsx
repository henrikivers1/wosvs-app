"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { createClient } from "@/lib/supabase/client";

type JoinLink = { token: string; pin: string; created_at: string };

// The state's join link and first-time PIN for owners and admins to share
// in their chats. It works until they make a new one.
export function JoinLinkCard({
  stateId,
  stateName,
}: {
  stateId: string;
  stateName: string;
}) {
  const { t, formatDateTime } = useLanguage();
  const supabase = useMemo(() => createClient(), []);
  const [link, setLink] = useState<JoinLink | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const { data } = await supabase.rpc("get_state_join_link", {
      target_state_id: stateId,
    });
    setLink(((data as JoinLink[] | null) ?? [])[0] ?? null);
    setLoaded(true);
  }, [stateId, supabase]);

  useEffect(() => {
    const loadId = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(loadId);
  }, [load]);

  async function makeLink() {
    if (
      link &&
      !window.confirm(
        t(
          "Make a new link and PIN? The current ones stop working; players who already joined are not affected.",
        ),
      )
    ) {
      return;
    }
    setBusy(true);
    setMessage("");
    const { data, error } = await supabase.rpc("create_state_join_link", {
      target_state_id: stateId,
    });
    setBusy(false);
    if (error) {
      setMessage(t(error.message));
      return;
    }
    setLink(((data as JoinLink[] | null) ?? [])[0] ?? null);
  }

  const url =
    link && typeof window !== "undefined"
      ? `${window.location.origin}/join/${link.token}`
      : "";
  const chatText = link
    ? t("Join {state} on Overwatch: {link} First-time PIN: {pin}", {
        state: stateName,
        link: url,
        pin: link.pin,
      })
    : "";

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setMessage(t("Copied."));
    } catch {
      setMessage(t("Copy it by hand: select the text above."));
    }
  }

  return (
    <section className="join-link-card">
      <h2>{t("Join link")}</h2>
      <p>
        {t(
          "Share the link and first-time PIN in your state and alliance chats. Players open it, enter their WOS ID and the PIN, and choose their own PIN. WOSOracle confirms they are in your state.",
        )}
      </p>
      {loaded && link && (
        <div className="join-link-details">
          <label>
            {t("Link")}
            <input readOnly value={url} onFocus={(event) => event.target.select()} />
          </label>
          <span className="join-link-pin">
            {t("First-time PIN")}
            <strong className="pin-code">{link.pin}</strong>
          </span>
          <small>
            {t("Made {date}. Works until you make a new one.", {
              date: formatDateTime(link.created_at),
            })}
          </small>
          <div className="button-row">
            <button
              type="button"
              className="primary-button"
              onClick={() => void copy(chatText)}
            >
              {t("Copy chat message")}
            </button>
            <button
              type="button"
              className="secondary-link"
              onClick={() => void copy(url)}
            >
              {t("Copy link")}
            </button>
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => void makeLink()}
            >
              {t("Make a new link")}
            </button>
          </div>
        </div>
      )}
      {loaded && !link && (
        <button
          type="button"
          className="primary-button"
          disabled={busy}
          onClick={() => void makeLink()}
        >
          {t("Make a join link")}
        </button>
      )}
      {message && <p className="form-hint">{message}</p>}
    </section>
  );
}
