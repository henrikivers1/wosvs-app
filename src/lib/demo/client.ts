import { exitDemo } from "@/lib/demo/mode";
import { DemoQuery } from "@/lib/demo/query";
import { runDemoRpc } from "@/lib/demo/rpc";
import { DEMO_USER_ID, demoEnemyRoster } from "@/lib/demo/seed";
import { demoTable } from "@/lib/demo/store";

const demoUser = {
  id: DEMO_USER_ID,
  email: "demo@wosoverwatch.local",
  user_metadata: {},
  app_metadata: {},
};

// The parts of the Supabase browser client the app uses, backed by the
// in-browser demo tables.
export function createDemoClient() {
  installDemoFetch();
  const channel = {
    on() {
      return channel;
    },
    subscribe() {
      return channel;
    },
  };
  return {
    from: (table: string) => new DemoQuery(table),
    rpc: (name: string, args?: Record<string, unknown>) =>
      Promise.resolve(runDemoRpc(name, args)),
    channel: () => channel,
    removeChannel: async () => "ok",
    auth: {
      getUser: async () => ({ data: { user: demoUser }, error: null }),
      getSession: async () => ({
        data: { session: { user: demoUser } },
        error: null,
      }),
      getClaims: async () => ({ data: { claims: { sub: DEMO_USER_ID } }, error: null }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe() {} } },
      }),
      signOut: async () => {
        exitDemo();
        return { error: null };
      },
      signInWithPassword: async () => ({
        data: { user: null, session: null },
        error: { message: "Exit the demo to sign in." },
      }),
      signUp: async () => ({
        data: { user: null, session: null },
        error: { message: "Exit the demo to create an account." },
      }),
    },
    storage: {
      from: () => ({
        getPublicUrl: () => ({ data: { publicUrl: "" } }),
        upload: async () => ({
          data: null,
          error: { message: "Uploads are not available in the demo." },
        }),
      }),
    },
  };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

// Answers the app's own API routes from demo data so no request reaches
// the server, WOSOracle or Supabase.
function demoApiResponse(url: URL): Response | null {
  switch (url.pathname) {
    case "/api/oracle/opponent": {
      const intel = demoTable("battle_intel")[0] as
        | { opponent_state: number; opponent: Record<string, unknown> }
        | undefined;
      if (!intel) return json({ error: "No opponent in the demo." }, 404);
      return json({
        opponent: intel.opponent_state,
        source: "draw",
        alliances: intel.opponent.alliances,
        topPlayers: intel.opponent.topPlayers,
      });
    }
    case "/api/oracle/roster":
      return json({
        members: demoEnemyRoster(Number(url.searchParams.get("allianceId"))),
      });
    case "/api/oracle/player-sync":
      return json({ cached: true });
    case "/api/automation/run":
      return json({
        statesChecked: 1,
        drawsFound: 1,
        intelSaved: 0,
        battlesAdvanced: 0,
        resultsSaved: 0,
        playersSynced: 0,
        errors: [],
      });
    case "/api/accounts/release-claim":
      return json({ error: "Releasing WOS IDs is not available in the demo." }, 400);
    case "/api/time":
      return json({ now: Date.now() });
    default:
      return url.pathname.startsWith("/api/")
        ? json({ error: "Not available in the demo." }, 400)
        : null;
  }
}

let fetchInstalled = false;

function installDemoFetch() {
  if (fetchInstalled || typeof window === "undefined") return;
  fetchInstalled = true;
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const raw =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const url = new URL(raw, window.location.origin);
    if (url.origin === window.location.origin) {
      const response = demoApiResponse(url);
      if (response) return response;
    }
    return realFetch(input, init);
  };
}
