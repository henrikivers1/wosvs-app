"use client";

import { useLanguage } from "@/components/LanguageProvider";

// The SvS plan's progress from draw to battle, with what the automation
// does next and when. Admins can run a step early.

const HOUR_MS = 60 * 60 * 1000;
const REMIND_BEFORE_MS = 30 * HOUR_MS;
const GENERATE_BEFORE_MS = 24 * HOUR_MS;
const PUBLISH_BEFORE_MS = 6 * HOUR_MS;

type Step = {
  key: string;
  done: boolean;
  warning?: boolean;
  title: string;
  detail: string;
  action?: { label: string; onClick: () => void };
};

export function NextSvsChecklist({
  plan,
  autoPlan,
  autoPublish,
  memberCount,
  votedCount,
  availableCount,
  rallyCount,
  assignedCount,
  waitingCount,
  missingAlliance,
  busy,
  now,
  onGenerate,
  onPublish,
}: {
  plan: {
    scheduled_at: string;
    status: "draft" | "published";
    opponent_state_number: number | null;
    attendance_reminder_sent_at: string | null;
  };
  autoPlan: boolean;
  autoPublish: boolean;
  memberCount: number;
  votedCount: number;
  availableCount: number;
  rallyCount: number;
  assignedCount: number;
  // Players who can play but have no rally yet.
  waitingCount: number;
  missingAlliance: number;
  busy: boolean;
  now: number;
  onGenerate: () => void;
  onPublish: () => void;
}) {
  const { t, formatDateTime } = useLanguage();
  const battleAt = new Date(plan.scheduled_at).getTime();
  const at = (beforeMs: number) => formatDateTime(new Date(battleAt - beforeMs));
  const published = plan.status === "published";

  const steps: Step[] = [
    {
      key: "draw",
      done: true,
      title: plan.opponent_state_number
        ? t("Draw: vs state {opponent}", { opponent: plan.opponent_state_number })
        : t("SvS plan created"),
      detail: t("Battle {time} (12:00–17:00 UTC).", {
        time: formatDateTime(plan.scheduled_at),
      }),
    },
    {
      key: "votes",
      done: votedCount >= memberCount,
      title: t("Attendance: {voted}/{total} voted, {available} can play", {
        voted: votedCount,
        total: memberCount,
        available: availableCount,
      }),
      detail: plan.attendance_reminder_sent_at
        ? t("Members who had not voted were reminded.")
        : t("Members who have not voted are reminded at {time}.", {
            time: at(REMIND_BEFORE_MS),
          }),
    },
    {
      key: "rallies",
      done: rallyCount > 0 && waitingCount === 0,
      title:
        rallyCount > 0
          ? t("Rallies: {rallies} with {players} players", {
              rallies: rallyCount,
              players: assignedCount,
            })
          : t("Rallies: not generated yet"),
      detail:
        rallyCount === 0
          ? autoPlan
            ? t(
                "Generated automatically at {time} from your Rally Leads and best Labyrinth players, then filled by your auto-fill priorities.",
                { time: at(GENERATE_BEFORE_MS) },
              )
            : t("Automatic rallies are off for this state.")
          : waitingCount > 0
            ? t(
                "{count} players who can play have no rally yet. They are added to open slots every hour.",
                { count: waitingCount },
              )
            : t("Late voters are added to open slots every hour."),
      action:
        !published || waitingCount > 0
          ? {
              label: rallyCount ? t("Fill open slots now") : t("Generate now"),
              onClick: onGenerate,
            }
          : undefined,
    },
    {
      key: "publish",
      done: published,
      warning: missingAlliance > 0,
      title: published ? t("Published") : t("Not published yet"),
      detail: published
        ? t("Every member got their rally, hero and formation.")
        : missingAlliance > 0
          ? t("{count} rallies have no destination alliance.", {
              count: missingAlliance,
            })
          : autoPublish
            ? t("Published automatically at {time}.", {
                time: at(PUBLISH_BEFORE_MS),
              })
            : t("Automatic publishing is off: publish when ready."),
      action:
        !published && rallyCount > 0
          ? { label: t("Publish now"), onClick: onPublish }
          : undefined,
    },
    {
      key: "battle",
      done: now >= battleAt,
      title: t("Battle goes live automatically"),
      detail: t("Live Battle opens for callers and garrison at {time}.", {
        time: formatDateTime(plan.scheduled_at),
      }),
    },
  ];

  // The next step an admin can act on gets the screen's gold button.
  const nextActionKey = steps.find((step) => step.action && !step.done)?.key;

  return (
    <section className="next-svs">
      <p className="section-label">{t("Next SvS")}</p>
      <ol className="next-svs-steps">
        {steps.map((step) => (
          <li
            key={step.key}
            className={
              step.warning ? "warning" : step.done ? "done" : "pending"
            }
          >
            <span className="next-svs-mark" aria-hidden="true">
              {step.warning ? "!" : step.done ? "✓" : "…"}
            </span>
            <div>
              <strong>{step.title}</strong>
              <p>{step.detail}</p>
            </div>
            {step.action && (
              <button
                type="button"
                className={
                  step.key === nextActionKey ? "primary-button" : "secondary-link"
                }
                disabled={busy}
                onClick={step.action.onClick}
              >
                {step.action.label}
              </button>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
