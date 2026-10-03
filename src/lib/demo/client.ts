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
    case "/api/oracle/state-alliances":
      return json({
        alliances: [
          { id: 801, abbr: "FWV", name: "Frost Wolves", power: 8_000_000_000, memberCount: 95 },
          { id: 802, abbr: "PGD", name: "Polar Guard", power: 6_400_000_000, memberCount: 87 },
          { id: 803, abbr: "ICL", name: "Ice Legion", power: 4_800_000_000, memberCount: 79 },
          { id: 804, abbr: "SNW", name: "Snow Owls", power: 2_100_000_000, memberCount: 61 },
        ],
      });
    case "/api/oracle/alliance":
      return json({
        alliance: {
          id: Number(url.searchParams.get("allianceId")),
          abbr: "SHL",
          name: "Shell Alliance",
          state: 9999,
          memberCount: 3,
          power: 0,
        },
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

// "Generate now" / "Publish now": the real planning code, run against the
// demo tables instead of the database.
async function demoAutoPlan(body: string) {
  const { runAutoPlan } = await import("@/lib/autoPlan");
  const request = JSON.parse(body) as { planId?: string; action?: string };
  const plan = demoTable("battle_plans").find((row) => row.id === request.planId);
  const state = demoTable("states").find((row) => row.id === plan?.state_id);
  if (!plan || !state) return json({ error: "Battle plan not found." }, 404);
  try {
    const result = await runAutoPlan(
      createDemoClient() as unknown as Parameters<typeof runAutoPlan>[0],
      plan as unknown as Parameters<typeof runAutoPlan>[1],
      state as unknown as Parameters<typeof runAutoPlan>[2],
      request.action === "publish" ? { publishNow: true } : { generateNow: true },
    );
    return json(result);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
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
      if (url.pathname === "/api/automation/plan") {
        return demoAutoPlan(String(init?.body ?? "{}"));
      }
      const response = demoApiResponse(url);
      if (response) return response;
    }
    return realFetch(input, init);
  };
}
