import type { ReactNode } from "react";
import { BattleProvider } from "@/components/BattleProvider";

// Live battle pages (Live Battle, enemy leaders, call rally, garrison) share
// one BattleProvider: battle data, realtime and the synced clock only run
// here, and stay loaded while moving between these pages.
export default function LiveLayout({ children }: { children: ReactNode }) {
  return <BattleProvider>{children}</BattleProvider>;
}
