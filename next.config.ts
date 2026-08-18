import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
};

export default withSentryConfig(nextConfig, {
  org: "nutrigenie",
  project: "bandifinder",

  // Suppress verbose source map upload logs
  silent: true,

  // Route Sentry events through Next.js to bypass ad-blockers
  tunnelRoute: "/monitoring",

  // Auth token for source map uploads
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Upload source maps including third-party code
  widenClientFileUpload: true,
});
