"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { useStates } from "@/components/StateProvider";
import { useLanguage } from "@/components/LanguageProvider";

export default function Home() {
  const { t } = useLanguage();
  const { activeMembership, signedIn, loadingStates } = useStates();

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
              <dd>{t("SvS plans, rallies and battles run automatically from the draw.")}</dd>
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

  // Members land on Overwatch (their SvS, vote and assignment); players
  // without a state on Account, where adding a WOS ID sends the join request.
  return (
    <main>
      <AppHeader />
      <RedirectTo href={activeMembership ? "/state/overwatch" : "/account"} />
      <section className="loading-panel">
        <p>{t("Loading...")}</p>
      </section>
    </main>
  );
}

function RedirectTo({ href }: { href: string }) {
  const router = useRouter();
  useEffect(() => {
    router.replace(href);
  }, [href, router]);
  return null;
}
