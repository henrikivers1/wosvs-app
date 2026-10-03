"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { useStates } from "@/components/StateProvider";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/components/LanguageProvider";
import { JoinerHeroesEditor } from "@/components/JoinerHeroesEditor";
import { furnaceLabel } from "@/lib/furnace";

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


export default function AccountPage() {
  const { t, formatDateTime, formatNumber } = useLanguage();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { memberships, loadingStates } = useStates();

  function roleLabel(role: string) {
    if (role === "owner") return t("Owner");
    if (role === "admin") return t("Admin");
    return t("Member");
  }
  const [accounts, setAccounts] = useState<WosAccount[]>([]);
  const [combatProfiles, setCombatProfiles] = useState<
    Record<string, CombatProfile>
  >({});
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

    const { data: savedAccounts } = await supabase
        .from("wos_accounts")
        .select(
          "id, wos_id, nickname, is_configured, furnace_level, furnace_level_raw, power, chief_level, vip_level, kills, labyrinth_score, game_avatar_url, state_number, alliance_abbr, alliance_name, game_active, player_data_updated_at, player_data_synced_at, infantry_tier, lancer_tier, marksman_tier, infantry_fc_level, lancer_fc_level, marksman_fc_level, infantry_t12_skill, lancer_t12_skill, marksman_t12_skill",
        )
        .eq("user_id", user.id);

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

        if (result.cached) {
          if (force) {
            setMessage(
              t(
                "Player data was refreshed in the last 24 hours. It also updates automatically every week.",
              ),
            );
          }
        } else {
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
      // Synced accounts refresh weekly on the server; only brand-new
      // accounts are pulled from WOSOracle when the page opens.
      const stale = !account.player_data_synced_at;
      if (stale && !automaticSyncAttempts.current.has(account.id)) {
        automaticSyncAttempts.current.add(account.id);
        void syncPlayer(account.id, false);
      }
    });
  }, [accounts, syncPlayer]);

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

    setMessage("");
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
      <section className="page-heading">
        <h1>{t("Account")}</h1>
        <p>
          {t("You sign in with your WOS ID and your PIN.")}{" "}
          <Link href="/account/pin">{t("Change PIN")}</Link>
        </p>
        {!loadingStates && memberships.length === 0 && (
          <p className="page-message">
            {t(
              "You are not in a state. Ask your state leader for the join link and first-time PIN.",
            )}
          </p>
        )}
      </section>

      <section>
        <h2>{t("Your WOS account")}</h2>
        {accounts.length === 0 ? (
          <p>{t("Loading...")}</p>
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

                    <JoinerHeroesEditor
                      wosAccountId={account.id}
                      stateIds={accountMemberships.map(
                        (membership) => membership.stateId,
                      )}
                    />

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
                </li>
              );
            })}
          </ul>
        )}

        {message && <p className="auth-message">{message}</p>}
      </section>
    </main>
  );
}
