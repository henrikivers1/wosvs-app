import { heroByName } from "@/lib/heroes";

// Reads a roster CSV exported from another planning tool into troop details
// and 4★ joiner heroes per WOS ID. Unknown or unsure answers stay empty, so
// players can fill them in themselves.

export type RosterRow = {
  wos_id: string;
  infantry_tier: number | null;
  lancer_tier: number | null;
  marksman_tier: number | null;
  infantry_fc_level: number | null;
  lancer_fc_level: number | null;
  marksman_fc_level: number | null;
  infantry_t12_skill: number | null;
  lancer_t12_skill: number | null;
  marksman_t12_skill: number | null;
  // null: the source did not answer.
  heroes: string[] | null;
};

export type RosterParse = {
  rows: RosterRow[];
  skipped: number;
  withTroops: number;
  withHeroes: number;
  unknownHeroes: string[];
  error?: string;
};

const TROOPS = ["Infantry", "Lancer", "Marksman"] as const;
const ID_COLUMN = "Player ID";
const HERO_COLUMN = "Confirmed qualified heroes (4 stars + first Expedition skill 5)";

// RFC 4180 CSV: quoted fields may hold commas, quotes ("") and line breaks.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const source = text.replace(/^﻿/, "");
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else quoted = false;
      } else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[index + 1] === "\n") index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim()));
}

// "FC9" -> 9, "F30" or "Furnace 30" -> 0 (no Fire Crystal yet).
function furnaceFireCrystal(value: string) {
  const fc = value.match(/FC\s*(\d+)/i);
  if (fc) return Number(fc[1]);
  return /^F\s*\d+|furnace/i.test(value.trim()) ? 0 : null;
}

function troopTier(record: Record<string, string>, troop: string) {
  if (record[`${troop} T12 unlocked`] === "Unlocked") return 12;
  if (record[`${troop} T11 unlocked`] === "Unlocked") return 11;
  if (record[`${troop} availability`] === "T11 only") return 11;
  return null;
}

function troopSkill(record: Record<string, string>, troop: string, tier: number | null) {
  const value = record[`${troop} T12 joiner skill`] ?? "";
  const level = value.match(/Level\s*(\d)/i);
  if (level) return Math.min(3, Number(level[1]));
  if (/not researched/i.test(value) && tier === 12) return 0;
  return null;
}

// Troop FC from the source's own text when it names a tier too ("FC9 T11";
// a bare "FC10" is usually the Furnace), and never above the Furnace.
function troopFireCrystal(record: Record<string, string>, troop: string, furnaceFc: number | null) {
  const text = record[`${troop} original source text`] ?? "";
  const match = text.match(/FC\s*(\d+)/i);
  if (!match || !/\bT1[0-2]\b/i.test(text)) return null;
  const level = Number(match[1]);
  if (level > 10 || (furnaceFc !== null && level > furnaceFc)) return null;
  return level;
}

export function parseRoster(text: string): RosterParse {
  const table = parseCsv(text);
  const empty = { rows: [], skipped: 0, withTroops: 0, withHeroes: 0, unknownHeroes: [] };
  if (table.length < 2) return { ...empty, error: "The file has no players." };
  const header = table[0].map((cell) => cell.trim());
  if (!header.includes(ID_COLUMN)) {
    return { ...empty, error: `The file needs a "${ID_COLUMN}" column with each player's WOS ID.` };
  }

  const byId = new Map<string, RosterRow>();
  const unknownHeroes = new Set<string>();
  let skipped = 0;
  for (const cells of table.slice(1)) {
    const record = Object.fromEntries(header.map((name, index) => [name, (cells[index] ?? "").trim()]));
    const wosId = record[ID_COLUMN].replace(/\s/g, "");
    if (!/^\d{1,20}$/.test(wosId)) {
      skipped += 1;
      continue;
    }
    const furnaceFc = furnaceFireCrystal(record["Furnace / FC (confirmed)"] ?? "");
    const row: RosterRow = {
      wos_id: wosId,
      infantry_tier: null, lancer_tier: null, marksman_tier: null,
      infantry_fc_level: null, lancer_fc_level: null, marksman_fc_level: null,
      infantry_t12_skill: null, lancer_t12_skill: null, marksman_t12_skill: null,
      heroes: null,
    };
    for (const troop of TROOPS) {
      const key = troop.toLowerCase() as "infantry" | "lancer" | "marksman";
      const tier = troopTier(record, troop);
      row[`${key}_tier`] = tier;
      row[`${key}_t12_skill`] = tier === 12 ? troopSkill(record, troop, tier) : null;
      row[`${key}_fc_level`] = troopFireCrystal(record, troop, furnaceFc);
    }
    if ((record["Hero status"] ?? "").toLowerCase() === "selected") {
      const names = (record[HERO_COLUMN] ?? "").split(/[;,]/).map((name) => name.trim()).filter(Boolean);
      row.heroes = names.flatMap((name) => {
        const hero = heroByName(name);
        if (!hero) unknownHeroes.add(name);
        return hero ? [hero.name] : [];
      });
    }
    byId.set(wosId, row);
  }

  const rows = [...byId.values()];
  return {
    rows,
    skipped,
    withTroops: rows.filter((row) => row.infantry_tier || row.lancer_tier || row.marksman_tier).length,
    withHeroes: rows.filter((row) => row.heroes?.length).length,
    unknownHeroes: [...unknownHeroes],
  };
}
