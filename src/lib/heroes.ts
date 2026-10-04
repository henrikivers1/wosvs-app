// Whiteout Survival heroes by generation. Epic and Rare heroes are
// available from the start, so they count as Generation 1.
export type HeroRarity = "Legendary" | "Epic" | "Rare";

export type Hero = {
  name: string;
  generation: number;
  rarity: HeroRarity;
};

const LEGENDARY_BY_GENERATION: Record<number, string[]> = {
  1: ["Jeronimo", "Natalia", "Molly", "Zinman"],
  2: ["Flint", "Philly", "Alonso"],
  3: ["Logan", "Mia", "Greg"],
  4: ["Ahmose", "Reina", "Lynn"],
  5: ["Hector", "Norah", "Gwen"],
  6: ["Wu Ming", "Renee", "Wayne"],
  7: ["Edith", "Gordon", "Bradley"],
  8: ["Gatot", "Sonya", "Hendrik"],
  9: ["Magnus", "Fred", "Xura"],
  10: ["Gregory", "Freya", "Blanchette"],
  11: ["Eleonora", "Lloyd", "Rufus"],
  12: ["Hervor", "Karol", "Ligeia"],
  13: ["Gisela", "Flora", "Vulcanus"],
  14: ["Elif", "Dominic", "Cara"],
  15: ["Hank", "Estrella", "Viveca"],
  16: ["Seigel", "Ursar", "Aisling"],
  17: ["Aiden", "Bertha", "Eleanor"],
};

const EPIC = [
  "Jessie",
  "Jasser",
  "Seo-yoon",
  "Sergey",
  "Patrick",
  "Ling Xue",
  "Lumak Bokan",
  "Bahiti",
  "Gina",
];

const RARE = ["Smith", "Eugene", "Charlie", "Cloris"];

export const HEROES: Hero[] = [
  ...Object.entries(LEGENDARY_BY_GENERATION).flatMap(([generation, names]) =>
    names.map((name) => ({
      name,
      generation: Number(generation),
      rarity: "Legendary" as const,
    })),
  ),
  ...EPIC.map((name) => ({ name, generation: 1, rarity: "Epic" as const })),
  ...RARE.map((name) => ({ name, generation: 1, rarity: "Rare" as const })),
];

export const LATEST_HERO_GENERATION = Math.max(
  ...HEROES.map((hero) => hero.generation),
);

export function heroByName(name: string) {
  const lower = name.trim().toLowerCase();
  return HEROES.find((hero) => hero.name.toLowerCase() === lower) ?? null;
}
