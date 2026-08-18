/**
 * analyze_eligibility tool
 *
 * This tool previously returned a hardcoded `{ eligibility: "ELIGIBLE",
 * score: 75 }` for every input, which the chat agent then narrated as if it
 * were a real assessment. These tests pin it to the deterministic scoring
 * engine so a fabricated score can never come back.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeTender, makeProfile } from "../fixtures";
import { scoreTender } from "../../lib/scoring";

const tender = makeTender();
const profile = makeProfile();

const getTenderById = vi.fn();
const getTenderByExternalId = vi.fn();
const getUserByClerkId = vi.fn();
const getCompanyProfile = vi.fn();
const getTenderScore = vi.fn();
const upsertTenderScore = vi.fn();

vi.mock("../../lib/db/tenders", () => ({
  getTenderById: (...a: unknown[]) => getTenderById(...a),
  getTenderByExternalId: (...a: unknown[]) => getTenderByExternalId(...a),
}));
vi.mock("../../lib/db/users", () => ({
  getUserByClerkId: (...a: unknown[]) => getUserByClerkId(...a),
}));
vi.mock("../../lib/db/company-profiles", () => ({
  getCompanyProfile: (...a: unknown[]) => getCompanyProfile(...a),
}));
vi.mock("../../lib/db/tender-scores", () => ({
  getTenderScore: (...a: unknown[]) => getTenderScore(...a),
  upsertTenderScore: (...a: unknown[]) => upsertTenderScore(...a),
}));
vi.mock("../../lib/pinecone", () => ({ pineconeService: { search: vi.fn() } }));

const { analyzeEligibilityTool } = await import("../../agents/tools/analysis");

const CONFIG = { configurable: { user_id: "user_abc" } };

/** Invoke the tool and parse its JSON string result. */
async function run(input: { tenderId: string }, config?: unknown) {
  const raw = await analyzeEligibilityTool.invoke(input, config as never);
  return JSON.parse(String(raw));
}

beforeEach(() => {
  vi.clearAllMocks();
  getTenderById.mockResolvedValue(tender);
  getTenderByExternalId.mockResolvedValue(null);
  getUserByClerkId.mockResolvedValue({ organization_id: "org-1" });
  getCompanyProfile.mockResolvedValue(profile);
  getTenderScore.mockResolvedValue(null);
  upsertTenderScore.mockResolvedValue(undefined);
});

describe("analyze_eligibility", () => {
  it("returns exactly what the scoring engine computes", async () => {
    const expected = scoreTender(tender, profile);
    const result = await run({ tenderId: tender.id }, CONFIG);

    expect(result.overallScore).toBe(expected.overallScore);
    expect(result.recommendation).toBe(expected.recommendation);
    expect(result.components).toHaveLength(6);
    expect(result.eligibility).toEqual(expected.eligibility);
    expect(result.cached).toBe(false);
  });

  it("does not return the old hardcoded 75 / ELIGIBLE placeholder", async () => {
    // A profile that shares nothing with the tender must not score like a match.
    getCompanyProfile.mockResolvedValue(
      makeProfile({
        cpv_codes: ["03000000"],
        operating_regions: ["FRA"],
        certifications: [],
      })
    );

    const result = await run({ tenderId: tender.id }, CONFIG);

    expect(result.eligibility).not.toBe("ELIGIBLE");
    expect(result.overallScore).not.toBe(75);
    expect(result.overallScore).toBe(
      scoreTender(
        tender,
        makeProfile({
          cpv_codes: ["03000000"],
          operating_regions: ["FRA"],
          certifications: [],
        })
      ).overallScore
    );
  });

  it("varies by tender instead of returning a constant", async () => {
    const a = await run({ tenderId: tender.id }, CONFIG);

    const mismatched = makeTender({
      cpv_codes: ["03000000"],
      country: "FRA",
      value: 50_000_000,
    });
    getTenderById.mockResolvedValue(mismatched);
    const b = await run({ tenderId: mismatched.id }, CONFIG);

    expect(a.overallScore).not.toBe(b.overallScore);
  });

  it("takes identity from config, not from the model", async () => {
    const result = await run({ tenderId: tender.id });

    expect(result.error).toBe("NOT_AUTHENTICATED");
    expect(getTenderById).not.toHaveBeenCalled();
  });

  it("refuses to score without a company profile", async () => {
    getCompanyProfile.mockResolvedValue(null);

    const result = await run({ tenderId: tender.id }, CONFIG);

    expect(result.error).toBe("PROFILE_INCOMPLETE");
    expect(result.overallScore).toBeUndefined();
  });

  it("reports a missing tender instead of guessing", async () => {
    getTenderById.mockResolvedValue(null);
    getTenderByExternalId.mockResolvedValue(null);

    const result = await run({ tenderId: "does-not-exist" }, CONFIG);

    expect(result.error).toBe("TENDER_NOT_FOUND");
    expect(result.overallScore).toBeUndefined();
  });

  it("serves a fresh cached score without recomputing", async () => {
    getTenderScore.mockResolvedValue({
      overall_score: 42,
      recommendation: "REVIEW",
      components: [],
      eligibility: [],
      computed_at: new Date().toISOString(),
    });

    const result = await run({ tenderId: tender.id }, CONFIG);

    expect(result.overallScore).toBe(42);
    expect(result.cached).toBe(true);
    expect(upsertTenderScore).not.toHaveBeenCalled();
  });

  it("recomputes and re-caches once the 24h TTL has expired", async () => {
    getTenderScore.mockResolvedValue({
      overall_score: 42,
      recommendation: "REVIEW",
      components: [],
      eligibility: [],
      computed_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
    });

    const result = await run({ tenderId: tender.id }, CONFIG);

    expect(result.cached).toBe(false);
    expect(result.overallScore).toBe(scoreTender(tender, profile).overallScore);
    expect(upsertTenderScore).toHaveBeenCalledOnce();
  });

  it("falls back to TED external id lookup", async () => {
    getTenderById.mockResolvedValue(null);
    getTenderByExternalId.mockResolvedValue(tender);

    const result = await run({ tenderId: "TED-2025-001" }, CONFIG);

    expect(getTenderByExternalId).toHaveBeenCalledWith("ted", "TED-2025-001");
    expect(result.overallScore).toBe(scoreTender(tender, profile).overallScore);
  });
});
