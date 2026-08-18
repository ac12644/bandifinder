/**
 * Durable rate limits and plan quotas
 *
 * Both counters used to be module-level Maps. On serverless that meant each
 * instance kept its own: daily search quotas reset on cold start, and rate
 * limits multiplied by the number of running instances.
 *
 * These tests cover the TypeScript layer — that the middleware consults the
 * shared store, degrades sanely when it is unreachable, and never
 * double-counts. The atomicity guarantee itself lives in the SQL functions in
 * migration 006 and needs a real Postgres to exercise.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono, type MiddlewareHandler } from "hono";
import type { Env } from "../../app";

const consumeRateLimitToken = vi.fn();
const consumeDailyQuota = vi.fn();
const getUserByClerkId = vi.fn();
const getOrganizationById = vi.fn();

vi.mock("../../lib/db/usage", () => ({
  consumeRateLimitToken: (...a: unknown[]) => consumeRateLimitToken(...a),
  consumeDailyQuota: (...a: unknown[]) => consumeDailyQuota(...a),
  peekDailyQuota: vi.fn(),
}));
vi.mock("../../lib/db/users", () => ({
  getUserByClerkId: (...a: unknown[]) => getUserByClerkId(...a),
}));
vi.mock("../../lib/db/organizations", () => ({
  getOrganizationById: (...a: unknown[]) => getOrganizationById(...a),
}));

const { rateLimitMiddleware, __resetLocalBuckets } = await import(
  "../../middleware/rateLimit"
);
const { searchLimitMiddleware } = await import("../../middleware/billing");

/** Minimal app exercising one middleware under a chosen identity. */
function appWith(
  mw: MiddlewareHandler<Env>,
  userId: string | undefined = "user_1"
) {
  const app = new Hono<Env>();
  app.use("*", async (c, next) => {
    c.set("userId", userId);
    await next();
  });
  app.use("*", mw);
  app.get("/", (c) => c.json({ ok: true }));
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetLocalBuckets();
});

describe("rate limiting", () => {
  it("consults the shared store rather than process-local state", async () => {
    consumeRateLimitToken.mockResolvedValue({
      allowed: true,
      remaining: 29,
      retryAfter: 0,
    });

    const res = await appWith(rateLimitMiddleware({ limit: 30, window: 60 })).request("/");

    expect(res.status).toBe(200);
    expect(consumeRateLimitToken).toHaveBeenCalledWith("/:user_1", 30, 60);
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("29");
  });

  it("429s with Retry-After when the shared bucket is empty", async () => {
    consumeRateLimitToken.mockResolvedValue({
      allowed: false,
      remaining: 0,
      retryAfter: 12,
    });

    const res = await appWith(rateLimitMiddleware({ limit: 30, window: 60 })).request("/");

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("12");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
  });

  it("keys by authenticated user, not by IP, when signed in", async () => {
    consumeRateLimitToken.mockResolvedValue({ allowed: true, remaining: 5, retryAfter: 0 });

    await appWith(rateLimitMiddleware({ limit: 10, window: 60 }), "user_abc").request("/");

    expect(consumeRateLimitToken).toHaveBeenCalledWith("/:user_abc", 10, 60);
  });

  it("falls back to a local bucket when the store is unreachable", async () => {
    consumeRateLimitToken.mockRejectedValue(new Error("connection refused"));
    const app = appWith(rateLimitMiddleware({ limit: 3, window: 60 }));

    // The local bucket must still enforce a limit rather than waving traffic
    // through or 500-ing every request.
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) statuses.push((await app.request("/")).status);

    expect(statuses.slice(0, 3)).toEqual([200, 200, 200]);
    expect(statuses.slice(3)).toEqual([429, 429]);
  });

  it("does not fail the request when the store errors", async () => {
    consumeRateLimitToken.mockRejectedValue(new Error("timeout"));

    const res = await appWith(rateLimitMiddleware({ limit: 10, window: 60 })).request("/");

    expect(res.status).toBe(200);
  });
});

describe("daily search quota", () => {
  const withOrg = () => {
    getUserByClerkId.mockResolvedValue({ organization_id: "org-1" });
    getOrganizationById.mockResolvedValue({ id: "org-1", plan: "free" });
  };

  it("consumes exactly one unit per search", async () => {
    withOrg();
    consumeDailyQuota.mockResolvedValue({ allowed: true, used: 1 });

    const res = await appWith(searchLimitMiddleware()).request("/");

    expect(res.status).toBe(200);
    expect(consumeDailyQuota).toHaveBeenCalledOnce();
    expect(consumeDailyQuota).toHaveBeenCalledWith("org-1", "search", 5);
  });

  it("blocks with 429 and Italian copy once the allowance is spent", async () => {
    withOrg();
    consumeDailyQuota.mockResolvedValue({ allowed: false, used: 5 });

    const res = await appWith(searchLimitMiddleware()).request("/");

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe("Limite ricerche giornaliere raggiunto");
    expect(body.currentPlan).toBe("free");
    expect(body.limit).toBe(5);
    expect(body.used).toBe(5);
  });

  it("reports remaining allowance so the UI can warn before the wall", async () => {
    withOrg();
    consumeDailyQuota.mockResolvedValue({ allowed: true, used: 2 });

    const res = await appWith(searchLimitMiddleware()).request("/");

    expect(res.headers.get("X-Quota-Limit")).toBe("5");
    expect(res.headers.get("X-Quota-Remaining")).toBe("3");
  });

  it("records usage on unlimited plans but never blocks", async () => {
    getUserByClerkId.mockResolvedValue({ organization_id: "org-1" });
    getOrganizationById.mockResolvedValue({ id: "org-1", plan: "pro" });
    consumeDailyQuota.mockResolvedValue({ allowed: true, used: 900 });

    const res = await appWith(searchLimitMiddleware()).request("/");

    expect(res.status).toBe(200);
    expect(consumeDailyQuota).toHaveBeenCalledWith("org-1", "search", -1);
    expect(res.headers.get("X-Quota-Remaining")).toBe("unlimited");
  });

  it("fails open when the counter store is unreachable", async () => {
    withOrg();
    consumeDailyQuota.mockRejectedValue(new Error("connection refused"));

    const res = await appWith(searchLimitMiddleware()).request("/");

    // Blocking paying customers because a counter table blipped is worse than
    // allowing a few uncounted searches.
    expect(res.status).toBe(200);
  });

  it("skips accounting for callers with no organization", async () => {
    getUserByClerkId.mockResolvedValue({ organization_id: null });

    const res = await appWith(searchLimitMiddleware()).request("/");

    expect(res.status).toBe(200);
    expect(consumeDailyQuota).not.toHaveBeenCalled();
  });

  it("skips accounting for unauthenticated callers", async () => {
    const res = await appWith(searchLimitMiddleware(), undefined).request("/");

    expect(res.status).toBe(200);
    expect(consumeDailyQuota).not.toHaveBeenCalled();
  });
});

describe("no module-level timers", () => {
  it("rateLimit registers no background interval", async () => {
    // A setInterval at module scope keeps a handle alive and interferes with
    // graceful shutdown on serverless.
    const source = await import("node:fs").then((fs) =>
      fs.readFileSync("src/middleware/rateLimit.ts", "utf8")
    );
    // Match call sites only — prose mentioning the removal is fine.
    expect(source).not.toMatch(/setInterval\s*\(/);
  });
});
