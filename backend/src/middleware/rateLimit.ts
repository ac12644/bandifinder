/**
 * Rate Limiting Middleware
 *
 * Token bucket backed by Postgres, so a limit applies across every API
 * instance rather than per-process.
 *
 * The previous implementation kept buckets in a module-level Map. On
 * serverless each instance had its own counters, so the effective limit was
 * `limit × instances` — scaling up under load raised the ceiling instead of
 * holding it. It also registered a `setInterval` at module scope to sweep the
 * Map, which keeps a handle alive and interferes with graceful shutdown; the
 * shared table is swept by `purge_usage_data()` instead.
 *
 * Degradation: if the shared store is unreachable, requests fall back to a
 * process-local bucket rather than failing. That is weaker than the intended
 * limit but strictly better than either 500-ing every request or waving all
 * traffic through.
 */

import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../app";
import { consumeRateLimitToken } from "../lib/db/usage";
import { logger } from "../lib/observability";

interface RateLimitConfig {
  /** Max requests per window */
  limit: number;
  /** Window size in seconds */
  window: number;
}

// ---------------------------------------------------------------------------
// Local fallback bucket
// ---------------------------------------------------------------------------
//
// Used only when the shared store cannot be reached. Bounded so a burst of
// distinct keys during an outage cannot grow it without limit, and swept
// lazily on write rather than by a background timer.

interface LocalBucket {
  tokens: number;
  lastRefill: number;
}

const MAX_LOCAL_BUCKETS = 10_000;
const LOCAL_BUCKET_TTL_MS = 300_000;

const localBuckets = new Map<string, LocalBucket>();

function sweepLocalBuckets(now: number): void {
  for (const [key, bucket] of localBuckets) {
    if (now - bucket.lastRefill > LOCAL_BUCKET_TTL_MS) localBuckets.delete(key);
  }

  // Still oversized after sweeping: drop oldest-inserted entries. Map iterates
  // in insertion order, so this evicts the least recently created.
  if (localBuckets.size > MAX_LOCAL_BUCKETS) {
    const excess = localBuckets.size - MAX_LOCAL_BUCKETS;
    let dropped = 0;
    for (const key of localBuckets.keys()) {
      localBuckets.delete(key);
      if (++dropped >= excess) break;
    }
  }
}

/** Token bucket against process-local state. Mirrors the SQL function. */
function consumeLocalToken(
  key: string,
  config: RateLimitConfig
): { allowed: boolean; remaining: number; retryAfter: number } {
  const now = Date.now();
  const refillRate = config.limit / config.window;
  const existing = localBuckets.get(key);

  let tokens: number;
  if (existing) {
    const elapsedSeconds = (now - existing.lastRefill) / 1000;
    tokens = Math.min(config.limit, existing.tokens + elapsedSeconds * refillRate);
  } else {
    sweepLocalBuckets(now);
    tokens = config.limit;
  }

  if (tokens >= 1) {
    localBuckets.set(key, { tokens: tokens - 1, lastRefill: now });
    return { allowed: true, remaining: tokens - 1, retryAfter: 0 };
  }

  localBuckets.set(key, { tokens, lastRefill: now });
  return {
    allowed: false,
    remaining: 0,
    retryAfter: Math.max(Math.ceil((1 - tokens) / refillRate), 1),
  };
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

/**
 * Rate limiting middleware factory.
 */
export function rateLimitMiddleware(config: RateLimitConfig) {
  return createMiddleware<Env>(async (c, next) => {
    // Prefer the authenticated user; fall back to client IP.
    const userId = c.get("userId");
    const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const key = `${c.req.path}:${userId || ip}`;

    let result: { allowed: boolean; remaining: number; retryAfter: number };

    try {
      result = await consumeRateLimitToken(key, config.limit, config.window);
    } catch (error) {
      logger.warn("Rate limit store unavailable, using local bucket", {
        error: error instanceof Error ? error.message : String(error),
      });
      result = consumeLocalToken(key, config);
    }

    c.header("X-RateLimit-Limit", String(config.limit));
    c.header("X-RateLimit-Remaining", String(Math.max(Math.floor(result.remaining), 0)));

    if (!result.allowed) {
      c.header("Retry-After", String(result.retryAfter));
      c.header("X-RateLimit-Reset", String(Date.now() + result.retryAfter * 1000));

      throw new HTTPException(429, {
        message: `Rate limit exceeded. Try again in ${result.retryAfter} seconds.`,
      });
    }

    return next();
  });
}

/**
 * Preset rate limiters for common use cases.
 */
export const rateLimits = {
  /** Standard API endpoints: 100 requests per minute */
  standard: rateLimitMiddleware({ limit: 100, window: 60 }),

  /** Search endpoints: 30 requests per minute */
  search: rateLimitMiddleware({ limit: 30, window: 60 }),

  /** Agent endpoints: 20 requests per minute */
  agent: rateLimitMiddleware({ limit: 20, window: 60 }),

  /** Export endpoints: 10 requests per minute */
  export: rateLimitMiddleware({ limit: 10, window: 60 }),

  /** Auth endpoints: 5 requests per minute */
  auth: rateLimitMiddleware({ limit: 5, window: 60 }),
};

/** Exposed for tests: drop all process-local fallback state. */
export function __resetLocalBuckets(): void {
  localBuckets.clear();
}
