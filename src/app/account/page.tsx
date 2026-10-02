"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { useStates } from "@/components/StateProvider";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/components/LanguageProvider";

type WosAccount = {
  id: string;
  wos_id: string;
  nickname: string | null;
  is_configured: boolean;
  furnace_level: number | null;
  infantry_tier: number | null;
  lancer_tier: number | null;
  marksman_tier: number | null;
  infantry_fc_level: number | null;
  lancer_fc_level: number | null;
  marksman_fc_level: number | null;
  infantry_t12_skill: number | null;
  lancer_t12_skill: number | null;
  marksman_t12_skill: number | null;
};

type CombatProfile = Pick<
  WosAccount,
  | "furnace_level"
  | "infantry_tier"
  | "lancer_tier"
  | "marksman_tier"
  | "infantry_fc_level"
  | "lancer_fc_level"
  | "marksman_fc_level"
  | "infantry_t12_skill"
  | "lancer_t12_skill"
  | "marksman_t12_skill"
>;

const COMBAT_FIELDS: Array<{
  key: keyof CombatProfile;
  label: string;
  min: number;
  max: number;
}> = [
  {
    key: "furnace_level",
    label: "Fire Crystal Furnace Level",
    min: 0,
    max: 10,
  },
  { key: "infantry_tier", label: "Infantry troop tier", min: 1, max: 12 },
  { key: "lancer_tier", label: "Lancer troop tier", min: 1, max: 12 },
  { key: "marksman_tier", label: "Marksman troop tier", min: 1, max: 12 },
  { key: "infantry_fc_level", label: "Infantry camp FC", min: 0, max: 10 },
  { key: "lancer_fc_level", label: "Lancer camp FC", min: 0, max: 10 },
  { key: "marksman_fc_level", label: "Marksman camp FC", min: 0, max: 10 },
  { key: "infantry_t12_skill", label: "Infantry T12 skill", min: 0, max: 3 },
  { key: "lancer_t12_skill", label: "Lancer T12 skill", min: 0, max: 3 },
  { key: "marksman_t12_skill", label: "Marksman T12 skill", min: 0, max: 3 },
];

export default function AccountPage() {
  const { t } = useLanguage();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { memberships, loadingStates } = useStates();
  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState("");

  function roleLabel(role: string) {
    if (role === "owner") return t("Owner");
    if (role === "admin") return t("Admin");
    return t("Member");
  }
  const [accounts, setAccounts] = useState<WosAccount[]>([]);
  const [combatProfiles, setCombatProfiles] = useState<
    Record<string, CombatProfile>
  >({});
  const [newWosId, setNewWosId] = useState("");
  const [newNickname, setNewNickname] = useState("");
  const [message, setMessage] = useState("");

  const loadAccount = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.replace("/login");
      return;
    }

    setUserId(user.id);
    const [{ data: profile }, { data: savedAccounts }] = await Promise.all([
      supabase
        .from("profiles")
        .select("username")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("wos_accounts")
        .select(
          "id, wos_id, nickname, is_configured, furnace_level, infantry_tier, lancer_tier, marksman_tier, infantry_fc_level, lancer_fc_level, marksman_fc_level, infantry_t12_skill, lancer_t12_skill, marksman_t12_skill",
        )
        .eq("user_id", user.id)
        .eq("is_configured", true)
        .order("created_at"),
    ]);

    if (!profile?.username) {
      router.replace("/account/setup");
      return;
    }

    setUsername(profile.username);
    const loadedAccounts = (savedAccounts ?? []) as WosAccount[];
    setAccounts(loadedAccounts);
    setCombatProfiles(
      Object.fromEntries(
        loadedAccounts.map((account) => [
          account.id,
          {
            furnace_level: account.furnace_level,
            infantry_tier: account.infantry_tier,
            lancer_tier: account.lancer_tier,
            marksman_tier: account.marksman_tier,
            infantry_fc_level: account.infantry_fc_level,
            lancer_fc_level: account.lancer_fc_level,
            marksman_fc_level: account.marksman_fc_level,
            infantry_t12_skill: account.infantry_t12_skill,
            lancer_t12_skill: account.lancer_t12_skill,
            marksman_t12_skill: account.marksman_t12_skill,
          },
        ]),
      ),
    );
  }, [router, supabase]);

  useEffect(() => {
    const initialLoadId = window.setTimeout(() => {
      void loadAccount();
    }, 0);

    return () => window.clearTimeout(initialLoadId);
  }, [loadAccount]);

  async function addWosAccount() {
    if (!userId || !/^[0-9]+$/.test(newWosId.trim())) {
      setMessage(t("Enter a numeric WOS ID."));
      return;
    }

    setMessage(t(""));
    const { error } = await supabase.from("wos_accounts").insert({
      user_id: userId,
      wos_id: newWosId.trim(),
      nickname: newNickname.trim() || null,
      is_configured: true,
    });

    if (error) {
      setMessage(
        error.code === "23505"
          ? "That WOS ID is already registered."
          : error.message,
      );
      return;
    }

    setNewWosId("");
    setNewNickname("");
    await loadAccount();
  }

  async function removeWosAccount(id: string) {
    const { data, error } = await supabase
      .from("wos_accounts")
      .delete()
      .eq("id", id)
      .select("id");

    if (error || !data || data.length === 0) {
      setMessage(
        t("This WOS account cannot be removed while it belongs to a state."),
      );
      return;
    }

    await loadAccount();
  }

  async function saveCombatProfile(accountId: string) {
    const profile = combatProfiles[accountId];
    if (!profile) return;

    const invalidField = COMBAT_FIELDS.find((field) => {
      const value = profile[field.key];
      return value !== null && (value < field.min || value > field.max);
    });

    if (invalidField) {
      setMessage(
        `${invalidField.label} must be between ${invalidField.min} and ${invalidField.max}.`,
      );
      return;
    }

    setMessage(t(""));
    const { error } = await supabase
      .from("wos_accounts")
      .update(profile)
      .eq("id", accountId);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage(t("Combat profile saved."));
    await loadAccount();
  }

  return (
    <main>
      <AppHeader />
      <section>
        <h2>{t("Account")}</h2>
        <p>
          {t("Public username:")}{" "}
          <strong>
            {t("@")}
            {username}
          </strong>
        </p>
        <p>{t("Your email is private and is never shown to other players.")}</p>
      </section>

      <section>
        <h2>{t("Your WOS accounts")}</h2>
        {accounts.length === 0 ? (
          <p>{t("No WOS accounts added.")}</p>
        ) : (
          <ul>
            {accounts.map((account) => {
              const accountMemberships = memberships.filter(
                (membership) => membership.wosAccountId === account.id,
              );

              return (
                <li key={account.id}>
                  <div className="account-membership-details">
                    <span>
                      <strong>
                        {account.nickname || t("Unnamed account")}
                      </strong>
                      {" — WOS ID "}
                      {account.wos_id}
                    </span>
                    <small>
                      {loadingStates
                        ? t("Loading state memberships...")
                        : accountMemberships.length === 0
                          ? t("Not in a state")
                          : accountMemberships
                              .map(
                                (membership) =>
                                  `${membership.stateName} (${roleLabel(membership.role)})`,
                              )
                              .join(" · ")}
                    </small>
                    <details className="combat-profile-editor">
                      <summary>{t("Combat profile")}</summary>
                      <div className="combat-profile-grid">
                        {COMBAT_FIELDS.map((field) => (
                          <label key={field.key}>
                            {t(field.label)}
                            <input
                              type="number"
                              min={field.min}
                              max={field.max}
                              value={
                                combatProfiles[account.id]?.[field.key] ?? ""
                              }
                              onChange={(event) =>
                                setCombatProfiles((current) => ({
                                  ...current,
                                  [account.id]: {
                                    ...current[account.id],
                                    [field.key]: event.target.value
                                      ? Number(event.target.value)
                                      : null,
                                  },
                                }))
                              }
                            />
                          </label>
                        ))}
                      </div>
                      <button
                        type="button"
                        className="save-button"
                        onClick={() => void saveCombatProfile(account.id)}
                      >
                        {t("Save combat profile")}
                      </button>
                    </details>
                  </div>
                  <button
                    type="button"
                    onClick={() => void removeWosAccount(account.id)}
                  >
                    {t("Remove")}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <h3>{t("Add another WOS account")}</h3>
        <label>
          {t("WOS ID")}
          <input
            type="text"
            inputMode="numeric"
            value={newWosId}
            onChange={(event) => setNewWosId(event.target.value)}
            placeholder={t("Numeric WOS ID")}
          />
        </label>
        <label>
          {t("WOS nickname (optional)")}
          <input
            type="text"
            value={newNickname}
            onChange={(event) => setNewNickname(event.target.value)}
            maxLength={40}
            placeholder={t("In-game name")}
          />
        </label>
        <button type="button" onClick={addWosAccount}>
          {t("Add WOS account")}
        </button>
        {message && <p className="auth-message">{message}</p>}
      </section>
    </main>
  );
}
