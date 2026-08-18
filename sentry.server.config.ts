import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://0a0df045811fc507cf6af04c38c63250@o4507435115479040.ingest.de.sentry.io/4510848463011920",

  sendDefaultPii: true,

  tracesSampleRate: 0.1,
});
