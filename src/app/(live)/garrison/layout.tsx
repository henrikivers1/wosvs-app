import type { ReactNode } from "react";
import { BattleToolGuard } from "@/components/BattleToolGuard";

export default function GarrisonLayout({ children }: { children: ReactNode }) {
  return <BattleToolGuard capability="garrison">{children}</BattleToolGuard>;
}
