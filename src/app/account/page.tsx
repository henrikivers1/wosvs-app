"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/client";

type WosAccount = {
  id: string;
  wos_id: string;
  nickname: string | null;
  is_configured: boolean;
};

export default function AccountPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [accounts, setAccounts] = useState<WosAccount[]>([]);
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
    const [{ data: profile }, { data: savedAccounts }] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("username")
          .eq("id", user.id)
          .maybeSingle(),
        supabase
          .from("wos_accounts")
          .select("id, wos_id, nickname, is_configured")
          .eq("user_id", user.id)
          .eq("is_configured", true)
          .order("created_at"),
      ]);

    if (!profile?.username) {
      router.replace("/account/setup");
      return;
    }

    setUsername(profile.username);
    setAccounts(savedAccounts ?? []);
  }, [router, supabase]);

  useEffect(() => {
    void loadAccount();
  }, [loadAccount]);

  async function addWosAccount() {
    if (!userId || !/^[0-9]+$/.test(newWosId.trim())) {
      setMessage("Enter a numeric WOS ID.");
      return;
    }

    setMessage("");
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
          : error.message
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
        "This WOS account cannot be removed while it belongs to a state."
      );
      return;
    }

    await loadAccount();
  }

  return (
    <main>
      <AppHeader />
      <section>
        <h2>Account</h2>
        <p>
          Public username: <strong>@{username}</strong>
        </p>
        <p>Your email is private and is never shown to other players.</p>
      </section>

      <section>
        <h2>Your WOS accounts</h2>
        {accounts.length === 0 ? (
          <p>No WOS accounts added.</p>
        ) : (
          <ul>
            {accounts.map((account) => (
              <li key={account.id}>
                <span>
                  <strong>{account.nickname || "Unnamed account"}</strong>
                  {" — WOS ID "}
                  {account.wos_id}
                </span>
                <button
                  type="button"
                  onClick={() => void removeWosAccount(account.id)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        <h3>Add another WOS account</h3>
        <label>
          WOS ID
          <input
            type="text"
            inputMode="numeric"
            value={newWosId}
            onChange={(event) => setNewWosId(event.target.value)}
            placeholder="Numeric WOS ID"
          />
        </label>
        <label>
          WOS nickname (optional)
          <input
            type="text"
            value={newNickname}
            onChange={(event) => setNewNickname(event.target.value)}
            maxLength={40}
            placeholder="In-game name"
          />
        </label>
        <button type="button" onClick={addWosAccount}>
          Add WOS account
        </button>
        {message && <p className="auth-message">{message}</p>}
      </section>
    </main>
  );
}
