/**
 * Ingestion Routes
 *
 * POST /ingestion/run     - Trigger manual ingestion (admin only)
 * GET  /ingestion/jobs    - List ingestion jobs (admin only)
 * GET  /ingestion/jobs/:id - Get job details (admin only)
 */

import { Hono } from "hono";
import type { Env } from "../app";
import { runIngestion, runAwardIngestion, TEDConnector, ANACConnector } from "../lib/ingestion";
import type { TenderConnector } from "../lib/ingestion";
import {
  listIngestionJobs,
  getIngestionJob,
} from "../lib/db/ingestion-jobs";

/** Connector factory map */
const CONNECTORS: Record<string, () => TenderConnector> = {
  ted: () => new TEDConnector(),
  anac: () => new ANACConnector(),
};

export const ingestionRoutes = new Hono<Env>();

// Access control lives in ingestionAuthMiddleware (mounted in app.ts), which
// accepts either a scheduler presenting CRON_SECRET or a verified admin
// session. The previous inline guard compared an unverified `x-user-id`
// header against a UID that is also shipped in the browser bundle.

/**
 * POST /ingestion/run
 * Trigger a manual ingestion run.
 */
ingestionRoutes.post("/run", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const {
    source,
    country,
    cpvCodes,
    dateFrom,
    dateTo,
    limit,
    skipVectors,
    skipNotifications,
  } = body;

  const fetchOptions = {
    country,
    cpvCodes,
    dateFrom,
    dateTo,
    limit: limit || 500,
  };
  const runOpts = {
    fetchOptions,
    skipVectors: skipVectors || false,
    skipNotifications: skipNotifications || false,
  };

  try {
    // Run all connectors
    if (source === "all") {
      const results: Record<string, unknown> = {};
      for (const [key, factory] of Object.entries(CONNECTORS)) {
        try {
          results[key] = await runIngestion({ ...runOpts, connector: factory() });
        } catch (err) {
          results[key] = { error: err instanceof Error ? err.message : String(err) };
        }
      }
      return c.json({ success: true, results });
    }

    // Run specific connector
    const connector = source && CONNECTORS[source]
      ? CONNECTORS[source]()
      : undefined; // default: TEDConnector (runner fallback)

    const result = await runIngestion({ ...runOpts, connector });
    return c.json({ success: true, result });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return c.json({ success: false, error: msg }, 500);
  }
});

/**
 * POST /ingestion/awards
 * Trigger award ingestion — fetch Contract Award Notices from TED
 * and link them to existing tenders.
 */
ingestionRoutes.post("/awards", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { country, cpvCodes, dateFrom, dateTo, limit } = body;

  try {
    const result = await runAwardIngestion({
      fetchOptions: { country, cpvCodes, dateFrom, dateTo, limit: limit || 500 },
    });
    return c.json({ success: true, result });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return c.json({ success: false, error: msg }, 500);
  }
});

/**
 * GET /ingestion/jobs
 * List ingestion jobs with pagination.
 */
ingestionRoutes.get("/jobs", async (c) => {
  const source = c.req.query("source");
  const status = c.req.query("status");
  const limit = parseInt(c.req.query("limit") || "20");
  const offset = parseInt(c.req.query("offset") || "0");

  try {
    const { jobs, total } = await listIngestionJobs({
      source: source || undefined,
      status: status || undefined,
      limit,
      offset,
    });

    return c.json({ jobs, total, limit, offset });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return c.json({ error: msg }, 500);
  }
});

/**
 * GET /ingestion/jobs/:id
 * Get details for a specific ingestion job.
 */
ingestionRoutes.get("/jobs/:id", async (c) => {
  const id = c.req.param("id");

  try {
    const job = await getIngestionJob(id);
    if (!job) {
      return c.json({ error: "Job not found" }, 404);
    }
    return c.json({ job });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return c.json({ error: msg }, 500);
  }
});
