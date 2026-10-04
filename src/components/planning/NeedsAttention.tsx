"use client";

import { useState } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { availabilityLabel } from "@/lib/attendance";
import { blockLabel } from "@/lib/castle";
import { issueSeverity, type PlanIssue } from "./planIssues";
import { memberName, type PlanGroup, type StateMember } from "./types";

const COLLAPSED_COUNT = 6;

// What to check before publishing, each line with a one-tap fix.
export function NeedsAttention({
  issues,
  busy,
  onFillOpenSlots,
  onAssignHeroes,
  onMove,
  onEditGroup,
  onSetupGroup,
  onEditRotation,
  onAddGarrison,
  onOpenLeads,
  onOpenPlayer,
}: {
  issues: PlanIssue[];
  busy: boolean;
  onFillOpenSlots: () => void;
  onAssignHeroes: (group: PlanGroup) => void;
  // target null = take the player out of their rally.
  onMove: (member: StateMember, target: PlanGroup | null) => void;
  onEditGroup: (group: PlanGroup) => void;
  onSetupGroup: (group: PlanGroup) => void;
  onEditRotation: (group: PlanGroup) => void;
  onAddGarrison: () => void;
  onOpenLeads: () => void;
  onOpenPlayer: (member: StateMember) => void;
}) {
  const { t } = useLanguage();
  const [showAll, setShowAll] = useState(false);

  if (!issues.length) {
    return (
      <section className="needs-attention is-clear">
        <span className="needs-attention-mark" aria-hidden="true">
          ✓
        </span>
        <div>
          <strong>{t("Nothing to check")}</strong>
          <p>{t("Every rally has its alliance, its half and its heroes.")}</p>
        </div>
      </section>
    );
  }

  const rallies = (list: PlanGroup[]) =>
    list.map((group) => group.name).join(", ");
  const half = (value: string) => t(availabilityLabel(value as never));
  const names = (list: StateMember[]) =>
    list.slice(0, 6).map(memberName).join(", ") +
    (list.length > 6 ? ` +${list.length - 6}` : "");

  function describe(issue: PlanIssue): {
    text: string;
    detail?: string;
    player?: StateMember;
    fix?: { label: string; run: () => void };
  } {
    switch (issue.kind) {
      case "missing_alliance":
        return issue.groups.length === 1
          ? {
              text: t("{rally} has no destination alliance.", {
                rally: issue.groups[0].name,
              }),
              fix: {
                label: t("Choose alliance"),
                run: () => onEditGroup(issue.groups[0]),
              },
            }
          : {
              text: t("{count} rallies have no destination alliance.", {
                count: issue.groups.length,
              }),
              detail: rallies(issue.groups),
              fix: {
                label: t("Choose alliance"),
                run: () => onEditGroup(issue.groups[0]),
              },
            };
      case "no_joiner_heroes":
        return issue.groups.length === 1
          ? {
              text: t("{rally} has no joiner heroes chosen.", {
                rally: issue.groups[0].name,
              }),
              fix: {
                label: t("Choose heroes"),
                run: () => onSetupGroup(issue.groups[0]),
              },
            }
          : {
              text: t(
                "{count} rallies have no joiner heroes. Set default heroes under State management → SvS automation, or choose them per rally.",
                { count: issue.groups.length },
              ),
              detail: rallies(issue.groups),
              fix: {
                label: t("Choose heroes"),
                run: () => onSetupGroup(issue.groups[0]),
              },
            };
      case "wrong_half": {
        const name = memberName(issue.member);
        const text =
          issue.availability === null
            ? t("{name} hasn't voted but is in {rally}.", {
                name,
                rally: issue.group.name,
              })
            : issue.availability === "unavailable"
              ? t("{name} can't join but is in {rally}.", {
                  name,
                  rally: issue.group.name,
                })
              : t("{name} voted {voted}, but {rally} fights {half}.", {
                  name,
                  voted: half(issue.availability),
                  rally: issue.group.name,
                  half: half(issue.group.shift ?? "whole"),
                });
        return {
          text,
          player: issue.member,
          fix: issue.target
            ? {
                label: t("Move to {rally}", { rally: issue.target.name }),
                run: () => onMove(issue.member, issue.target),
              }
            : {
                label: t("Take out of rally"),
                run: () => onMove(issue.member, null),
              },
        };
      }
      case "no_matching_hero":
        return {
          text: t("{name} has none of {rally}'s joiner heroes at 4★.", {
            name: memberName(issue.member),
            rally: issue.group.name,
          }),
          player: issue.member,
          fix: issue.target
            ? {
                label: t("Move to {rally}", { rally: issue.target.name }),
                run: () => onMove(issue.member, issue.target),
              }
            : undefined,
        };
      case "heroes_missing":
        return {
          text: t("{count} players in {rally} have no joiner hero yet.", {
            count: issue.members.length,
            rally: issue.group.name,
          }),
          detail: names(issue.members),
          fix: {
            label: t("Assign heroes"),
            run: () => onAssignHeroes(issue.group),
          },
        };
      case "no_hero_anywhere":
        return {
          text: t(
            "{count} players have none of the joiner heroes in any rally with room. They join without a hero.",
            { count: issue.members.length },
          ),
          detail: names(issue.members),
        };
      case "no_garrison":
        return issue.hasHolders
          ? {
              text: t("There is no garrison to hold the castle yet."),
              fix: { label: t("Add garrison"), run: onAddGarrison },
            }
          : {
              text: t(
                "There is no garrison yet. Mark your Castle Holders first.",
              ),
              fix: { label: t("Leads & holders"), run: onOpenLeads },
            };
      case "rotation_gap": {
        const blocks = issue.blocks.map(blockLabel).join(", ");
        return {
          text:
            issue.group.kind === "garrison"
              ? t("Nobody holds the castle {blocks}.", { blocks })
              : t("{rally} has no lead {blocks}.", {
                  rally: issue.group.name,
                  blocks,
                }),
          fix: {
            label:
              issue.group.kind === "garrison"
                ? t("Choose holders")
                : t("Choose leads"),
            run: () => onEditRotation(issue.group),
          },
        };
      }
      case "rotation_unavailable":
        return {
          text: t("{name} leads {rally} {block}, but voted {voted}.", {
            name: memberName(issue.member),
            rally: issue.group.name,
            block: blockLabel(issue.block),
            voted: issue.availability
              ? half(issue.availability)
              : t("nothing yet"),
          }),
          player: issue.member,
          fix: {
            label:
              issue.group.kind === "garrison"
                ? t("Choose holders")
                : t("Choose leads"),
            run: () => onEditRotation(issue.group),
          },
        };
      case "lead_as_joiner":
        return {
          text: t(
            "{name} is a Rally Lead or Castle Holder but joins {rally}. Leads and holders never join.",
            { name: memberName(issue.member), rally: issue.group.name },
          ),
          player: issue.member,
          fix: {
            label: t("Take out of rally"),
            run: () => onMove(issue.member, null),
          },
        };
      case "heroes_unknown":
        return {
          text: t(
            "{count} players haven't entered their heroes. They can add them on Account.",
            { count: issue.members.length },
          ),
          detail: names(issue.members),
        };
      case "open_slots":
        return {
          text: t(
            "{slots} open seats, and {waiting} players who can play are waiting.",
            { slots: issue.openSlots, waiting: issue.waiting },
          ),
          fix: { label: t("Fill open seats"), run: onFillOpenSlots },
        };
    }
  }

  const shown = showAll ? issues : issues.slice(0, COLLAPSED_COUNT);
  return (
    <section className="needs-attention">
      <div className="needs-attention-heading">
        <p className="section-label">{t("Needs attention")}</p>
        <span className="count-pill">{issues.length}</span>
      </div>
      <ul className="needs-attention-list">
        {shown.map((issue, index) => {
          const line = describe(issue);
          return (
            <li key={index} className={`issue-${issueSeverity(issue)}`}>
              <span className="issue-dot" aria-hidden="true" />
              <div className="issue-text">
                {line.player ? (
                  <button
                    type="button"
                    className="text-button issue-player"
                    onClick={() => onOpenPlayer(line.player!)}
                  >
                    {line.text}
                  </button>
                ) : (
                  <span>{line.text}</span>
                )}
                {line.detail && <small>{line.detail}</small>}
              </div>
              {line.fix && (
                <button
                  type="button"
                  className="secondary-link issue-fix"
                  disabled={busy}
                  onClick={line.fix.run}
                >
                  {line.fix.label}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {issues.length > COLLAPSED_COUNT && (
        <button
          type="button"
          className="text-button"
          onClick={() => setShowAll((value) => !value)}
        >
          {showAll
            ? t("Show fewer")
            : t("Show all {count}", { count: issues.length })}
        </button>
      )}
    </section>
  );
}
