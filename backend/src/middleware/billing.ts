/**
 * Billing Middleware
 *
 * Plan-based feature gating and usage limit enforcement.
 * Reads the organization's plan from the DB and checks limits.
 */

import { createMiddleware } from "hono/factory";
import type { Env } from "../app";
import { getUserByClerkId } from "../lib/db/users";
import { getOrganizationById } from "../lib/db/organizations";
import { getPlanLimits, type PlanLimits } from "../lib/stripe";
import { consumeDailyQuota } from "../lib/db/usage";
import { logger } from "../lib/observability";

// Daily usage counters live in Postgres (see lib/db/usage and migration 006).
// They were previously a module-level Map, so on serverless every cold start
// handed the organization a fresh allowance and each instance counted
// separately — the daily quota was effectively unenforceable.

// ---------------------------------------------------------------------------
// Feature Gate Middleware
// ---------------------------------------------------------------------------

type Feature = "pipeline" | "export" | "api";

/**
 * Middleware that blocks access if the org's plan doesn't include a feature.
 */
export function requireFeature(feature: Feature) {
  return createMiddleware<Env>(async (c, next) => {
    const clerkUserId = c.get("userId");
    if (!clerkUserId) return c.json({ error: "Authentication required" }, 401);

    const dbUser = await getUserByClerkId(clerkUserId);
    if (!dbUser?.organization_id) return c.json({ error: "No organization" }, 403);

    const org = await getOrganizationById(dbUser.organization_id);
    if (!org) return c.json({ error: "Organization not found" }, 404);

    const limits = getPlanLimits(org.plan);

    const allowed = checkFeature(limits, feature);
    if (!allowed) {
      return c.json(
        {
          error: "Upgrade richiesto",
          message: featureMessage(feature),
          currentPlan: org.plan,
          requiredFeature: feature,
        },
        403
      );
    }

    await next();
  });
}

function checkFeature(limits: PlanLimits, feature: Feature): boolean {
  switch (feature) {
    case "pipeline":
      return limits.pipelineEnabled;
    case "export":
      return limits.exportEnabled;
    case "api":
      return limits.apiAccess;
    default:
      return true;
  }
}

function featureMessage(feature: Feature): string {
  switch (feature) {
    case "pipeline":
      return "La pipeline gare è disponibile dal piano Starter";
    case "export":
      return "L'esportazione è disponibile dal piano Starter";
    case "api":
      return "L'accesso API è disponibile dal piano Pro";
    default:
      return "Funzionalità non disponibile nel piano attuale";
  }
}

// ---------------------------------------------------------------------------
// Search Rate Limit Middleware (plan-based)
// ---------------------------------------------------------------------------

/**
 * Middleware that enforces daily search limits based on the org's plan.
 * Only counts actual search requests, not detail views.
 */
export function searchLimitMiddleware() {
  return createMiddleware<Env>(async (c, next) => {
    const clerkUserId = c.get("userId");
    if (!clerkUserId) {
      // Allow unauthenticated searches (handled by other rate limits)
      await next();
      return;
    }

    const dbUser = await getUserByClerkId(clerkUserId);
    if (!dbUser?.organization_id) {
      await next();
      return;
    }

    const org = await getOrganizationById(dbUser.organization_id);
    if (!org) {
      await next();
      return;
    }

    const limits = getPlanLimits(org.plan);

    // One atomic increment decides the outcome. Reading the count and then
    // incrementing it separately let two concurrent requests both see room
    // under the limit and both proceed, overshooting the quota.
    let quota;
    try {
      quota = await consumeDailyQuota(org.id, "search", limits.searchesPerDay);
    } catch (error) {
      // Fail open: a counter table being briefly unreachable must not stop
      // customers from searching. Logged so the gap is visible.
      logger.error("Search quota check failed, allowing request", error as Error, {
        organizationId: org.id,
        plan: org.plan,
      });
      await next();
      return;
    }

    if (!quota.allowed) {
      return c.json(
        {
          error: "Limite ricerche giornaliere raggiunto",
          message: `Il piano ${org.plan} consente ${limits.searchesPerDay} ricerche al giorno. Passa a un piano superiore per ricerche illimitate.`,
          currentPlan: org.plan,
          limit: limits.searchesPerDay,
          used: quota.used,
        },
        429
      );
    }

    c.header("X-Quota-Limit", String(limits.searchesPerDay));
    c.header(
      "X-Quota-Remaining",
      limits.searchesPerDay < 0
        ? "unlimited"
        : String(Math.max(limits.searchesPerDay - quota.used, 0))
    );

    await next();
  });
}

// ---------------------------------------------------------------------------
// Active Bids Limit Check (called from bids route, not middleware)
// ---------------------------------------------------------------------------

/**
 * Check if the org can create more active bids.
 * Returns null if OK, or an error message if limit reached.
 */
export async function checkBidLimit(
  organizationId: string,
  currentActiveBids: number
): Promise<string | null> {
  const org = await getOrganizationById(organizationId);
  if (!org) return "Organization not found";

  const limits = getPlanLimits(org.plan);
  if (limits.bidsActive < 0) return null; // unlimited

  if (currentActiveBids >= limits.bidsActive) {
    return `Il piano ${org.plan} consente max ${limits.bidsActive} gare attive. Passa a un piano superiore.`;
  }

  return null;
}
