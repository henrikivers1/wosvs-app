import Link from "next/link";

export function AppHeader() {
  return (
    <header>
      <h1>WOS Battle Planner</h1>
      <p>SVS castle rally and reinforcement timing.</p>
      <nav>
        <Link className="nav-link" href="/admin/leaders">
          Manage leaders
        </Link>
        <Link className="nav-link" href="/admin/call-rally">
          Call rally
        </Link>
        <Link className="nav-link" href="/garrison">
          Garrison
        </Link>
      </nav>
    </header>
  );
}
