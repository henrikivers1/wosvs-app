"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/components/LanguageProvider";
import {
  FDT_BATTLE_WINDOW_MS,
  FDT_EVENT_COLUMNS,
  FDT_VOTE_OPTIONS,
  fdtRallyNote,
  fdtTargetLabel,
  type FdtAssignment,
  type FdtEvent,
  type FdtVote as FdtVoteValue,
  type FdtVoteRow,
} from "@/lib/fdt";
import { createClient } from "@/lib/supabase/client";

// Members vote whether they can play the next Frostdragon Tyrant and, once
// admins publish the lineup, see their alliance, target and rally note.
export function FdtVote({
  stateId,
  wosAccountId,
  isAdmin,
}: {
  stateId: string;
  wosAccountId: string;
  isAdmin: boolean;
}) {
  const { t, formatDateTime } = useLanguage();
  const supabase = useMemo(() => createClient(), []);
  const [event, setEvent] = useState<FdtEvent | null>(null);
  const [votes, setVotes] = useState<FdtVoteRow[]>([]);
  const [spot, setSpot] = useState<FdtAssignment | null>(null);
  const [allianceName, setAllianceName] = useState<string | null>(null);
  const [voiceCall, setVoiceCall] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("fdt_events")
      .select(FDT_EVENT_COLUMNS)
      .eq("state_id", stateId)
      .gt("battle_at", new Date(Date.now() - FDT_BATTLE_WINDOW_MS).toISOString())
      .order("battle_at", { ascending: true })
      .limit(1);
    const next = ((data ?? []) as FdtEvent[])[0] ?? null;
    setEvent(next);
    if (!next) {
      setVotes([]);
      setSpot(null);
      return;
    }
    const [voteResult, spotResult] = await Promise.all([
      supabase
        .from("fdt_votes")
        .select("event_id, wos_account_id, availability, voice_call")
        .eq("event_id", next.id),
      supabase
        .from("fdt_assignments")
        .select("event_id, wos_account_id, alliance_id, target")
        .eq("event_id", next.id)
        .eq("wos_account_id", wosAccountId)
        .maybeSingle(),
    ]);
    const loaded = (voteResult.data ?? []) as FdtVoteRow[];
    setVotes(loaded);
    const own = loaded.find((row) => row.wos_account_id === wosAccountId);
    if (own) setVoiceCall(own.voice_call);
    const ownSpot = (spotResult.data as FdtAssignment | null) ?? null;
    setSpot(ownSpot);
    if (ownSpot) {
      const { data: alliance } = await supabase
        .from("state_alliances")
        .select("name")
        .eq("id", ownSpot.alliance_id)
        .maybeSingle();
      setAllianceName(alliance?.name ?? null);
    }
  }, [stateId, supabase, wosAccountId]);

  useEffect(() => {
    const loadId = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(loadId);
  }, [load]);

  if (!event) return null;

  const own = votes.find((row) => row.wos_account_id === wosAccountId);
  const published = Boolean(event.published_at);
  const target = fdtTargetLabel(spot?.target);
  const note = spot ? fdtRallyNote(event, spot.target) : null;

  async function answer(availability: FdtVoteValue, voice: boolean) {
    if (!event) return;
    setSaving(true);
    setMessage("");
    const { error } = await supabase.rpc("set_fdt_vote", {
      target_event_id: event.id,
      target_wos_account_id: wosAccountId,
      selected_availability: availability,
      joins_voice: voice,
    });
    setSaving(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage(t("Thanks — your answer is saved."));
    await load();
  }

  return (
    <section className="attendance-vote fdt-vote">
      <div className="section-title-row">
        <div>
          <p className="section-label">{t("Frostdragon Tyrant")}</p>
          <h2>{event.name}</h2>
        </div>
        {isAdmin && (
          <Link className="nav-link" href="/state/planning/fdt">
            {t("Open FDT planning")}
          </Link>
        )}
      </div>
      <p>{t("Battle starts {date}.", { date: formatDateTime(event.battle_at) })}</p>

      {published && (
        <div className="fdt-spot">
          {spot ? (
            <>
              <p>
                {t("Alliance:")} <strong>{allianceName ?? t("Unknown")}</strong>
                {" · "}
                {t("Target:")}{" "}
                <strong>{target ? t(target) : t("Not set")}</strong>
              </p>
              {note && <p className="fdt-note">{note}</p>}
            </>
          ) : (
            <p>{t("You're not in the Frostdragon Tyrant lineup.")}</p>
          )}
        </div>
      )}

      <div className="attendance-options">
        {FDT_VOTE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            disabled={saving}
            className={
              own?.availability === option.value
                ? "attendance-option selected"
                : "attendance-option secondary-link"
            }
            onClick={() => void answer(option.value, voiceCall)}
          >
            <strong>{t(option.label)}</strong>
            <small>
              {t("{count} players", {
                count: votes.filter((row) => row.availability === option.value)
                  .length,
              })}
            </small>
          </button>
        ))}
      </div>
      <label>
        <input
          type="checkbox"
          checked={voiceCall}
          disabled={saving}
          onChange={(change) => {
            setVoiceCall(change.target.checked);
            if (own) void answer(own.availability, change.target.checked);
          }}
        />
        {t("I can join voice call")}
      </label>
      <p>
        {own
          ? t("You answered. Tap another option to change it.")
          : t("Pick an option to answer.")}{" "}
        {!published && t("The lineup is not published yet.")}
      </p>
      {message && <p className="auth-message">{message}</p>}
    </section>
  );
}
