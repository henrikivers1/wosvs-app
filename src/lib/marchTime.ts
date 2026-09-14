export function calculateMarchTime(
  x: number,
  y: number,
  petActive: boolean = false
): number {
  const castleX = 599;
  const castleY = 599;

  const distance = Math.hypot(
    x - castleX,
    y - castleY
  );

  const normalMarchTime = Math.round(
    4.2813 * distance + 6.079
  );

  if (petActive) {
    return Math.round(normalMarchTime * 0.7);
  }

  return normalMarchTime;
}