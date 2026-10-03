"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { useLanguage } from "@/components/LanguageProvider";

type OperatorState = {
  id: string;
  name: string;
  stateNumber: number | null;
  createdAt: string;
  memberCount: number;
  owner: { wosId: string; nickname: string | null } | null;
};

type Handout = { title: string; pin: string };

// For the people running Overwatch (OPERATOR_WOS_IDS on the server): create
// a state when its leader asks, and give anyone a one-time PIN.
export default function OperatorPage() {
  const { t, formatDateTime } = useLanguage();
  const [states, setStates] = useState<OperatorState[] | null>(null);
  const [denied, setDenied] = useState("");
  const [ownerWosId, setOwnerWosId] = useState("");
  const [stateName, setStateName] = useState("");
  const [resetWosId, setResetWosId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [handout, setHandout] = useState<Handout | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/operator/states");
    const result = (await response.json()) as {
      states?: OperatorState[];
      error?: string;
    };
    if (!response.ok) {
      setDenied(result.error ?? "Only Overwatch operators can open this page.");
      return;
    }
    setStates(result.states ?? []);
  }, []);

  useEffect(() => {
    const loadId = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(loadId);
  }, [load]);

  async function post(body: object) {
    setBusy(true);
    setMessage("");
    setHandout(null);
    try {
      const response = await fetch("/api/operator/states", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as {
        error?: string;
        pin?: string | null;
        name?: string;
        stateNumber?: number;
        owner?: { nickname: string };
      };
      if (!response.ok) {
        setMessage(result.error ?? "Something went wrong.");
        return null;
      }
      return result;
    } catch {
      setMessage("Something went wrong.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function createState(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await post({
      action: "create",
      ownerWosId: ownerWosId.trim(),
      name: stateName.trim(),
    });
    if (!result) return;
    setOwnerWosId("");
    setStateName("");
    if (result.pin) {
      setHandout({
        title: `${result.name} (#${result.stateNumber}) is ready. Send ${result.owner?.nickname} their WOS ID login and this one-time PIN:`,
        pin: result.pin,
      });
    } else {
      setMessage(
        `${result.name} is ready. ${result.owner?.nickname} already has a login and is now its owner.`,
      );
    }
    await load();
  }

  async function resetPin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const wosId = resetWosId.trim();
    const result = await post({ action: "reset_pin", wosId });
    if (!result?.pin) return;
    setResetWosId("");
    setHandout({ title: `One-time PIN for WOS ID ${wosId}:`, pin: result.pin });
  }

  return (
    <main>
      <AppHeader />
      <section className="page-heading">
        <p className="section-label">{t("Operator")}</p>
        <h1>{t("States")}</h1>
      </section>

      {denied && <p className="page-message">{denied}</p>}

      {states && (
        <>
          {message && <p className="page-message">{message}</p>}
          {handout && (
            <div className="pin-reveal" role="status">
              <p>{handout.title}</p>
              <strong className="pin-code">{handout.pin}</strong>
              <button
                type="button"
                className="text-button"
                onClick={() => setHandout(null)}
              >
                {t("Done")}
              </button>
            </div>
          )}

          <section>
            <h2>Create a state</h2>
            <p>
              Enter the leader&apos;s WOS ID. The state number comes from
              WOSOracle; the leader becomes the owner and signs in with their
              WOS ID and a one-time PIN.
            </p>
            <form className="invite-form" onSubmit={createState}>
              <label>
                Leader&apos;s WOS ID
                <input
                  inputMode="numeric"
                  pattern="[0-9]+"
                  required
                  value={ownerWosId}
                  onChange={(event) => setOwnerWosId(event.target.value)}
                />
              </label>
              <label>
                Name (optional)
                <input
                  value={stateName}
                  maxLength={60}
                  placeholder="State 1234"
                  onChange={(event) => setStateName(event.target.value)}
                />
              </label>
              <button type="submit" className="primary-button" disabled={busy}>
                Create state
              </button>
            </form>
          </section>

          <section>
            <h2>Give a one-time PIN</h2>
            <p>
              For a leader who lost their PIN. The player is signed out and
              chooses a new PIN when they sign in.
            </p>
            <form className="invite-form" onSubmit={resetPin}>
              <label>
                WOS ID
                <input
                  inputMode="numeric"
                  pattern="[0-9]+"
                  required
                  value={resetWosId}
                  onChange={(event) => setResetWosId(event.target.value)}
                />
              </label>
              <button type="submit" disabled={busy}>
                Reset PIN
              </button>
            </form>
          </section>

          <section>
            <h2>States ({states.length})</h2>
            <ul>
              {states.map((state) => (
                <li key={state.id} className="member-row">
                  <span className="member-identity">
                    <strong>
                      {state.name}
                      {state.stateNumber ? ` · #${state.stateNumber}` : ""}
                    </strong>
                    <small>
                      {state.owner
                        ? `${state.owner.nickname ?? state.owner.wosId} (WOS ID ${state.owner.wosId})`
                        : "No owner"}
                      {` · ${state.memberCount} members · ${formatDateTime(state.createdAt)}`}
                    </small>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}
