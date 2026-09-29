"use client";

import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { useStates } from "@/components/StateProvider";

export default function Home() {
  const { activeMembership, loadingStates } = useStates();
  const canCallRallies =
    activeMembership?.role === "owner" ||
    activeMembership?.role === "rally_caller";
  const canUseGarrison =
    activeMembership?.role === "owner" ||
    activeMembership?.role === "garrison";

  return (
    <main>
      <AppHeader />
      <section>
        <h2>Choose your workspace</h2>
        {loadingStates && <p>Loading your states...</p>}
        {!loadingStates && !activeMembership && (
          <p>
            Your account is ready, but it has not joined a state yet. You
            need a state invitation or a state-creation invitation.
          </p>
        )}
        <div className="page-grid">
          {canCallRallies && (
            <>
              <Link className="dashboard-card" href="/admin/leaders">
                <strong>Manage rally leaders</strong>
                <span>Add coordinates and track enemy pet timers.</span>
              </Link>
              <Link className="dashboard-card" href="/admin/call-rally">
                <strong>Call enemy rally</strong>
                <span>Select a leader and record the rally countdown.</span>
              </Link>
            </>
          )}
          {canUseGarrison && (
            <Link className="dashboard-card" href="/garrison">
              <strong>Garrison timing</strong>
              <span>Calculate when to send and receive alerts.</span>
            </Link>
          )}
          {activeMembership?.role === "owner" && (
            <Link className="dashboard-card" href="/state/manage">
              <strong>Manage state</strong>
              <span>Invite members and assign their state roles.</span>
            </Link>
          )}
          {activeMembership?.role === "member" && (
            <div className="dashboard-card">
              <strong>Member access</strong>
              <span>
                The state owner can assign this WOS account as Garrison or
                Rally Caller.
              </span>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
