"use client";

import Image from "next/image";
import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { DiscordHandle } from "@/components/DiscordHandle";
import { useLanguage } from "@/components/LanguageProvider";
import { LandingVideo } from "@/components/LandingVideo";
import { NavIcon, type NavIconName } from "@/components/NavIcon";
import { enterDemo } from "@/lib/demo/mode";

const FEATURES: { icon: NavIconName; title: string; body: string }[] = [
  {
    icon: "planning",
    title: "Your SvS plans itself",
    body: "The moment the draw is out, Overwatch creates the plan, reminds members to vote, builds the rallies from who can play and publishes them. Admins only review.",
  },
  {
    icon: "live",
    title: "Land between enemy rallies",
    body: "Every garrison player gets a personal countdown that tells them exactly when to send, so reinforcements arrive between enemy hits, or right after the last one.",
  },
  {
    icon: "overwatch",
    title: "One shared battle clock",
    body: "Every phone and PC times against the same server clock, so a device that is a few seconds off still sends on the right second.",
  },
  {
    icon: "state",
    title: "Rallies built the smart way",
    body: "The strongest defenders hold the castle, Rally Leads swap every pet block, and joiners bring one of four joiner heroes they own at 4★. Auto-fill follows your priorities.",
  },
  {
    icon: "intel",
    title: "Know your opponent",
    body: "Their strongest players, alliances and SvS record, refreshed daily from WOSOracle. Enemy leaders and their coordinates are remembered between battles.",
  },
  {
    icon: "bell",
    title: "Everyone knows where to be",
    body: "“Hi Frost, you're in Ted's rally with Jessie and 50/20/30. Leads: Ted 12–14, Ice 14–16.” Every member gets their assignment, every change, and Victory or Defeat afterwards.",
  },
];

const TIMELINE = [
  { when: "Draw", what: "Plan created, members told" },
  { when: "T−30 h", what: "Reminder to vote" },
  { when: "T−24 h", what: "Garrison and rallies built and filled" },
  { when: "T−6 h", what: "Published to every member" },
  { when: "11:00 UTC", what: "Live Battle opens for coordinates" },
  { when: "17:00 UTC", what: "Victory or Defeat for all" },
];

const ROLES = [
  {
    title: "Members",
    body: "Vote once, see your rally, hero, formation and lead order, and get told about every change.",
  },
  {
    title: "Garrison",
    body: "Every member. Enter your city once; a countdown and an alert tell you the exact second to send.",
  },
  {
    title: "Coordinators",
    body: "Pick enemy leaders from the opponent's strongest players and call each rally with one tap.",
  },
  {
    title: "Admins",
    body: "A checklist for the next SvS, automation that does the busywork, and full control when you want it.",
  },
];

const QUESTIONS = [
  {
    q: "Is the demo really free?",
    a: "Yes. It needs no account, uses a fake state with fake players, and lives only in your browser: nothing is saved anywhere.",
  },
  {
    q: "Where does the game data come from?",
    a: "Player stats, SvS draws, results and opponent intel come from WOSOracle. Members only type their WOS ID.",
  },
  {
    q: "Does it work on phones?",
    a: "Yes. Overwatch is built for phones first, with a tab bar at the bottom and big buttons for battle time.",
  },
  {
    q: "How does my state get started?",
    a: "Your state leader messages us on Discord (wosoverwatch) and we set the state up. The leader then shares a join link and first-time PIN in your chats; members open it, enter their WOS ID and choose their own PIN.",
  },
  {
    q: "Which languages are supported?",
    a: "English, العربية, ไทย, 简体中文 and Español.",
  },
];

// The public front page for people who are not signed in.
export function LandingPage() {
  const { t } = useLanguage();

  return (
    <main className="landing">
      <AppHeader />

      <section className="landing-hero">
        <div className="landing-hero-copy">
          <p className="landing-eyebrow">
            {t("For Whiteout Survival SvS states")}
          </p>
          <h1>{t("Your whole SvS, planned and timed for you.")}</h1>
          <p className="landing-lead">
            {t(
              "Overwatch reads the draw, builds your rallies from who can play, tells every member where to be, and counts down to the second when to send reinforcements.",
            )}
          </p>
          <div className="landing-actions">
            <button
              type="button"
              className="primary-button landing-cta"
              onClick={() => enterDemo()}
            >
              {t("Try the free demo")}
            </button>
            <Link className="secondary-link landing-cta" href="/login">
              {t("Sign in")}
            </Link>
          </div>
          <p className="landing-note">
            {t("Free demo · No account needed · Nothing leaves your browser")}
          </p>
        </div>

        <div className="landing-preview" aria-hidden="true">
          <div className="preview-card">
            <div className="preview-head">
              <span className="preview-live" />
              {t("Garrison")} · {t("Live")}
            </div>
            <small>{t("Send reinforcements in")}</small>
            <strong className="preview-countdown">00:12.4</strong>
            <div className="preview-track">
              <span className="preview-hit" style={{ left: "14%" }} />
              <span className="preview-hit" style={{ left: "46%" }} />
              <span className="preview-window" style={{ left: "61%" }} />
              <span className="preview-hit" style={{ left: "78%" }} />
            </div>
            <ul className="preview-list">
              <li>
                <span>{t("Rally 1")}</span>
                <time>12:31:05</time>
              </li>
              <li className="preview-you">
                <span>{t("Your garrison lands")}</span>
                <time>12:31:41</time>
              </li>
              <li>
                <span>{t("Rally 2")}</span>
                <time>12:32:02</time>
              </li>
            </ul>
          </div>
          <div className="preview-card preview-card-small">
            <p className="section-label">{t("Next SvS")}</p>
            <ul className="preview-steps">
              <li>{t("Draw: vs state 1234")}</li>
              <li>{t("41/48 voted")}</li>
              <li>{t("6 rally groups, 58 players")}</li>
              <li>{t("Published")}</li>
            </ul>
          </div>
        </div>
      </section>

      <ul className="landing-strip">
        <li>{t("Live data from WOSOracle")}</li>
        <li>{t("Works on any phone")}</li>
        <li>{t("5 languages")}</li>
        <li>{t("All times in UTC")}</li>
      </ul>

      <LandingVideo />

      <section className="landing-section">
        <p className="section-label">{t("The best parts")}</p>
        <h2>{t("Less admin work, sharper battles")}</h2>
        <div className="landing-features">
          {FEATURES.map((feature) => (
            <article key={feature.title} className="landing-feature">
              <span className="landing-feature-icon">
                <NavIcon name={feature.icon} size={22} />
              </span>
              <h3>{t(feature.title)}</h3>
              <p>{t(feature.body)}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section">
        <p className="section-label">{t("How an SvS runs")}</p>
        <h2>{t("From the draw to the result, on autopilot")}</h2>
        <ol className="landing-timeline">
          {TIMELINE.map((step) => (
            <li key={step.when}>
              <time>{t(step.when)}</time>
              <span>{t(step.what)}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="landing-demo">
        <Image
          src="/brand/overwatch-mark-on-dark.svg"
          width={72}
          height={72}
          alt=""
        />
        <div>
          <h2>{t("See it with a fake state, free")}</h2>
          <p>
            {t(
              "The demo gives you a state with 40 players, an SvS draw and an opponent. Start the battle whenever you like, switch between the admin and member view, and try every tool.",
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
      </section>

      <section className="landing-section">
        <p className="section-label">{t("For everyone in your state")}</p>
        <h2>{t("Each role gets exactly what it needs")}</h2>
        <div className="landing-roles">
          {ROLES.map((role) => (
            <article key={role.title}>
              <h3>{t(role.title)}</h3>
              <p>{t(role.body)}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section landing-faq">
        <div>
          <p className="section-label">{t("Questions")}</p>
          <h2>{t("Good to know")}</h2>
          <p>
            {t("Every feature is explained step by step in the guides.")}
          </p>
          <Link className="secondary-link" href="/guides">
            {t("Read the guides")}
          </Link>
        </div>
        <div className="landing-questions">
          {QUESTIONS.map((item) => (
            <details key={item.q}>
              <summary>{t(item.q)}</summary>
              <p>{t(item.a)}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="landing-final">
        <h2>{t("Ready for your next SvS?")}</h2>
        <div className="landing-actions">
          <button
            type="button"
            className="primary-button landing-cta"
            onClick={() => enterDemo()}
          >
            {t("Try the free demo")}
          </button>
          <Link className="secondary-link landing-cta" href="/login">
            {t("Sign in")}
          </Link>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-footer-brand">
          <Image
            src="/brand/overwatch-mark-small-on-dark.svg"
            width={24}
            height={24}
            alt=""
          />
          <span>Overwatch</span>
        </div>
        <nav aria-label={t("Footer")}>
          <Link href="/guides">{t("Guides")}</Link>
          <Link href="/login">{t("Sign in")}</Link>
          <Link href="/privacy">{t("Privacy")}</Link>
          <button type="button" onClick={() => enterDemo()}>
            {t("Free demo")}
          </button>
        </nav>
        <DiscordHandle />
        <p>
          {t(
            "A fan-made companion tool for Whiteout Survival. Not affiliated with Century Games.",
          )}
        </p>
      </footer>
    </main>
  );
}
