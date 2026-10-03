import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";
// The browser talks to Supabase directly (data, sign-in, realtime).
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const supabase = supabaseUrl
  ? `${supabaseUrl} ${supabaseUrl.replace(/^http/, "ws")}`
  : "https://*.supabase.co wss://*.supabase.co";

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  // Player avatars come from the game's image servers.
  "img-src 'self' https: data: blob:",
  "media-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self' ${supabase}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
  // Pages folded into others; old links and bookmarks keep working.
  async redirects() {
    return [
      { source: "/profile", destination: "/account", permanent: true },
      // Invitations are accepted in the notification inbox now.
      { source: "/invite/:token", destination: "/notifications", permanent: true },
    ];
  },
};

export default nextConfig;
