import { describe, it, expect } from "vitest";
import {
  scoreCpvMatch,
  scoreRevenueFit,
  scoreGeographicMatch,
  scoreCertificationMatch,
  scoreExperienceMatch,
  scoreDeadlineFeasibility,
} from "../../lib/scoring/components";
import { makeTender, makeProfile, pastDate } from "../fixtures";

// ============================================================================
// CPV MATCH (0-25)
// ============================================================================

describe("scoreCpvMatch", () => {
  it("returns 25 for exact CPV match", () => {
    const result = scoreCpvMatch(
      makeTender({ cpv_codes: ["72000000"] }),
      makeProfile({ cpv_codes: ["72000000"] })
    );
    expect(result.score).toBe(25);
    expect(result.maxScore).toBe(25);
  });

  it("returns 20 for class-level match (5-digit prefix)", () => {
    // Both share 5-digit prefix "72110" but differ in last 3 digits
    const result = scoreCpvMatch(
      makeTender({ cpv_codes: ["72110000"] }),
      makeProfile({ cpv_codes: ["72110100"] })
    );
    expect(result.score).toBe(20);
  });

  it("returns 13 for group-level match (3-digit prefix)", () => {
    const result = scoreCpvMatch(
      makeTender({ cpv_codes: ["72100000"] }),
      makeProfile({ cpv_codes: ["72200000"] })
    );
    // 3-digit prefix "721" vs "722" — no match at 3 digits
    // Actually "72" matches at 2-digit → division
    // Let me use proper 3-digit matching: "721" vs "721xx"
    const result2 = scoreCpvMatch(
      makeTender({ cpv_codes: ["72110000"] }),
      makeProfile({ cpv_codes: ["72120000"] })
    );
    // "72110" vs "72120" — no 5-digit match, "721" vs "721" — 3-digit match
    expect(result2.score).toBe(13); // Math.round(25 * 0.5)
  });

  it("returns 6 for division-level match (2-digit prefix)", () => {
    const result = scoreCpvMatch(
      makeTender({ cpv_codes: ["72000000"] }),
      makeProfile({ cpv_codes: ["73000000"] })
    );
    // "72" vs "73" — no 2-digit match either
    // Use codes that share 2-digit prefix
    const result2 = scoreCpvMatch(
      makeTender({ cpv_codes: ["72100000"] }),
      makeProfile({ cpv_codes: ["72900000"] })
    );
    // "72100" vs "72900" — no 5-digit, "721" vs "729" — no 3-digit, "72" vs "72" — 2-digit match
    expect(result2.score).toBe(6); // Math.round(25 * 0.25)
  });

  it("returns 0 when no CPV overlap", () => {
    const result = scoreCpvMatch(
      makeTender({ cpv_codes: ["72000000"] }),
      makeProfile({ cpv_codes: ["45000000"] })
    );
    expect(result.score).toBe(0);
  });

  it("returns 0 when tender has no CPV codes", () => {
    const result = scoreCpvMatch(
      makeTender({ cpv_codes: [] }),
      makeProfile({ cpv_codes: ["72000000"] })
    );
    expect(result.score).toBe(0);
    expect(result.explanation).toContain("Nessun codice CPV specificato");
  });

  it("returns 0 when profile has no CPV codes", () => {
    const result = scoreCpvMatch(
      makeTender({ cpv_codes: ["72000000"] }),
      makeProfile({ cpv_codes: [] })
    );
    expect(result.score).toBe(0);
    expect(result.explanation).toContain("Aggiungi i codici CPV");
  });
});

// ============================================================================
// REVENUE FIT (0-20)
// ============================================================================

describe("scoreRevenueFit", () => {
  it("returns 20 when tender value is within contract size range", () => {
    const result = scoreRevenueFit(
      makeTender({ value: 200_000 }),
      makeProfile({ contract_size_min: 50_000, contract_size_max: 500_000 })
    );
    expect(result.score).toBe(20);
  });

  it("returns 12 when slightly over contract size range", () => {
    const result = scoreRevenueFit(
      makeTender({ value: 600_000 }),
      makeProfile({ contract_size_min: 50_000, contract_size_max: 500_000 })
    );
    // 600k <= 500k * 1.5 = 750k → slightly over
    expect(result.score).toBe(12); // Math.round(20 * 0.6)
  });

  it("returns 4 when far out of contract size range", () => {
    const result = scoreRevenueFit(
      makeTender({ value: 5_000_000 }),
      makeProfile({ contract_size_min: 50_000, contract_size_max: 500_000 })
    );
    // 5M > 500k * 1.5 = 750k → out of range
    expect(result.score).toBe(4); // Math.round(20 * 0.2)
  });

  it("returns 10 when tender has no value", () => {
    const result = scoreRevenueFit(
      makeTender({ value: null }),
      makeProfile()
    );
    expect(result.score).toBe(10); // Math.round(20 * 0.5)
  });

  it("returns 20 when revenue ratio ≤ 0.3", () => {
    const result = scoreRevenueFit(
      makeTender({ value: 300_000 }),
      makeProfile({
        annual_revenue: 2_000_000,
        contract_size_min: null,
        contract_size_max: null,
      })
    );
    // ratio = 300k / 2M = 0.15 ≤ 0.3
    expect(result.score).toBe(20);
  });

  it("returns 14 when revenue ratio ≤ 0.5", () => {
    const result = scoreRevenueFit(
      makeTender({ value: 800_000 }),
      makeProfile({
        annual_revenue: 2_000_000,
        contract_size_min: null,
        contract_size_max: null,
      })
    );
    // ratio = 800k / 2M = 0.4 ≤ 0.5
    expect(result.score).toBe(14); // Math.round(20 * 0.7)
  });

  it("returns 6 when revenue ratio > 0.5", () => {
    const result = scoreRevenueFit(
      makeTender({ value: 1_500_000 }),
      makeProfile({
        annual_revenue: 2_000_000,
        contract_size_min: null,
        contract_size_max: null,
      })
    );
    // ratio = 1.5M / 2M = 0.75 > 0.5
    expect(result.score).toBe(6); // Math.round(20 * 0.3)
  });

  it("returns 8 when no revenue and no contract range", () => {
    const result = scoreRevenueFit(
      makeTender({ value: 500_000 }),
      makeProfile({
        annual_revenue: null,
        contract_size_min: null,
        contract_size_max: null,
      })
    );
    expect(result.score).toBe(8); // Math.round(20 * 0.4)
  });
});

// ============================================================================
// GEOGRAPHIC MATCH (0-15)
// ============================================================================

describe("scoreGeographicMatch", () => {
  it("returns 15 for direct country match", () => {
    const result = scoreGeographicMatch(
      makeTender({ country: "ITA" }),
      makeProfile({ operating_regions: ["ITA"] })
    );
    expect(result.score).toBe(15);
  });

  it("returns 8 when both are EU countries", () => {
    const result = scoreGeographicMatch(
      makeTender({ country: "DEU" }),
      makeProfile({ operating_regions: ["ITA"] })
    );
    // Both EU, no direct match
    expect(result.score).toBe(8); // Math.round(15 * 0.5)
  });

  it("returns 3 for non-EU country with no match", () => {
    const result = scoreGeographicMatch(
      makeTender({ country: "USA" }),
      makeProfile({ operating_regions: ["ITA"] })
    );
    expect(result.score).toBe(3); // Math.round(15 * 0.2)
  });

  it("returns 8 when tender has no country", () => {
    const result = scoreGeographicMatch(
      makeTender({ country: null }),
      makeProfile({ operating_regions: ["ITA"] })
    );
    expect(result.score).toBe(8); // Math.round(15 * 0.5)
  });

  it("returns 0 when profile has no operating regions", () => {
    const result = scoreGeographicMatch(
      makeTender({ country: "ITA" }),
      makeProfile({ operating_regions: [] })
    );
    expect(result.score).toBe(0);
  });

  it("is case-insensitive for country matching", () => {
    const result = scoreGeographicMatch(
      makeTender({ country: "ita" }),
      makeProfile({ operating_regions: ["ITA"] })
    );
    expect(result.score).toBe(15);
  });
});

// ============================================================================
// CERTIFICATION MATCH (0-20)
// ============================================================================

describe("scoreCertificationMatch", () => {
  it("scores ISO 9001 at 5 points", () => {
    const result = scoreCertificationMatch(
      makeTender(),
      makeProfile({ certifications: ["ISO 9001"] })
    );
    // 5 (ISO 9001) = 5
    expect(result.score).toBeGreaterThanOrEqual(5);
  });

  it("scores high with all major certifications", () => {
    const result = scoreCertificationMatch(
      makeTender(),
      makeProfile({
        certifications: [
          "ISO 9001",
          "ISO 14001",
          "ISO 27001",
          "SOA",
          "ISO 45001",
        ],
      })
    );
    // 5 + 3 + 4 + 5 + 3 = 20
    expect(result.score).toBe(20);
  });

  it("returns 3 when no certifications", () => {
    const result = scoreCertificationMatch(
      makeTender(),
      makeProfile({ certifications: [] })
    );
    expect(result.score).toBe(3); // Math.round(20 * 0.15)
  });

  it("includes SOA in explanation for works contracts", () => {
    const result = scoreCertificationMatch(
      makeTender({ contract_nature: "works" }),
      makeProfile({ certifications: ["ISO 9001"] })
    );
    expect(result.explanation).toContain("SOA");
  });

  it("caps score at maxScore with many extra certs", () => {
    const result = scoreCertificationMatch(
      makeTender(),
      makeProfile({
        certifications: [
          "ISO 9001",
          "ISO 14001",
          "ISO 27001",
          "SOA",
          "ISO 45001",
          "Extra 1",
          "Extra 2",
          "Extra 3",
          "Extra 4",
        ],
      })
    );
    expect(result.score).toBeLessThanOrEqual(20);
  });
});

// ============================================================================
// EXPERIENCE MATCH (0-10)
// ============================================================================

describe("scoreExperienceMatch", () => {
  it("returns 10 for 10+ years and 50+ employees", () => {
    const result = scoreExperienceMatch(
      makeTender(),
      makeProfile({ years_in_business: 10, employee_count: 50 })
    );
    expect(result.score).toBe(10);
  });

  it("returns 6 for 5 years and 10 employees", () => {
    const result = scoreExperienceMatch(
      makeTender(),
      makeProfile({ years_in_business: 5, employee_count: 10 })
    );
    // 3 (5yr) + 3 (10emp) = 6
    expect(result.score).toBe(6);
  });

  it("returns 2 for 2 years and 5 employees", () => {
    const result = scoreExperienceMatch(
      makeTender(),
      makeProfile({ years_in_business: 2, employee_count: 5 })
    );
    // 1 (2yr) + 1 (emp>0) = 2
    expect(result.score).toBe(2);
  });

  it("returns 0 when no experience data", () => {
    const result = scoreExperienceMatch(
      makeTender(),
      makeProfile({ years_in_business: null, employee_count: null })
    );
    expect(result.score).toBe(0);
    expect(result.explanation).toContain("Aggiungi");
  });
});

// ============================================================================
// DEADLINE FEASIBILITY (0-10)
// ============================================================================

describe("scoreDeadlineFeasibility", () => {
  it("returns 10 when >14 days remaining", () => {
    const result = scoreDeadlineFeasibility(
      makeTender({ deadline: futureDate(30) }),
      makeProfile()
    );
    expect(result.score).toBe(10);
  });

  it("returns 7 when 7-14 days remaining", () => {
    const result = scoreDeadlineFeasibility(
      makeTender({ deadline: futureDate(10) }),
      makeProfile()
    );
    expect(result.score).toBe(7);
  });

  it("returns 4 when 4-7 days remaining", () => {
    const result = scoreDeadlineFeasibility(
      makeTender({ deadline: futureDate(5) }),
      makeProfile()
    );
    expect(result.score).toBe(4);
  });

  it("returns 1 when ≤3 days remaining", () => {
    const result = scoreDeadlineFeasibility(
      makeTender({ deadline: futureDate(2) }),
      makeProfile()
    );
    expect(result.score).toBe(1);
  });

  it("returns 0 when deadline has passed", () => {
    const result = scoreDeadlineFeasibility(
      makeTender({ deadline: pastDate(5) }),
      makeProfile()
    );
    expect(result.score).toBe(0);
    expect(result.explanation).toContain("superata");
  });

  it("returns 5 when no deadline", () => {
    const result = scoreDeadlineFeasibility(
      makeTender({ deadline: null }),
      makeProfile()
    );
    expect(result.score).toBe(5); // Math.round(10 * 0.5)
  });
});

// ============================================================================
// HELPERS
// ============================================================================

function futureDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}
