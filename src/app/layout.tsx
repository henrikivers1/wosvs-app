import type { Metadata } from "next";
import { BattleProvider } from "@/components/BattleProvider";
import { StateProvider } from "@/components/StateProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "WOS Battle Planner",
  description: "SVS castle rally and reinforcement timing",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <StateProvider>
          <BattleProvider>{children}</BattleProvider>
        </StateProvider>
      </body>
    </html>
  );
}
