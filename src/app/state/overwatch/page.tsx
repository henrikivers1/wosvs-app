"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { SvsStatus } from "@/components/SvsStatus";
import { AttendanceVote } from "@/components/AttendanceVote";
import { useStates } from "@/components/StateProvider";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/components/LanguageProvider";

type Battle = {
  id: string;
  name: string;
  battle_type: string | null;
  status: "scheduled" | "active";
  scheduled_at: string | null;
  plan_id: string | null;
};

type Tag = {
  id: string;
  name: string;
  color: string;
  system_key: string | null;
  kind: "custom" | "rally" | "hero";
};

type Alliance = {
  id: string;
  name: string;
  color: string;
};

type Plan = {
  id: string;
  name: string;
  battle_type: string;
  scheduled_at: string;
  notes: string | null;
};

type PlanGroup = {
  id: string;
  plan_id: string;
  name: string;
  leader_wos_account_id: string;
  alliance_id: string | null;
  notes: string | null;
  formation: string | null;
};

type Assignment = {
  plan_id: string;
  group_id: string;
  hero: string | null;
  formation: string | null;
};

type Announcement = {
  id: string;
  title: string;
  body: string;
  expires_at: string;
  created_at: string;
};

type PlanComment = {
  id: string;
  plan_id: string;
  author_wos_account_id: string | null;
  body: string;
  created_at: string;
};

type AccountLabel = {
  id: string;
  nickname: string | null;
  wos_id: string;
};

export default function OverwatchPage() {
  const { t, formatDateTime } = useLanguage();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { activeMembership, signedIn, loadingStates } = useStates();
  const [battles, setBattles] = useState<Battle[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [alliance, setAlliance] = useState<Alliance | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  // The next plan whose battle has not ended yet (else the latest one).
  const [nextPlanId, setNextPlanId] = useState<string | null>(null);
  const [groups, setGroups] = useState<PlanGroup[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [comments, setComments] = useState<PlanComment[]>([]);
  const [accountLabels, setAccountLabels] = useState<AccountLabel[]>([]);
  const [commentDraft, setCommentDraft] = useState("");
  const [savingComment, setSavingComment] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const loadOverwatch = useCallback(async () => {
    if (!activeMembership) {
      setBattles([]);
      setTags([]);
      setAlliance(null);
      setPlans([]);
      setGroups([]);
      setAssignments([]);
      setAnnouncements([]);
      setComments([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setMessage(t(""));
    const stateId = activeMembership.stateId;
    const accountId = activeMembership.wosAccountId;

    await supabase.rpc("cleanup_expired_state_announcements");

    const [
      battleResult,
      tagAssignmentResult,
      allianceAssignmentResult,
      planResult,
      recipientResult,
    ] = await Promise.all([
      supabase
        .from("battles")
        .select("id, name, battle_type, status, scheduled_at, plan_id")
        .eq("state_id", stateId)
        .in("status", ["scheduled", "active"])
        .order("scheduled_at", { ascending: true }),
      supabase
        .from("state_member_tags")
        .select("tag_id")
        .eq("wos_account_id", accountId),
      supabase
        .from("state_alliance_members")
        .select("alliance_id")
        .eq("state_id", stateId)
        .eq("wos_account_id", accountId)
        .maybeSingle(),
      supabase
        .from("battle_plans")
        .select("id, name, battle_type, scheduled_at, notes")
        .eq("state_id", stateId)
        .eq("status", "published")
        .order("scheduled_at", { ascending: true }),
      supabase
        .from("state_announcement_recipients")
        .select("announcement_id")
        .eq("state_id", stateId)
        .eq("wos_account_id", accountId),
    ]);

    const firstError =
      battleResult.error ||
      tagAssignmentResult.error ||
      allianceAssignmentResult.error ||
      planResult.error ||
      recipientResult.error;

    if (firstError) {
      setMessage(firstError.message);
      setLoading(false);
      return;
    }

    const planRows = (planResult.data ?? []) as Plan[];
    const planIds = planRows.map((plan) => plan.id);
    const tagIds = (tagAssignmentResult.data ?? []).map((row) => row.tag_id);
    const announcementIds = (recipientResult.data ?? []).map(
      (row) => row.announcement_id,
    );
    const allianceId = allianceAssignmentResult.data?.alliance_id ?? null;

    const [
      tagResult,
      allianceResult,
      groupResult,
      assignmentResult,
      announcementResult,
      commentResult,
    ] = await Promise.all([
      tagIds.length
        ? supabase
            .from("state_tags")
            .select("id, name, color, system_key, kind")
            .in("id", tagIds)
            .order("name")
        : Promise.resolve({ data: [], error: null }),
      allianceId
        ? supabase
            .from("state_alliances")
            .select("id, name, color")
            .eq("id", allianceId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      planIds.length
        ? supabase
            .from("battle_plan_groups")
            .select(
              "id, plan_id, name, leader_wos_account_id, alliance_id, notes, formation",
            )
            .in("plan_id", planIds)
        : Promise.resolve({ data: [], error: null }),
      planIds.length
        ? supabase
            .from("battle_plan_assignments")
            .select("plan_id, group_id, hero, formation")
            .in("plan_id", planIds)
            .eq("wos_account_id", accountId)
        : Promise.resolve({ data: [], error: null }),
      announcementIds.length
        ? supabase
            .from("state_announcements")
            .select("id, title, body, expires_at, created_at")
            .in("id", announcementIds)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      planIds.length
        ? supabase.rpc("get_battle_plan_comments", {
            target_state_id: stateId,
            viewer_wos_account_id: accountId,
          })
        : Promise.resolve({ data: [], error: null }),
    ]);

    const secondError =
      tagResult.error ||
      allianceResult.error ||
      groupResult.error ||
      assignmentResult.error ||
      announcementResult.error ||
      commentResult.error;

    if (secondError) {
      setMessage(secondError.message);
      setLoading(false);
      return;
    }

    const loadedGroups = (groupResult.data ?? []) as PlanGroup[];
    const loadedComments = (
      (commentResult.data ?? []) as Array<PlanComment & { visibility: string }>
    ).filter((comment) => comment.visibility === "public");
    const accountIds = [
      ...new Set([
        ...loadedGroups.map((group) => group.leader_wos_account_id),
        ...loadedComments.flatMap((comment) =>
          comment.author_wos_account_id ? [comment.author_wos_account_id] : [],
        ),
      ]),
    ];
    const accountResult = accountIds.length
      ? await supabase
          .from("wos_accounts")
          .select("id, nickname, wos_id")
          .in("id", accountIds)
      : { data: [], error: null };

    if (accountResult.error) {
      setMessage(accountResult.error.message);
      setLoading(false);
      return;
    }

    setBattles((battleResult.data ?? []) as Battle[]);
    setTags((tagResult.data ?? []) as Tag[]);
    setAlliance((allianceResult.data as Alliance | null) ?? null);
    setPlans(planRows);
    const stillRunningAfter = Date.now() - 5 * 60 * 60 * 1000;
    setNextPlanId(
      (
        planRows.find(
          (plan) => new Date(plan.scheduled_at).getTime() > stillRunningAfter,
        ) ?? planRows[planRows.length - 1]
      )?.id ?? null,
    );
    setGroups(loadedGroups);
    setAssignments((assignmentResult.data ?? []) as Assignment[]);
    setAnnouncements((announcementResult.data ?? []) as Announcement[]);
    setComments(loadedComments);
    setAccountLabels((accountResult.data ?? []) as AccountLabel[]);
    setLoading(false);
  }, [activeMembership, supabase, t]);

  useEffect(() => {
    if (!loadingStates && signedIn === false) {
      router.replace("/login");
      return;
    }
    const loadId = window.setTimeout(() => void loadOverwatch(), 0);
    return () => window.clearTimeout(loadId);
  }, [loadOverwatch, loadingStates, router, signedIn]);

  // This state's notices, comments, plans and assignments; a burst of
  // changes (publishing writes a row per member) reloads once.
  useEffect(() => {
    if (!activeMembership) return;
    let timer: number | undefined;
    const reload = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void loadOverwatch(), 400);
    };
    const channel = supabase.channel(`overwatch-${activeMembership.key}`);
    for (const table of [
      "state_announcements",
      "battle_plan_comments",
      "battle_plans",
      "battle_plan_assignments",
    ]) {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: `state_id=eq.${activeMembership.stateId}`,
        },
        reload,
      );
    }
    channel.subscribe();
    return () => {
      window.clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [activeMembership, loadOverwatch, supabase]);

  async function postPublicComment(planId: string) {
    if (!activeMembership || !commentDraft.trim()) return;
    setSavingComment(true);
    setMessage(t(""));
    const { error } = await supabase.rpc("create_battle_plan_comment", {
      target_plan_id: planId,
      commenter_wos_account_id: activeMembership.wosAccountId,
      comment_body: commentDraft.trim(),
      comment_visibility: "public",
    });

    if (error) {
      setMessage(error.message);
    } else {
      setCommentDraft("");
      await loadOverwatch();
      setMessage(t("Comment posted."));
    }
    setSavingComment(false);
  }

  if (loadingStates || signedIn === null) {
    return (
      <main>
        <AppHeader />
        <section className="loading-panel">
          <p>{t("Loading Overwatch...")}</p>
        </section>
      </main>
    );
  }

  if (!activeMembership) {
    return (
      <main>
        <AppHeader />
        <section className="empty-state">
          <h2>{t("Choose a state")}</h2>
          <p>{t("Overwatch becomes available after joining a state.")}</p>
        </section>
      </main>
    );
  }

  const activeBattle = battles.find((battle) => battle.status === "active");
  const scheduledBattle = battles.find(
    (battle) => battle.status === "scheduled",
  );
  const featuredBattle = activeBattle ?? scheduledBattle;
  const featuredPlan =
    plans.find((plan) => plan.id === featuredBattle?.plan_id) ??
    plans.find((plan) => plan.id === nextPlanId);
  const ownAssignment = assignments.find(
    (assignment) => assignment.plan_id === featuredPlan?.id,
  );
  const ownGroup = groups.find((group) => group.id === ownAssignment?.group_id);
  const leader = accountLabels.find(
    (account) => account.id === ownGroup?.leader_wos_account_id,
  );
  const publicComments = comments.filter(
    (comment) => comment.plan_id === featuredPlan?.id,
  );

  return (
    <main>
      <AppHeader />
      <section className="overwatch-hero">
        <div>
          <p className="section-label">{activeMembership.stateName}</p>
          <h1>{t("Overwatch")}</h1>
          <p>
            {t(
              "Your battle assignment, tags, alliance and operational messages.",
            )}
          </p>
        </div>
        {featuredBattle && (
          <span
            className={`battle-state ${featuredBattle.status === "active" ? "battle-state-active" : ""}`}
          >
            {featuredBattle.status === "active" ? t("Active") : t("Scheduled")}
          </span>
        )}
      </section>
      <SvsStatus stateId={activeMembership.stateId} />
      <AttendanceVote
        stateId={activeMembership.stateId}
        wosAccountId={activeMembership.wosAccountId}
      />

      {message && <p className="page-message">{message}</p>}
      {loading ? (
        <section className="loading-panel">
          <p>{t("Loading your battle overview...")}</p>
        </section>
      ) : (
        <>
          <section className="overwatch-grid">
            <article className="overwatch-card overwatch-battle-card">
              <p className="section-label">{t("Battle")}</p>
              {featuredBattle || featuredPlan ? (
                <>
                  <h2>{featuredBattle?.name ?? featuredPlan?.name}</h2>
                  <p>
                    {(
                      featuredBattle?.battle_type ?? featuredPlan?.battle_type
                    )?.toUpperCase()}
                    {" · "}
                    {formatDateTime(
                      featuredBattle?.scheduled_at ??
                        featuredPlan?.scheduled_at ??
                        "",
                    )}
                  </p>
                  {featuredPlan?.notes && <p>{featuredPlan.notes}</p>}
                  {activeBattle && (
                    <Link className="nav-link" href="/battle">
                      {t("Open Live Battle")}
                    </Link>
                  )}
                </>
              ) : (
                <p>{t("No published battle is currently scheduled.")}</p>
              )}
            </article>

            <article className="overwatch-card">
              <p className="section-label">{t("Your assignment")}</p>
              {ownGroup ? (
                <>
                  <h2>{ownGroup.name}</h2>
                  <p>
                    {t("Rally Lead:")}{" "}
                    <strong>
                      {leader?.nickname ?? leader?.wos_id ?? t("Unknown")}
                    </strong>
                  </p>
                  <p>
                    {t("Alliance:")}{" "}
                    <strong>{alliance?.name ?? t("Not selected")}</strong>
                  </p>
                  <p>
                    {t("Join with:")}{" "}
                    <strong>
                      {ownAssignment?.hero ?? t("Not assigned yet")}
                    </strong>
                  </p>
                  <p>
                    {t("Formation:")}{" "}
                    <strong>
                      {ownAssignment?.formation ??
                        ownGroup.formation ??
                        t("Not set")}
                    </strong>
                  </p>
                  {ownGroup.notes && <p>{ownGroup.notes}</p>}
                </>
              ) : (
                <p>
                  {t(
                    "This WOS account has not been assigned to a rally group.",
                  )}
                </p>
              )}
            </article>

            <article className="overwatch-card">
              <p className="section-label">{t("Alliance")}</p>
              {alliance ? (
                <h2 className="alliance-title">
                  <span style={{ backgroundColor: alliance.color }} />
                  {alliance.name}
                </h2>
              ) : (
                <p>{t("No alliance assignment yet.")}</p>
              )}
            </article>

            <article className="overwatch-card">
              <p className="section-label">{t("Your tags")}</p>
              {tags
                .filter((tag) => tag.kind === "hero")
                .map((tag) => (
                  <p key={`hero-${tag.id}`} className="join-hero">
                    {t("Join with: {hero}", { hero: tag.name })}
                  </p>
                ))}
              {tags.length ? (
                <div className="overwatch-tags">
                  {tags.map((tag) => (
                    <span key={tag.id} className="member-tag-pill">
                      <span style={{ backgroundColor: tag.color }} />
                      {tag.name}
                    </span>
                  ))}
                </div>
              ) : (
                <p>{t("No battle tags assigned.")}</p>
              )}
            </article>
          </section>

          <section>
            <div className="section-title-row">
              <div>
                <p className="section-label">{t("Messages")}</p>
                <h2>{t("Your battle notices")}</h2>
              </div>
              <span className="retention-badge">
                {t("Until Sunday 23:59 UTC")}
              </span>
            </div>
            {announcements.length ? (
              <div className="announcement-list">
                {announcements.map((announcement) => (
                  <article key={announcement.id} className="announcement-card">
                    <h3>{announcement.title}</h3>
                    <p>{announcement.body}</p>
                    <time>{formatDateTime(announcement.created_at)}</time>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state compact-empty-state">
                <p>{t("No active messages for this account.")}</p>
              </div>
            )}
          </section>

          {featuredPlan && (
            <section>
              <div className="section-title-row">
                <div>
                  <p className="section-label">{t("Plan discussion")}</p>
                  <h2>{t("Public comments")}</h2>
                </div>
                <Link
                  className="nav-link"
                  href={`/state/planning#plan-${featuredPlan.id}`}
                >
                  {t("Open full plan")}
                </Link>
              </div>
              {publicComments.length ? (
                <div className="plan-comment-list">
                  {publicComments.map((comment) => {
                    const author = accountLabels.find(
                      (account) => account.id === comment.author_wos_account_id,
                    );
                    return (
                      <article
                        key={comment.id}
                        className="plan-comment plan-comment-public"
                      >
                        <div className="plan-comment-heading">
                          <strong>
                            {author?.nickname ??
                              author?.wos_id ??
                              t("State member")}
                          </strong>
                          <time>{formatDateTime(comment.created_at)}</time>
                        </div>
                        <p>{comment.body}</p>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <p>{t("No public comments on this plan.")}</p>
              )}
              <div className="plan-comment-form">
                <label>
                  {t("Add a public comment")}
                  <textarea
                    rows={3}
                    maxLength={2000}
                    value={commentDraft}
                    onChange={(event) => setCommentDraft(event.target.value)}
                    placeholder={t(
                      "Write a comment. Use @username to notify another member.",
                    )}
                  />
                </label>
                <button
                  type="button"
                  disabled={savingComment || !commentDraft.trim()}
                  onClick={() => void postPublicComment(featuredPlan.id)}
                >
                  {savingComment ? t("Posting...") : t("Post comment")}
                </button>
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}
