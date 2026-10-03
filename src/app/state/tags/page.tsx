"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { useStates } from "@/components/StateProvider";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/components/LanguageProvider";

type StateTag = {
  id: string;
  name: string;
  color: string;
  bulk_move_limit: number;
  system_key: string | null;
  created_at: string;
  kind: "custom" | "rally" | "hero";
};

type TagAssignment = {
  tag_id: string;
  wos_account_id: string;
};

type MemberOption = {
  id: string;
  label: string;
};

// Heroes commonly used to join rallies; admins can add any other hero.
const PRESET_HEROES = ["Jessie", "Jasser", "Seo-yoon", "Sergey"];
const HERO_TAG_COLOR = "#9b6bd6";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export default function TagsPage() {
  const { t } = useLanguage();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { activeMembership, signedIn, loadingStates } = useStates();
  const [tags, setTags] = useState<StateTag[]>([]);
  const [assignmentCounts, setAssignmentCounts] = useState<
    Record<string, number>
  >({});
  const [assignments, setAssignments] = useState<TagAssignment[]>([]);
  const [memberOptions, setMemberOptions] = useState<MemberOption[]>([]);
  const [playersTagId, setPlayersTagId] = useState<string | null>(null);
  const [memberToAdd, setMemberToAdd] = useState("");
  const [customHero, setCustomHero] = useState("");
  const [name, setName] = useState("");
  const [color, setColor] = useState("#e4a853");
  const [bulkMoveLimit, setBulkMoveLimit] = useState(100);
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingColor, setEditingColor] = useState("#e4a853");
  const [editingBulkMoveLimit, setEditingBulkMoveLimit] = useState(100);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const isAdmin =
    activeMembership?.role === "owner" || activeMembership?.role === "admin";

  const loadTags = useCallback(async () => {
    if (!activeMembership || !isAdmin) {
      setTags([]);
      setAssignmentCounts({});
      setLoading(false);
      return;
    }

    setLoading(true);
    const [tagResult, assignmentResult, memberResult] = await Promise.all([
      supabase
        .from("state_tags")
        .select(
          "id, name, color, bulk_move_limit, system_key, created_at, kind",
        )
        .eq("state_id", activeMembership.stateId)
        .order("name"),
      supabase.from("state_member_tags").select("tag_id, wos_account_id"),
      supabase
        .from("state_members")
        .select("wos_account_id, wos_accounts(nickname, wos_id)")
        .eq("state_id", activeMembership.stateId),
    ]);

    const firstError = tagResult.error || assignmentResult.error;
    if (firstError) {
      setMessage(firstError.message);
      setLoading(false);
      return;
    }

    const stateTags = (tagResult.data ?? []) as StateTag[];
    const tagIds = new Set(stateTags.map((tag) => tag.id));
    const counts = ((assignmentResult.data ?? []) as TagAssignment[]).reduce<
      Record<string, number>
    >((currentCounts, assignment) => {
      if (tagIds.has(assignment.tag_id)) {
        currentCounts[assignment.tag_id] =
          (currentCounts[assignment.tag_id] ?? 0) + 1;
      }
      return currentCounts;
    }, {});

    setTags(stateTags);
    setAssignmentCounts(counts);
    setAssignments(
      ((assignmentResult.data ?? []) as TagAssignment[]).filter((assignment) =>
        tagIds.has(assignment.tag_id),
      ),
    );
    setMemberOptions(
      (memberResult.data ?? [])
        .map((row) => {
          const account = (
            Array.isArray(row.wos_accounts)
              ? row.wos_accounts[0]
              : row.wos_accounts
          ) as { nickname: string | null; wos_id: string } | null;
          return {
            id: row.wos_account_id as string,
            label: account?.nickname || `WOS ID ${account?.wos_id ?? "?"}`,
          };
        })
        .sort((first, second) => first.label.localeCompare(second.label)),
    );
    setLoading(false);
  }, [activeMembership, isAdmin, supabase]);

  useEffect(() => {
    if (!loadingStates && signedIn === false) {
      router.replace("/login");
      return;
    }

    const loadId = window.setTimeout(() => {
      void loadTags();
    }, 0);
    return () => window.clearTimeout(loadId);
  }, [loadTags, loadingStates, router, signedIn]);

  function validateTag(
    tagName: string,
    tagColor: string,
    tagBulkMoveLimit: number,
  ) {
    if (!tagName.trim()) {
      setMessage(t("Enter a tag name."));
      return false;
    }
    if (!HEX_COLOR.test(tagColor)) {
      setMessage(t("Use a six-digit color code such as #e4a853."));
      return false;
    }
    if (
      !Number.isInteger(tagBulkMoveLimit) ||
      tagBulkMoveLimit < 1 ||
      tagBulkMoveLimit > 100
    ) {
      setMessage(t("The bulk-move limit must be between 1 and 100."));
      return false;
    }
    return true;
  }

  async function addHeroTag(heroName: string) {
    if (!activeMembership || !isAdmin) return;
    const trimmed = heroName.trim().slice(0, 32);
    if (!trimmed) return;
    setSaving(true);
    setMessage(t(""));
    const { error } = await supabase.from("state_tags").insert({
      state_id: activeMembership.stateId,
      name: trimmed,
      color: HERO_TAG_COLOR,
      kind: "hero",
    });
    setSaving(false);
    if (error) {
      setMessage(
        error.code === "23505"
          ? t("A tag with that name already exists.")
          : error.message,
      );
      return;
    }
    setCustomHero("");
    await loadTags();
  }

  async function setPlayerTag(
    tagId: string,
    wosAccountId: string,
    enabled: boolean,
  ) {
    setSaving(true);
    setMessage(t(""));
    const { error } = enabled
      ? await supabase.from("state_member_tags").insert({
          tag_id: tagId,
          wos_account_id: wosAccountId,
          source: "manual",
        })
      : await supabase
          .from("state_member_tags")
          .delete()
          .eq("tag_id", tagId)
          .eq("wos_account_id", wosAccountId);
    setSaving(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setMemberToAdd("");
    await loadTags();
  }

  function renderPlayersPanel(tag: StateTag) {
    const assignedIds = new Set(
      assignments
        .filter((assignment) => assignment.tag_id === tag.id)
        .map((assignment) => assignment.wos_account_id),
    );
    const assigned = memberOptions.filter((member) =>
      assignedIds.has(member.id),
    );
    const available = memberOptions.filter(
      (member) => !assignedIds.has(member.id),
    );
    return (
      <div className="tag-players-panel">
        {assigned.length === 0 ? (
          <p>{t("No players have this tag.")}</p>
        ) : (
          <ul>
            {assigned.map((member) => (
              <li key={member.id}>
                <span>{member.label}</span>
                <button
                  type="button"
                  className="secondary-link"
                  disabled={saving}
                  onClick={() => void setPlayerTag(tag.id, member.id, false)}
                >
                  {t("Remove")}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="invite-form">
          <select
            value={memberToAdd}
            onChange={(event) => setMemberToAdd(event.target.value)}
          >
            <option value="">{t("Choose a player")}</option>
            {available.map((member) => (
              <option key={member.id} value={member.id}>
                {member.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={saving || !memberToAdd}
            onClick={() => void setPlayerTag(tag.id, memberToAdd, true)}
          >
            {t("Add player")}
          </button>
        </div>
        {tag.kind === "rally" && (
          <p>
            {t(
              "Rally tags are also given to the whole group when the battle plan is published.",
            )}
          </p>
        )}
      </div>
    );
  }

  async function createTag() {
    if (
      !activeMembership ||
      !isAdmin ||
      !validateTag(name, color, bulkMoveLimit)
    )
      return;

    setSaving(true);
    setMessage(t(""));
    const { error } = await supabase.rpc("create_state_tag", {
      target_state_id: activeMembership.stateId,
      tag_name: name,
      tag_color: color,
      tag_bulk_move_limit: bulkMoveLimit,
    });

    if (error) {
      setMessage(error.message);
    } else {
      setName("");
      setColor("#e4a853");
      setBulkMoveLimit(100);
      await loadTags();
      setMessage(t("Tag created."));
    }
    setSaving(false);
  }

  function beginEditing(tag: StateTag) {
    if (tag.system_key) return;
    setEditingTagId(tag.id);
    setEditingName(tag.name);
    setEditingColor(tag.color);
    setEditingBulkMoveLimit(tag.bulk_move_limit);
    setMessage(t(""));
  }

  async function saveTag() {
    if (
      !editingTagId ||
      !validateTag(editingName, editingColor, editingBulkMoveLimit)
    )
      return;

    setSaving(true);
    setMessage(t(""));
    const { error } = await supabase.rpc("update_state_tag", {
      target_tag_id: editingTagId,
      tag_name: editingName,
      tag_color: editingColor,
      tag_bulk_move_limit: editingBulkMoveLimit,
    });

    if (error) {
      setMessage(error.message);
    } else {
      setEditingTagId(null);
      await loadTags();
      setMessage(t("Tag updated."));
    }
    setSaving(false);
  }

  async function deleteTag(tag: StateTag) {
    if (tag.system_key) {
      setMessage(
        t("System tags are permanent and are managed from State members."),
      );
      return;
    }
    const assignmentCount = assignmentCounts[tag.id] ?? 0;
    if (
      !window.confirm(
        `Delete the “${tag.name}” tag? It will be removed from ${assignmentCount} WOS ${assignmentCount === 1 ? "account" : "accounts"} and from any connected vote options.`,
      )
    ) {
      return;
    }

    setSaving(true);
    setMessage(t(""));
    const { error } = await supabase.rpc("delete_state_tag", {
      target_tag_id: tag.id,
    });

    if (error) {
      setMessage(error.message);
    } else {
      if (editingTagId === tag.id) setEditingTagId(null);
      await loadTags();
      setMessage(t("Tag deleted."));
    }
    setSaving(false);
  }

  if (loadingStates || signedIn === null) {
    return (
      <main>
        <AppHeader />
        <section className="loading-panel">
          <p>{t("Loading tags...")}</p>
        </section>
      </main>
    );
  }

  return (
    <main>
      <AppHeader />

      {!activeMembership || !isAdmin ? (
        <section className="empty-state">
          <h2>{t("Admin access required")}</h2>
          <p>{t("Only state Owners and Admins can manage tags.")}</p>
        </section>
      ) : (
        <>
          <section className="tags-heading">
            <div>
              <p className="section-label">{activeMembership.stateName}</p>
              <h1>{t("Tags")}</h1>
              <p>
                {t(
                  "Labels for rallies, joiner heroes and announcements. Rally tags are created automatically for each rally group.",
                )}
              </p>
            </div>
          </section>

          <section>
            <h2>{t("Create tag")}</h2>
            <div className="tag-create-form">
              <label>
                {t("Tag name")}
                <input
                  type="text"
                  maxLength={32}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={t("Full Battle")}
                />
              </label>
              <label>
                {t("Color")}
                <span className="color-input-row">
                  <input
                    type="color"
                    value={HEX_COLOR.test(color) ? color : "#e4a853"}
                    onChange={(event) => setColor(event.target.value)}
                  />
                  <input
                    className="hex-color-input"
                    type="text"
                    maxLength={7}
                    value={color}
                    onChange={(event) => setColor(event.target.value)}
                    placeholder={t("#e4a853")}
                  />
                </span>
              </label>
              <label>
                {t("Bulk-move limit")}
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={bulkMoveLimit}
                  onChange={(event) =>
                    setBulkMoveLimit(Number(event.target.value))
                  }
                />
              </label>
              <button
                type="button"
                disabled={saving}
                onClick={() => void createTag()}
              >
                {saving ? t("Saving...") : t("Create tag")}
              </button>
            </div>
            {message && <p className="page-message">{message}</p>}
          </section>

          <section>
            <p className="section-label">{t("Joiner heroes")}</p>
            <h2>{t("Hero tags")}</h2>
            <p>
              {t(
                "Tag players with the hero they join rallies with. Players see it on Overwatch as “Join with”.",
              )}
            </p>
            <div className="hero-presets">
              {PRESET_HEROES.filter(
                (hero) =>
                  !tags.some(
                    (tag) => tag.name.toLowerCase() === hero.toLowerCase(),
                  ),
              ).map((hero) => (
                <button
                  key={hero}
                  type="button"
                  className="secondary-link"
                  disabled={saving}
                  onClick={() => void addHeroTag(hero)}
                >
                  {t("+ {hero}", { hero })}
                </button>
              ))}
            </div>
            <div className="invite-form">
              <label>
                {t("Other hero")}
                <input
                  type="text"
                  maxLength={32}
                  value={customHero}
                  onChange={(event) => setCustomHero(event.target.value)}
                />
              </label>
              <button
                type="button"
                disabled={saving || !customHero.trim()}
                onClick={() => void addHeroTag(customHero)}
              >
                {t("Add hero tag")}
              </button>
            </div>
          </section>

          <section>
            <div className="section-title-row">
              <div>
                <p className="section-label">{t("Reusable labels")}</p>
                <h2>{t("State tags")}</h2>
              </div>
              <span className="retention-badge">
                {tags.length} {tags.length === 1 ? t("tag") : t("tags")}
              </span>
            </div>

            {loading ? (
              <p>{t("Loading tags...")}</p>
            ) : tags.length === 0 ? (
              <div className="empty-state compact-empty-state">
                <h3>{t("No tags yet")}</h3>
                <p>
                  {t("Create a tag above, then connect it to a voting option.")}
                </p>
              </div>
            ) : (
              <div className="tag-list">
                {tags.map((tag) =>
                  editingTagId === tag.id && !tag.system_key ? (
                    <article key={tag.id} className="tag-edit-card">
                      <div className="tag-create-form">
                        <label>
                          {t("Tag name")}
                          <input
                            type="text"
                            maxLength={32}
                            value={editingName}
                            onChange={(event) =>
                              setEditingName(event.target.value)
                            }
                          />
                        </label>
                        <label>
                          {t("Color")}
                          <span className="color-input-row">
                            <input
                              type="color"
                              value={
                                HEX_COLOR.test(editingColor)
                                  ? editingColor
                                  : "#e4a853"
                              }
                              onChange={(event) =>
                                setEditingColor(event.target.value)
                              }
                            />
                            <input
                              className="hex-color-input"
                              type="text"
                              maxLength={7}
                              value={editingColor}
                              onChange={(event) =>
                                setEditingColor(event.target.value)
                              }
                            />
                          </span>
                        </label>
                        <label>
                          {t("Bulk-move limit")}
                          <input
                            type="number"
                            min="1"
                            max="100"
                            value={editingBulkMoveLimit}
                            onChange={(event) =>
                              setEditingBulkMoveLimit(
                                Number(event.target.value),
                              )
                            }
                          />
                        </label>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void saveTag()}
                        >
                          {t("Save")}
                        </button>
                        <button
                          type="button"
                          className="secondary-link"
                          onClick={() => setEditingTagId(null)}
                        >
                          {t("Cancel")}
                        </button>
                      </div>
                    </article>
                  ) : (
                    <article key={tag.id} className="tag-row">
                      <span
                        className="tag-swatch"
                        style={{ backgroundColor: tag.color }}
                      />
                      <div>
                        <strong>
                          {tag.name}
                          {tag.kind === "hero" && (
                            <span className="role-badge">{t("Hero")}</span>
                          )}
                          {tag.kind === "rally" && (
                            <span className="role-badge">{t("Rally")}</span>
                          )}
                        </strong>
                        <small>
                          {tag.color.toUpperCase()} {t("·")}{" "}
                          {assignmentCounts[tag.id] ?? 0} {t("assigned")}
                          {tag.system_key
                            ? t(" · permanent system tag")
                            : ` · bulk max ${tag.bulk_move_limit}`}
                        </small>
                      </div>
                      {tag.system_key ? (
                        <span className="role-badge">
                          {t("Managed in State members")}
                        </span>
                      ) : (
                        <div className="tag-row-actions">
                          <button
                            type="button"
                            className="secondary-link"
                            onClick={() => {
                              setMemberToAdd("");
                              setPlayersTagId(
                                playersTagId === tag.id ? null : tag.id,
                              );
                            }}
                          >
                            {t("Players")}
                          </button>
                          <button
                            type="button"
                            className="secondary-link"
                            onClick={() => beginEditing(tag)}
                          >
                            {t("Edit")}
                          </button>
                          <button
                            type="button"
                            className="danger-button"
                            disabled={saving}
                            onClick={() => void deleteTag(tag)}
                          >
                            {t("Delete")}
                          </button>
                        </div>
                      )}
                      {playersTagId === tag.id &&
                        !tag.system_key &&
                        renderPlayersPanel(tag)}
                    </article>
                  ),
                )}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
