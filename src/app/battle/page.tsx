"use client";

import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { useStates } from "@/components/StateProvider";
import { useLanguage } from "@/components/LanguageProvider";

export default function LiveBattlePage() {
  const { t } = useLanguage();
  const { activeMembership, loadingStates } = useStates();

  if (loadingStates) {
    return (
      <main>
        <AppHeader />
        <section className="loading-panel">
          <p>{t("Loading Live Battle...")}</p>
        </section>
      </main>
    );
  }

  if (!activeMembership?.battleId) {
    return (
      <main>
        <AppHeader />
        <section className="empty-state">
          <h2>{t("No active battle")}</h2>
          <p>
            {t(
              "A published plan must be started before live tools become available.",
            )}
          </p>
          <Link className="nav-link" href="/state/overwatch">
            {t("Open Overwatch")}
          </Link>
        </section>
      </main>
    );
  }

  const canCoordinate =
    activeMembership.role === "owner" ||
    activeMembership.role === "admin" ||
    activeMembership.capabilities.includes("rally_caller");
  const canGarrison =
    activeMembership.role === "owner" ||
    activeMembership.role === "admin" ||
    activeMembership.capabilities.includes("garrison");

  return (
    <main>
      <AppHeader />
      <section className="live-battle-heading">
        <p className="section-label">{activeMembership.stateName}</p>
        <h1>{activeMembership.battleName || t("Live Battle")}</h1>
        <p>{t("Open the operational tool needed by this WOS account.")}</p>
      </section>

      <section className="live-battle-grid">
        {canCoordinate && (
          <article className="live-battle-card">
            <p className="section-label">{t("Coordinator")}</p>
            <h2>{t("Enemy leaders")}</h2>
            <p>
              {t(
                "Add and maintain the enemy Rally Leads for this battle period.",
              )}
            </p>
            <Link className="nav-link" href="/admin/leaders">
              {t("Manage leaders")}
            </Link>
          </article>
        )}
        {canCoordinate && (
          <article className="live-battle-card">
            <p className="section-label">{t("Coordinator")}</p>
            <h2>{t("Call rally")}</h2>
            <p>
              {t("Record an incoming rally and synchronize its impact time.")}
            </p>
            <Link className="nav-link" href="/admin/call-rally">
              {t("Call a rally")}
            </Link>
          </article>
        )}
        {canGarrison && (
          <article className="live-battle-card">
            <p className="section-label">{t("Garrison")}</p>
            <h2>{t("Reinforcement timing")}</h2>
            <p>
              {t("See your personal send times, alerts and incoming waves.")}
            </p>
            <Link className="nav-link" href="/garrison">
              {t("Open garrison")}
            </Link>
          </article>
        )}
        {!canCoordinate && !canGarrison && (
          <div className="empty-state compact-empty-state">
            <p>{t("This WOS account does not have a live battle role.")}</p>
          </div>
        )}
      </section>
    </main>
  );
}
