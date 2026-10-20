"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { useLanguage } from "@/components/LanguageProvider";
import { useStates } from "@/components/StateProvider";
import type { StateAlliance } from "@/components/planning/types";
import {
  FDT_ALLIANCE_LIMIT,
  FDT_EVENT_COLUMNS,
  FDT_TARGETS,
  FDT_VOTE_OPTIONS,
  fdtEventOver,
  type FdtAssignment,
  type FdtEvent,
  type FdtTarget,
  type FdtVote,
  type FdtVoteRow,
} from "@/lib/fdt";
import { furnaceLabel } from "@/lib/furnace";
import { createClient } from "@/lib/supabase/client";

type Member = {
  id: string;
  wos_id: string;
  nickname: string | null;
  furnace_level_raw: number | null;
  power: number | null;
};

type VoteFilter = "all" | FdtVote | "none" | "lineup" | "bench";

const VOTE_ORDER: Record<FdtVote | "none", number> = {
  yes: 0,
  maybe: 1,
  none: 2,
  no: 3,
};

// The form works in UTC, like the game: "2026-10-10T12:00".
function toUtcInputValue(value: string) {
  return new Date(value).toISOString().slice(0, 16);
}

function fromUtcInputValue(value: string) {
  return new Date(`${value}:00Z`);
}

export default function FdtPlanningPage() {
  const { t, formatDateTime, formatNumber } = useLanguage();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { activeMembership, signedIn, loadingStates } = useStates();
  const [events, setEvents] = useState<FdtEvent[]>([]);
  const [votes, setVotes] = useState<FdtVoteRow[]>([]);
  const [assignments, setAssignments] = useState<FdtAssignment[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [alliances, setAlliances] = useState<StateAlliance[]>([]);
  // The alliance each player is in on the Alliances page.
  const [usualAlliance, setUsualAlliance] = useState<Map<string, string>>(
    new Map(),
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyMember, setBusyMember] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [newName, setNewName] = useState("Frostdragon Tyrant");
  const [newTime, setNewTime] = useState("");
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editTime, setEditTime] = useState("");
  const [capitalNote, setCapitalNote] = useState("");
  const [spiresNote, setSpiresNote] = useState("");
  const [filter, setFilter] = useState<VoteFilter>("all");
  const [search, setSearch] = useState("");

  const isAdmin =
    activeMembership?.role === "owner" || activeMembership?.role === "admin";
  const upcoming = events.filter((event) => !fdtEventOver(event));
  const earlier = events.filter((event) => fdtEventOver(event)).reverse();
  const event = upcoming[0] ?? null;

  const load = useCallback(async () => {
    if (!activeMembership) {
      setLoading(false);
      return;
    }
    const stateId = activeMembership.stateId;
    const [eventResult, memberResult, allianceResult, allianceMemberResult] =
      await Promise.all([
        supabase
          .from("fdt_events")
          .select(FDT_EVENT_COLUMNS)
          .eq("state_id", stateId)
          .order("battle_at", { ascending: true }),
        supabase
          .from("state_members")
          .select(
            "wos_account_id, wos_accounts!state_members_wos_account_id_fkey!inner(id, wos_id, nickname, furnace_level_raw, power)",
          )
          .eq("state_id", stateId),
        supabase
          .from("state_alliances")
          .select("id, name, color, max_members")
          .eq("state_id", stateId)
          .order("name"),
        supabase
          .from("state_alliance_members")
          .select("wos_account_id, alliance_id")
          .eq("state_id", stateId),
      ]);
    const firstError =
      eventResult.error ||
      memberResult.error ||
      allianceResult.error ||
      allianceMemberResult.error;
    if (firstError) {
      setMessage(firstError.message);
      setLoading(false);
      return;
    }
    const loadedEvents = (eventResult.data ?? []) as FdtEvent[];
    const eventIds = loadedEvents
      .filter((item) => !fdtEventOver(item))
      .map((item) => item.id);
    const [voteResult, assignmentResult] = await Promise.all([
      eventIds.length
        ? supabase
            .from("fdt_votes")
            .select("event_id, wos_account_id, availability, voice_call")
            .in("event_id", eventIds)
        : Promise.resolve({ data: [], error: null }),
      eventIds.length
        ? supabase
            .from("fdt_assignments")
            .select("event_id, wos_account_id, alliance_id, target")
            .in("event_id", eventIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    const secondError = voteResult.error || assignmentResult.error;
    if (secondError) {
      setMessage(secondError.message);
      setLoading(false);
      return;
    }
    const memberRows = (memberResult.data ?? []) as unknown as Array<{
      wos_accounts: Member | Member[];
    }>;
    setEvents(loadedEvents);
    setVotes((voteResult.data ?? []) as FdtVoteRow[]);
    setAssignments((assignmentResult.data ?? []) as FdtAssignment[]);
    setMembers(
      memberRows.map((row) =>
        Array.isArray(row.wos_accounts) ? row.wos_accounts[0] : row.wos_accounts,
      ),
    );
    setAlliances((allianceResult.data ?? []) as StateAlliance[]);
    setUsualAlliance(
      new Map(
        (
          (allianceMemberResult.data ?? []) as Array<{
            wos_account_id: string;
            alliance_id: string;
          }>
        ).map((row) => [row.wos_account_id, row.alliance_id]),
      ),
    );
    const next = loadedEvents.find((item) => !fdtEventOver(item));
    setCapitalNote(next?.capital_note ?? "");
    setSpiresNote(next?.spires_note ?? "");
    setLoading(false);
  }, [activeMembership, supabase]);

  useEffect(() => {
    if (!loadingStates && signedIn === false) {
      router.replace("/login");
      return;
    }
    const loadId = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(loadId);
  }, [load, loadingStates, router, signedIn]);

  async function run(
    action: () => PromiseLike<{ error: { message: string } | null }>,
    done?: string,
  ) {
    setSaving(true);
    setMessage("");
    const { error } = await action();
    setSaving(false);
    if (error) {
      setMessage(error.message);
      return false;
    }
    if (done) setMessage(done);
    await load();
    return true;
  }

  async function createEvent() {
    if (!activeMembership || !newTime) return;
    await run(
      () =>
        supabase.rpc("create_fdt_event", {
          target_state_id: activeMembership.stateId,
          event_name: newName,
          event_battle_at: fromUtcInputValue(newTime).toISOString(),
        }),
      t("Event created. Every member was asked to vote."),
    );
  }

  async function saveEvent(fields: {
    name: string;
    battleAt: string;
    capital: string;
    spires: string;
  }) {
    if (!event) return false;
    return run(
      () =>
        supabase.rpc("update_fdt_event", {
          target_event_id: event.id,
          event_name: fields.name,
          event_battle_at: fields.battleAt,
          capital_rally_note: fields.capital,
          spires_rally_note: fields.spires,
        }),
      t("Saved."),
    );
  }

  async function deleteEvent() {
    if (!event) return;
    if (
      !window.confirm(
        t("Delete {name} with its votes and lineup?", { name: event.name }),
      )
    ) {
      return;
    }
    await run(() =>
      supabase.rpc("delete_fdt_event", { target_event_id: event.id }),
    );
  }

  async function publish() {
    if (!event) return;
    setSaving(true);
    setMessage("");
    const { data, error } = await supabase.rpc("publish_fdt_event", {
      target_event_id: event.id,
    });
    setSaving(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage(
      t("Published. {count} players got their alliance and target.", {
        count: Number(data ?? 0),
      }),
    );
    await load();
  }

  async function assign(
    memberId: string,
    allianceId: string | null,
    target: FdtTarget | null,
  ) {
    if (!event) return;
    setBusyMember(memberId);
    setMessage("");
    const { error } = await supabase.rpc("set_fdt_assignment", {
      target_event_id: event.id,
      target_wos_account_id: memberId,
      target_alliance_id: allianceId,
      selected_target: target,
    });
    setBusyMember(null);
    if (error) {
      setMessage(error.message);
      return;
    }
    setAssignments((current) => [
      ...current.filter(
        (row) => !(row.event_id === event.id && row.wos_account_id === memberId),
      ),
      ...(allianceId
        ? [
            {
              event_id: event.id,
              wos_account_id: memberId,
              alliance_id: allianceId,
              target,
            },
          ]
        : []),
    ]);
  }

  // Everyone who said yes and is not placed yet joins their usual alliance,
  // strongest first, while it has room.
  async function addYesVoters() {
    if (!event) return;
    const counts = new Map<string, number>();
    eventAssignments.forEach((row) =>
      counts.set(row.alliance_id, (counts.get(row.alliance_id) ?? 0) + 1),
    );
    const placed = new Set(eventAssignments.map((row) => row.wos_account_id));
    const candidates = members
      .filter(
        (member) =>
          voteOf(member.id) === "yes" &&
          !placed.has(member.id) &&
          usualAlliance.has(member.id),
      )
      .sort((first, second) => (second.power ?? 0) - (first.power ?? 0));
    setSaving(true);
    setMessage("");
    let added = 0;
    for (const member of candidates) {
      const allianceId = usualAlliance.get(member.id)!;
      if ((counts.get(allianceId) ?? 0) >= FDT_ALLIANCE_LIMIT) continue;
      const { error } = await supabase.rpc("set_fdt_assignment", {
        target_event_id: event.id,
        target_wos_account_id: member.id,
        target_alliance_id: allianceId,
        selected_target: null,
      });
      if (error) {
        setMessage(error.message);
        break;
      }
      counts.set(allianceId, (counts.get(allianceId) ?? 0) + 1);
      added += 1;
    }
    setSaving(false);
    if (added || !candidates.length) {
      setMessage(t("{count} players added to their alliance.", { count: added }));
    }
    await load();
  }

  const eventVotes = votes.filter((row) => row.event_id === event?.id);
  const eventAssignments = assignments.filter(
    (row) => row.event_id === event?.id,
  );
  const voteOf = (memberId: string) =>
    eventVotes.find((row) => row.wos_account_id === memberId)?.availability;
  const spotOf = (memberId: string) =>
    eventAssignments.find((row) => row.wos_account_id === memberId);
  const allianceCount = (allianceId: string) =>
    eventAssignments.filter((row) => row.alliance_id === allianceId).length;
  const label = (member: Member) => member.nickname || `WOS ${member.wos_id}`;

  const query = search.trim().toLowerCase();
  const rows = members
    .filter((member) => {
      const vote = voteOf(member.id);
      const spot = spotOf(member.id);
      if (filter === "none" && vote) return false;
      if (filter === "lineup" && !spot) return false;
      if (filter === "bench" && spot) return false;
      if (
        filter !== "all" &&
        filter !== "none" &&
        filter !== "lineup" &&
        filter !== "bench" &&
        vote !== filter
      ) {
        return false;
      }
      return (
        !query ||
        label(member).toLowerCase().includes(query) ||
        member.wos_id.includes(query)
      );
    })
    .sort(
      (first, second) =>
        VOTE_ORDER[voteOf(first.id) ?? "none"] -
          VOTE_ORDER[voteOf(second.id) ?? "none"] ||
        (second.power ?? 0) - (first.power ?? 0),
    );

  const filters: { value: VoteFilter; label: string; count: number }[] = [
    { value: "all", label: "All", count: members.length },
    ...FDT_VOTE_OPTIONS.map((option) => ({
      value: option.value,
      label: option.label,
      count: eventVotes.filter((row) => row.availability === option.value)
        .length,
    })),
    {
      value: "none",
      label: "Not voted",
      count: members.filter((member) => !voteOf(member.id)).length,
    },
    { value: "lineup", label: "In lineup", count: eventAssignments.length },
    {
      value: "bench",
      label: "Not in lineup",
      count: members.length - eventAssignments.length,
    },
  ];

  function renderCreateForm() {
    return (
      <div className="invite-form fdt-create-form">
        <label>
          {t("Name")}
          <input
            type="text"
            maxLength={60}
            value={newName}
            onChange={(change) => setNewName(change.target.value)}
          />
        </label>
        <label>
          {t("Battle start (UTC)")}
          <input
            type="datetime-local"
            value={newTime}
            onChange={(change) => setNewTime(change.target.value)}
          />
        </label>
        <button
          type="button"
          className="primary-button"
          disabled={saving || !newName.trim() || !newTime}
          onClick={() => void createEvent()}
        >
          {t("Create FDT event")}
        </button>
      </div>
    );
  }

  if (loadingStates || signedIn === null) {
    return (
      <main>
        <AppHeader />
        <section className="loading-panel">
          <p>{t("Loading Frostdragon Tyrant...")}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="planning-page fdt-page">
      <AppHeader />
      {!activeMembership ? (
        <section className="empty-state">
          <h2>{t("Choose a state")}</h2>
          <p>{t("Select a state before opening battle planning.")}</p>
        </section>
      ) : !isAdmin ? (
        <section className="empty-state">
          <h2>{t("Frostdragon Tyrant")}</h2>
          <p>{t("Only state owners and admins plan Frostdragon Tyrant.")}</p>
        </section>
      ) : (
        <>
          <section className="page-heading">
            <p className="section-label">{activeMembership.stateName}</p>
            <h1>{t("Frostdragon Tyrant")}</h1>
            <p>
              {t(
                "Members vote in Overwatch. Put the players who can play in an alliance (at most 60 each) with a target, write the rally note for each target, and publish.",
              )}
            </p>
          </section>

          {message && <p className="page-message">{message}</p>}

          {loading ? (
            <section className="loading-panel">
              <p>{t("Loading Frostdragon Tyrant...")}</p>
            </section>
          ) : !event ? (
            <section>
              <p className="section-label">{t("No FDT event")}</p>
              <h2>{t("Create the Frostdragon Tyrant event")}</h2>
              <p>
                {t(
                  "Every member is asked to vote whether they can play as soon as the event is created.",
                )}
              </p>
              {renderCreateForm()}
            </section>
          ) : (
            <>
              <section>
                <div className="section-title-row">
                  <div>
                    <p className="section-label">
                      {event.published_at ? t("Published") : t("Draft")}
                    </p>
                    <h2>{event.name}</h2>
                    <p>
                      {t("Battle starts {date}.", {
                        date: formatDateTime(event.battle_at),
                      })}
                    </p>
                  </div>
                  <div className="fdt-actions">
                    <button
                      type="button"
                      className="primary-button"
                      disabled={saving}
                      onClick={() => void publish()}
                    >
                      {event.published_at
                        ? t("Send spots again")
                        : t("Publish lineup")}
                    </button>
                    <button
                      type="button"
                      className="secondary-link"
                      disabled={saving}
                      onClick={() => {
                        setEditName(event.name);
                        setEditTime(toUtcInputValue(event.battle_at));
                        setEditing((open) => !open);
                      }}
                    >
                      {t("Edit")}
                    </button>
                    <button
                      type="button"
                      className="danger-button"
                      disabled={saving}
                      onClick={() => void deleteEvent()}
                    >
                      {t("delete")}
                    </button>
                  </div>
                </div>
                {event.published_at && (
                  <p>
                    {t(
                      "Members see their spot in Overwatch. Changes from now on are sent to the player at once.",
                    )}
                  </p>
                )}
                {editing && (
                  <div className="invite-form fdt-create-form">
                    <label>
                      {t("Name")}
                      <input
                        type="text"
                        maxLength={60}
                        value={editName}
                        onChange={(change) => setEditName(change.target.value)}
                      />
                    </label>
                    <label>
                      {t("Battle start (UTC)")}
                      <input
                        type="datetime-local"
                        value={editTime}
                        onChange={(change) => setEditTime(change.target.value)}
                      />
                    </label>
                    <button
                      type="button"
                      className="primary-button"
                      disabled={saving || !editName.trim() || !editTime}
                      onClick={async () => {
                        const saved = await saveEvent({
                          name: editName,
                          battleAt: fromUtcInputValue(editTime).toISOString(),
                          capital: event.capital_note ?? "",
                          spires: event.spires_note ?? "",
                        });
                        if (saved) setEditing(false);
                      }}
                    >
                      {t("Save")}
                    </button>
                  </div>
                )}
              </section>

              <section>
                <p className="section-label">{t("Rally notes")}</p>
                <h2>{t("What each target should know")}</h2>
                <p>
                  {t(
                    "Players see the note for their target, for example which 4 joiner heroes to send first.",
                  )}
                </p>
                <div className="fdt-notes">
                  <label>
                    {t("Capital")}
                    <textarea
                      rows={3}
                      maxLength={500}
                      value={capitalNote}
                      placeholder={t("Join with these 4 heroes first: …")}
                      onChange={(change) => setCapitalNote(change.target.value)}
                    />
                  </label>
                  <label>
                    {t("Spires")}
                    <textarea
                      rows={3}
                      maxLength={500}
                      value={spiresNote}
                      placeholder={t("Join with these 4 heroes first: …")}
                      onChange={(change) => setSpiresNote(change.target.value)}
                    />
                  </label>
                </div>
                <button
                  type="button"
                  disabled={
                    saving ||
                    (capitalNote === (event.capital_note ?? "") &&
                      spiresNote === (event.spires_note ?? ""))
                  }
                  onClick={() =>
                    void saveEvent({
                      name: event.name,
                      battleAt: event.battle_at,
                      capital: capitalNote,
                      spires: spiresNote,
                    })
                  }
                >
                  {t("Save notes")}
                </button>
              </section>

              <section>
                <p className="section-label">{t("Lineup")}</p>
                <h2>{t("Alliances and targets")}</h2>
                {alliances.length === 0 ? (
                  <p>
                    {t("Add your alliances under State management first.")}{" "}
                    <Link href="/state/manage">{t("State management")}</Link>
                  </p>
                ) : (
                  <div className="fdt-alliance-summary">
                    {alliances.map((alliance) => {
                      const spots = eventAssignments.filter(
                        (row) => row.alliance_id === alliance.id,
                      );
                      return (
                        <article key={alliance.id} className="fdt-alliance-card">
                          <h3 className="alliance-title">
                            <span style={{ backgroundColor: alliance.color }} />
                            {alliance.name}
                          </h3>
                          <p
                            className={
                              spots.length >= FDT_ALLIANCE_LIMIT
                                ? "fdt-count fdt-count-full"
                                : "fdt-count"
                            }
                          >
                            {spots.length}/{FDT_ALLIANCE_LIMIT}
                          </p>
                          <small>
                            {t("Capital {capital} · Spires {spires} · No target {none}", {
                              capital: spots.filter((row) => row.target === "capital")
                                .length,
                              spires: spots.filter((row) => row.target === "spires")
                                .length,
                              none: spots.filter((row) => !row.target).length,
                            })}
                          </small>
                        </article>
                      );
                    })}
                  </div>
                )}
                <button
                  type="button"
                  disabled={saving || alliances.length === 0}
                  onClick={() => void addYesVoters()}
                >
                  {t("Add everyone who said yes to their alliance")}
                </button>
              </section>

              <section>
                <div className="fdt-filters">
                  {filters.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={
                        filter === option.value ? "selected" : "secondary-link"
                      }
                      onClick={() => setFilter(option.value)}
                    >
                      {t(option.label)} ({option.count})
                    </button>
                  ))}
                  <input
                    type="search"
                    value={search}
                    placeholder={t("Search players")}
                    onChange={(change) => setSearch(change.target.value)}
                  />
                </div>
                <div className="alliance-roster-table-wrap">
                  <table className="alliance-roster-table fdt-table">
                    <thead>
                      <tr>
                        <th>{t("Player")}</th>
                        <th>{t("Vote")}</th>
                        <th>{t("Alliance")}</th>
                        <th>{t("Target")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((member) => {
                        const vote = eventVotes.find(
                          (row) => row.wos_account_id === member.id,
                        );
                        const spot = spotOf(member.id);
                        const busy = saving || busyMember === member.id;
                        return (
                          <tr key={member.id}>
                            <td>
                              <strong>{label(member)}</strong>
                              <small className="fdt-player-meta">
                                {furnaceLabel(member.furnace_level_raw)}
                                {member.power
                                  ? ` · ${formatNumber(member.power)}`
                                  : ""}
                              </small>
                            </td>
                            <td>
                              {vote
                                ? t(
                                    FDT_VOTE_OPTIONS.find(
                                      (option) =>
                                        option.value === vote.availability,
                                    )?.label ?? vote.availability,
                                  )
                                : "—"}
                              {vote?.voice_call ? " 🎧" : ""}
                            </td>
                            <td>
                              <select
                                value={spot?.alliance_id ?? ""}
                                disabled={busy}
                                onChange={(change) =>
                                  void assign(
                                    member.id,
                                    change.target.value || null,
                                    change.target.value
                                      ? (spot?.target ?? null)
                                      : null,
                                  )
                                }
                              >
                                <option value="">{t("Not playing")}</option>
                                {alliances.map((alliance) => {
                                  const count = allianceCount(alliance.id);
                                  return (
                                    <option
                                      key={alliance.id}
                                      value={alliance.id}
                                      disabled={
                                        count >= FDT_ALLIANCE_LIMIT &&
                                        spot?.alliance_id !== alliance.id
                                      }
                                    >
                                      {alliance.name} ({count}/
                                      {FDT_ALLIANCE_LIMIT})
                                    </option>
                                  );
                                })}
                              </select>
                            </td>
                            <td>
                              <select
                                value={spot?.target ?? ""}
                                disabled={busy || !spot}
                                onChange={(change) =>
                                  spot &&
                                  void assign(
                                    member.id,
                                    spot.alliance_id,
                                    (change.target.value || null) as FdtTarget | null,
                                  )
                                }
                              >
                                <option value="">{t("No target")}</option>
                                {FDT_TARGETS.map((target) => (
                                  <option key={target.value} value={target.value}>
                                    {t(target.label)}
                                  </option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {rows.length === 0 && <p>{t("No players match.")}</p>}
              </section>
            </>
          )}

          {event && (
            <details className="plan-history">
              <summary>{t("Plan the next FDT event")}</summary>
              {renderCreateForm()}
            </details>
          )}

          {earlier.length > 0 && (
            <details className="plan-history">
              <summary>
                {t("Earlier FDT events ({count})", { count: earlier.length })}
              </summary>
              <ul>
                {earlier.map((item) => (
                  <li key={item.id}>
                    <strong>{item.name}</strong>{" "}
                    <time>{formatDateTime(item.battle_at)}</time>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </main>
  );
}
