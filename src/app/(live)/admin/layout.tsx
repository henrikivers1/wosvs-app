import type { ReactNode } from "react";
import { BattleToolGuard } from "@/components/BattleToolGuard";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <BattleToolGuard capability="rally_caller">{children}</BattleToolGuard>;
}
