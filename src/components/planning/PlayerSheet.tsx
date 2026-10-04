"use client";

import { useEffect } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { availabilityLabel, type AttendanceRow } from "@/lib/attendance";
import { furnaceLabel } from "@/lib/furnace";
import { memberName, type PlanGroup, type StateMember } from "./types";

// Everything about one player in the plan, and the two choices an admin
// makes for them: which rally, and which joiner hero they bring.
export function PlayerSheet({
  member,
  groups,
  groupSizes,
  groupId,
  hero,
  answer,
  isLeader,
  isLeadTagged,
  isAdmin,
  busy,
  onMove,
  onSetHero,
  onClose,
}: {
  member: StateMember;
  groups: PlanGroup[];
  groupSizes: Map<string, number>;
  groupId: string | null;
  hero: string | null;
  answer: AttendanceRow | undefined;
  isLeader: boolean;
  // Rally Lead or Castle Holder: leads or holds, never joins.
  isLeadTagged: boolean;
  isAdmin: boolean;
  busy: boolean;
  onMove: (groupId: string | null) => void;
  onSetHero: (hero: string | null) => void;
  onClose: () => void;
}) {
  const { t, formatNumber } = useLanguage();
  const group = groups.find((item) => item.id === groupId) ?? null;
  const heroOptions = (group?.joiner_heroes ?? []).filter((name) =>
    member.heroes.includes(name),
  );

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [onClose]);

  const troops = [member.infantry_tier, member.lancer_tier, member.marksman_tier]
    .map((tier) => tier ?? "—")
    .join("/");

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <aside
        className="player-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={memberName(member)}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="player-sheet-heading">
          <div>
            <h3>{memberName(member)}</h3>
            <small>
              {member.username ? `@${member.username} · ` : ""}
              {t("WOS ID")} {member.wos_id}
            </small>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label={t("Close")}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <dl className="player-sheet-stats">
          <div>
            <dt>{t("Power")}</dt>
            <dd>{member.power === null ? "—" : formatNumber(member.power)}</dd>
          </div>
          <div>
            <dt>{t("Furnace")}</dt>
            <dd>{furnaceLabel(member.furnace_level_raw)}</dd>
          </div>
          <div>
            <dt>{t("Labyrinth")}</dt>
            <dd>
              {member.labyrinth_score
                ? formatNumber(member.labyrinth_score)
                : "—"}
            </dd>
          </div>
          <div>
            <dt>{t("Troops")}</dt>
            <dd>{troops}</dd>
          </div>
        </dl>

        <div className="player-sheet-pills">
          <span className="member-tag-pill attendance-pill">
            {answer
              ? `${t(availabilityLabel(answer.availability))}${
                  answer.voice_call ? ` · ${t("Voice")}` : ""
                }`
              : t("Not answered")}
          </span>
          {member.heroes_updated_at ? (
            <span className="member-tag-pill hero-pill">
              {member.heroes.length
                ? `4★ ${member.heroes.join(", ")}`
                : t("No 4★ joiner heroes")}
            </span>
          ) : (
            <span className="member-tag-pill heroes-unknown-pill">
              {t("Heroes unknown")}
            </span>
          )}
          {member.tags
            .filter((tag) => tag.kind !== "hero")
            .map((tag) => (
              <span key={tag.id} className="member-tag-pill">
                <span style={{ backgroundColor: tag.color }} />
                {tag.name}
              </span>
            ))}
        </div>

        {isAdmin && !isLeader && !isLeadTagged && (
          <div className="player-sheet-controls">
            <label>
              {t("Rally")}
              <select
                value={groupId ?? ""}
                disabled={busy}
                onChange={(event) => onMove(event.target.value || null)}
              >
                <option value="">{t("Not in a rally")}</option>
                {groups.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({groupSizes.get(item.id) ?? 0}/
                    {item.max_members})
                  </option>
                ))}
              </select>
            </label>
            {group && (group.joiner_heroes ?? []).length > 0 && (
              <label>
                {t("Joins with")}
                {heroOptions.length ? (
                  <select
                    value={hero && heroOptions.includes(hero) ? hero : ""}
                    disabled={busy}
                    onChange={(event) => onSetHero(event.target.value || null)}
                  >
                    <option value="">{t("No hero yet")}</option>
                    {heroOptions.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <small className="form-hint">
                    {member.heroes_updated_at
                      ? t("Has none of this rally's joiner heroes at 4★.")
                      : t("Heroes unknown: ask them to fill in their heroes.")}
                  </small>
                )}
              </label>
            )}
          </div>
        )}
        {(isLeader || isLeadTagged) && (
          <p className="form-hint">
            {isLeader
              ? t("Leads or holds in {rally}. Change who leads each pet block under the group's ⋯ menu.", {
                  rally: group?.name ?? "",
                })
              : t("Rally Leads and Castle Holders only lead or hold, so they never join. Put them in a rally's or the garrison's pet blocks under its ⋯ menu.")}
          </p>
        )}
      </aside>
    </div>
  );
}
