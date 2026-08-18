/**
 * Migration 006 — usage limits, executed against real Postgres
 *
 * The quota and rate-limit guarantees live in SQL, not TypeScript, so mocking
 * the RPC proves nothing about them. These tests run the migration file
 * verbatim in PGlite (Postgres compiled to WASM, in-process) and exercise the
 * functions directly.
 *
 * Scope: this verifies the SQL is valid and that the ON CONFLICT / RETURNING
 * logic behaves as designed at the limit boundaries. PGlite is single
 * connection, so it cannot reproduce two sessions racing for the last unit —
 * that property follows from the operations being single statements, and would
 * need a multi-connection Postgres to demonstrate.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

let db: PGlite;

const ORG = "11111111-1111-1111-1111-111111111111";
const OTHER_ORG = "22222222-2222-2222-2222-222222222222";

/** Call consume_daily_quota and return the single result row. */
async function consumeQuota(org: string, metric: string, limit: number) {
  const res = await db.query<{ allowed: boolean; used: number }>(
    "SELECT * FROM consume_daily_quota($1, $2, $3)",
    [org, metric, limit]
  );
  return res.rows[0];
}

/** Call consume_rate_limit_token and return the single result row. */
async function consumeToken(key: string, limit: number, windowSeconds: number) {
  const res = await db.query<{
    allowed: boolean;
    remaining: number;
    retry_after: number;
  }>("SELECT * FROM consume_rate_limit_token($1, $2, $3)", [
    key,
    limit,
    windowSeconds,
  ]);
  return res.rows[0];
}

beforeAll(async () => {
  db = new PGlite();

  // Minimal FK target; the real table lives in migration 001.
  await db.exec(`
    CREATE TABLE organizations (
      id UUID PRIMARY KEY,
      name TEXT NOT NULL
    );
    INSERT INTO organizations (id, name) VALUES
      ('${ORG}', 'Acme SRL'),
      ('${OTHER_ORG}', 'Beta SPA');
  `);

  // Run the migration exactly as it will run against Supabase.
  const migration = readFileSync(
    resolve(__dirname, "../../../../supabase/migrations/006_usage_limits.sql"),
    "utf8"
  );
  await db.exec(migration);
});

afterAll(async () => {
  await db?.close();
});

beforeEach(async () => {
  await db.exec("DELETE FROM usage_counters; DELETE FROM rate_limit_buckets;");
});

describe("migration applies", () => {
  it("creates both tables and all four functions", async () => {
    const tables = await db.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables
        WHERE tablename IN ('usage_counters', 'rate_limit_buckets')
        ORDER BY tablename`
    );
    expect(tables.rows.map((r) => r.tablename)).toEqual([
      "rate_limit_buckets",
      "usage_counters",
    ]);

    const fns = await db.query<{ proname: string }>(
      `SELECT proname FROM pg_proc
        WHERE proname IN ('consume_daily_quota', 'peek_daily_quota',
                          'consume_rate_limit_token', 'purge_usage_data')
        ORDER BY proname`
    );
    expect(fns.rows.map((r) => r.proname)).toEqual([
      "consume_daily_quota",
      "consume_rate_limit_token",
      "peek_daily_quota",
      "purge_usage_data",
    ]);
  });

  it("is idempotent enough to re-run", async () => {
    const migration = readFileSync(
      resolve(__dirname, "../../../../supabase/migrations/006_usage_limits.sql"),
      "utf8"
    );
    await expect(db.exec(migration)).resolves.toBeDefined();
  });
});

describe("consume_daily_quota", () => {
  it("allows exactly the plan limit and no more", async () => {
    const results = [];
    for (let i = 0; i < 7; i++) results.push(await consumeQuota(ORG, "search", 5));

    expect(results.map((r) => r.allowed)).toEqual([
      true, true, true, true, true, false, false,
    ]);
    expect(results.map((r) => r.used)).toEqual([1, 2, 3, 4, 5, 5, 5]);
  });

  it("does not increment once blocked", async () => {
    for (let i = 0; i < 5; i++) await consumeQuota(ORG, "search", 5);
    for (let i = 0; i < 10; i++) await consumeQuota(ORG, "search", 5);

    const peek = await db.query<{ peek_daily_quota: number }>(
      "SELECT peek_daily_quota($1, $2)",
      [ORG, "search"]
    );
    expect(peek.rows[0].peek_daily_quota).toBe(5);
  });

  it("blocks outright on a zero limit", async () => {
    // The conflict guard does not cover the first insert, so without an
    // explicit check the first request of the day would slip through.
    const first = await consumeQuota(ORG, "search", 0);

    expect(first.allowed).toBe(false);
    expect(first.used).toBe(0);

    const rows = await db.query("SELECT * FROM usage_counters");
    expect(rows.rows).toHaveLength(0);
  });

  it("counts but never blocks on a negative (unlimited) limit", async () => {
    const results = [];
    for (let i = 0; i < 50; i++) results.push(await consumeQuota(ORG, "search", -1));

    expect(results.every((r) => r.allowed)).toBe(true);
    expect(results.at(-1)!.used).toBe(50);
  });

  it("keeps organizations independent", async () => {
    for (let i = 0; i < 5; i++) await consumeQuota(ORG, "search", 5);

    const other = await consumeQuota(OTHER_ORG, "search", 5);
    expect(other.allowed).toBe(true);
    expect(other.used).toBe(1);
  });

  it("keeps metrics independent", async () => {
    for (let i = 0; i < 5; i++) await consumeQuota(ORG, "search", 5);

    const exported = await consumeQuota(ORG, "export", 5);
    expect(exported.allowed).toBe(true);
    expect(exported.used).toBe(1);
  });

  it("gives a fresh allowance on a new day", async () => {
    for (let i = 0; i < 5; i++) await consumeQuota(ORG, "search", 5);
    expect((await consumeQuota(ORG, "search", 5)).allowed).toBe(false);

    // Age today's row into yesterday; the function keys on CURRENT_DATE.
    await db.exec(
      `UPDATE usage_counters SET day = CURRENT_DATE - 1 WHERE organization_id = '${ORG}'`
    );

    const today = await consumeQuota(ORG, "search", 5);
    expect(today.allowed).toBe(true);
    expect(today.used).toBe(1);
  });

  it("does not overshoot when consumption is issued without awaiting in turn", async () => {
    const results = await Promise.all(
      Array.from({ length: 12 }, () => consumeQuota(ORG, "search", 5))
    );

    expect(results.filter((r) => r.allowed)).toHaveLength(5);
    expect(Math.max(...results.map((r) => r.used))).toBe(5);
  });
});

describe("peek_daily_quota", () => {
  it("reports zero before any usage", async () => {
    const res = await db.query<{ peek_daily_quota: number }>(
      "SELECT peek_daily_quota($1, $2)",
      [ORG, "search"]
    );
    expect(res.rows[0].peek_daily_quota).toBe(0);
  });

  it("reads without consuming", async () => {
    await consumeQuota(ORG, "search", 5);

    for (let i = 0; i < 3; i++) {
      await db.query("SELECT peek_daily_quota($1, $2)", [ORG, "search"]);
    }

    const after = await consumeQuota(ORG, "search", 5);
    expect(after.used).toBe(2);
  });
});

describe("consume_rate_limit_token", () => {
  it("allows a full burst then refuses", async () => {
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await consumeToken("k1", 3, 60));

    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false, false]);
  });

  it("reports a positive retry_after once empty", async () => {
    for (let i = 0; i < 3; i++) await consumeToken("k1", 3, 60);

    const blocked = await consumeToken("k1", 3, 60);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retry_after).toBeGreaterThan(0);
  });

  it("never reports negative remaining tokens", async () => {
    const results = [];
    for (let i = 0; i < 8; i++) results.push(await consumeToken("k1", 3, 60));

    expect(results.every((r) => r.remaining >= 0)).toBe(true);
  });

  it("refills over elapsed time", async () => {
    for (let i = 0; i < 3; i++) await consumeToken("k1", 3, 60);
    expect((await consumeToken("k1", 3, 60)).allowed).toBe(false);

    // Backdate the refill clock by a full window: the bucket should be full.
    await db.exec(
      `UPDATE rate_limit_buckets SET last_refill = NOW() - INTERVAL '60 seconds'
        WHERE bucket_key = 'k1'`
    );

    expect((await consumeToken("k1", 3, 60)).allowed).toBe(true);
  });

  it("never refills beyond the configured limit", async () => {
    await consumeToken("k1", 3, 60);
    await db.exec(
      `UPDATE rate_limit_buckets SET last_refill = NOW() - INTERVAL '1 hour'
        WHERE bucket_key = 'k1'`
    );

    const after = await consumeToken("k1", 3, 60);
    // Full bucket is 3; one token just spent leaves at most 2.
    expect(after.remaining).toBeLessThanOrEqual(2);
  });

  it("keeps buckets independent by key", async () => {
    for (let i = 0; i < 3; i++) await consumeToken("user-a", 3, 60);

    expect((await consumeToken("user-a", 3, 60)).allowed).toBe(false);
    expect((await consumeToken("user-b", 3, 60)).allowed).toBe(true);
  });

  it("refuses a non-positive limit", async () => {
    const res = await consumeToken("k1", 0, 60);
    expect(res.allowed).toBe(false);
  });
});

describe("purge_usage_data", () => {
  it("drops stale rows and keeps current ones", async () => {
    await consumeQuota(ORG, "search", 5);
    await consumeToken("k1", 3, 60);

    await db.exec(`
      INSERT INTO usage_counters (organization_id, metric, day, count)
        VALUES ('${ORG}', 'search', CURRENT_DATE - 200, 9);
      INSERT INTO rate_limit_buckets (bucket_key, tokens, last_refill)
        VALUES ('ancient', 3, NOW() - INTERVAL '3 days');
    `);

    await db.query("SELECT purge_usage_data()");

    const counters = await db.query("SELECT * FROM usage_counters");
    const buckets = await db.query("SELECT * FROM rate_limit_buckets");

    expect(counters.rows).toHaveLength(1);
    expect(buckets.rows).toHaveLength(1);
  });
});
