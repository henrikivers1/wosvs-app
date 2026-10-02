"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { useLanguage } from "@/components/LanguageProvider";
import { useStates } from "@/components/StateProvider";
import { createClient } from "@/lib/supabase/client";

type PollRow = {
  id: string;
  question: string;
  description: string | null;
  closes_at: string;
  delete_at: string;
  created_at: string;
};

type PollOption = {
  id: string;
  poll_id: string;
  label: string;
  sort_order: number;
  auto_tag_id: string | null;
};

type StateTag = {
  id: string;
  name: string;
  color: string;
};

type Poll = PollRow & {
  options: PollOption[];
};

type PollCount = {
  poll_id: string;
  option_id: string;
  vote_count: number;
};

type OwnVote = {
  poll_id: string;
  option_id: string;
};

type AdminResponse = {
  poll_id: string;
  option_id: string;
  wos_account_id: string;
  wos_id: string;
  nickname: string | null;
  username: string | null;
  voted_at: string;
};

function defaultClosingTime() {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export default function VotesPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { t, formatDateTime, formatNumber } = useLanguage();
  const { activeMembership, signedIn, loadingStates } = useStates();
  const [polls, setPolls] = useState<Poll[]>([]);
  const [counts, setCounts] = useState<PollCount[]>([]);
  const [responses, setResponses] = useState<AdminResponse[]>([]);
  const [selectedOptions, setSelectedOptions] = useState<
    Record<string, string>
  >({});
  const [question, setQuestion] = useState("");
  const [description, setDescription] = useState("");
  const [optionLabels, setOptionLabels] = useState(["", ""]);
  const [optionTagIds, setOptionTagIds] = useState(["", ""]);
  const [tags, setTags] = useState<StateTag[]>([]);
  const [closesAt, setClosesAt] = useState(defaultClosingTime);
  const [currentTime, setCurrentTime] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const isAdmin =
    activeMembership?.role === "owner" || activeMembership?.role === "admin";

  const loadPolls = useCallback(async () => {
    if (!activeMembership) {
      setPolls([]);
      setCounts([]);
      setResponses([]);
      setTags([]);
      setSelectedOptions({});
      setLoading(false);
      return;
    }

    setLoading(true);
    setMessage("");
    await supabase.rpc("cleanup_expired_state_polls");

    const [pollResult, optionResult, ownVoteResult, countResult, tagResult] =
      await Promise.all([
        supabase
          .from("state_polls")
          .select("id, question, description, closes_at, delete_at, created_at")
          .eq("state_id", activeMembership.stateId)
          .order("created_at", { ascending: false }),
        supabase
          .from("state_poll_options")
          .select("id, poll_id, label, sort_order, auto_tag_id")
          .order("sort_order"),
        supabase
          .from("state_poll_votes")
          .select("poll_id, option_id")
          .eq("wos_account_id", activeMembership.wosAccountId),
        supabase.rpc("get_state_poll_counts", {
          target_state_id: activeMembership.stateId,
        }),
        supabase
          .from("state_tags")
          .select("id, name, color")
          .eq("state_id", activeMembership.stateId)
          .order("name"),
      ]);

    const firstError =
      pollResult.error ||
      optionResult.error ||
      ownVoteResult.error ||
      countResult.error ||
      tagResult.error;

    if (firstError) {
      setMessage(firstError.message);
      setLoading(false);
      return;
    }

    const pollRows = (pollResult.data ?? []) as PollRow[];
    const optionRows = (optionResult.data ?? []) as PollOption[];
    const ownVotes = (ownVoteResult.data ?? []) as OwnVote[];

    setPolls(
      pollRows.map((poll) => ({
        ...poll,
        options: optionRows.filter((option) => option.poll_id === poll.id),
      })),
    );
    setCounts((countResult.data ?? []) as PollCount[]);
    setTags((tagResult.data ?? []) as StateTag[]);
    setSelectedOptions(
      ownVotes.reduce<Record<string, string>>((selections, vote) => {
        selections[vote.poll_id] = vote.option_id;
        return selections;
      }, {}),
    );

    if (isAdmin) {
      const { data, error } = await supabase.rpc(
        "get_state_poll_admin_responses",
        { target_state_id: activeMembership.stateId },
      );
      if (error) {
        setMessage(error.message);
      } else {
        setResponses((data ?? []) as AdminResponse[]);
      }
    } else {
      setResponses([]);
    }

    setLoading(false);
  }, [activeMembership, isAdmin, supabase]);

  useEffect(() => {
    if (!loadingStates && signedIn === false) {
      router.replace("/login");
      return;
    }

    const loadId = window.setTimeout(() => {
      void loadPolls();
    }, 0);
    return () => window.clearTimeout(loadId);
  }, [loadPolls, loadingStates, router, signedIn]);

  useEffect(() => {
    const updateId = window.setTimeout(() => setCurrentTime(Date.now()), 0);
    const intervalId = window.setInterval(
      () => setCurrentTime(Date.now()),
      15_000,
    );
    return () => {
      window.clearTimeout(updateId);
      window.clearInterval(intervalId);
    };
  }, []);

  function updateOption(index: number, value: string) {
    setOptionLabels((current) =>
      current.map((option, optionIndex) =>
        optionIndex === index ? value : option,
      ),
    );
  }

  async function createPoll() {
    if (!activeMembership || !isAdmin) return;

    const closingTimestamp = Date.parse(closesAt);
    if (!closesAt || Number.isNaN(closingTimestamp)) {
      setMessage(t("votesChooseClosing"));
      return;
    }

    setSaving(true);
    setMessage("");
    const { error } = await supabase.rpc("create_state_poll", {
      target_state_id: activeMembership.stateId,
      creator_wos_account_id: activeMembership.wosAccountId,
      poll_question: question,
      poll_description: description,
      option_labels: optionLabels,
      option_tag_ids: optionTagIds.map((tagId) => tagId || null),
      poll_closes_at: new Date(closingTimestamp).toISOString(),
    });

    if (error) {
      setMessage(error.message);
      setSaving(false);
      return;
    }

    setQuestion("");
    setDescription("");
    setOptionLabels(["", ""]);
    setOptionTagIds(["", ""]);
    setClosesAt(defaultClosingTime());
    await loadPolls();
    setMessage(t("votesCreated"));
    setSaving(false);
  }

  async function submitVote(pollId: string) {
    if (!activeMembership) return;
    const optionId = selectedOptions[pollId];
    if (!optionId) {
      setMessage(t("votesChooseOption"));
      return;
    }

    setSaving(true);
    setMessage("");
    const { error } = await supabase.rpc("submit_state_poll_vote", {
      target_poll_id: pollId,
      target_option_id: optionId,
      voter_wos_account_id: activeMembership.wosAccountId,
    });

    if (error) {
      setMessage(error.message);
    } else {
      await loadPolls();
      setMessage(t("votesSaved"));
    }
    setSaving(false);
  }

  async function deletePoll(poll: Poll) {
    if (!window.confirm(t("votesDeleteConfirm", { question: poll.question }))) {
      return;
    }

    setSaving(true);
    setMessage("");
    const { error } = await supabase.rpc("delete_state_poll", {
      target_poll_id: poll.id,
    });

    if (error) {
      setMessage(error.message);
    } else {
      await loadPolls();
      setMessage(t("votesDeleted"));
    }
    setSaving(false);
  }

  if (loadingStates || signedIn === null) {
    return (
      <main>
        <AppHeader />
        <section className="loading-panel">
          <p>{t("votesLoading")}</p>
        </section>
      </main>
    );
  }

  return (
    <main>
      <AppHeader />

      <section className="votes-heading">
        <div>
          <p className="section-label">{t("votesStateCoordination")}</p>
          <h1>{t("votesTitle")}</h1>
          <p>
            {t("votesVotingAs", {
              account:
                activeMembership?.wosNickname || activeMembership?.wosId || "—",
            })}
          </p>
        </div>
        <span className="retention-badge">{t("votesRetention")}</span>
      </section>

      {!activeMembership ? (
        <section className="empty-state">
          <h2>{t("votesJoinState")}</h2>
          <p>{t("votesJoinStateDescription")}</p>
        </section>
      ) : (
        <>
          {isAdmin && (
            <section>
              <p className="section-label">{t("votesAdminTools")}</p>
              <h2>{t("votesCreate")}</h2>
              <div className="poll-form-grid">
                <label className="poll-question-field">
                  {t("votesQuestion")}
                  <input
                    type="text"
                    maxLength={140}
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    placeholder={t("votesQuestionPlaceholder")}
                  />
                </label>
                <label>
                  {t("votesClosingTime")}
                  <input
                    type="datetime-local"
                    value={closesAt}
                    onChange={(event) => setClosesAt(event.target.value)}
                  />
                </label>
                <label className="poll-description-field">
                  {t("votesDescriptionOptional")}
                  <textarea
                    maxLength={1000}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder={t("votesDescriptionPlaceholder")}
                  />
                </label>
              </div>

              <div className="poll-option-editor">
                <h3>{t("votesOptions")}</h3>
                {optionLabels.map((option, index) => (
                  <div key={index} className="poll-option-edit-row">
                    <label>
                      {t("votesOptionNumber", { number: index + 1 })}
                      <input
                        type="text"
                        maxLength={100}
                        value={option}
                        onChange={(event) =>
                          updateOption(index, event.target.value)
                        }
                        placeholder={
                          index === 0
                            ? t("votesYes")
                            : index === 1
                              ? t("votesNo")
                              : t("votesOption")
                        }
                      />
                    </label>
                    <label className="poll-option-tag-field">
                      {t("votesAutomaticTag")}
                      <select
                        value={optionTagIds[index] ?? ""}
                        onChange={(event) =>
                          setOptionTagIds((current) =>
                            current.map((tagId, optionIndex) =>
                              optionIndex === index
                                ? event.target.value
                                : tagId,
                            ),
                          )
                        }
                      >
                        <option value="">{t("votesNoAutomaticTag")}</option>
                        {tags.map((tag) => (
                          <option key={tag.id} value={tag.id}>
                            {tag.name} ({tag.color.toUpperCase()})
                          </option>
                        ))}
                      </select>
                    </label>
                    {optionLabels.length > 2 && (
                      <button
                        type="button"
                        className="danger-button"
                        onClick={() => {
                          setOptionLabels((current) =>
                            current.filter(
                              (_, optionIndex) => optionIndex !== index,
                            ),
                          );
                          setOptionTagIds((current) =>
                            current.filter(
                              (_, optionIndex) => optionIndex !== index,
                            ),
                          );
                        }}
                      >
                        {t("remove")}
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="button-row">
                <button
                  type="button"
                  className="secondary-link"
                  disabled={optionLabels.length >= 10}
                  onClick={() => {
                    setOptionLabels((current) => [...current, ""]);
                    setOptionTagIds((current) => [...current, ""]);
                  }}
                >
                  {t("votesAddOption")}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void createPoll()}
                >
                  {saving ? t("votesCreating") : t("votesCreateButton")}
                </button>
              </div>
              <p className="form-hint">{t("votesRetentionExplanation")}</p>
              {tags.length === 0 && (
                <p className="form-hint">
                  {t("votesNoTagsPrefix")}{" "}
                  <Link href="/state/tags">{t("votesCreateTags")}</Link>{" "}
                  {t("votesNoTagsSuffix")}
                </p>
              )}
            </section>
          )}

          <section>
            <div className="section-title-row">
              <div>
                <p className="section-label">{activeMembership.stateName}</p>
                <h2>{t("votesCurrentAndRecent")}</h2>
              </div>
            </div>
            {message && <p className="page-message">{message}</p>}

            {loading ? (
              <p>{t("votesLoading")}</p>
            ) : polls.length === 0 ? (
              <div className="empty-state compact-empty-state">
                <h3>{t("votesNoneTitle")}</h3>
                <p>{t("votesNoneDescription")}</p>
              </div>
            ) : (
              <div className="poll-list">
                {polls.map((poll) => {
                  const closed =
                    currentTime > 0 &&
                    new Date(poll.closes_at).getTime() <= currentTime;
                  const pollResponses = responses.filter(
                    (response) => response.poll_id === poll.id,
                  );
                  const totalVotes = counts
                    .filter((count) => count.poll_id === poll.id)
                    .reduce(
                      (total, count) => total + Number(count.vote_count),
                      0,
                    );

                  return (
                    <article key={poll.id} className="poll-card">
                      <div className="poll-card-heading">
                        <div>
                          <span
                            className={
                              closed ? "poll-status closed" : "poll-status open"
                            }
                          >
                            {closed ? t("closed") : t("open")}
                          </span>
                          <h3>{poll.question}</h3>
                        </div>
                        {isAdmin && (
                          <button
                            type="button"
                            className="danger-button"
                            disabled={saving}
                            onClick={() => void deletePoll(poll)}
                          >
                            {t("delete")}
                          </button>
                        )}
                      </div>

                      {poll.description && <p>{poll.description}</p>}
                      <p className="poll-deadline">
                        {closed ? t("closed") : t("closes")}{" "}
                        {formatDateTime(poll.closes_at)}
                        {" · "}
                        {formatNumber(totalVotes)}{" "}
                        {totalVotes === 1 ? t("response") : t("responses")}
                      </p>

                      <div className="poll-options">
                        {poll.options.map((option) => {
                          const automaticTag = tags.find(
                            (tag) => tag.id === option.auto_tag_id,
                          );
                          const optionCount = Number(
                            counts.find(
                              (count) =>
                                count.poll_id === poll.id &&
                                count.option_id === option.id,
                            )?.vote_count ?? 0,
                          );
                          const percentage =
                            totalVotes === 0
                              ? 0
                              : Math.round((optionCount / totalVotes) * 100);

                          return (
                            <label key={option.id} className="poll-option">
                              <span className="poll-option-choice">
                                <input
                                  type="radio"
                                  name={`poll-${poll.id}`}
                                  value={option.id}
                                  disabled={closed}
                                  checked={
                                    selectedOptions[poll.id] === option.id
                                  }
                                  onChange={() =>
                                    setSelectedOptions((current) => ({
                                      ...current,
                                      [poll.id]: option.id,
                                    }))
                                  }
                                />
                                <span>{option.label}</span>
                                {automaticTag && (
                                  <span className="auto-tag-badge">
                                    <span
                                      style={{
                                        backgroundColor: automaticTag.color,
                                      }}
                                    />
                                    {t("votesAwardsTag", {
                                      tag: automaticTag.name,
                                    })}
                                  </span>
                                )}
                                <strong>{optionCount}</strong>
                              </span>
                              <span
                                className="poll-result-track"
                                aria-hidden="true"
                              >
                                <span style={{ width: `${percentage}%` }} />
                              </span>
                            </label>
                          );
                        })}
                      </div>

                      {!closed && (
                        <button
                          type="button"
                          disabled={saving || !selectedOptions[poll.id]}
                          onClick={() => void submitVote(poll.id)}
                        >
                          {saving ? t("votesSaving") : t("votesSaveMine")}
                        </button>
                      )}

                      {isAdmin && pollResponses.length > 0 && (
                        <details className="poll-response-details">
                          <summary>{t("votesReviewResponses")}</summary>
                          {poll.options.map((option) => {
                            const optionResponses = pollResponses.filter(
                              (response) => response.option_id === option.id,
                            );
                            return (
                              <div
                                key={option.id}
                                className="poll-response-group"
                              >
                                <strong>{option.label}</strong>
                                {optionResponses.length === 0 ? (
                                  <span>{t("votesNoResponses")}</span>
                                ) : (
                                  <ul>
                                    {optionResponses.map((response) => (
                                      <li key={response.wos_account_id}>
                                        <span>
                                          {response.nickname ||
                                            t("votesWosId", {
                                              id: response.wos_id,
                                            })}
                                          {response.username &&
                                            ` · @${response.username}`}
                                        </span>
                                        <small>
                                          {t("votesWosId", {
                                            id: response.wos_id,
                                          })}
                                        </small>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            );
                          })}
                        </details>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
