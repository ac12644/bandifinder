/**
 * Usage Accounting
 *
 * Shared, durable counters for plan quotas and rate limiting, backed by the
 * Postgres functions in migration 006. Both were previously module-level Maps,
 * which on serverless meant per-instance state: quotas reset on cold start and
 * rate limits scaled with the number of running instances.
 *
 * Every operation is a single atomic statement, so concurrent requests across
 * instances cannot both consume the last unit of an allowance.
 */

import { getSupabaseAdmin } from "../supabase";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Metrics tracked against a daily plan allowance. */
export type UsageMetric = "search" | "export" | "agent_message";

export interface QuotaResult {
  /** Whether the caller is within the plan limit. */
  allowed: boolean;
  /** Usage for the current day, after this call. */
  used: number;
  /**
   * True when the counter store could not be reached and the result is a
   * fail-open default rather than a real measurement.
   */
  degraded?: boolean;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Tokens left in the bucket. */
  remaining: number;
  /** Seconds until a token frees up. Zero when allowed. */
  retryAfter: number;
  /** True when the shared store was unreachable. */
  degraded?: boolean;
}

// ---------------------------------------------------------------------------
// Daily plan quotas
// ---------------------------------------------------------------------------

/**
 * Atomically consume one unit of an organization's daily allowance.
 *
 * Pass a negative `limit` for unlimited plans: usage is still recorded (useful
 * for analytics and for showing customers their own volume) but never blocked.
 *
 * Fails open. If the counter store is unreachable the request is allowed and
 * the result is flagged `degraded` — refusing to serve paying customers
 * because a counter table is briefly unavailable is the worse failure.
 */
export async function consumeDailyQuota(
  organizationId: string,
  metric: UsageMetric,
  limit: number
): Promise<QuotaResult> {
  const sb = getSupabaseAdmin();

  const { data, error } = await sb.rpc("consume_daily_quota", {
    p_organization_id: organizationId,
    p_metric: metric,
    p_limit: limit,
  });

  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  return {
    allowed: row?.allowed ?? true,
    used: row?.used ?? 0,
  };
}

/**
 * Read today's usage without consuming any of it.
 */
export async function peekDailyQuota(
  organizationId: string,
  metric: UsageMetric
): Promise<number> {
  const sb = getSupabaseAdmin();

  const { data, error } = await sb.rpc("peek_daily_quota", {
    p_organization_id: organizationId,
    p_metric: metric,
  });

  if (error) throw error;
  return typeof data === "number" ? data : 0;
}

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

/**
 * Atomically refill and consume one token from a shared bucket.
 *
 * The bucket key should identify the caller and the route group, e.g.
 * `"/tenders:user_abc"`.
 */
export async function consumeRateLimitToken(
  bucketKey: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const sb = getSupabaseAdmin();

  const { data, error } = await sb.rpc("consume_rate_limit_token", {
    p_bucket_key: bucketKey,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });

  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  return {
    allowed: row?.allowed ?? true,
    remaining: Number(row?.remaining ?? limit),
    retryAfter: Number(row?.retry_after ?? 0),
  };
}
