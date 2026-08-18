/**
 * Auth enforcement
 *
 * The API previously derived identity from an unverified `x-user-id` header on
 * every request, and `authMiddleware` — though fully implemented — was mounted
 * on no route at all. Any caller could act as any user by setting a header.
 *
 * These tests pin the contract: protected routes require a verified Clerk
 * token, a bare header is never enough, and the signed-out landing-page chat
 * keeps working.
 *
 * The header fallback is gated on an explicit ALLOW_INSECURE_HEADER_AUTH flag
 * rather than on NODE_ENV, because the deployed API runs with
 * NODE_ENV="development" — a NODE_ENV check would leave the bypass open in
 * production. These tests assert the flag defaults to off.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { app } from "../../app";

// Some routes reach out to the TED API. These tests are about auth, not about
// TED being up, so outbound calls are stubbed — otherwise the suite makes live
// network requests and fails on latency rather than on behaviour.
const realFetch = globalThis.fetch;

beforeAll(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(JSON.stringify({ notices: [], totalNoticeCount: 0 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )
  );
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

const ORIGINAL_FLAG = process.env.ALLOW_INSECURE_HEADER_AUTH;

beforeAll(() => {
  delete process.env.ALLOW_INSECURE_HEADER_AUTH;
});

afterAll(() => {
  if (ORIGINAL_FLAG === undefined) delete process.env.ALLOW_INSECURE_HEADER_AUTH;
  else process.env.ALLOW_INSECURE_HEADER_AUTH = ORIGINAL_FLAG;
});

/**
 * Route groups that require a verified session.
 *
 * /tenders, /analytics and /compare are deliberately absent: they are open to
 * guests so the product can demonstrate itself before signup. Their security
 * property is covered in guest-access.test.ts — a guest reaches them but is
 * never granted an identity.
 */
const PROTECTED = [
  "/company",
  "/preferences",
  "/export/csv",
  "/organizations",
  "/notifications",
  "/saved-searches",
  "/bids",
  "/billing",
];

/** Read-only routes a visitor without an account may reach. */
const GUEST_READABLE = ["/tenders", "/analytics/kpis", "/compare"];

describe("protected routes", () => {
  it.each(PROTECTED)("%s rejects an unauthenticated request", async (path) => {
    const res = await app.request(path);
    expect(res.status).toBe(401);
  });

  it.each(PROTECTED)(
    "%s rejects a bare x-user-id header with no token",
    async (path) => {
      const res = await app.request(path, {
        headers: { "x-user-id": "user_someone_elses_id" },
      });
      expect(res.status).toBe(401);
    }
  );

  it("rejects a malformed bearer token", async () => {
    const res = await app.request("/bids", {
      headers: { Authorization: "Bearer not-a-real-jwt" },
    });
    expect(res.status).toBe(401);
  });
});

describe("public endpoints", () => {
  it.each(["/", "/health"])("%s stays reachable", async (path) => {
    const res = await app.request(path);
    expect(res.status).toBe(200);
  });

  // The marketing page runs the chat for signed-out visitors.
  it("/agent does not hard-401 signed-out callers", async () => {
    const res = await app.request("/agent/health");
    expect(res.status).not.toBe(401);
  });

  it("/suggestions does not hard-401 signed-out callers", async () => {
    const res = await app.request("/suggestions");
    expect(res.status).not.toBe(401);
  });

  it.each(GUEST_READABLE)("%s is reachable without an account", async (path) => {
    const res = await app.request(path);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  it("does not adopt an unverified x-user-id on the public agent route", async () => {
    // Reaching the route is fine; adopting the header as identity is not.
    const res = await app.request("/suggestions?type=recent", {
      headers: { "x-user-id": "user_victim" },
    });
    expect(res.status).toBe(200);

    // `recent` reads per-user history, so a spoofed header must yield nothing.
    const body = await res.json();
    expect(body.suggestions).toEqual([]);
  });
});

describe("admin surfaces", () => {
  it("/getAdminMetrics rejects the published admin UID sent as a header", async () => {
    // This UID ships in the browser bundle via NEXT_PUBLIC_ADMIN_UID, so it
    // must not be usable as a credential on its own.
    const res = await app.request("/getAdminMetrics", {
      headers: { "x-user-id": "user_395HbXA1E11WhNTHbx3H0MJaC6C" },
    });
    expect(res.status).toBe(401);
  });

  it("/ingestion/run rejects an unauthenticated request", async () => {
    const res = await app.request("/ingestion/run", { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("/ingestion/run rejects the admin UID sent as a header", async () => {
    const res = await app.request("/ingestion/run", {
      method: "POST",
      headers: { "x-user-id": "user_395HbXA1E11WhNTHbx3H0MJaC6C" },
    });
    expect(res.status).toBe(401);
  });

  it("/ingestion/run rejects a wrong service token", async () => {
    process.env.CRON_SECRET = "correct-horse-battery-staple";
    const res = await app.request("/ingestion/jobs", {
      headers: { Authorization: "Bearer wrong-secret" },
    });
    expect(res.status).toBe(401);
    delete process.env.CRON_SECRET;
  });

  it("/ingestion accepts the scheduler's service token", async () => {
    process.env.CRON_SECRET = "correct-horse-battery-staple";
    const res = await app.request("/ingestion/jobs", {
      headers: { Authorization: "Bearer correct-horse-battery-staple" },
    });
    // Past auth: whatever happens next is the DB's business, not 401/403.
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
    delete process.env.CRON_SECRET;
  });
});

describe("webhooks", () => {
  // Webhooks carry no Clerk session; they are signature-verified instead and
  // must not be behind authMiddleware.
  it("/webhooks/clerk is not gated by session auth", async () => {
    const res = await app.request("/webhooks/clerk", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).not.toBe(401);
  });
});

describe("header-auth bypass is fail-closed", () => {
  // The deployed API sets NODE_ENV="development" in its Vercel project, so a
  // `NODE_ENV !== "production"` guard would read as development in production
  // and leave the bypass open. Reproduce that exact condition.
  it("stays disabled under NODE_ENV=development with the flag unset", async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    delete process.env.ALLOW_INSECURE_HEADER_AUTH;

    const res = await app.request("/bids", {
      headers: { "x-user-id": "user_victim" },
    });

    expect(res.status).toBe(401);
    process.env.NODE_ENV = prev;
  });

  it("stays disabled when the flag is set to anything but the literal 'true'", async () => {
    for (const value of ["1", "yes", "TRUE", ""]) {
      process.env.ALLOW_INSECURE_HEADER_AUTH = value;
      const res = await app.request("/bids", {
        headers: { "x-user-id": "user_victim" },
      });
      expect(res.status).toBe(401);
    }
    delete process.env.ALLOW_INSECURE_HEADER_AUTH;
  });

  it("opens only for local development when explicitly enabled", async () => {
    process.env.ALLOW_INSECURE_HEADER_AUTH = "true";

    const res = await app.request("/bids", {
      headers: { "x-user-id": "user_dev" },
    });

    // Past auth now; the DB is what fails in tests, not the gate.
    expect(res.status).not.toBe(401);
    delete process.env.ALLOW_INSECURE_HEADER_AUTH;
  });
});
