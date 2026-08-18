/**
 * rank_tenders tool
 *
 * This tool used to carry its own weighted scorer: exact-match-only CPV
 * comparison, a hardcoded "competition level" of 60, and a value score that
 * rose with contract size regardless of whether the company could deliver it.
 * It also took the tender list as JSON from the model, routing every tender
 * through the context window in order to sort an array.
 *
 * These tests pin it to the deterministic engine and to config-supplied
 * identity.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeTender, makeProfile } from "../fixtures";
import { scoreTender } from "../../lib/scoring";

const getTendersByIds = vi.fn();
const getUserByClerkId = vi.fn();
const getCompanyProfile = vi.fn();
const addFavorite = vi.fn();

vi.mock("../../lib/db/tenders", () => ({
  getTendersByIds: (...a: unknown[]) => getTendersByIds(...a),
}));
vi.mock("../../lib/db/users", () => ({
  getUserByClerkId: (...a: unknown[]) => getUserByClerkId(...a),
}));
vi.mock("../../lib/db/company-profiles", () => ({
  getCompanyProfile: (...a: unknown[]) => getCompanyProfile(...a),
}));
vi.mock("../../lib/db/favorites", () => ({
  addFavorite: (...a: unknown[]) => addFavorite(...a),
}));

const { rankTendersTool, createShortlistTool } = await import(
  "../../agents/tools/ranking"
);

const CONFIG = { configurable: { user_id: "user_abc" } };
const profile = makeProfile();

/** A strong match and a poor one for the default profile. */
const goodFit = makeTender({ id: "good", title: "Servizi IT" });
const poorFit = makeTender({
  id: "poor",
  title: "Lavori stradali",
  cpv_codes: ["45200000"],
  country: "FRA",
  value: 90_000_000,
});

/** Invoke a tool and parse its JSON string result. */
async function run(
  tool: { invoke: (input: never, config?: never) => Promise<unknown> },
  input: unknown,
  config?: unknown
) {
  return JSON.parse(String(await tool.invoke(input as never, config as never)));
}

beforeEach(() => {
  vi.clearAllMocks();
  getUserByClerkId.mockResolvedValue({ id: "db-user-1", organization_id: "org-1" });
  getCompanyProfile.mockResolvedValue(profile);
  getTendersByIds.mockResolvedValue([goodFit, poorFit]);
  addFavorite.mockResolvedValue({});
});

describe("rank_tenders", () => {
  it("scores with the deterministic engine", async () => {
    const res = await run(rankTendersTool, { tenderIds: ["good", "poor"] }, CONFIG);

    const expected = new Map(
      [goodFit, poorFit].map((t) => [t.id, scoreTender(t, profile).overallScore])
    );
    for (const row of res.rankedTenders) {
      expect(row.score).toBe(expected.get(row.tenderId));
    }
  });

  it("orders by score and assigns ranks", async () => {
    const res = await run(rankTendersTool, { tenderIds: ["poor", "good"] }, CONFIG);

    expect(res.rankedTenders[0].tenderId).toBe("good");
    expect(res.rankedTenders[0].rank).toBe(1);
    expect(res.rankedTenders[1].rank).toBe(2);
    expect(res.rankedTenders[0].score).toBeGreaterThan(res.rankedTenders[1].score);
  });

  it("returns a real BID/REVIEW/SKIP recommendation per tender", async () => {
    const res = await run(rankTendersTool, { tenderIds: ["good", "poor"] }, CONFIG);

    for (const row of res.rankedTenders) {
      expect(["BID", "REVIEW", "SKIP"]).toContain(row.recommendation);
    }
  });

  it("never reports a hardcoded competition factor", async () => {
    const res = await run(rankTendersTool, { tenderIds: ["good"] }, CONFIG);
    const serialised = JSON.stringify(res);

    expect(serialised).not.toContain("Competition Level");
    expect(res.rankedTenders[0].factors).toBeUndefined();
  });

  it("explains rankings with engine explanations, not invented prose", async () => {
    const res = await run(rankTendersTool, { tenderIds: ["poor"] }, CONFIG);
    const row = res.rankedTenders[0];

    const explanations = scoreTender(poorFit, profile).components.map(
      (c) => c.explanation
    );
    for (const concern of row.concerns) {
      expect(explanations).toContain(concern);
    }
  });

  it("loads tenders itself rather than accepting them from the model", async () => {
    await run(rankTendersTool, { tenderIds: ["good", "poor"] }, CONFIG);

    expect(getTendersByIds).toHaveBeenCalledWith(["good", "poor"]);
  });

  it("takes identity from config", async () => {
    const res = await run(rankTendersTool, { tenderIds: ["good"] });

    expect(res.error).toBe("NOT_AUTHENTICATED");
    expect(getTendersByIds).not.toHaveBeenCalled();
  });

  it("refuses to rank without a company profile", async () => {
    getCompanyProfile.mockResolvedValue(null);

    const res = await run(rankTendersTool, { tenderIds: ["good"] }, CONFIG);

    expect(res.error).toBe("PROFILE_INCOMPLETE");
    expect(res.rankedTenders).toEqual([]);
  });

  it("reports unknown tenders instead of inventing them", async () => {
    getTendersByIds.mockResolvedValue([goodFit]);

    const res = await run(
      rankTendersTool,
      { tenderIds: ["good", "missing-1", "missing-2"] },
      CONFIG
    );

    expect(res.count).toBe(1);
    expect(res.notFound).toBe(2);
  });
});

describe("create_shortlist", () => {
  it("saves favourites concurrently, not one await at a time", async () => {
    let inFlight = 0;
    let peak = 0;
    addFavorite.mockImplementation(async () => {
      peak = Math.max(peak, ++inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return {};
    });

    await run(createShortlistTool, { tenderIds: ["good", "poor"] }, CONFIG);

    expect(peak).toBeGreaterThan(1);
  });

  it("respects maxItems", async () => {
    getTendersByIds.mockResolvedValue([goodFit]);

    await run(createShortlistTool, { tenderIds: ["good", "poor"], maxItems: 1 }, CONFIG);

    expect(getTendersByIds).toHaveBeenCalledWith(["good"]);
  });

  it("reports partial failures rather than failing the whole call", async () => {
    addFavorite
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("duplicate"));

    const res = await run(createShortlistTool, { tenderIds: ["good", "poor"] }, CONFIG);

    expect(res.count).toBe(2);
    expect(res.saved).toBe(1);
    expect(res.failedToSave).toBe(1);
  });

  it("takes identity from config", async () => {
    const res = await run(createShortlistTool, { tenderIds: ["good"] });

    expect(res.error).toBe("NOT_AUTHENTICATED");
    expect(addFavorite).not.toHaveBeenCalled();
  });
});
