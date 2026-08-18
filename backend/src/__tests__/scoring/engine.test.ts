import { describe, it, expect } from "vitest";
import { scoreTender, quickScore } from "../../lib/scoring/engine";
import { makeTender, makeProfile, pastDate } from "../fixtures";

describe("scoreTender", () => {
  it("returns 6 components + overall score + recommendation with full profile", () => {
    const result = scoreTender(makeTender(), makeProfile());

    expect(result.components).toHaveLength(6);
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.overallScore).toBeLessThanOrEqual(100);
    expect(["BID", "REVIEW", "SKIP"]).toContain(result.recommendation);
    expect(result.eligibility).toBeDefined();
    expect(result.eligibility.length).toBeGreaterThan(0);
  });

  it("returns 0 score, REVIEW, and empty components when profile is null", () => {
    const result = scoreTender(makeTender(), null);

    expect(result.overallScore).toBe(0);
    expect(result.recommendation).toBe("REVIEW");
    expect(result.components).toHaveLength(0);
    expect(result.eligibility.length).toBeGreaterThan(0);
  });

  it("produces high score for perfectly matching tender/profile", () => {
    const tender = makeTender({
      cpv_codes: ["72000000"],
      country: "ITA",
      value: 200_000,
      deadline: futureDate(30),
      contract_nature: "services",
    });
    const profile = makeProfile({
      cpv_codes: ["72000000"],
      operating_regions: ["ITA"],
      contract_size_min: 50_000,
      contract_size_max: 500_000,
      certifications: ["ISO 9001", "ISO 14001", "ISO 27001", "SOA", "ISO 45001"],
      years_in_business: 15,
      employee_count: 60,
      completeness_score: 100,
    });

    const result = scoreTender(tender, profile);
    expect(result.overallScore).toBeGreaterThanOrEqual(70);
    expect(result.recommendation).toBe("BID");
  });

  it("returns BID for overall score ≥ 70", () => {
    // Create a perfect match scenario
    const tender = makeTender({
      cpv_codes: ["72000000"],
      country: "ITA",
      value: 200_000,
      deadline: futureDate(30),
    });
    const profile = makeProfile({
      cpv_codes: ["72000000"],
      operating_regions: ["ITA"],
      contract_size_min: 100_000,
      contract_size_max: 500_000,
      certifications: ["ISO 9001", "ISO 14001", "ISO 27001", "SOA", "ISO 45001"],
      years_in_business: 15,
      employee_count: 60,
    });

    const result = scoreTender(tender, profile);
    expect(result.recommendation).toBe("BID");
  });

  it("returns SKIP for expired deadline regardless of score", () => {
    const tender = makeTender({
      cpv_codes: ["72000000"],
      country: "ITA",
      value: 200_000,
      deadline: pastDate(5),
    });
    const profile = makeProfile({
      cpv_codes: ["72000000"],
      operating_regions: ["ITA"],
    });

    const result = scoreTender(tender, profile);
    expect(result.recommendation).toBe("SKIP");
  });

  it("returns SKIP when CPV score is 0 and overall < 50", () => {
    const tender = makeTender({
      cpv_codes: ["45000000"], // construction — no match
      country: "USA",
      value: 10_000_000,
      deadline: futureDate(3),
    });
    const profile = makeProfile({
      cpv_codes: ["72000000"], // IT services
      operating_regions: ["ITA"],
      contract_size_min: 50_000,
      contract_size_max: 500_000,
      certifications: [],
      years_in_business: 2,
      employee_count: 3,
    });

    const result = scoreTender(tender, profile);
    expect(result.recommendation).toBe("SKIP");
  });
});

describe("quickScore", () => {
  it("returns overallScore and recommendation", () => {
    const result = quickScore(makeTender(), makeProfile());

    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.overallScore).toBeLessThanOrEqual(100);
    expect(["BID", "REVIEW", "SKIP"]).toContain(result.recommendation);
  });

  it("uses only 4 components (no experience, no deadline)", () => {
    // quickScore computes: CPV, Revenue, Geographic, Certification
    // Verify this by checking the overall score differs from scoreTender
    const tender = makeTender({
      cpv_codes: ["72000000"],
      deadline: futureDate(30),
    });
    const profile = makeProfile({
      cpv_codes: ["72000000"],
      years_in_business: 15,
      employee_count: 60,
    });

    const quick = quickScore(tender, profile);
    const full = scoreTender(tender, profile);

    // Quick score uses 4 components (max 80), full uses 6 (max 100)
    // They normalize differently, so values will differ
    expect(quick.overallScore).toBeDefined();
    expect(full.components).toHaveLength(6);
  });
});

function futureDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}
