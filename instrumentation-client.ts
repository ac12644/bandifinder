import * as Sentry from "@sentry/nextjs";

const hasConsent =
  typeof window !== "undefined" &&
  localStorage.getItem("cookie-consent") === "accepted";

Sentry.init({
  dsn: "https://0a0df045811fc507cf6af04c38c63250@o4507435115479040.ingest.de.sentry.io/4510848463011920",

  // Only send PII if user consented
  sendDefaultPii: hasConsent,

  // 100% in dev, 10% in production
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  // Replay only with consent
  integrations: hasConsent ? [Sentry.replayIntegration()] : [],
  replaysSessionSampleRate: hasConsent ? 0.1 : 0,
  replaysOnErrorSampleRate: hasConsent ? 1.0 : 0,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
