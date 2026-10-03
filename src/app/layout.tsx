import type { Metadata, Viewport } from "next";
import { Archivo, IBM_Plex_Mono } from "next/font/google";
import { LanguageProvider } from "@/components/LanguageProvider";
import { StateProvider } from "@/components/StateProvider";
import "./globals.css";

// Brand type: Archivo (wordmark, headings, body) with its width axis for
// the 118% wordmark, IBM Plex Mono for labels, times and coordinates.
const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-archivo",
  display: "swap",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Overwatch",
  description:
    "SvS battle coordination, rally planning and garrison timing for Whiteout Survival states.",
  applicationName: "Overwatch",
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-touch-icon-180.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0B1D31",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${archivo.variable} ${plexMono.variable}`}>
      <body>
        <LanguageProvider>
          <StateProvider>{children}</StateProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
