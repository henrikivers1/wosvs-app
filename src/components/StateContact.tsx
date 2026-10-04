"use client";

import { DiscordHandle } from "@/components/DiscordHandle";
import { useLanguage } from "@/components/LanguageProvider";

// How a state leader gets Overwatch for their state: message us on Discord.
// The card goes on the landing and sign-in pages; the compact line on the
// demo banner.
export function StateContact({ compact = false }: { compact?: boolean }) {
  const { t } = useLanguage();

  if (compact) {
    return (
      <div className="state-contact-compact">
        <span>{t("Want this for your state?")}</span>
        <DiscordHandle />
      </div>
    );
  }

  return (
    <section className="state-contact">
      <h2>{t("Get Overwatch for your state")}</h2>
      <p>
        {t(
          "State leaders message us on Discord and we set your state up. Your members then join with a link from you.",
        )}
      </p>
      <DiscordHandle />
    </section>
  );
}
