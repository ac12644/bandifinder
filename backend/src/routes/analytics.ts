/**
 * Analytics Routes
 *
 * User analytics and metrics using Supabase.
 */

import { Hono } from "hono";
import type { Env } from "../app";
import {
  logActivity,
  getActivity,
  getDashboardMetrics,
} from "../lib/db/activity";
import { getUserByClerkId } from "../lib/db/users";
import { listBids } from "../lib/db/bids";
import {
  getOutcomeStats,
  getWinRateByValueRange,
  getWinRateByBuyer,
  getTopCompetitors,
  getLessonsLearned,
} from "../lib/db/bid-outcomes";
import { getMarketCompetitors } from "../lib/db/tenders";

export const analyticsRoutes = new Hono<Env>();

/**
 * GET /analytics/dashboard - Get dashboard metrics
 */
analyticsRoutes.get("/dashboard", async (c) => {
  const clerkUserId = c.get("userId");

  if (!clerkUserId) {
    return c.json({ error: "User ID required" }, 400);
  }

  try {
    const dbUser = await getUserByClerkId(clerkUserId);
    if (!dbUser) {
      return c.json({
        metrics: { savedTenders: 0, totalSearches: 0, applications: 0 },
        period: "all-time",
      });
    }

    const metrics = await getDashboardMetrics(
      dbUser.id,
      dbUser.organization_id || undefined
    );

    return c.json({
      metrics,
      period: "all-time",
    });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to get analytics",
      },
      500
    );
  }
});

/**
 * GET /analytics/kpis - Get KPI data for dashboard
 */
analyticsRoutes.get("/kpis", async (c) => {
  const clerkUserId = c.get("userId");

  if (!clerkUserId) {
    return c.json({ error: "User ID required" }, 400);
  }

  try {
    const dbUser = await getUserByClerkId(clerkUserId);
    if (!dbUser) {
      return c.json({
        tendersReviewed: 0,
        bidsSubmitted: 0,
        winRate: 0,
        avgValue: 0,
        missedDeadlines: 0,
      });
    }

    const metrics = await getDashboardMetrics(
      dbUser.id,
      dbUser.organization_id || undefined
    );

    // Fetch real outcome stats if org exists
    let outcomeData = { winRate: 0, avgWonValue: 0 };
    let bidsSubmitted = metrics.applications;
    if (dbUser.organization_id) {
      try {
        const stats = await getOutcomeStats(dbUser.organization_id);
        outcomeData = {
          winRate: stats.winRate,
          avgWonValue: stats.avgWonValue,
        };
        // Count bids with status "submitted", "won", or "lost"
        const submitted = await listBids(dbUser.organization_id, {
          status: ["submitted", "won", "lost"],
        });
        bidsSubmitted = submitted.length;
      } catch {
        // fallback to zeros
      }
    }

    return c.json({
      tendersReviewed: metrics.totalSearches,
      bidsSubmitted,
      winRate: outcomeData.winRate,
      avgValue: outcomeData.avgWonValue,
      missedDeadlines: 0,
    });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to get KPIs",
      },
      500
    );
  }
});

/**
 * POST /analytics/track - Track an event
 */
analyticsRoutes.post("/track", async (c) => {
  const clerkUserId = c.get("userId");
  const body = await c.req.json();

  try {
    const dbUser = clerkUserId
      ? await getUserByClerkId(clerkUserId)
      : null;

    await logActivity({
      user_id: dbUser?.id,
      organization_id: dbUser?.organization_id || undefined,
      event: body.event,
      properties: body.properties || {},
    });

    return c.json({ success: true });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to track event",
      },
      500
    );
  }
});

/**
 * GET /analytics/outcomes - Full outcome analytics for the analytics page
 */
analyticsRoutes.get("/outcomes", async (c) => {
  const clerkUserId = c.get("userId");

  if (!clerkUserId) {
    return c.json({ error: "User ID required" }, 400);
  }

  try {
    const dbUser = await getUserByClerkId(clerkUserId);
    if (!dbUser?.organization_id) {
      return c.json({
        stats: { total: 0, won: 0, lost: 0, withdrawn: 0, noResponse: 0, winRate: 0, totalWonValue: 0, avgWonValue: 0 },
        byValueRange: [],
        byBuyer: [],
        competitors: [],
        lessons: [],
      });
    }

    const [stats, byValueRange, byBuyer, competitors, lessons] =
      await Promise.all([
        getOutcomeStats(dbUser.organization_id),
        getWinRateByValueRange(dbUser.organization_id),
        getWinRateByBuyer(dbUser.organization_id),
        getTopCompetitors(dbUser.organization_id),
        getLessonsLearned(dbUser.organization_id),
      ]);

    return c.json({ stats, byValueRange, byBuyer, competitors, lessons });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to get outcomes",
      },
      500
    );
  }
});

/**
 * GET /analytics/market-competitors - Market-wide competitive intelligence from award data
 */
analyticsRoutes.get("/market-competitors", async (c) => {
  const clerkUserId = c.get("userId");

  if (!clerkUserId) {
    return c.json({ error: "User ID required" }, 400);
  }

  try {
    const country = c.req.query("country") || undefined;
    const cpvPrefix = c.req.query("cpvPrefix") || undefined;
    const limit = parseInt(c.req.query("limit") || "20");

    const competitors = await getMarketCompetitors({
      country,
      cpvPrefix,
      limit,
    });

    return c.json({ competitors });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to get market competitors",
      },
      500
    );
  }
});

/**
 * GET /analytics/activity - Get recent activity
 */
analyticsRoutes.get("/activity", async (c) => {
  const clerkUserId = c.get("userId");
  const limit = Number(c.req.query("limit")) || 20;

  if (!clerkUserId) {
    return c.json({ error: "User ID required" }, 400);
  }

  try {
    const dbUser = await getUserByClerkId(clerkUserId);
    if (!dbUser) {
      return c.json({ activity: [], count: 0 });
    }

    const activity = await getActivity(dbUser.id, limit);

    return c.json({
      activity,
      count: activity.length,
    });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to get activity",
      },
      500
    );
  }
});
