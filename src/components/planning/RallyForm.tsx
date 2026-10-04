"use client";

import { useState } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import {
  memberName,
  type PlanGroup,
  type StateAlliance,
  type StateMember,
  type StateTag,
} from "./types";

export type RallyFormValues = {
  name: string;
  leaderId: string;
  allianceId: string;
  tagId: string;
  capacity: number;
  notes: string;
};

// Adds a rally or edits one: name, leader, destination alliance and size.
export function RallyForm({
  group,
  leaders,
  alliances,
  tags,
  busy,
  onSubmit,
  onCancel,
}: {
  group: PlanGroup | null;
  leaders: StateMember[];
  alliances: StateAlliance[];
  tags: StateTag[];
  busy: boolean;
  onSubmit: (values: RallyFormValues) => void;
  onCancel: () => void;
}) {
  const { t } = useLanguage();
  const [values, setValues] = useState<RallyFormValues>({
    name: group?.name ?? "",
    leaderId: group?.leader_wos_account_id ?? "",
    allianceId: group?.alliance_id ?? "",
    tagId: group?.assignment_tag_id ?? "",
    capacity: group?.max_members ?? 10,
    notes: group?.notes ?? "",
  });
  const set = (patch: Partial<RallyFormValues>) =>
    setValues((current) => ({ ...current, ...patch }));

  return (
    <form
      className="rally-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(values);
      }}
    >
      <label>
        {t("Name")}
        <input
          value={values.name}
          placeholder={t("TED Rally")}
          onChange={(event) => set({ name: event.target.value })}
        />
      </label>
      {!group && (
        <label>
          {t("Rally Lead")}
          <select
            value={values.leaderId}
            onChange={(event) => set({ leaderId: event.target.value })}
          >
            <option value="">{t("Choose tagged leader")}</option>
            {leaders.map((member) => (
              <option key={member.id} value={member.id}>
                {memberName(member)}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        {t("Destination alliance")}
        <select
          value={values.allianceId}
          onChange={(event) => set({ allianceId: event.target.value })}
        >
          <option value="">{t("Choose alliance")}</option>
          {alliances.map((alliance) => (
            <option key={alliance.id} value={alliance.id}>
              {alliance.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t("Capacity")}
        <input
          type="number"
          min="1"
          max="100"
          value={values.capacity}
          onChange={(event) => set({ capacity: Number(event.target.value) })}
        />
      </label>
      <details className="rally-form-more">
        <summary>{t("More options")}</summary>
        <label>
          {t("Tag after publish")}
          <select
            value={values.tagId}
            onChange={(event) => set({ tagId: event.target.value })}
          >
            <option value="">{t("Automatic: leader’s rally tag")}</option>
            {tags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("Instructions")}
          <input
            value={values.notes}
            onChange={(event) => set({ notes: event.target.value })}
          />
        </label>
      </details>
      {!group && leaders.length === 0 && (
        <p className="form-hint">
          {t("Mark Rally Leads first: Leads & holders button above the board.")}
        </p>
      )}
      <div className="button-row">
        <button type="submit" className="primary-button" disabled={busy}>
          {group ? t("Save rally") : t("Add rally")}
        </button>
        <button type="button" className="secondary-link" onClick={onCancel}>
          {t("Cancel")}
        </button>
      </div>
    </form>
  );
}
