"use client";

import { useState } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { memberName, type StateMember } from "./types";

export type PlanComment = {
  id: string;
  plan_id: string;
  author_wos_account_id: string | null;
  visibility: "public" | "admins";
  body: string;
  created_at: string;
};

// The plan's discussion, folded away under its count.
export function PlanComments({
  comments,
  members,
  viewerAccountId,
  isAdmin,
  busy,
  onPost,
  onDelete,
}: {
  comments: PlanComment[];
  members: StateMember[];
  viewerAccountId: string;
  isAdmin: boolean;
  busy: boolean;
  onPost: (body: string, visibility: "public" | "admins") => Promise<boolean>;
  onDelete: (comment: PlanComment) => void;
}) {
  const { t, formatDateTime } = useLanguage();
  const [draft, setDraft] = useState("");
  const [visibility, setVisibility] = useState<"public" | "admins">("public");

  return (
    <details className="plan-comments-panel">
      <summary>
        <span>{t("Comments")}</span>
        <span className="count-pill">{comments.length}</span>
      </summary>
      {comments.length === 0 ? (
        <p className="plan-comments-empty">{t("No comments yet.")}</p>
      ) : (
        <div className="plan-comment-list">
          {comments.map((comment) => {
            const author = members.find(
              (member) => member.id === comment.author_wos_account_id,
            );
            return (
              <article
                key={comment.id}
                className={`plan-comment plan-comment-${comment.visibility}`}
              >
                <div className="plan-comment-heading">
                  <div>
                    <strong>
                      {author ? memberName(author) : t("Former member")}
                    </strong>
                    {author?.username && <small>@{author.username}</small>}
                  </div>
                  <div>
                    <span className="comment-visibility">
                      {comment.visibility === "admins"
                        ? t("Admin only")
                        : t("Public")}
                    </span>
                    <time>{formatDateTime(comment.created_at)}</time>
                  </div>
                </div>
                <p>{comment.body}</p>
                {(isAdmin || comment.author_wos_account_id === viewerAccountId) && (
                  <button
                    type="button"
                    className="danger-button comment-delete-button"
                    disabled={busy}
                    onClick={() => onDelete(comment)}
                  >
                    {t("Delete")}
                  </button>
                )}
              </article>
            );
          })}
        </div>
      )}
      <form
        className="plan-comment-form"
        onSubmit={(event) => {
          event.preventDefault();
          void onPost(draft.trim(), isAdmin ? visibility : "public").then(
            (posted) => posted && setDraft(""),
          );
        }}
      >
        <label>
          {t("Comment")}
          <textarea
            rows={3}
            maxLength={2000}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={t(
              "Write a comment. Use @username to mention and notify someone.",
            )}
          />
        </label>
        {isAdmin && (
          <label>
            {t("Visibility")}
            <select
              value={visibility}
              onChange={(event) =>
                setVisibility(event.target.value as "public" | "admins")
              }
            >
              <option value="public">{t("Public — all state members")}</option>
              <option value="admins">{t("Admin only")}</option>
            </select>
          </label>
        )}
        <button type="submit" disabled={busy || !draft.trim()}>
          {t("Post comment")}
        </button>
      </form>
    </details>
  );
}
