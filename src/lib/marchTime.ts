export function calculateMarchTime(x: number, y: number): number {
  const castleX = 599;
  const castleY = 599;

  const distance = Math.hypot(x - castleX, y - castleY);

  return Math.round(4.2813 * distance + 6.079);
}