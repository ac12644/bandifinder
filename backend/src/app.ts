/**
 * Bandifinder API - Modular Multi-Agent Architecture
 *
 * Enterprise-Ready Features:
 * ✅ LangGraph Supervisor with Intent Classification
 * ✅ Specialized Agents (Search, Analysis, Ranking, Personalization, ContractReview)
 * ✅ Real TED API Integration
 * ✅ Supabase Postgres + Pinecone Vector Database
 * ✅ Clerk Authentication (JWT, Organizations, RBAC)
 * ✅ SSE Streaming for Real-time Responses
 * ✅ Modular Route Architecture
 * ✅ Security Middleware Stack (Rate Limiting, Sanitization, PII Detection, Audit Logging)
 * ✅ Observability (Metrics, Logging, Tracing)
 */

import { Hono } from "hono";
import type { GuestContext } from "./lib/guest";
import { cors } from "hono/cors";

// Route imports
import { tenderRoutes } from "./routes/tenders";
import { companyRoutes } from "./routes/company";
import { analyticsRoutes } from "./routes/analytics";
import { agentRoutes } from "./routes/agent";
import { preferencesRoutes } from "./routes/preferences";
import { suggestionsRoutes } from "./routes/suggestions";
import { compareRoutes } from "./routes/compare";
import { exportRoutes } from "./routes/export";
import { webhookRoutes } from "./routes/webhooks";
import { organizationRoutes } from "./routes/organizations";
import { notificationRoutes } from "./routes/notifications";
import { savedSearchRoutes } from "./routes/saved-searches";
import { ingestionRoutes } from "./routes/ingestion";
import { bidRoutes } from "./routes/bids";
import { billingRoutes } from "./routes/billing";

// Security middleware
import {
  securityStacks,
  auditLogMiddleware,
  rateLimits,
  authMiddleware,
  optionalAuthMiddleware,
  adminMiddleware,
  ingestionAuthMiddleware,
  searchLimitMiddleware,
  guestOrAuthMiddleware,
  requireAccount,
} from "./middleware";

// Observability
import {
  observabilityMiddleware,
  getMetricsJson,
  getMetricsPrometheus,
  updateHealthGauge,
  metrics,
} from "./lib/observability";

// ============================================================================
// ENV TYPE
// ============================================================================

export interface AuthenticatedUser {
  uid: string;
  email?: string;
  emailVerified: boolean;
  displayName?: string;
  photoURL?: string;
  orgId?: string;
  orgRole?: string;
  customClaims?: Record<string, unknown>;
}

export type Env = {
  Variables: {
    userId: string | undefined;
    user: AuthenticatedUser | null;
    dbUserId: string | undefined;
    orgId: string | undefined;
    /**
     * Present only for visitors without an account. Carries no userId and no
     * organization: a guest can never be mistaken for an authenticated user.
     */
    guest: GuestContext | undefined;
  };
};

// ============================================================================
// APP SETUP
// ============================================================================

export const app = new Hono<Env>();

// ============================================================================
// CORS MIDDLEWARE
// ============================================================================

app.use(
  "*",
  cors({
    origin: (origin) => {
      const allowed = [
        "http://localhost:3000",
        "https://bandifinder.it",
        "https://www.bandifinder.it",
        // Extra origins for local development, e.g. when port 3000 is taken
        // by another project. Comma-separated, explicit opt-in:
        //   CORS_EXTRA_ORIGINS=http://localhost:3010,http://localhost:4000
        //
        // Deliberately not derived from NODE_ENV — the deployed API runs with
        // NODE_ENV="development", so a "dev only" check there would silently
        // widen production CORS. Absent configuration means nothing extra.
        ...(process.env.CORS_EXTRA_ORIGINS?.split(",")
          .map((o) => o.trim())
          .filter(Boolean) ?? []),
      ];
      if (allowed.includes(origin) || origin?.endsWith(".vercel.app"))
        return origin;
      return null;
    },
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: [
      "Content-Type",
      "Authorization",
      "x-user-id",
      // Guest session headers. Omitting these makes the browser reject every
      // guest request at preflight, which presents as an empty app with no
      // request ever reaching the server.
      "x-guest-id",
      "x-guest-profile",
    ],
    credentials: true,
  })
);

// ============================================================================
// USER ID EXTRACTION MIDDLEWARE
// ============================================================================

// Initialise request-scoped auth context. Identity is deliberately NOT set
// here: it is established per route group by authMiddleware /
// optionalAuthMiddleware, which verify the Clerk JWT. Reading identity from an
// unverified `x-user-id` header (as this previously did) let any caller act as
// any user simply by setting a header.
app.use("*", async (c, next) => {
  c.set("userId", undefined);
  c.set("user", null);
  c.set("dbUserId", undefined);
  c.set("orgId", undefined);
  c.set("guest", undefined);
  await next();
});

// ============================================================================
// OBSERVABILITY MIDDLEWARE
// ============================================================================

app.use("*", observabilityMiddleware({
  logging: true,
  metrics: true,
  skipPaths: ["/health", "/", "/metrics"],
}));

// ============================================================================
// GLOBAL SECURITY MIDDLEWARE
// ============================================================================

// Audit logging for all requests (except health checks)
app.use("*", auditLogMiddleware({
  skipPaths: ["/health", "/"],
  logAllRequests: true,
}));

// ============================================================================
// HEALTH & INFO ENDPOINTS
// ============================================================================

app.get("/", (c) =>
  c.json({
    name: "Bandifinder API",
    version: "2.1.0",
    description: "AI-powered tender matching with multi-agent architecture",
    architecture: {
      pattern: "LangGraph Supervisor with Specialized Agents",
      features: [
        "Intent Classification & Routing",
        "Specialized Agents (Search, Analysis, Ranking, Personalization, ContractReview)",
        "Real TED API Integration",
        "Supabase Postgres (Structured Data)",
        "Pinecone Vector Database (Embeddings)",
        "Clerk Authentication (JWT, Orgs, RBAC)",
        "SSE Streaming",
        "Thread-based Memory (Checkpointing)",
      ],
      agents: [
        { name: "search", description: "Finds relevant tenders via TED API" },
        { name: "analysis", description: "Analyzes company-tender eligibility" },
        { name: "ranking", description: "Prioritizes opportunities by fit and urgency" },
        { name: "personalization", description: "Tailors recommendations to company profile" },
        { name: "contractReview", description: "Analyzes contract documents for risks" },
      ],
    },
    endpoints: {
      health: "GET /health",
      tenders: "GET /tenders, POST /tenders/search, POST /tenders/advanced",
      chat: "POST /agent/chat",
      stream: "POST /agent/stream (SSE)",
      company: "GET/POST /company",
      analytics: "GET /analytics",
    },
  })
);

app.get("/health", (c) => {
  // Update health gauge
  updateHealthGauge(true);

  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "2.1.0",
    services: {
      api: "healthy",
      agents: "healthy",
    },
  });
});

// ============================================================================
// METRICS ENDPOINT
// ============================================================================

app.get("/metrics", (c) => {
  const format = c.req.query("format") || "json";

  if (format === "prometheus") {
    c.header("Content-Type", "text/plain; charset=utf-8");
    return c.text(getMetricsPrometheus());
  }

  return c.json(getMetricsJson());
});

// ============================================================================
// MOUNT ROUTES WITH SECURITY MIDDLEWARE
// ============================================================================

// Tender routes: /tenders/* - Search rate limiting
//
// Open to visitors without an account: browsing tenders and seeing real fit
// scores is how the product demonstrates itself. Guests carry no identity and
// no organization, and the write endpoints below still require an account.
app.use("/tenders/*", securityStacks.search);
app.use("/tenders/*", guestOrAuthMiddleware);

// Writes and exports within /tenders still need a real account.
for (const path of [
  "/tenders/favorite",
  "/tenders/favorites",
  "/tenders/:id/decision",
  "/tenders/index",
]) {
  app.use(path, requireAccount);
}

// Plan quota applies to actual searches only. Detail views, favourites,
// dashboards and scoring lookups must not burn a customer's daily allowance,
// so these are mounted per-path rather than across /tenders/*.
const SEARCH_QUOTA_PATHS = [
  "/tenders",
  "/tenders/search",
  "/tenders/advanced",
  "/tenders/semantic",
  "/tenders/similar",
];
for (const path of SEARCH_QUOTA_PATHS) {
  app.use(path, searchLimitMiddleware());
}

app.route("/tenders", tenderRoutes);

// Agent routes: /agent/* - Strict rate limiting + prompt sanitization
app.use("/agent/*", securityStacks.agent);
app.use("/agent/*", optionalAuthMiddleware);
app.route("/agent", agentRoutes);

// Company routes: /company/* - Standard security
app.use("/company/*", securityStacks.standard);
app.use("/company/*", authMiddleware);
app.route("/company", companyRoutes);

// Analytics routes: /analytics/* - Standard security
app.use("/analytics/*", securityStacks.standard);
app.use("/analytics/*", guestOrAuthMiddleware);
app.route("/analytics", analyticsRoutes);

// Preferences routes: /preferences/* - Standard security
app.use("/preferences/*", securityStacks.standard);
app.use("/preferences/*", authMiddleware);
app.route("/preferences", preferencesRoutes);

// Suggestions routes: /suggestions/* - Search rate limiting
app.use("/suggestions/*", securityStacks.search);
app.use("/suggestions/*", optionalAuthMiddleware);
app.route("/suggestions", suggestionsRoutes);

// Compare routes: /compare/* - Standard security
app.use("/compare/*", securityStacks.standard);
app.use("/compare/*", guestOrAuthMiddleware);
app.route("/compare", compareRoutes);

// Export routes: /export/* - Strict rate limiting
app.use("/export/*", securityStacks.export);
app.use("/export/*", authMiddleware);
app.route("/export", exportRoutes);

// Webhook routes: /webhooks/* - No rate limiting (signature verified)
app.route("/webhooks", webhookRoutes);

// Organization routes: /organizations/* - Standard security
app.use("/organizations/*", securityStacks.standard);
app.use("/organizations/*", authMiddleware);
app.route("/organizations", organizationRoutes);

// Notification routes: /notifications/* - Standard security
app.use("/notifications/*", securityStacks.standard);
app.use("/notifications/*", authMiddleware);
app.route("/notifications", notificationRoutes);

// Saved search routes: /saved-searches/* - Standard security
app.use("/saved-searches/*", securityStacks.standard);
app.use("/saved-searches/*", authMiddleware);
app.route("/saved-searches", savedSearchRoutes);

// Ingestion routes: /ingestion/* - Standard security (admin-gated internally)
app.use("/ingestion/*", securityStacks.standard);
app.use("/ingestion/*", ingestionAuthMiddleware);
app.route("/ingestion", ingestionRoutes);

// Bid pipeline routes: /bids/* - Standard security
app.use("/bids/*", securityStacks.standard);
app.use("/bids/*", authMiddleware);
app.route("/bids", bidRoutes);

// Billing routes: /billing/* - Standard security
app.use("/billing/*", securityStacks.standard);
app.use("/billing/*", authMiddleware);
app.route("/billing", billingRoutes);

// ============================================================================
// LEGACY ENDPOINT ALIASES (for backward compatibility)
// ============================================================================

// GET /models - redirect to agent models
app.get("/models", (c) => c.redirect("/agent/models"));

// POST /models/config - redirect to agent models config
app.post("/models/config", (c) => c.redirect("/agent/models/config", 307));

// GET /getAdminMetrics - admin metrics endpoint (real data)
app.get("/getAdminMetrics", authMiddleware, adminMiddleware, async (c) => {
  const userId = c.get("userId");
  const ADMIN_UID = process.env.ADMIN_UID;

  if (!ADMIN_UID || userId !== ADMIN_UID) {
    return c.json({ error: "Access denied" }, 403);
  }

  const periodParam = c.req.query("period") || "7d";
  const days = parseInt(periodParam.replace("d", "")) || 7;
  const now = new Date();
  const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  try {
    const {
      getAdminPlatformStats,
      getAdminPipelineStats,
      getAdminIngestionStats,
      getAdminActivityStats,
    } = await import("./lib/db/admin-metrics");

    // Run all queries in parallel (each wrapped to prevent one failure from blocking all)
    const [platform, pipeline, ingestion, activity] = await Promise.all([
      getAdminPlatformStats().catch((e) => { console.error("Platform stats error:", e); return { totalOrganizations: 0, totalUsers: 0, totalTenders: 0, tendersBySource: {}, planDistribution: {} }; }),
      getAdminPipelineStats().catch((e) => { console.error("Pipeline stats error:", e); return { totalBids: 0, bidsByStatus: {}, winRate: 0, totalWonValue: 0, avgWonValue: 0, totalOutcomes: 0 }; }),
      getAdminIngestionStats(startDate).catch((e) => { console.error("Ingestion stats error:", e); return { totalJobsInPeriod: 0, completedJobsInPeriod: 0, failedJobsInPeriod: 0, totalTendersNewInPeriod: 0, totalTendersFoundInPeriod: 0, lastCompletedBySource: {} }; }),
      getAdminActivityStats(startDate).catch((e) => { console.error("Activity stats error:", e); return { totalEventsInPeriod: 0, eventsByType: {}, totalSearches: 0, avgResultsPerSearch: 0, topUsers: [] }; }),
    ]);

    // Runtime metrics from in-memory observability (resets on deploy)
    const snapshot = metrics.getSnapshot();
    const httpRequestsTotal = snapshot.counters
      .filter((c) => c.name === "http_requests_total")
      .reduce((sum, c) => sum + c.value, 0);
    const httpErrorsTotal = snapshot.counters
      .filter((c) => c.name === "http_errors_total")
      .reduce((sum, c) => sum + c.value, 0);
    const latencyHistogram = snapshot.histograms.find(
      (h) => h.name === "http_request_duration_ms"
    );
    const avgLatencyMs =
      latencyHistogram && latencyHistogram.count > 0
        ? Math.round(latencyHistogram.sum / latencyHistogram.count)
        : 0;


    return c.json({
      period: { start: startDate.toISOString(), end: now.toISOString(), days },
      platform,
      pipeline,
      ingestion,
      activity,
      runtime: {
        httpRequestsTotal,
        httpErrorsTotal,
        avgLatencyMs,
        errorRate:
          httpRequestsTotal > 0
            ? Math.round((httpErrorsTotal / httpRequestsTotal) * 1000) / 10
            : 0,
      },
      timestamp: now.toISOString(),
    });
  } catch (err) {
    console.error("Admin metrics error:", err);
    return c.json(
      { error: "Failed to load metrics", detail: String(err) },
      500
    );
  }
});

// ============================================================================
// EXPORT
// ============================================================================

export default app;
