"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { useStates } from "@/components/StateProvider";
import { createClient } from "@/lib/supabase/client";
import type { StateRole } from "@/types/state";

type StateMember = {
  wosAccountId: string;
  wosId: string;
  nickname: string | null;
  username: string | null;
  role: StateRole;
};

type PendingApproval = {
  inviteId: string;
  wosId: string;
  nickname: string | null;
  expiresAt: string;
};

export default function ManageStatePage() {
  const supabase = useMemo(() => createClient(), []);
  const { activeMembership, refreshMemberships } = useStates();
  const [members, setMembers] = useState<StateMember[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [inviteWosId, setInviteWosId] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [message, setMessage] = useState("");

  const loadStateManagement = useCallback(async () => {
    if (!activeMembership || activeMembership.role !== "owner") {
      setMembers([]);
      setPendingApprovals([]);
      return;
    }

    const [{ data: memberRows, error }, { data: inviteRows }] =
      await Promise.all([
        supabase
          .from("state_members")
          .select("wos_account_id, role")
          .eq("state_id", activeMembership.stateId),
        supabase
          .from("state_invites")
          .select("id, invited_wos_account_id, expires_at")
          .eq("state_id", activeMembership.stateId)
          .eq("status", "pending_owner")
          .order("created_at"),
      ]);

    if (error || !memberRows) {
      setMessage(error?.message ?? "Could not load state members.");
      return;
    }

    const memberAccountIds = memberRows.map((row) => row.wos_account_id);
    const pendingAccountIds = (inviteRows ?? []).map(
      (row) => row.invited_wos_account_id
    );
    const accountIds = [
      ...new Set([...memberAccountIds, ...pendingAccountIds]),
    ];
    const { data: accounts } = accountIds.length
      ? await supabase
          .from("wos_accounts")
          .select("id, user_id, wos_id, nickname")
          .in("id", accountIds)
      : { data: [] };
    const memberUserIds = [
      ...new Set(
        (accounts ?? [])
          .filter((account) => memberAccountIds.includes(account.id))
          .map((account) => account.user_id)
      ),
    ];
    const { data: profiles } = memberUserIds.length
      ? await supabase
          .from("profiles")
          .select("id, username")
          .in("id", memberUserIds)
      : { data: [] };

    const accountById = new Map(
      (accounts ?? []).map((account) => [account.id, account])
    );
    const usernameByUserId = new Map(
      (profiles ?? []).map((profile) => [profile.id, profile.username])
    );

    setMembers(
      memberRows.flatMap((row) => {
        const account = accountById.get(row.wos_account_id);
        if (!account) return [];
        return [{
          wosAccountId: account.id,
          wosId: account.wos_id,
          nickname: account.nickname,
          username: usernameByUserId.get(account.user_id) ?? null,
          role: row.role as StateRole,
        }];
      })
    );

    setPendingApprovals(
      (inviteRows ?? []).flatMap((invite) => {
        const account = accountById.get(invite.invited_wos_account_id);
        if (!account) return [];
        return [{
          inviteId: invite.id,
          wosId: account.wos_id,
          nickname: account.nickname,
          expiresAt: invite.expires_at,
        }];
      })
    );
  }, [activeMembership, supabase]);

  useEffect(() => {
    const loadId = window.setTimeout(() => {
      void loadStateManagement();
    }, 0);
    return () => window.clearTimeout(loadId);
  }, [loadStateManagement]);

  async function createInvitation() {
    if (!activeMembership || !inviteWosId.trim()) return;
    setMessage("");
    setInviteLink("");

    const { data, error } = await supabase.rpc("create_state_join_invite", {
      target_state_id: activeMembership.stateId,
      target_wos_id: inviteWosId.trim(),
      valid_for_hours: 72,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setInviteLink(window.location.origin + "/invite/" + data);
    setInviteWosId("");
    setMessage(
      "Invitation delivered in the player's notification inbox. The link below is an optional backup."
    );
  }

  async function copyInviteLink() {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setMessage("Backup invitation link copied.");
  }

  async function reviewInvitation(inviteId: string, approveInvite: boolean) {
    setMessage("");
    const { error } = await supabase.rpc("review_state_invite", {
      target_invite_id: inviteId,
      approve_invite: approveInvite,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage(
      approveInvite
        ? "Player verified and added as a regular member."
        : "Membership request rejected."
    );
    await loadStateManagement();
    await refreshMemberships();
  }

  async function changeRole(
    wosAccountId: string,
    role: Exclude<StateRole, "owner">
  ) {
    if (!activeMembership) return;
    const { error } = await supabase.rpc("set_state_member_role", {
      target_state_id: activeMembership.stateId,
      target_wos_account_id: wosAccountId,
      new_role: role,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    await loadStateManagement();
    await refreshMemberships();
  }

  async function removeMember(wosAccountId: string) {
    if (!activeMembership) return;
    const { error } = await supabase.rpc("remove_state_member", {
      target_state_id: activeMembership.stateId,
      target_wos_account_id: wosAccountId,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    await loadStateManagement();
  }

  if (!activeMembership) {
    return (
      <main>
        <AppHeader />
        <section>
          <h2>Manage state</h2>
          <p>Select or join a state first.</p>
        </section>
      </main>
    );
  }

  if (activeMembership.role !== "owner") {
    return (
      <main>
        <AppHeader />
        <section>
          <h2>Manage state</h2>
          <p>Only the state owner can manage invitations and roles.</p>
        </section>
      </main>
    );
  }

  return (
    <main>
      <AppHeader />
      <section>
        <h2>Manage {activeMembership.stateName}</h2>
        <h3>Invite a WOS account</h3>
        <p>
          Enter the player&apos;s registered WOS ID. They receive an in-app
          invitation and must accept it. You then verify the player before
          they receive state access.
        </p>
        <label>
          WOS ID
          <input
            type="text"
            inputMode="numeric"
            value={inviteWosId}
            onChange={(event) => setInviteWosId(event.target.value)}
            placeholder="Player's WOS ID"
          />
        </label>
        <button type="button" onClick={createInvitation}>
          Send invitation
        </button>
        {inviteLink && (
          <div className="invite-link-box">
            <label className="invite-link-field">
              Optional backup link
              <input
                value={inviteLink}
                readOnly
                onFocus={(event) => event.target.select()}
              />
            </label>
            <button type="button" onClick={copyInviteLink}>
              Copy link
            </button>
          </div>
        )}
        {message && <p className="auth-message">{message}</p>}
      </section>

      <section>
        <h2>Waiting for your verification</h2>
        <p>
          These players accepted an invitation. Confirm their identity
          outside the app before approving them.
        </p>
        {pendingApprovals.length === 0 ? (
          <p>No players are waiting for approval.</p>
        ) : (
          <ul>
            {pendingApprovals.map((approval) => (
              <li key={approval.inviteId}>
                <span>
                  <strong>{approval.nickname || "Unnamed WOS account"}</strong>
                  {" — WOS ID " + approval.wosId}
                  <small>
                    {" — expires " +
                      new Date(approval.expiresAt).toLocaleString()}
                  </small>
                </span>
                <div className="member-actions">
                  <button
                    type="button"
                    onClick={() =>
                      void reviewInvitation(approval.inviteId, true)
                    }
                  >
                    Verify and approve
                  </button>
                  <button
                    type="button"
                    className="danger-button"
                    onClick={() =>
                      void reviewInvitation(approval.inviteId, false)
                    }
                  >
                    Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>State members</h2>
        {members.length === 0 ? (
          <p>No members found.</p>
        ) : (
          <ul>
            {members.map((member) => (
              <li key={member.wosAccountId}>
                <span>
                  <strong>{member.nickname || member.wosId}</strong>
                  {" — WOS ID " + member.wosId}
                  {member.username ? " — @" + member.username : ""}
                </span>
                {member.role === "owner" ? (
                  <span className="role-badge">Owner</span>
                ) : (
                  <div className="member-actions">
                    <label>
                      Role
                      <select
                        value={member.role}
                        onChange={(event) =>
                          void changeRole(
                            member.wosAccountId,
                            event.target.value as Exclude<
                              StateRole,
                              "owner"
                            >
                          )
                        }
                      >
                        <option value="member">Member</option>
                        <option value="garrison">Garrison</option>
                        <option value="rally_caller">Rally caller</option>
                      </select>
                    </label>
                    <button
                      type="button"
                      className="danger-button"
                      onClick={() =>
                        void removeMember(member.wosAccountId)
                      }
                    >
                      Remove
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
