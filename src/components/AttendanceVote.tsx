"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/components/LanguageProvider";
import {
  AVAILABILITY_OPTIONS,
  windowLabel,
  type AttendanceRow,
  type Availability,
  type UpcomingSvs,
} from "@/lib/attendance";
import { createClient } from "@/lib/supabase/client";

// Members tell the state when they can play the upcoming SvS battle and
// whether they can join voice call. Admins see the answers in Planning.
export function AttendanceVote({
  stateId,
  wosAccountId,
}: {
  stateId: string;
  wosAccountId: string;
}) {
  const { t, formatDateTime } = useLanguage();
  const supabase = useMemo(() => createClient(), []);
  const [svs, setSvs] = useState<UpcomingSvs | null>(null);
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [voiceCall, setVoiceCall] = useState(false);
  const [heroesKnown, setHeroesKnown] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const { data } = await supabase.rpc("get_upcoming_svs", {
      target_state_id: stateId,
    });
    const upcoming = ((data ?? []) as UpcomingSvs[])[0] ?? null;
    setSvs(upcoming);
    if (!upcoming) {
      setRows([]);
      return;
    }
    const { data: account } = await supabase
      .from("wos_accounts")
      .select("heroes_updated_at")
      .eq("id", wosAccountId)
      .maybeSingle();
    setHeroesKnown(Boolean(account?.heroes_updated_at));
    const { data: attendance } = await supabase
      .from("battle_attendance")
      .select("plan_id, wos_account_id, availability, voice_call")
      .eq("plan_id", upcoming.plan_id);
    const loaded = (attendance ?? []) as AttendanceRow[];
    setRows(loaded);
    const own = loaded.find((row) => row.wos_account_id === wosAccountId);
    if (own) setVoiceCall(own.voice_call);
  }, [stateId, supabase, wosAccountId]);

  useEffect(() => {
    const loadId = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(loadId);
  }, [load]);

  if (!svs) return null;

  const own = rows.find((row) => row.wos_account_id === wosAccountId);

  async function answer(availability: Availability, voice: boolean) {
    if (!svs) return;
    setSaving(true);
    setMessage("");
    const { error } = await supabase.rpc("set_battle_attendance", {
      target_plan_id: svs.plan_id,
      target_wos_account_id: wosAccountId,
      selected_availability: availability,
      joins_voice: voice,
    });
    setSaving(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage(t("Thanks — your availability is saved."));
    await load();
  }

  return (
    <section className="attendance-vote">
      <p className="section-label">{t("Attendance")}</p>
      <h2>
        {svs.opponent_state
          ? t("When can you play SvS vs state {opponent}?", {
              opponent: svs.opponent_state,
            })
          : t("When can you play the next SvS?")}
      </h2>
      <p>{t("Battle starts {date}.", { date: formatDateTime(svs.battle_at) })}</p>
      <div className="attendance-options">
        {AVAILABILITY_OPTIONS.map((option) => {
          const count = rows.filter(
            (row) => row.availability === option.value,
          ).length;
          return (
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
              {option.window && (
                <small>
                  <bdi dir="ltr">{windowLabel(svs.battle_at, option.window)}</bdi>
                </small>
              )}
              <small>{t("{count} players", { count })}</small>
            </button>
          );
        })}
      </div>
      <label>
        <input
          type="checkbox"
          checked={voiceCall}
          disabled={saving}
          onChange={(event) => {
            setVoiceCall(event.target.checked);
            if (own) void answer(own.availability, event.target.checked);
          }}
        />
        {t("I can join voice call")}
      </label>
      <p>
        {own
          ? t("You answered. Tap another option to change it.")
          : t("Pick an option to answer.")}{" "}
        {t("{count} of your state answered, {voice} can join voice.", {
          count: rows.length,
          voice: rows.filter((row) => row.voice_call).length,
        })}
      </p>
      {!heroesKnown && (
        <p className="auth-message">
          {t("Your 4★ joiner heroes are not filled in yet.")}{" "}
          <Link href="/account">{t("Update them on your account page")}</Link>
        </p>
      )}
      {message && <p className="auth-message">{message}</p>}
    </section>
  );
}
