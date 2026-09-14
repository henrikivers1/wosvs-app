export function calculateSendTime(
  impactTime: Date,
  marchTimeSeconds: number
): Date {
  return new Date(
    impactTime.getTime() - marchTimeSeconds * 1000
  );
}