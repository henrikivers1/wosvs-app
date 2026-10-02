"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { useStates } from "@/components/StateProvider";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/components/LanguageProvider";

type Alliance = {
  id: string;
  name: string;
  color: string;
  max_members: number;
};

type AllianceAssignment = {
  alliance_id: string;
  wos_account_id: string;
};

type MemberRow = {
  wos_account_id: string;
};

type AccountRow = {
  id: string;
  user_id: string;
  wos_id: string;
  nickname: string | null;
};

type ProfileRow = {
  id: string;
  username: string | null;
};

type AllianceNotice = {
  id: string;
  title: string;
  body: string;
  audience_id: string;
  expires_at: string;
  created_at: string;
};

type StateMember = AccountRow & {
  username: string | null;
  allianceId: string | null;
};

export default function AlliancesPage() {
  const { t, formatDateTime } = useLanguage();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { activeMembership, signedIn, loadingStates } = useStates();
  const [alliances, setAlliances] = useState<Alliance[]>([]);
  const [allianceNotices, setAllianceNotices] = useState<AllianceNotice[]>([]);
  const [members, setMembers] = useState<StateMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const isAdmin =
    activeMembership?.role === "owner" || activeMembership?.role === "admin";

  const loadAllianceOverview = useCallback(async () => {
    if (!activeMembership) {
      setAlliances([]);
      setAllianceNotices([]);
      setMembers([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setMessage(t(""));
    await supabase.rpc("cleanup_expired_state_announcements");

    const [allianceResult, assignmentResult, memberResult, recipientResult] =
      await Promise.all([
        supabase
          .from("state_alliances")
          .select("id, name, color, max_members")
          .eq("state_id", activeMembership.stateId)
          .order("name"),
        supabase
          .from("state_alliance_members")
          .select("alliance_id, wos_account_id")
          .eq("state_id", activeMembership.stateId),
        supabase
          .from("state_members")
          .select("wos_account_id")
          .eq("state_id", activeMembership.stateId),
        isAdmin
          ? supabase
              .from("state_announcement_recipients")
              .select("announcement_id")
              .eq("state_id", activeMembership.stateId)
          : supabase
              .from("state_announcement_recipients")
              .select("announcement_id")
              .eq("state_id", activeMembership.stateId)
              .eq("wos_account_id", activeMembership.wosAccountId),
      ]);

    const firstError =
      allianceResult.error ||
      assignmentResult.error ||
      memberResult.error ||
      recipientResult.error;

    if (firstError) {
      setMessage(firstError.message);
      setLoading(false);
      return;
    }

    const stateAlliances = (allianceResult.data ?? []) as Alliance[];
    const assignments = (assignmentResult.data ?? []) as AllianceAssignment[];
    const memberRows = (memberResult.data ?? []) as MemberRow[];
    const visibleNoticeIds = [
      ...new Set(
        (recipientResult.data ?? []).map(
          (recipient) => recipient.announcement_id,
        ),
      ),
    ];
    let notices: AllianceNotice[] = [];

    if (isAdmin || visibleNoticeIds.length > 0) {
      let noticeQuery = supabase
        .from("state_announcements")
        .select("id, title, body, audience_id, expires_at, created_at")
        .eq("state_id", activeMembership.stateId)
        .eq("audience_type", "alliance")
        .order("created_at", { ascending: false });

      if (!isAdmin) {
        noticeQuery = noticeQuery.in("id", visibleNoticeIds);
      }

      const noticeResult = await noticeQuery;
      if (noticeResult.error) {
        setMessage(noticeResult.error.message);
        setLoading(false);
        return;
      }
      notices = (noticeResult.data ?? []) as AllianceNotice[];
    }

    const accountIds = memberRows.map((member) => member.wos_account_id);
    if (accountIds.length === 0) {
      setAlliances(stateAlliances);
      setAllianceNotices(notices);
      setMembers([]);
      setLoading(false);
      return;
    }

    const accountResult = await supabase
      .from("wos_accounts")
      .select("id, user_id, wos_id, nickname")
      .in("id", accountIds);

    if (accountResult.error) {
      setMessage(accountResult.error.message);
      setLoading(false);
      return;
    }

    const accounts = (accountResult.data ?? []) as AccountRow[];
    const userIds = [...new Set(accounts.map((account) => account.user_id))];
    const profileResult = userIds.length
      ? await supabase.from("profiles").select("id, username").in("id", userIds)
      : { data: [], error: null };

    if (profileResult.error) {
      setMessage(profileResult.error.message);
      setLoading(false);
      return;
    }

    const profiles = (profileResult.data ?? []) as ProfileRow[];
    const usernameByUserId = new Map(
      profiles.map((profile) => [profile.id, profile.username]),
    );
    const allianceByAccountId = new Map(
      assignments.map((assignment) => [
        assignment.wos_account_id,
        assignment.alliance_id,
      ]),
    );

    const stateMembers = accounts
      .map<StateMember>((account) => ({
        ...account,
        username: usernameByUserId.get(account.user_id) ?? null,
        allianceId: allianceByAccountId.get(account.id) ?? null,
      }))
      .sort((first, second) =>
        (first.nickname || first.wos_id).localeCompare(
          second.nickname || second.wos_id,
        ),
      );

    setAlliances(stateAlliances);
    setAllianceNotices(notices);
    setMembers(stateMembers);
    setLoading(false);
  }, [activeMembership, isAdmin, supabase, t]);

  useEffect(() => {
    if (!loadingStates && signedIn === false) {
      router.replace("/login");
      return;
    }

    const loadId = window.setTimeout(() => {
      void loadAllianceOverview();
    }, 0);
    return () => window.clearTimeout(loadId);
  }, [loadAllianceOverview, loadingStates, router, signedIn]);

  useEffect(() => {
    if (!activeMembership) return;

    const stateId = activeMembership.stateId;
    const channel = supabase
      .channel(`alliance-overview-${stateId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "state_alliance_members",
          filter: `state_id=eq.${stateId}`,
        },
        () => void loadAllianceOverview(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "state_alliances",
          filter: `state_id=eq.${stateId}`,
        },
        () => void loadAllianceOverview(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeMembership, loadAllianceOverview, supabase]);

  function renderRosterTable(allianceMembers: StateMember[]) {
    return (
      <div className="alliance-roster-table-wrap">
        <table className="alliance-roster-table">
          <thead>
            <tr>
              <th>{t("Member")}</th>
              <th>{t("WOS ID")}</th>
              <th>{t("Username")}</th>
            </tr>
          </thead>
          <tbody>
            {allianceMembers.map((member) => (
              <tr key={member.id}>
                <td>
                  <strong>{member.nickname || t("Unnamed account")}</strong>
                </td>
                <td>{member.wos_id}</td>
                <td>{member.username ? `@${member.username}` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (loadingStates || signedIn === null) {
    return (
      <main>
        <AppHeader />
        <section className="loading-panel">
          <p>{t("Loading alliance overview...")}</p>
        </section>
      </main>
    );
  }

  return (
    <main>
      <AppHeader />

      {!activeMembership ? (
        <section className="empty-state">
          <h2>{t("Join a state to view battle assignments")}</h2>
          <p>
            {t("Alliance rosters become visible after membership approval.")}
          </p>
        </section>
      ) : (
        <>
          <section className="alliances-heading">
            <p className="section-label">{activeMembership.stateName}</p>
            <h1>{t("Alliance overview")}</h1>
            <p>
              {t(
                "This is the current published battle-day roster. Member assignments can only be changed from Battle Planning.",
              )}
            </p>
          </section>

          <section>
            <div className="section-title-row">
              <div>
                <p className="section-label">{t("Published assignments")}</p>
                <h2>{t("Battle-day alliances")}</h2>
              </div>
              <span className="retention-badge">
                {members.filter((member) => member.allianceId).length}{" "}
                {t("assigned")}
              </span>
            </div>

            {message && <p className="page-message">{message}</p>}

            {loading ? (
              <p>{t("Loading alliance overview...")}</p>
            ) : alliances.length === 0 ? (
              <div className="empty-state compact-empty-state">
                <h3>{t("No alliances configured")}</h3>
                <p>
                  {t(
                    "An Owner or Admin can create alliances from Manage State.",
                  )}
                </p>
              </div>
            ) : (
              <div className="alliance-grid alliance-overview-grid">
                {alliances.map((alliance) => {
                  const allianceMembers = members.filter(
                    (member) => member.allianceId === alliance.id,
                  );
                  const notices = allianceNotices
                    .filter((notice) => notice.audience_id === alliance.id)
                    .slice(0, 3);

                  return (
                    <article
                      key={alliance.id}
                      className="alliance-card"
                      style={{ borderTopColor: alliance.color }}
                    >
                      <div className="alliance-card-heading">
                        <div>
                          <span
                            className="tag-swatch alliance-swatch"
                            style={{ backgroundColor: alliance.color }}
                          />
                          <div>
                            <h3>{alliance.name}</h3>
                            <small>
                              {allianceMembers.length}
                              {t("/")}
                              {alliance.max_members} {t("members")}
                            </small>
                          </div>
                        </div>
                      </div>

                      {notices.length > 0 && (
                        <div className="alliance-notice-list">
                          {notices.map((notice) => (
                            <div key={notice.id} className="alliance-notice">
                              <strong>{notice.title}</strong>
                              <p>{notice.body}</p>
                              <small>
                                {t("Expires")}{" "}
                                {formatDateTime(notice.expires_at)}
                              </small>
                            </div>
                          ))}
                        </div>
                      )}

                      {allianceMembers.length === 0 ? (
                        <p className="alliance-empty">
                          {t("No members assigned in the published plan.")}
                        </p>
                      ) : (
                        renderRosterTable(allianceMembers)
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          {!loading && members.some((member) => !member.allianceId) && (
            <section>
              <div className="section-title-row">
                <div>
                  <p className="section-label">
                    {t("Not on the battle roster")}
                  </p>
                  <h2>{t("Unassigned accounts")}</h2>
                </div>
                <span className="retention-badge">
                  {members.filter((member) => !member.allianceId).length}
                </span>
              </div>
              <p>
                {t(
                  "Assign these accounts to a rally group in Battle Planning, then publish the plan.",
                )}
              </p>
              {renderRosterTable(
                members.filter((member) => !member.allianceId),
              )}
            </section>
          )}
        </>
      )}
    </main>
  );
}
