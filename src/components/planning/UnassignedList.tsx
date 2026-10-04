"use client";

import { useMemo, useState } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import {
  AVAILABILITY_OPTIONS,
  availabilityLabel,
  type AttendanceRow,
  type Availability,
} from "@/lib/attendance";
import { canPlayShift } from "@/lib/autofill";
import { furnaceLabel } from "@/lib/furnace";
import { DRAG_TYPE, useCompactNumber } from "./RallyColumn";
import {
  averageTroopTier,
  memberName,
  type PlanGroup,
  type StateMember,
  type StateTag,
} from "./types";

type SortKey = "power" | "fc" | "troop" | "labyrinth" | "name";
const SHOWN_AT_ONCE = 60;

function score(member: StateMember, key: SortKey) {
  if (key === "fc") return member.furnace_level_raw ?? 0;
  if (key === "labyrinth") return member.labyrinth_score ?? 0;
  if (key === "troop") return averageTroopTier(member);
  return member.power ?? 0;
}

// Players not in a rally yet. By default only those who can play one of the
// rallies' halves; everything else is under "More filters".
export function UnassignedList({
  players,
  answers,
  groups,
  tags,
  isAdmin,
  busy,
  selectedIds,
  onToggle,
  onSelect,
  onMoveSelected,
  onOpenPlayer,
  onDropPlayer,
}: {
  players: StateMember[];
  answers: Map<string, AttendanceRow>;
  groups: PlanGroup[];
  tags: StateTag[];
  isAdmin: boolean;
  busy: boolean;
  selectedIds: Set<string>;
  onToggle: (accountId: string) => void;
  onSelect: (accountIds: string[]) => void;
  onMoveSelected: (groupId: string) => void;
  onOpenPlayer: (member: StateMember) => void;
  // Dropping a rally player here takes them out of their rally.
  onDropPlayer: (accountId: string) => void;
}) {
  const { t } = useLanguage();
  const compact = useCompactNumber();
  const [search, setSearch] = useState("");
  const [canPlayOnly, setCanPlayOnly] = useState(true);
  const [tagFilter, setTagFilter] = useState("");
  const [availabilityFilter, setAvailabilityFilter] = useState<
    Availability | "unanswered" | ""
  >("");
  const [voiceOnly, setVoiceOnly] = useState(false);
  const [minimumFurnace, setMinimumFurnace] = useState(0);
  const [minimumTroopTier, setMinimumTroopTier] = useState(0);
  const [sortBy, setSortBy] = useState<SortKey>("power");

  const moreFiltersOn =
    Boolean(tagFilter || availabilityFilter || voiceOnly) ||
    minimumFurnace > 0 ||
    minimumTroopTier > 0 ||
    sortBy !== "power";

  const shown = useMemo(() => {
    const query = search.trim().toLowerCase();
    return players
      .filter((member) => {
        const answer = answers.get(member.id);
        if (
          query &&
          ![member.nickname, member.wos_id, member.username]
            .filter(Boolean)
            .some((value) => value!.toLowerCase().includes(query))
        )
          return false;
        if (
          canPlayOnly &&
          groups.length &&
          !groups.some((group) =>
            canPlayShift(answer?.availability ?? null, group.shift ?? "whole"),
          )
        )
          return false;
        if (tagFilter && !member.tags.some((tag) => tag.id === tagFilter))
          return false;
        if (availabilityFilter === "unanswered" && answer) return false;
        if (
          availabilityFilter &&
          availabilityFilter !== "unanswered" &&
          answer?.availability !== availabilityFilter
        )
          return false;
        if (voiceOnly && !answer?.voice_call) return false;
        if ((member.furnace_level ?? 0) < minimumFurnace) return false;
        if (
          minimumTroopTier > 0 &&
          [member.infantry_tier, member.lancer_tier, member.marksman_tier].some(
            (value) => (value ?? 0) < minimumTroopTier,
          )
        )
          return false;
        return true;
      })
      .sort((first, second) =>
        sortBy === "name"
          ? memberName(first).localeCompare(memberName(second))
          : score(second, sortBy) - score(first, sortBy),
      );
  }, [
    answers,
    availabilityFilter,
    canPlayOnly,
    groups,
    minimumFurnace,
    minimumTroopTier,
    players,
    search,
    sortBy,
    tagFilter,
    voiceOnly,
  ]);

  function clearFilters() {
    setTagFilter("");
    setAvailabilityFilter("");
    setVoiceOnly(false);
    setMinimumFurnace(0);
    setMinimumTroopTier(0);
    setSortBy("power");
  }

  return (
    <aside
      className="waiting-list"
      aria-label={t("Waiting players")}
      onDragOver={(event) => {
        if (isAdmin) event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
        const id = event.dataTransfer.getData(DRAG_TYPE);
        if (id) onDropPlayer(id);
      }}
    >
      <div className="waiting-list-heading">
        <h3>{t("Waiting")}</h3>
        <span className="count-pill">{shown.length}</span>
      </div>
      <input
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder={t("Search players")}
        aria-label={t("Search players")}
      />
      <label className="waiting-toggle">
        <input
          type="checkbox"
          checked={canPlayOnly}
          onChange={(event) => setCanPlayOnly(event.target.checked)}
        />
        {t("Only players who can play")}
      </label>
      <details className="waiting-filters">
        <summary>
          {t("More filters")}
          {moreFiltersOn && <span className="filter-dot" aria-hidden="true" />}
        </summary>
        <label>
          {t("Tag")}
          <select
            value={tagFilter}
            onChange={(event) => setTagFilter(event.target.value)}
          >
            <option value="">{t("Any tag")}</option>
            {tags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("Availability")}
          <select
            value={availabilityFilter}
            onChange={(event) =>
              setAvailabilityFilter(
                event.target.value as Availability | "unanswered" | "",
              )
            }
          >
            <option value="">{t("Any availability")}</option>
            {AVAILABILITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.label)}
              </option>
            ))}
            <option value="unanswered">{t("Not answered")}</option>
          </select>
        </label>
        <label>
          {t("Minimum Fire Crystal Furnace")}
          <input
            type="number"
            min="0"
            max="10"
            value={minimumFurnace}
            onChange={(event) => setMinimumFurnace(Number(event.target.value))}
          />
        </label>
        <label>
          {t("Minimum all troop tiers")}
          <input
            type="number"
            min="0"
            max="12"
            value={minimumTroopTier}
            onChange={(event) => setMinimumTroopTier(Number(event.target.value))}
          />
        </label>
        <label>
          {t("Sort by")}
          <select
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value as SortKey)}
          >
            <option value="power">{t("Power")}</option>
            <option value="fc">{t("FC level")}</option>
            <option value="troop">{t("Troop tier")}</option>
            <option value="labyrinth">{t("Labyrinth")}</option>
            <option value="name">{t("Name")}</option>
          </select>
        </label>
        <label className="waiting-toggle">
          <input
            type="checkbox"
            checked={voiceOnly}
            onChange={(event) => setVoiceOnly(event.target.checked)}
          />
          {t("Voice call only")}
        </label>
        <button type="button" className="text-button" onClick={clearFilters}>
          {t("Clear filters")}
        </button>
      </details>

      {isAdmin && selectedIds.size > 0 && (
        <div className="waiting-selection">
          <select
            value=""
            disabled={busy}
            onChange={(event) =>
              event.target.value && onMoveSelected(event.target.value)
            }
          >
            <option value="">
              {t("Move {count} selected to…", { count: selectedIds.size })}
            </option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="text-button"
            onClick={() => onSelect([])}
          >
            {t("Clear selection")}
          </button>
        </div>
      )}
      {isAdmin && shown.length > 0 && selectedIds.size === 0 && (
        <button
          type="button"
          className="text-button"
          onClick={() => onSelect(shown.map((member) => member.id))}
        >
          {t("Select all shown")}
        </button>
      )}

      <ul className="waiting-players">
        {shown.slice(0, SHOWN_AT_ONCE).map((member) => {
          const answer = answers.get(member.id);
          return (
            <li
              key={member.id}
              draggable={isAdmin && !busy}
              onDragStart={(event) => {
                event.dataTransfer.setData(DRAG_TYPE, member.id);
                event.dataTransfer.effectAllowed = "move";
              }}
            >
              {isAdmin && (
                <input
                  type="checkbox"
                  aria-label={t("Select {name}", { name: memberName(member) })}
                  checked={selectedIds.has(member.id)}
                  onChange={() => onToggle(member.id)}
                />
              )}
              <button type="button" onClick={() => onOpenPlayer(member)}>
                <span className="rally-player-name">{memberName(member)}</span>
                <span className="rally-player-meta">
                  {compact(member.power)} ·{" "}
                  {furnaceLabel(member.furnace_level_raw)} ·{" "}
                  {answer
                    ? t(availabilityLabel(answer.availability))
                    : t("Not answered")}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {shown.length > SHOWN_AT_ONCE && (
        <p className="form-hint">
          {t("Showing the first {shown} of {count}. Search to find others.", {
            shown: SHOWN_AT_ONCE,
            count: shown.length,
          })}
        </p>
      )}
      {shown.length === 0 && (
        <p className="form-hint">{t("No players waiting.")}</p>
      )}
    </aside>
  );
}
