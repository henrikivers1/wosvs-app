import type { Metadata } from "next";
import { BattleProvider } from "@/components/BattleProvider";
import { LanguageProvider } from "@/components/LanguageProvider";
import { StateProvider } from "@/components/StateProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "WOSOverwatch",
  description: "State battle coordination, rally timing, and planning",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <LanguageProvider>
          <StateProvider>
            <BattleProvider>{children}</BattleProvider>
          </StateProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
