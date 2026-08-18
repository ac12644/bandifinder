import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: process.env.SENTRY_DSN ||
    "https://0a0df045811fc507cf6af04c38c63250@o4507435115479040.ingest.de.sentry.io/4510848463011920",

  environment: process.env.NODE_ENV || "production",

  sendDefaultPii: true,

  tracesSampleRate: 0.2,
});
