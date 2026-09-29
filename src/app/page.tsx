"use client";

import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { useStates } from "@/components/StateProvider";

export default function Home() {
  const {
    activeMembership,
    memberships,
    signedIn,
    loadingStates,
  } = useStates();
  const battleActive = Boolean(activeMembership?.battleId);
  const canCallRallies =
    battleActive &&
    (activeMembership?.role === "owner" ||
      activeMembership?.role === "rally_caller");
  const canUseGarrison =
    battleActive &&
    (activeMembership?.role === "owner" ||
      activeMembership?.role === "garrison");
  const uniqueStateCount = new Set(
    memberships.map((membership) => membership.stateId)
  ).size;
  const accountsInActiveState = activeMembership
    ? memberships.filter(
        (membership) =>
          membership.stateId === activeMembership.stateId
      ).length
    : 0;

  if (signedIn === null || loadingStates) {
    return (
      <main>
        <AppHeader />
        <section className="loading-panel">
          <p>Loading...</p>
        </section>
      </main>
    );
  }

  if (!signedIn) {
    return (
      <main>
        <AppHeader />
        <section className="public-intro">
          <div>
            <p className="section-label">WOS Battle Planner</p>
            <h1>Rally timing for organized SVS states.</h1>
            <p className="intro-text">
              A shared workspace for enemy rally calls, synchronized impact
              waves, and personal garrison send times.
            </p>
            <div className="button-row">
              <Link className="primary-link" href="/login">
                Sign in or create an account
              </Link>
              <a className="secondary-link" href="#contact">
                Request state access
              </a>
            </div>
          </div>
          <dl className="product-summary">
            <div>
              <dt>Rally callers</dt>
              <dd>Record calls and maintain the shared schedule.</dd>
            </div>
            <div>
              <dt>Garrison players</dt>
              <dd>Receive a personal send time and browser alerts.</dd>
            </div>
            <div>
              <dt>State owners</dt>
              <dd>Control members, roles, and active battle periods.</dd>
            </div>
          </dl>
        </section>

        <section id="access" className="public-info-grid">
          <div>
            <p className="section-label">Access model</p>
            <h2>One-time state setup</h2>
            <p>
              Creating an account is free. Creating a state requires a
              one-time state creation entitlement issued by WOS Battle
              Planner. State members join through invitations from their
              state owner.
            </p>
            <p>
              A limited free trial can be arranged before purchasing state
              access. Monthly plans may be introduced later.
            </p>
          </div>
          <div id="contact" className="contact-panel">
            <p className="section-label">Contact</p>
            <h2>Request a trial or state setup</h2>
            <p>
              Contact us on Discord with your state name and a short
              description of your team.
            </p>
            <div className="contact-detail">
              <span>Discord</span>
              <strong>your-discord-handle</strong>
            </div>
            <small>
              Placeholder account — official contact information will be
              added before launch.
            </small>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main>
      <AppHeader />
      <section className="dashboard-heading">
        <div>
          <p className="section-label">Current workspace</p>
          <h1>
            {activeMembership
              ? activeMembership.stateName
              : "No state selected"}
          </h1>
          {activeMembership && (
            <p>
              Signed in as{" "}
              <strong>
                {activeMembership.wosNickname ||
                  activeMembership.wosId}
              </strong>
              {" · "}
              {activeMembership.role.replace("_", " ")}
            </p>
          )}
        </div>
        {activeMembership && (
          <span
            className={
              battleActive
                ? "battle-state battle-state-active"
                : "battle-state"
            }
          >
            {battleActive
              ? `${activeMembership.battleName || "Battle"} — Battle period active`
              : "No active battle period"}
          </span>
        )}
      </section>

      {!activeMembership ? (
        <section className="empty-state">
          <h2>You have not joined a state</h2>
          <p>
            Ask a state owner to invite one of your registered WOS IDs.
            Invitations appear under the notification bell.
          </p>
          <div className="button-row">
            <Link className="primary-link" href="/notifications">
              View notifications
            </Link>
            <Link className="secondary-link" href="/account">
              Manage WOS accounts
            </Link>
          </div>
        </section>
      ) : (
        <>
          {!battleActive && (
            <section className="battle-inactive-panel">
              <div>
                <p className="section-label">Battle operations unavailable</p>
                <h2>No battle period is active</h2>
                <p>
                  Rally leaders, rally calls, schedules, and garrison
                  timing remain hidden until the state owner starts a
                  battle period.
                </p>
              </div>
              {activeMembership.role === "owner" && (
                <Link className="primary-link" href="/state/manage">
                  Manage battle period
                </Link>
              )}
            </section>
          )}

          {battleActive && (
            <section>
              <div className="section-title-row">
                <div>
                  <p className="section-label">Battle operations</p>
                  <h2>Available tools</h2>
                </div>
              </div>
              <div className="operations-list">
                {canCallRallies && (
                  <>
                    <Link
                      className="operation-row"
                      href="/admin/leaders"
                    >
                      <div>
                        <strong>Rally leaders</strong>
                        <span>
                          Enemy coordinates and pet status
                        </span>
                      </div>
                      <span>Open</span>
                    </Link>
                    <Link
                      className="operation-row"
                      href="/admin/call-rally"
                    >
                      <div>
                        <strong>Call rally</strong>
                        <span>
                          Add an incoming rally to the live schedule
                        </span>
                      </div>
                      <span>Open</span>
                    </Link>
                  </>
                )}
                {canUseGarrison && (
                  <Link className="operation-row" href="/garrison">
                    <div>
                      <strong>Garrison timing</strong>
                      <span>
                        Personal send times and alerts
                      </span>
                    </div>
                    <span>Open</span>
                  </Link>
                )}
              </div>
            </section>
          )}

          {activeMembership.role === "owner" && (
            <section className="owner-shortcut">
              <div>
                <p className="section-label">Administration</p>
                <h2>State management</h2>
                <p>
                  Manage invitations, approvals, member roles, and the
                  current battle period.
                </p>
              </div>
              <Link className="secondary-link" href="/state/manage">
                Manage state
              </Link>
            </section>
          )}

          <section className="workspace-facts">
            <div>
              <span>States joined</span>
              <strong>{uniqueStateCount}</strong>
            </div>
            <div>
              <span>Your WOS accounts in this state</span>
              <strong>{accountsInActiveState}</strong>
            </div>
            <div>
              <span>Current role</span>
              <strong>
                {activeMembership.role.replace("_", " ")}
              </strong>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
