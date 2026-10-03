"use client";

import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { DiscordHandle } from "@/components/DiscordHandle";
import { useLanguage } from "@/components/LanguageProvider";

const CONTACT_EMAIL = "privacy@wosoverwatch.com";
const UPDATED = "2026-10-03";

// Plain-language privacy notice. Every string is an English translation key.
const SECTIONS: { title: string; items: string[] }[] = [
  {
    title: "What we store",
    items: [
      "Your login: email address and password. The password is stored only as a secure hash by our login provider; we never see it.",
      "Your public username and the WOS IDs you add.",
      "Game data for those WOS IDs from WOSOracle: name, avatar, state, power, Furnace level, Labyrinth score and alliance.",
      "What you enter in Overwatch: attendance votes, joiner heroes, troop details, and your state memberships and roles.",
      "What your state's admins and coordinators enter: rally assignments, notices, tags, and enemy leaders with their city coordinates.",
      "Your notifications.",
    ],
  },
  {
    title: "Why",
    items: [
      "Only to run Overwatch for you and your state: sign-in, planning rallies, timing reinforcements and telling you about changes.",
      "No ads, no tracking, no analytics. We never sell or share your data for marketing.",
    ],
  },
  {
    title: "Who can see it",
    items: [
      "Members of your state see your username, game data, rally and votes. Admins also see join requests and roles.",
      "Your email address is never shown to other players.",
    ],
  },
  {
    title: "Services we use",
    items: [
      "Supabase stores the database and handles sign-in.",
      "Vercel hosts the website.",
      "An email service sends sign-up and password emails.",
      "WOSOracle provides the game data; we send it only WOS IDs, state numbers and alliance IDs.",
      "These services may process data outside your country.",
    ],
  },
  {
    title: "Cookies and your browser",
    items: [
      "One sign-in cookie keeps you logged in. There are no other cookies.",
      "Your browser stores your language, your last state, your garrison settings and, if you open it, the demo. This never leaves your device.",
    ],
  },
  {
    title: "How long we keep it",
    items: [
      "Read notifications are removed after 30 days and all notifications after 90 days.",
      "Expired notices and invitations are removed automatically.",
      "Everything else is kept until you remove it or ask us to delete your account.",
    ],
  },
  {
    title: "Your rights",
    items: [
      "You can remove WOS accounts on Account at any time.",
      "Email us to get a copy of your data, correct it, or delete your account and everything linked to it. We answer within 30 days.",
      "If you are in the EU or UK you can also complain to your data protection authority.",
    ],
  },
];

export default function PrivacyPage() {
  const { t, locale } = useLanguage();
  const updated = new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(UPDATED));

  return (
    <main className="privacy">
      <AppHeader />

      <section className="page-heading">
        <p className="section-label">{t("Privacy")}</p>
        <h1>{t("Your data in Overwatch")}</h1>
        <p>
          {t("Last updated {date}", { date: updated })}
        </p>
      </section>

      <div className="privacy-content">
        {SECTIONS.map((section) => (
          <section key={section.title} className="guide-section">
            <h2>{t(section.title)}</h2>
            <ul className="privacy-list">
              {section.items.map((item) => (
                <li key={item}>{t(item)}</li>
              ))}
            </ul>
          </section>
        ))}

        <section className="guide-section">
          <h2>{t("Contact")}</h2>
          <p>
            {t("Questions or requests:")}{" "}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          </p>
          <p>
            <DiscordHandle />
          </p>
          <p className="guide-tip">
            {t(
              "A fan-made companion tool for Whiteout Survival. Not affiliated with Century Games.",
            )}
          </p>
          <Link className="secondary-link" href="/">
            {t("Back to Overwatch")}
          </Link>
        </section>
      </div>
    </main>
  );
}
