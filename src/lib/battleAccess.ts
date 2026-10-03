import type { StateCapability } from "@/types/state";

type Membership = {
  role: string;
  capabilities: string[];
  battleId: string | null;
} | null;

// Owners and admins can use every live battle tool; other members need the
// matching capability (Coordinator = rally_caller, Garrison = garrison).
export function canUseBattleTool(
  membership: Membership,
  capability: StateCapability,
) {
  return (
    Boolean(membership?.battleId) &&
    (membership?.role === "owner" ||
      membership?.role === "admin" ||
      Boolean(membership?.capabilities.includes(capability)))
  );
}
