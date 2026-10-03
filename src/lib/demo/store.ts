import { DEMO_DATA_KEY } from "@/lib/demo/mode";
import { buildDemoSeed } from "@/lib/demo/seed";

export type Row = Record<string, unknown>;
export type DemoTables = Record<string, Row[]>;

let tables: DemoTables | null = null;
let nextNumericId = 100_000;

// The whole demo database lives in localStorage so it survives reloads but
// stays private to this browser.
export function demoTables(): DemoTables {
  if (tables) return tables;
  try {
    const stored = window.localStorage.getItem(DEMO_DATA_KEY);
    if (stored) tables = JSON.parse(stored) as DemoTables;
  } catch {
    tables = null;
  }
  if (!tables) {
    tables = buildDemoSeed(new Date());
    saveDemoTables();
  }
  return tables;
}

export function demoTable(name: string): Row[] {
  const all = demoTables();
  all[name] ??= [];
  return all[name];
}

export function saveDemoTables() {
  if (!tables) return;
  try {
    window.localStorage.setItem(DEMO_DATA_KEY, JSON.stringify(tables));
  } catch {
    // Storage full or blocked: keep working in memory.
  }
}

export function newUuid() {
  return crypto.randomUUID();
}

export function newNumericId() {
  nextNumericId += 1;
  return Date.now() * 10 + (nextNumericId % 10);
}

export const nowIso = () => new Date().toISOString();
