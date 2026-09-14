export function calculateSendTime(
  impactTime: Date,
  marchTimeSeconds: number
): Date {
  return new Date(
    impactTime.getTime() - marchTimeSeconds * 1000
  );
}
export function calculateSecondsUntil(
  targetTime: Date,
  currentTime: Date
): number {
  return Math.ceil(
    (targetTime.getTime() - currentTime.getTime()) / 1000
  );
}