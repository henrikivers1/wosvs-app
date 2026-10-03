"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { useStates } from "@/components/StateProvider";
import { useLanguage } from "@/components/LanguageProvider";
import { canUseBattleTool } from "@/lib/battleAccess";

// "Live Battle" opens the tool this account needs: Call rally for
// coordinators, the garrison timer for everyone else with a battle role.
export default function LiveBattlePage() {
  const { t } = useLanguage();
  const router = useRouter();
  const { activeMembership, loadingStates } = useStates();
  const target = canUseBattleTool(activeMembership, "rally_caller")
    ? "/admin/call-rally"
    : canUseBattleTool(activeMembership, "garrison")
      ? "/garrison"
      : null;

  useEffect(() => {
    if (!loadingStates && target) router.replace(target);
  }, [loadingStates, router, target]);

  return (
    <main>
      <AppHeader />
      {loadingStates || target ? (
        <section className="loading-panel">
          <p>{t("Loading Live Battle...")}</p>
        </section>
      ) : (
        <section className="empty-state">
          <h2>
            {activeMembership?.battleId
              ? t("This WOS account does not have a live battle role.")
              : t("No active battle")}
          </h2>
          <p>
            {t(
              "Battles start automatically at 12:00 UTC on battle day. Live tools appear here then.",
            )}
          </p>
          <Link className="nav-link" href="/state/overwatch">
            {t("Open Overwatch")}
          </Link>
        </section>
      )}
    </main>
  );
}
