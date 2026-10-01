"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { useStates } from "@/components/StateProvider";
import { createClient } from "@/lib/supabase/client";

type AudienceType = "all" | "alliance" | "tag" | "role" | "capability";

type Announcement = {
  id: string;
  title: string;
  body: string;
  audience_type: AudienceType;
  audience_id: string | null;
  audience_value: string | null;
  expires_at: string;
  created_at: string;
};

type NamedAudience = {
  id: string;
  name: string;
};

type RecipientRow = {
  announcement_id: string;
  wos_account_id: string;
};

function defaultExpirationTime() {
  const date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formatAudienceValue(value: string | null) {
  if (value === "rally_caller") return "Coordinators";
  if (value === "garrison") return "Garrison";
  if (value === "owner") return "Owners";
  if (value === "admin") return "Admins";
  if (value === "member") return "Members";
  return "Selected audience";
}

export default function AnnouncementsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { activeMembership, signedIn, loadingStates } = useStates();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [alliances, setAlliances] = useState<NamedAudience[]>([]);
  const [tags, setTags] = useState<NamedAudience[]>([]);
  const [recipientCounts, setRecipientCounts] = useState<
    Record<string, number>
  >({});
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audienceType, setAudienceType] = useState<AudienceType>("all");
  const [audienceId, setAudienceId] = useState("");
  const [audienceValue, setAudienceValue] = useState("");
  const [expiresAt, setExpiresAt] = useState(defaultExpirationTime);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const isAdmin =
    activeMembership?.role === "owner" ||
    activeMembership?.role === "admin";

  const loadAnnouncements = useCallback(async () => {
    if (!activeMembership) {
      setAnnouncements([]);
      setAlliances([]);
      setTags([]);
      setRecipientCounts({});
      setLoading(false);
      return;
    }

    setLoading(true);
    setMessage("");
    await supabase.rpc("cleanup_expired_state_announcements");

    const [allianceResult, tagResult, recipientResult] = await Promise.all([
      supabase
        .from("state_alliances")
        .select("id, name")
        .eq("state_id", activeMembership.stateId)
        .order("name"),
      supabase
        .from("state_tags")
        .select("id, name")
        .eq("state_id", activeMembership.stateId)
        .order("name"),
      isAdmin
        ? supabase
            .from("state_announcement_recipients")
            .select("announcement_id, wos_account_id")
            .eq("state_id", activeMembership.stateId)
        : supabase
            .from("state_announcement_recipients")
            .select("announcement_id, wos_account_id")
            .eq("state_id", activeMembership.stateId)
            .eq("wos_account_id", activeMembership.wosAccountId),
    ]);

    const firstError =
      allianceResult.error || tagResult.error || recipientResult.error;
    if (firstError) {
      setMessage(firstError.message);
      setLoading(false);
      return;
    }

    const recipients = (recipientResult.data ?? []) as RecipientRow[];
    const visibleAnnouncementIds = [
      ...new Set(recipients.map((recipient) => recipient.announcement_id)),
    ];

    let announcementQuery = supabase
      .from("state_announcements")
      .select(
        "id, title, body, audience_type, audience_id, audience_value, expires_at, created_at"
      )
      .eq("state_id", activeMembership.stateId)
      .order("created_at", { ascending: false });

    if (!isAdmin) {
      if (visibleAnnouncementIds.length === 0) {
        setAnnouncements([]);
        setAlliances((allianceResult.data ?? []) as NamedAudience[]);
        setTags((tagResult.data ?? []) as NamedAudience[]);
        setRecipientCounts({});
        setLoading(false);
        return;
      }
      announcementQuery = announcementQuery.in("id", visibleAnnouncementIds);
    }

    const { data: announcementData, error: announcementError } =
      await announcementQuery;

    if (announcementError) {
      setMessage(announcementError.message);
      setLoading(false);
      return;
    }

    const counts = recipients.reduce<Record<string, number>>(
      (currentCounts, recipient) => {
        currentCounts[recipient.announcement_id] =
          (currentCounts[recipient.announcement_id] ?? 0) + 1;
        return currentCounts;
      },
      {}
    );

    setAnnouncements((announcementData ?? []) as Announcement[]);
    setAlliances((allianceResult.data ?? []) as NamedAudience[]);
    setTags((tagResult.data ?? []) as NamedAudience[]);
    setRecipientCounts(counts);
    setLoading(false);
  }, [activeMembership, isAdmin, supabase]);

  useEffect(() => {
    if (!loadingStates && signedIn === false) {
      router.replace("/login");
      return;
    }

    const loadId = window.setTimeout(() => {
      void loadAnnouncements();
    }, 0);
    return () => window.clearTimeout(loadId);
  }, [loadAnnouncements, loadingStates, router, signedIn]);

  function changeAudience(nextAudience: AudienceType) {
    setAudienceType(nextAudience);
    setAudienceId("");
    setAudienceValue("");
  }

  function getAudienceLabel(announcement: Announcement) {
    if (announcement.audience_type === "all") return "Entire state";
    if (announcement.audience_type === "alliance") {
      return (
        alliances.find((alliance) => alliance.id === announcement.audience_id)
          ?.name ?? "Deleted alliance"
      );
    }
    if (announcement.audience_type === "tag") {
      return (
        tags.find((tag) => tag.id === announcement.audience_id)?.name ??
        "Deleted tag"
      );
    }
    return formatAudienceValue(announcement.audience_value);
  }

  async function createAnnouncement() {
    if (!activeMembership || !isAdmin) return;

    const cleanedTitle = title.trim();
    const cleanedBody = body.trim();
    if (cleanedTitle.length < 3) {
      setMessage("Enter a title containing at least 3 characters.");
      return;
    }
    if (!cleanedBody) {
      setMessage("Enter an announcement message.");
      return;
    }
    if (
      (audienceType === "alliance" || audienceType === "tag") &&
      !audienceId
    ) {
      setMessage(`Choose a${audienceType === "alliance" ? "n" : ""} ${audienceType}.`);
      return;
    }
    if (
      (audienceType === "role" || audienceType === "capability") &&
      !audienceValue
    ) {
      setMessage(`Choose a ${audienceType}.`);
      return;
    }

    const expiration = new Date(expiresAt);
    const maximumExpiration = new Date();
    maximumExpiration.setDate(maximumExpiration.getDate() + 30);
    if (Number.isNaN(expiration.getTime()) || expiration <= new Date()) {
      setMessage("Choose a future expiration time.");
      return;
    }
    if (expiration > maximumExpiration) {
      setMessage("Announcements can remain active for at most 30 days.");
      return;
    }

    setSaving(true);
    setMessage("");
    const { error } = await supabase.rpc("create_state_announcement", {
      target_state_id: activeMembership.stateId,
      announcement_title: cleanedTitle,
      announcement_body: cleanedBody,
      target_audience_type: audienceType,
      target_audience_id:
        audienceType === "alliance" || audienceType === "tag"
          ? audienceId
          : null,
      target_audience_value:
        audienceType === "role" || audienceType === "capability"
          ? audienceValue
          : null,
      announcement_expires_at: expiration.toISOString(),
    });

    if (error) {
      setMessage(error.message);
    } else {
      setTitle("");
      setBody("");
      setAudienceType("all");
      setAudienceId("");
      setAudienceValue("");
      setExpiresAt(defaultExpirationTime());
      await loadAnnouncements();
      setMessage("Announcement sent.");
    }
    setSaving(false);
  }

  async function deleteAnnouncement(announcement: Announcement) {
    if (
      !window.confirm(
        `Delete “${announcement.title}”? It will also disappear from recipient notification inboxes.`
      )
    ) {
      return;
    }

    setSaving(true);
    setMessage("");
    const { error } = await supabase.rpc("delete_state_announcement", {
      target_announcement_id: announcement.id,
    });

    if (error) {
      setMessage(error.message);
    } else {
      await loadAnnouncements();
      setMessage("Announcement deleted.");
    }
    setSaving(false);
  }

  if (loadingStates || signedIn === null) {
    return (
      <main>
        <AppHeader />
        <section className="loading-panel"><p>Loading notices...</p></section>
      </main>
    );
  }

  return (
    <main>
      <AppHeader />

      {!activeMembership ? (
        <section className="empty-state">
          <h2>Join a state to view notices</h2>
          <p>State announcements become available after membership approval.</p>
        </section>
      ) : (
        <>
          <section className="announcements-heading">
            <div>
              <p className="section-label">{activeMembership.stateName}</p>
              <h1>Notices</h1>
              <p>
                Operational updates for your state, alliance, tags, role, and
                battle responsibilities.
              </p>
            </div>
            <span className="retention-badge">Expires automatically</span>
          </section>

          {isAdmin && (
            <section>
              <p className="section-label">Owner and admin tools</p>
              <h2>Send announcement</h2>
              <div className="announcement-form-grid">
                <label>
                  Title
                  <input
                    type="text"
                    minLength={3}
                    maxLength={100}
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Formation update"
                  />
                </label>
                <label>
                  Audience
                  <select
                    value={audienceType}
                    onChange={(event) =>
                      changeAudience(event.target.value as AudienceType)
                    }
                  >
                    <option value="all">Entire state</option>
                    <option value="alliance">Alliance</option>
                    <option value="tag">Tag</option>
                    <option value="role">State role</option>
                    <option value="capability">Battle role</option>
                  </select>
                </label>

                {audienceType === "alliance" && (
                  <label>
                    Alliance
                    <select
                      value={audienceId}
                      onChange={(event) => setAudienceId(event.target.value)}
                    >
                      <option value="">Choose alliance</option>
                      {alliances.map((alliance) => (
                        <option key={alliance.id} value={alliance.id}>
                          {alliance.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {audienceType === "tag" && (
                  <label>
                    Tag
                    <select
                      value={audienceId}
                      onChange={(event) => setAudienceId(event.target.value)}
                    >
                      <option value="">Choose tag</option>
                      {tags.map((tag) => (
                        <option key={tag.id} value={tag.id}>
                          {tag.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {audienceType === "role" && (
                  <label>
                    State role
                    <select
                      value={audienceValue}
                      onChange={(event) => setAudienceValue(event.target.value)}
                    >
                      <option value="">Choose role</option>
                      <option value="owner">Owners</option>
                      <option value="admin">Admins</option>
                      <option value="member">Members</option>
                    </select>
                  </label>
                )}

                {audienceType === "capability" && (
                  <label>
                    Battle role
                    <select
                      value={audienceValue}
                      onChange={(event) => setAudienceValue(event.target.value)}
                    >
                      <option value="">Choose battle role</option>
                      <option value="rally_caller">Coordinators</option>
                      <option value="garrison">Garrison</option>
                    </select>
                  </label>
                )}

                <label>
                  Expires
                  <input
                    type="datetime-local"
                    value={expiresAt}
                    onChange={(event) => setExpiresAt(event.target.value)}
                  />
                </label>
                <label className="announcement-body-field">
                  Message
                  <textarea
                    rows={5}
                    maxLength={2000}
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    placeholder="Tell the selected members what they need to know."
                  />
                  <span className="form-hint">{body.length}/2000 characters</span>
                </label>
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={() => void createAnnouncement()}
              >
                {saving ? "Sending..." : "Send announcement"}
              </button>
              <p className="form-hint">
                The selected WOS accounts are saved as the recipient list when
                you send. Notices expire after no more than 30 days.
              </p>
            </section>
          )}

          <section>
            <div className="section-title-row">
              <div>
                <p className="section-label">Active announcements</p>
                <h2>Your notices</h2>
              </div>
              <span className="retention-badge">
                {announcements.length} active
              </span>
            </div>
            {message && <p className="page-message">{message}</p>}

            {loading ? (
              <p>Loading notices...</p>
            ) : announcements.length === 0 ? (
              <div className="empty-state compact-empty-state">
                <h3>No active notices</h3>
                <p>Announcements sent to this account will appear here.</p>
              </div>
            ) : (
              <div className="announcement-list">
                {announcements.map((announcement) => (
                  <article key={announcement.id} className="announcement-card">
                    <div className="announcement-card-heading">
                      <div>
                        <span className="announcement-audience">
                          {getAudienceLabel(announcement)}
                        </span>
                        <h3>{announcement.title}</h3>
                      </div>
                      {isAdmin && (
                        <button
                          type="button"
                          className="danger-button"
                          disabled={saving}
                          onClick={() => void deleteAnnouncement(announcement)}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                    <p className="announcement-message">{announcement.body}</p>
                    <div className="announcement-meta">
                      <span>
                        Sent {new Date(announcement.created_at).toLocaleString()}
                      </span>
                      <span>
                        Expires {new Date(announcement.expires_at).toLocaleString()}
                      </span>
                      {isAdmin && (
                        <span>
                          {recipientCounts[announcement.id] ?? 0}{" "}
                          {(recipientCounts[announcement.id] ?? 0) === 1
                            ? "account"
                            : "accounts"}
                        </span>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
