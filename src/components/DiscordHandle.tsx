"use client";

import { useState } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { DISCORD_HANDLE } from "@/lib/contact";

// The official Discord username with a copy button: Discord has no public
// link for a username, so people paste it into "Add Friend".
export function DiscordHandle() {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(DISCORD_HANDLE);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the handle is visible to copy by hand.
    }
  }

  return (
    <span className="discord-handle">
      <span>{t("Discord")}</span>
      <strong>{DISCORD_HANDLE}</strong>
      <button
        type="button"
        className="text-button"
        onClick={() => void copy()}
        aria-label={t("Copy Discord name")}
      >
        {copied ? t("Copied") : t("Copy")}
      </button>
    </span>
  );
}
