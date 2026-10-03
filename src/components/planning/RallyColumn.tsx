"use client";

import type { ReactNode } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { availabilityLabel } from "@/lib/attendance";
import { blockLabel, PET_BLOCKS } from "@/lib/castle";
import { furnaceLabel } from "@/lib/furnace";
import { MoreMenu } from "./MoreMenu";
import { memberName, type PlanGroup, type StateMember } from "./types";

export const DRAG_TYPE = "text/plain";

export function useCompactNumber() {
  const { locale } = useLanguage();
  const format = new Intl.NumberFormat(locale, {
    notation: "compact",
    maximumFractionDigits: 1,
  });
  return (value: number | null) => (value === null ? "—" : format.format(value));
}

function average(values: Array<number | null>) {
  const numbers = values.filter((value): value is number => value !== null);
  return numbers.length
    ? Math.round((numbers.reduce((sum, value) => sum + value, 0) / numbers.length) * 10) / 10
    : null;
}

// "FC 9.3 · T11 · S6": troop FC level, troop tier and troop skill, the
// numbers that decide the garrison.
export function defenseLine(member: StateMember) {
  const fc = average([member.infantry_fc_level, member.lancer_fc_level, member.marksman_fc_level]);
  const tier = average([member.infantry_tier, member.lancer_tier, member.marksman_tier]);
  const skill = average([
    member.infantry_t12_skill,
    member.lancer_t12_skill,
    member.marksman_t12_skill,
  ]);
  return [
    fc === null ? null : `FC ${fc}`,
    tier === null ? null : `T${tier}`,
    skill === null ? null : `S${skill}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

// One rally (or the garrison): who leads each pet block, then one line per
// joiner. Players open in the player sheet; drag a line to move them.
export function RallyColumn({
  group,
  leads,
  members,
  heroByMember,
  allianceName,
  flagged,
  isAdmin,
  busy,
  selectedCount,
  editor,
  onOpenPlayer,
  onDropPlayer,
  onMoveSelected,
  onEditRotation,
  onSetup,
  onAssignHeroes,
  onEdit,
  onDelete,
}: {
  group: PlanGroup;
  // The lead (or holder) of each pet block.
  leads: Array<StateMember | null>;
  // Joiners only.
  members: StateMember[];
  heroByMember: Map<string, string | null>;
  allianceName: string | null;
  // Players with something to check.
  flagged: Set<string>;
  isAdmin: boolean;
  busy: boolean;
  selectedCount: number;
  // Rally setup, rotation or edit form, when open.
  editor: ReactNode;
  onOpenPlayer: (member: StateMember) => void;
  onDropPlayer: (accountId: string) => void;
  onMoveSelected: () => void;
  onEditRotation: () => void;
  onSetup: () => void;
  onAssignHeroes: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useLanguage();
  const compact = useCompactNumber();
  const garrison = group.kind === "garrison";
  const seats = members.length + 1;
  const full = seats >= group.max_members;
  const heroes = garrison ? [] : (group.joiner_heroes ?? []);
  const totalPower = members.reduce((sum, member) => sum + (member.power ?? 0), 0);

  const menu = garrison
    ? [
        { label: t("Castle holders by pet block"), onSelect: onEditRotation },
        { label: t("Edit garrison"), onSelect: onEdit },
        { label: t("Delete garrison"), onSelect: onDelete, danger: true },
      ]
    : [
        { label: t("Leads by pet block"), onSelect: onEditRotation },
        { label: t("Rally setup"), onSelect: onSetup },
        {
          label: t("Assign heroes"),
          onSelect: onAssignHeroes,
          disabled: busy || !heroes.length,
        },
        { label: t("Edit rally"), onSelect: onEdit },
        { label: t("Delete rally"), onSelect: onDelete, danger: true },
      ];

  return (
    <section
      className={`rally-column${garrison ? " is-garrison" : ""}`}
      aria-label={group.name}
      onDragOver={(event) => {
        if (isAdmin) event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
        const id = event.dataTransfer.getData(DRAG_TYPE);
        if (id) onDropPlayer(id);
      }}
    >
      <header className="rally-column-heading">
        <div className="rally-column-title">
          <h3>{garrison ? t("Garrison") : group.name}</h3>
          <span className={`count-pill${full ? " is-full" : ""}`}>
            {seats}/{group.max_members}
          </span>
          {isAdmin && (
            <MoreMenu
              label={garrison ? t("Garrison actions") : t("Rally actions")}
              items={menu}
            />
          )}
        </div>
        <p
          className="rally-column-meta"
          title={t("Total power {power}", { power: compact(totalPower) })}
        >
          <span className={allianceName ? undefined : "is-missing"}>
            {allianceName ?? t("No alliance")}
          </span>
          {garrison ? (
            <>
              {" · "}
              {t("Holds the castle all battle")}
            </>
          ) : (
            <>
              {" · "}
              {group.formation ?? t("No formation")}
              {" · "}
              {t(availabilityLabel(group.shift ?? "whole"))}
            </>
          )}
        </p>
        <ol className="rotation-list" aria-label={garrison ? t("Castle holders") : t("Rally leads")}>
          {PET_BLOCKS.map((_, block) => {
            const lead = leads[block] ?? null;
            return (
              <li key={block} className={lead ? undefined : "is-empty"}>
                <time>{blockLabel(block)}</time>
                {lead ? (
                  <button
                    type="button"
                    className={flagged.has(lead.id) ? "is-flagged" : undefined}
                    onClick={() => onOpenPlayer(lead)}
                  >
                    {memberName(lead)}
                  </button>
                ) : isAdmin ? (
                  <button type="button" className="is-missing" onClick={onEditRotation}>
                    {garrison ? t("Choose holder") : t("Choose lead")}
                  </button>
                ) : (
                  <span>—</span>
                )}
              </li>
            );
          })}
        </ol>
        {!garrison && (
          <div className="rally-hero-chips">
            {heroes.length ? (
              heroes.map((hero) => {
                const covered = members.filter(
                  (member) => heroByMember.get(member.id) === hero,
                ).length;
                return (
                  <span key={hero} className={covered ? "hero-chip" : "hero-chip is-empty"}>
                    {hero} ×{covered}
                  </span>
                );
              })
            ) : (
              <span className="hero-chip is-empty">{t("No joiner heroes")}</span>
            )}
          </div>
        )}
      </header>

      {editor}

      <ol className="rally-players">
        {members.map((member) => {
          const hero = heroByMember.get(member.id) ?? null;
          return (
            <li
              key={member.id}
              className={flagged.has(member.id) ? "is-flagged" : undefined}
              draggable={isAdmin && !busy}
              onDragStart={(event) => {
                event.dataTransfer.setData(DRAG_TYPE, member.id);
                event.dataTransfer.effectAllowed = "move";
              }}
            >
              <button type="button" onClick={() => onOpenPlayer(member)}>
                <span className="rally-player-name">{memberName(member)}</span>
                <span className="rally-player-meta">
                  {garrison
                    ? defenseLine(member) || furnaceLabel(member.furnace_level_raw)
                    : `${compact(member.power)} · ${furnaceLabel(member.furnace_level_raw)}`}
                </span>
                {heroes.length > 0 && (
                  <span className={hero ? "hero-chip" : "hero-chip is-empty"}>
                    {hero ?? t("No hero")}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
      {isAdmin && selectedCount > 0 && (
        <button
          type="button"
          className="secondary-link rally-move-here"
          disabled={busy || full}
          onClick={onMoveSelected}
        >
          {t("Move {count} selected here", { count: selectedCount })}
        </button>
      )}
      {isAdmin && members.length === 0 && (
        <p className="plan-drop-hint">{t("Drag players here.")}</p>
      )}
    </section>
  );
}
