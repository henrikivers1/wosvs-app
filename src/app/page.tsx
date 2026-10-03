"use client";

import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { useStates } from "@/components/StateProvider";
import { canUseBattleTool } from "@/lib/battleAccess";
import { useLanguage } from "@/components/LanguageProvider";

export default function Home() {
  const { t } = useLanguage();
  const { activeMembership, memberships, signedIn, loadingStates } =
    useStates();
  const battleActive = Boolean(activeMembership?.battleId);
  const canCallRallies = canUseBattleTool(activeMembership, "rally_caller");
  const canUseGarrison = canUseBattleTool(activeMembership, "garrison");
  const uniqueStateCount = new Set(
    memberships.map((membership) => membership.stateId),
  ).size;
  const accountsInActiveState = activeMembership
    ? memberships.filter(
        (membership) => membership.stateId === activeMembership.stateId,
      ).length
    : 0;

  if (signedIn === null || loadingStates) {
    return (
      <main>
        <AppHeader />
        <section className="loading-panel">
          <p>{t("Loading...")}</p>
        </section>
      </main>
    );
  }

  if (!signedIn) {
    return (
      <main>
        <AppHeader />
        <section className="public-intro">
          <div>
            <p className="section-label">{t("WOSOverwatch")}</p>
            <h1>{t("Rally timing for organized SVS states.")}</h1>
            <p className="intro-text">
              {t(
                "A shared workspace for enemy rally calls, synchronized impact waves, and personal garrison send times.",
              )}
            </p>
            <div className="button-row">
              <Link className="primary-link" href="/login">
                {t("Sign in or create an account")}
              </Link>
              <a className="secondary-link" href="#contact">
                {t("Request state access")}
              </a>
            </div>
          </div>
          <dl className="product-summary">
            <div>
              <dt>{t("Coordinators")}</dt>
              <dd>{t("Record calls and maintain the shared schedule.")}</dd>
            </div>
            <div>
              <dt>{t("Garrison players")}</dt>
              <dd>{t("Receive a personal send time and browser alerts.")}</dd>
            </div>
            <div>
              <dt>{t("State owners")}</dt>
              <dd>{t("Control members, roles, and active battle periods.")}</dd>
            </div>
          </dl>
        </section>

        <section id="access" className="public-info-grid">
          <div>
            <p className="section-label">{t("Access model")}</p>
            <h2>{t("One-time state setup")}</h2>
            <p>
              {t(
                "Creating an account is free. Creating a state requires a one-time state creation entitlement issued by WOS Battle Planner. State members join through invitations from their state owner.",
              )}
            </p>
            <p>
              {t(
                "A limited free trial can be arranged before purchasing state access. Monthly plans may be introduced later.",
              )}
            </p>
          </div>
          <div id="contact" className="contact-panel">
            <p className="section-label">{t("Contact")}</p>
            <h2>{t("Request a trial or state setup")}</h2>
            <p>
              {t(
                "Contact us on Discord with your state name and a short description of your team.",
              )}
            </p>
            <div className="contact-detail">
              <span>{t("Discord")}</span>
              <strong>{t("your-discord-handle")}</strong>
            </div>
            <small>
              {t(
                "Placeholder account — official contact information will be added before launch.",
              )}
            </small>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main>
      <AppHeader />
      <section className="dashboard-heading">
        <div>
          <p className="section-label">{t("Current workspace")}</p>
          <h1>
            {activeMembership
              ? activeMembership.stateName
              : t("No state selected")}
          </h1>
          {activeMembership && (
            <p>
              {t("Signed in as")}{" "}
              <strong>
                {activeMembership.wosNickname || activeMembership.wosId}
              </strong>
              {" · "}
              {activeMembership.role.replace("_", " ")}
            </p>
          )}
        </div>
        {activeMembership && (
          <span
            className={
              battleActive ? "battle-state battle-state-active" : "battle-state"
            }
          >
            {battleActive
              ? `${activeMembership.battleName || t("Battle")} — ${t("Battle period active")}`
              : t("No active battle period")}
          </span>
        )}
      </section>

      {!activeMembership ? (
        <section className="empty-state">
          <h2>{t("You have not joined a state")}</h2>
          <p>
            {t(
              "Ask a state owner to invite one of your registered WOS IDs. Invitations appear under the notification bell.",
            )}
          </p>
          <div className="button-row">
            <Link className="primary-link" href="/notifications">
              {t("View notifications")}
            </Link>
            <Link className="secondary-link" href="/account">
              {t("Manage WOS accounts")}
            </Link>
          </div>
        </section>
      ) : (
        <>
          {!battleActive && (
            <section className="battle-inactive-panel">
              <div>
                <p className="section-label">
                  {t("Battle operations unavailable")}
                </p>
                <h2>{t("No battle period is active")}</h2>
                <p>
                  {t(
                    "Rally leaders, rally calls, schedules, and garrison timing remain hidden until the state owner starts a battle period.",
                  )}
                </p>
              </div>
              {(activeMembership.role === "owner" ||
                activeMembership.role === "admin") && (
                <Link className="primary-link" href="/state/manage">
                  {t("Manage battle period")}
                </Link>
              )}
            </section>
          )}

          {battleActive && (
            <section>
              <div className="section-title-row">
                <div>
                  <p className="section-label">{t("Battle operations")}</p>
                  <h2>{t("Available tools")}</h2>
                </div>
              </div>
              <div className="operations-list">
                {canCallRallies && (
                  <>
                    <Link className="operation-row" href="/admin/leaders">
                      <div>
                        <strong>{t("Rally leaders")}</strong>
                        <span>{t("Enemy coordinates and pet status")}</span>
                      </div>
                      <span>{t("Open")}</span>
                    </Link>
                    <Link className="operation-row" href="/admin/call-rally">
                      <div>
                        <strong>{t("Call rally")}</strong>
                        <span>
                          {t("Add an incoming rally to the live schedule")}
                        </span>
                      </div>
                      <span>{t("Open")}</span>
                    </Link>
                  </>
                )}
                {canUseGarrison && (
                  <Link className="operation-row" href="/garrison">
                    <div>
                      <strong>{t("Garrison timing")}</strong>
                      <span>{t("Personal send times and alerts")}</span>
                    </div>
                    <span>{t("Open")}</span>
                  </Link>
                )}
              </div>
            </section>
          )}

          {(activeMembership.role === "owner" ||
            activeMembership.role === "admin") && (
            <section className="owner-shortcut">
              <div>
                <p className="section-label">{t("Administration")}</p>
                <h2>{t("State management")}</h2>
                <p>
                  {t(
                    "Manage invitations, approvals, member roles, and the current battle period.",
                  )}
                </p>
              </div>
              <Link className="secondary-link" href="/state/manage">
                {t("Manage state")}
              </Link>
            </section>
          )}

          <section className="workspace-facts">
            <div>
              <span>{t("States joined")}</span>
              <strong>{uniqueStateCount}</strong>
            </div>
            <div>
              <span>{t("Your WOS accounts in this state")}</span>
              <strong>{accountsInActiveState}</strong>
            </div>
            <div>
              <span>{t("Current role")}</span>
              <strong>{activeMembership.role.replace("_", " ")}</strong>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
