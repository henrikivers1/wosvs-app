"use client";

import { DiscordHandle } from "@/components/DiscordHandle";
import { useLanguage } from "@/components/LanguageProvider";
import { useStates } from "@/components/StateProvider";

const SOON_MS = 5 * 24 * 60 * 60 * 1000;

// Shown when the active state's paid period ends within 5 days (owners and
// admins) or has ended (everyone: the automation is paused).
export function BillingBanner() {
  const { t, formatDateTime } = useLanguage();
  const { activeMembership } = useStates();
  const paidUntil = activeMembership?.paidUntil;
  if (!activeMembership || !paidUntil) return null;
  // eslint-disable-next-line react-hooks/purity -- a banner, not render-critical
  const left = new Date(paidUntil).getTime() - Date.now();
  const leader = activeMembership.role === "owner" || activeMembership.role === "admin";
  if (left > SOON_MS || (left > 0 && !leader)) return null;
  const date = formatDateTime(paidUntil);

  return (
    <div className={left > 0 ? "billing-banner" : "billing-banner billing-banner-lapsed"} role="status">
      <span>
        {left > 0
          ? t("Overwatch for {state} runs until {date}.", { state: activeMembership.stateName, date })
          : leader
            ? t("Overwatch for {state} is paused since {date}: no draw checks, planning or publishing.", {
                state: activeMembership.stateName,
                date,
              })
            : t("Overwatch for {state} is paused. Your state leader can renew it.", {
                state: activeMembership.stateName,
              })}
      </span>
      {leader && (
        <span className="billing-banner-renew">
          {t("To renew, message us:")} <DiscordHandle />
        </span>
      )}
    </div>
  );
}
