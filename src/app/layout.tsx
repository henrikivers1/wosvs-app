import type { Metadata } from "next";
import { BattleProvider } from "@/components/BattleProvider";
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
        <BattleProvider>{children}</BattleProvider>
      </body>
    </html>
  );
}
