export function calculateImpactTime(
  currentTime: Date,
  minutesRemaining: number,
  secondsRemaining: number,
  marchTimeSeconds: number
): Date {
  const totalSeconds =
    minutesRemaining * 60 +
    secondsRemaining +
    marchTimeSeconds;

  return new Date(currentTime.getTime() + totalSeconds * 1000);
}