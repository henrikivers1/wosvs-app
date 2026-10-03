// Private demo mode: the app runs against fake data kept in this browser
// only. Nothing is read from or written to Supabase or WOSOracle.
const DEMO_FLAG_KEY = "wosoverwatch-demo";
// Bump the version when the seed changes so old demo data is replaced.
const DEMO_DATA_KEY = "wosoverwatch-demo-data-v2";

export function isDemoMode() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(DEMO_FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

export function enterDemo(path = "/state/overwatch") {
  try {
    window.localStorage.setItem(DEMO_FLAG_KEY, "1");
  } catch {
    window.alert("The demo needs browser storage, which is blocked here.");
    return;
  }
  // A full reload is needed so every page builds its client in demo mode.
  window.location.assign(path);
}

export function exitDemo() {
  try {
    window.localStorage.removeItem(DEMO_FLAG_KEY);
  } catch {
    // Nothing to clean up.
  }
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign("/");
}

export function resetDemo() {
  try {
    window.localStorage.removeItem(DEMO_DATA_KEY);
  } catch {
    // Storage unavailable: the in-memory copy is rebuilt on reload anyway.
  }
  window.location.reload();
}

export { DEMO_DATA_KEY };
