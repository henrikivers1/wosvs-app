"use client";

import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { useLanguage } from "@/components/LanguageProvider";
import { NavIcon } from "@/components/NavIcon";
import { useStates } from "@/components/StateProvider";
import { enterDemo } from "@/lib/demo/mode";
import { GUIDE_FAQ, GUIDE_SECTIONS } from "@/lib/guides";

// A guide to everything in Overwatch. Public, so players can read it before
// they sign up.
export default function GuidesPage() {
  const { t } = useLanguage();
  const { signedIn } = useStates();

  return (
    <main className="guides">
      <AppHeader />

      <section className="page-heading">
        <p className="section-label">{t("Guides")}</p>
        <h1>{t("How Overwatch works")}</h1>
        <p>
          {t(
            "Everything from your first sign-in to calling rallies in a live battle. Pick your part below.",
          )}
        </p>
      </section>

      <nav className="guide-cards" aria-label={t("Guides")}>
        {GUIDE_SECTIONS.map((section) => (
          <a key={section.id} href={`#${section.id}`} className="guide-card">
            <span className="landing-feature-icon">
              <NavIcon name={section.icon} size={22} />
            </span>
            <span className="guide-card-audience">{t(section.audience)}</span>
            <strong>{t(section.title)}</strong>
            <span>{t(section.intro)}</span>
          </a>
        ))}
      </nav>

      <div className="guide-layout">
        <aside className="guide-toc" aria-label={t("On this page")}>
          <p className="section-label">{t("On this page")}</p>
          <ol>
            {GUIDE_SECTIONS.map((section) => (
              <li key={section.id}>
                <a href={`#${section.id}`}>{t(section.title)}</a>
                <ol>
                  {section.topics.map((topic, index) => (
                    <li key={topic.title}>
                      <a href={`#${section.id}-${index}`}>{t(topic.title)}</a>
                    </li>
                  ))}
                </ol>
              </li>
            ))}
            <li>
              <a href="#faq">{t("Questions")}</a>
            </li>
          </ol>
        </aside>

        <div className="guide-content">
          {GUIDE_SECTIONS.map((section) => (
            <section key={section.id} id={section.id} className="guide-section">
              <p className="section-label">{t(section.audience)}</p>
              <h2>{t(section.title)}</h2>
              <p className="guide-intro">{t(section.intro)}</p>
              {section.topics.map((topic, index) => (
                <article
                  key={topic.title}
                  id={`${section.id}-${index}`}
                  className="guide-topic"
                >
                  <h3>{t(topic.title)}</h3>
                  {topic.steps && (
                    <ol className="guide-steps">
                      {topic.steps.map((step) => (
                        <li key={step}>{t(step)}</li>
                      ))}
                    </ol>
                  )}
                  {topic.body && <p>{t(topic.body)}</p>}
                  {topic.tip && <p className="guide-tip">{t(topic.tip)}</p>}
                </article>
              ))}
            </section>
          ))}

          <section id="faq" className="guide-section guide-faq">
            <p className="section-label">{t("Questions")}</p>
            <h2>{t("Common questions")}</h2>
            {GUIDE_FAQ.map((item) => (
              <details key={item.q}>
                <summary>{t(item.q)}</summary>
                <p>{t(item.a)}</p>
              </details>
            ))}
          </section>

          {signedIn === false && (
            <section className="landing-demo">
              <div>
                <h2>{t("See it with a fake state, free")}</h2>
                <p>
                  {t(
                    "Try every tool in the demo: no account needed, nothing leaves your browser.",
                  )}
                </p>
              </div>
              <button
                type="button"
                className="primary-button landing-cta"
                onClick={() => enterDemo()}
              >
                {t("Open the demo")}
              </button>
              <Link className="secondary-link landing-cta" href="/login">
                {t("Create your account")}
              </Link>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
