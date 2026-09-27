import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";

export default function Home() {
  return (
    <main>
      <AppHeader />
      <section>
        <h2>Choose your workspace</h2>
        <div className="page-grid">
          <Link className="dashboard-card" href="/admin/leaders">
            <strong>Manage rally leaders</strong>
            <span>Add coordinates and track enemy pet timers.</span>
          </Link>
          <Link className="dashboard-card" href="/admin/call-rally">
            <strong>Call enemy rally</strong>
            <span>Select a leader and record the rally countdown.</span>
          </Link>
          <Link className="dashboard-card" href="/garrison">
            <strong>Garrison timing</strong>
            <span>Calculate when to send and receive alerts.</span>
          </Link>
        </div>
      </section>
    </main>
  );
}
