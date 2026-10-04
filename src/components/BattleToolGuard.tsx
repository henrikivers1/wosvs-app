"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useStates } from "@/components/StateProvider";
import type { StateCapability } from "@/types/state";
import { canUseBattleTool } from "@/lib/battleAccess";

// Sends people without access to this live battle tool back home.
export function BattleToolGuard({
  capability,
  children,
}: {
  capability: StateCapability;
  children: ReactNode;
}) {
  const router = useRouter();
  const { activeMembership, loadingStates } = useStates();
  const allowed = canUseBattleTool(activeMembership, capability);

  useEffect(() => {
    if (!loadingStates && !allowed) router.replace("/");
  }, [allowed, loadingStates, router]);

  if (loadingStates || !allowed) return null;
  return children;
}
