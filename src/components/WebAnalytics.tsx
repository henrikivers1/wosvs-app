"use client";

import { Analytics } from "@vercel/analytics/next";

// Vercel Web Analytics: anonymous page views, no cookies. Join links carry
// the state's secret token in the path, so it is cut before sending.
export function WebAnalytics() {
  return (
    <Analytics
      beforeSend={(event) => ({
        ...event,
        url: event.url.replace(/\/join\/[^/?#]+/, "/join/[token]"),
      })}
    />
  );
}
