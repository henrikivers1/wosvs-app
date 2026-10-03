import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
