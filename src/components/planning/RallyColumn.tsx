"use client";

import type { ReactNode } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { availabilityLabel } from "@/lib/attendance";
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

// One rally: a short header and one line per player. Players open in the
// player sheet; drag a line to another rally to move them.
export function RallyColumn({
  group,
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
  onSetup,
  onAssignHeroes,
  onEdit,
  onDelete,
}: {
  group: PlanGroup;
  // Leader first.
  members: StateMember[];
  heroByMember: Map<string, string | null>;
  allianceName: string | null;
  // Players with something to check.
  flagged: Set<string>;
  isAdmin: boolean;
  busy: boolean;
  selectedCount: number;
  // Rally setup or edit form, when open.
  editor: ReactNode;
  onOpenPlayer: (member: StateMember) => void;
  onDropPlayer: (accountId: string) => void;
  onMoveSelected: () => void;
  onSetup: () => void;
  onAssignHeroes: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useLanguage();
  const compact = useCompactNumber();
  const full = members.length >= group.max_members;
  const heroes = group.joiner_heroes ?? [];
  const totalPower = members.reduce((sum, member) => sum + (member.power ?? 0), 0);
  const averageFurnace = members.length
    ? members.reduce((sum, member) => sum + (member.furnace_level ?? 0), 0) /
      members.length
    : 0;

  return (
    <section
      className="rally-column"
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
          <h3>{group.name}</h3>
          <span className={`count-pill${full ? " is-full" : ""}`}>
            {members.length}/{group.max_members}
          </span>
          {isAdmin && (
            <MoreMenu
              label={t("Rally actions")}
              items={[
                { label: t("Rally setup"), onSelect: onSetup },
                {
                  label: t("Assign heroes"),
                  onSelect: onAssignHeroes,
                  disabled: busy || !heroes.length,
                },
                { label: t("Edit rally"), onSelect: onEdit },
                { label: t("Delete rally"), onSelect: onDelete, danger: true },
              ]}
            />
          )}
        </div>
        <p
          className="rally-column-meta"
          title={t("Total power {power} · Avg furnace {furnace}", {
            power: compact(totalPower),
            furnace: averageFurnace.toFixed(1),
          })}
        >
          <span className={allianceName ? undefined : "is-missing"}>
            {allianceName ?? t("No alliance")}
          </span>
          {" · "}
          {group.formation ?? t("No formation")}
          {" · "}
          {t(availabilityLabel(group.shift ?? "whole"))}
        </p>
        <div className="rally-hero-chips">
          {heroes.length ? (
            heroes.map((hero) => {
              const covered = members.filter(
                (member) => heroByMember.get(member.id) === hero,
              ).length;
              return (
                <span
                  key={hero}
                  className={covered ? "hero-chip" : "hero-chip is-empty"}
                >
                  {hero} ×{covered}
                </span>
              );
            })
          ) : (
            <span className="hero-chip is-empty">{t("No joiner heroes")}</span>
          )}
        </div>
      </header>

      {editor}

      <ol className="rally-players">
        {members.map((member, index) => {
          const hero = heroByMember.get(member.id) ?? null;
          const isLeader = index === 0 && member.id === group.leader_wos_account_id;
          return (
            <li
              key={member.id}
              className={flagged.has(member.id) ? "is-flagged" : undefined}
              draggable={isAdmin && !busy && !isLeader}
              onDragStart={(event) => {
                event.dataTransfer.setData(DRAG_TYPE, member.id);
                event.dataTransfer.effectAllowed = "move";
              }}
            >
              <button type="button" onClick={() => onOpenPlayer(member)}>
                <span className="rally-player-name">
                  {isLeader && (
                    <span className="lead-badge" title={t("Rally Lead")}>
                      {t("Lead")}
                    </span>
                  )}
                  {memberName(member)}
                </span>
                <span className="rally-player-meta">
                  {compact(member.power)} · {furnaceLabel(member.furnace_level_raw)}
                </span>
                {!isLeader && heroes.length > 0 && (
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
      {isAdmin && members.length <= 1 && (
        <p className="plan-drop-hint">{t("Drag players here.")}</p>
      )}
    </section>
  );
}
