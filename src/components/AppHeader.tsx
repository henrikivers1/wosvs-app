"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function AppHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = useMemo(() => createClient(), []);
  const [signedIn, setSignedIn] = useState(false);
  const [username, setUsername] = useState<string | null>(null);

  const loadIdentity = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setSignedIn(false);
      setUsername(null);
      return;
    }

    setSignedIn(true);
    const { data: profile } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .maybeSingle();

    const publicUsername = profile?.username ?? null;
    setUsername(publicUsername);

    if (
      !publicUsername &&
      pathname !== "/login" &&
      pathname !== "/account/setup"
    ) {
      router.replace("/account/setup");
    }
  }, [pathname, router, supabase]);

  useEffect(() => {
    const initialLoadId = window.setTimeout(() => {
      void loadIdentity();
    }, 0);

    const { data } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSignedIn(Boolean(session?.user));
        if (!session?.user) setUsername(null);

        window.setTimeout(() => {
          void loadIdentity();
        }, 0);
      }
    );

    return () => {
      window.clearTimeout(initialLoadId);
      data.subscription.unsubscribe();
    };
  }, [loadIdentity, supabase]);

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
        {signedIn ? (
          <>
            <Link className="nav-link" href="/account">
              Account
            </Link>
            <span className="signed-in-user">
              {username ? `@${username}` : "Setup required"}
            </span>
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
