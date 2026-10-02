// WOSOracle (like the game) reports the furnace as one number that counts
// every step: 1-30 are Furnace levels, then 5 steps per Fire Crystal level
// (31-34 = 30-1..30-4, 35 = FC1, 36-39 = FC1-1..FC1-4, ..., 80 = FC10).
const STEPS_PER_FIRE_CRYSTAL = 5;

export function fireCrystalLevel(rawFurnaceLevel: number) {
  if (rawFurnaceLevel <= 30) return 0;
  return Math.min(
    10,
    Math.floor((rawFurnaceLevel - 30) / STEPS_PER_FIRE_CRYSTAL),
  );
}

export function furnaceLabel(rawLevel: number | null) {
  if (rawLevel === null) return "—";
  if (rawLevel <= 30) return `Furnace ${rawLevel}`;
  const fireCrystal = fireCrystalLevel(rawLevel);
  const step = (rawLevel - 30) % STEPS_PER_FIRE_CRYSTAL;
  if (fireCrystal === 0) return `Furnace 30-${step}`;
  return step ? `FC${fireCrystal}-${step}` : `FC${fireCrystal}`;
}
