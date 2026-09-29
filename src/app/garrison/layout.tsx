"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useStates } from "@/components/StateProvider";

export default function GarrisonLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { activeMembership, loadingStates } = useStates();
  const allowed =
    Boolean(activeMembership?.battleId) &&
    (activeMembership?.role === "owner" ||
      activeMembership?.role === "admin" ||
      activeMembership?.capabilities.includes("garrison"));

  useEffect(() => {
    if (!loadingStates && !allowed) router.replace("/");
  }, [allowed, loadingStates, router]);

  if (loadingStates || !allowed) return null;
  return children;
}
