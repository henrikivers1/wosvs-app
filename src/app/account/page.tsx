"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  furnace_level_raw: number | null;
  power: number | null;
  chief_level: number | null;
  vip_level: number | null;
  kills: number | null;
  labyrinth_score: number | null;
  game_avatar_url: string | null;
  state_number: number | null;
  alliance_abbr: string | null;
  alliance_name: string | null;
  game_active: boolean | null;
  player_data_updated_at: string | null;
  player_data_synced_at: string | null;
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

const AUTOMATIC_REFRESH_MS = 6 * 60 * 60 * 1000;

function furnaceLabel(rawLevel: number | null) {
  if (rawLevel === null) return "—";
  return rawLevel <= 30 ? `Furnace ${rawLevel}` : `FC${rawLevel - 30}`;
}

export default function AccountPage() {
  const { t, formatDateTime, formatNumber } = useLanguage();
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
  const [message, setMessage] = useState("");
  const [syncingIds, setSyncingIds] = useState<string[]>([]);
  const automaticSyncAttempts = useRef<Set<string>>(new Set());

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
          "id, wos_id, nickname, is_configured, furnace_level, furnace_level_raw, power, chief_level, vip_level, kills, labyrinth_score, game_avatar_url, state_number, alliance_abbr, alliance_name, game_active, player_data_updated_at, player_data_synced_at, infantry_tier, lancer_tier, marksman_tier, infantry_fc_level, lancer_fc_level, marksman_fc_level, infantry_t12_skill, lancer_t12_skill, marksman_t12_skill",
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

  const syncPlayer = useCallback(
    async (accountId: string, force: boolean) => {
      setSyncingIds((current) =>
        current.includes(accountId) ? current : [...current, accountId],
      );

      try {
        const response = await fetch("/api/oracle/player-sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountId, force }),
        });
        const result = (await response.json()) as {
          error?: string;
          cached?: boolean;
        };

        if (!response.ok) {
          throw new Error(result.error || "Player synchronization failed.");
        }

        if (!result.cached) {
          setMessage(t("Player data synchronized from WOSOracle."));
          await loadAccount();
        }
      } catch (error) {
        const reason =
          error instanceof Error
            ? error.message
            : "Player synchronization failed.";
        setMessage(
          t("Player data could not be synchronized: {reason}", { reason }),
        );
      } finally {
        setSyncingIds((current) => current.filter((id) => id !== accountId));
      }
    },
    [loadAccount, t],
  );

  useEffect(() => {
    accounts.forEach((account) => {
      const syncedAt = account.player_data_synced_at
        ? new Date(account.player_data_synced_at).getTime()
        : 0;
      const stale = Date.now() - syncedAt >= AUTOMATIC_REFRESH_MS;

      if (stale && !automaticSyncAttempts.current.has(account.id)) {
        automaticSyncAttempts.current.add(account.id);
        void syncPlayer(account.id, false);
      }
    });
  }, [accounts, syncPlayer]);

  async function addWosAccount() {
    if (!userId || !/^[0-9]+$/.test(newWosId.trim())) {
      setMessage(t("Enter a numeric WOS ID."));
      return;
    }

    setMessage(t(""));
    const { data: createdAccount, error } = await supabase
      .from("wos_accounts")
      .insert({
        user_id: userId,
        wos_id: newWosId.trim(),
        is_configured: true,
      })
      .select("id")
      .single();

    if (error) {
      setMessage(
        error.code === "23505"
          ? t(
              "That WOS ID is already registered. If it is yours, ask an admin of your state to release it.",
            )
          : error.message,
      );
      return;
    }

    setNewWosId("");
    automaticSyncAttempts.current.add(createdAccount.id);
    await syncPlayer(createdAccount.id, true);
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
                <li key={account.id} className="wos-account-card">
                  <span
                    className="game-avatar"
                    style={
                      account.game_avatar_url
                        ? { backgroundImage: `url(${account.game_avatar_url})` }
                        : undefined
                    }
                    aria-hidden="true"
                  >
                    {!account.game_avatar_url &&
                      (account.nickname?.charAt(0).toUpperCase() || "?")}
                  </span>
                  <div className="account-membership-details">
                    <div className="account-player-heading">
                      <span>
                        <strong>
                          {account.nickname || t("Unnamed account")}
                        </strong>
                        {" — WOS ID "}
                        {account.wos_id}
                      </span>
                      <span
                        className={
                          account.game_active === false
                            ? "player-data-badge player-data-inactive"
                            : "player-data-badge"
                        }
                      >
                        {!account.player_data_synced_at
                          ? t("Pending synchronization")
                          : account.game_active === false
                            ? t("Inactive")
                            : t("WOSOracle")}
                      </span>
                    </div>
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

                    {account.player_data_synced_at ? (
                      <div className="player-data-grid">
                        <span>
                          {t("Power")}
                          <strong>
                            {account.power === null
                              ? "—"
                              : formatNumber(account.power)}
                          </strong>
                        </span>
                        <span>
                          {t("Furnace")}
                          <strong>
                            {furnaceLabel(account.furnace_level_raw)}
                          </strong>
                        </span>
                        <span>
                          {t("State")}
                          <strong>
                            {account.state_number === null
                              ? "—"
                              : formatNumber(account.state_number)}
                          </strong>
                        </span>
                        <span>
                          {t("Alliance")}
                          <strong>
                            {account.alliance_abbr
                              ? `[${account.alliance_abbr}] ${account.alliance_name ?? ""}`
                              : t("No alliance")}
                          </strong>
                        </span>
                        <span>
                          {t("Chief level")}
                          <strong>{account.chief_level ?? "—"}</strong>
                        </span>
                        <span>
                          {t("VIP")}
                          <strong>{account.vip_level ?? "—"}</strong>
                        </span>
                        <span>
                          {t("Kills")}
                          <strong>
                            {account.kills === null
                              ? "—"
                              : formatNumber(account.kills)}
                          </strong>
                        </span>
                        <span>
                          {t("Labyrinth score")}
                          <strong>
                            {account.labyrinth_score === null
                              ? "—"
                              : formatNumber(account.labyrinth_score)}
                          </strong>
                        </span>
                      </div>
                    ) : (
                      <p className="player-data-empty">
                        {t(
                          "Automatic player data has not been synchronized yet.",
                        )}
                      </p>
                    )}

                    <div className="player-data-actions">
                      <button
                        type="button"
                        className="secondary-link"
                        disabled={syncingIds.includes(account.id)}
                        onClick={() => void syncPlayer(account.id, true)}
                      >
                        {syncingIds.includes(account.id)
                          ? t("Synchronizing...")
                          : t("Refresh player data")}
                      </button>
                      {account.player_data_synced_at && (
                        <small>
                          {t("Last synchronized: {date}", {
                            date: formatDateTime(account.player_data_synced_at),
                          })}
                        </small>
                      )}
                    </div>

                    <details className="combat-profile-editor">
                      <summary>{t("Troop details (manual)")}</summary>
                      <p className="form-hint">
                        {t(
                          "WOSOracle does not provide troop tiers, camp FC levels or T12 skills, so these fields remain manual.",
                        )}
                      </p>
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
                    className="danger-button"
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
        <p>
          {t(
            "Enter only the WOS ID. Name, avatar, state, Furnace and statistics are synchronized automatically.",
          )}
        </p>
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
        <button type="button" onClick={addWosAccount}>
          {t("Add WOS account")}
        </button>
        {message && <p className="auth-message">{message}</p>}
      </section>
    </main>
  );
}
