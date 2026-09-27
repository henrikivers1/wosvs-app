"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function AppHeader() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null);
    });

    const { data } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUserEmail(session?.user.email ?? null);
      }
    );

    return () => data.subscription.unsubscribe();
  }, [supabase]);

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

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
        {userEmail ? (
          <>
            <span className="signed-in-user">{userEmail}</span>
            <button type="button" onClick={signOut}>
              Sign out
            </button>
          </>
        ) : (
          <Link className="nav-link" href="/login">
            Sign in
          </Link>
        )}
      </nav>
    </header>
  );
}
