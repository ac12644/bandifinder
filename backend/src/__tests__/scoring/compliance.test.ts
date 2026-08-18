import { describe, it, expect } from "vitest";
import { checkEligibility } from "../../lib/scoring/compliance";
import { makeTender, makeProfile, pastDate } from "../fixtures";

describe("checkEligibility", () => {
  it("returns single 'profile incomplete' item when profile is null", () => {
    const items = checkEligibility(makeTender(), null);

    expect(items).toHaveLength(1);
    expect(items[0].requirement).toBe("Profilo aziendale completo");
    expect(items[0].met).toBe(false);
  });

  // --- CPV ---

  it("marks CPV as met when there is a 5-digit prefix match", () => {
    const items = checkEligibility(
      makeTender({ cpv_codes: ["72000000"] }),
      makeProfile({ cpv_codes: ["72000000"] })
    );
    const cpv = items.find((i) => i.requirement === "Codici CPV corrispondenti");
    expect(cpv).toBeDefined();
    expect(cpv!.met).toBe(true);
  });

  it("marks CPV as unmet when no match", () => {
    const items = checkEligibility(
      makeTender({ cpv_codes: ["72000000"] }),
      makeProfile({ cpv_codes: ["45000000"] })
    );
    const cpv = items.find((i) => i.requirement === "Codici CPV corrispondenti");
    expect(cpv).toBeDefined();
    expect(cpv!.met).toBe(false);
  });

  // --- Geographic ---

  it("marks geography as met for matching country", () => {
    const items = checkEligibility(
      makeTender({ country: "ITA" }),
      makeProfile({ operating_regions: ["ITA"] })
    );
    const geo = items.find((i) => i.requirement.includes("Operatività"));
    expect(geo).toBeDefined();
    expect(geo!.met).toBe(true);
  });

  it("marks geography as unmet for different country", () => {
    const items = checkEligibility(
      makeTender({ country: "DEU" }),
      makeProfile({ operating_regions: ["ITA"] })
    );
    const geo = items.find((i) => i.requirement.includes("Operatività"));
    expect(geo).toBeDefined();
    expect(geo!.met).toBe(false);
  });

  it("marks geography as unmet when no operating regions", () => {
    const items = checkEligibility(
      makeTender({ country: "ITA" }),
      makeProfile({ operating_regions: [] })
    );
    const geo = items.find((i) => i.requirement.includes("Operatività"));
    expect(geo).toBeDefined();
    expect(geo!.met).toBe(false);
  });

  // --- Contract value ---

  it("marks value as met when within contract size range", () => {
    const items = checkEligibility(
      makeTender({ value: 200_000 }),
      makeProfile({ contract_size_min: 50_000, contract_size_max: 500_000 })
    );
    const val = items.find((i) => i.requirement.includes("range contrattuale"));
    expect(val).toBeDefined();
    expect(val!.met).toBe(true);
  });

  it("marks value as unmet when outside contract size range", () => {
    const items = checkEligibility(
      makeTender({ value: 2_000_000 }),
      makeProfile({ contract_size_min: 50_000, contract_size_max: 500_000 })
    );
    const val = items.find((i) => i.requirement.includes("range contrattuale"));
    expect(val).toBeDefined();
    expect(val!.met).toBe(false);
  });

  it("marks capacity as met when value ≤ 50% of revenue (no range set)", () => {
    const items = checkEligibility(
      makeTender({ value: 500_000 }),
      makeProfile({
        annual_revenue: 2_000_000,
        contract_size_min: null,
        contract_size_max: null,
      })
    );
    const cap = items.find((i) => i.requirement.includes("Capacità economica"));
    expect(cap).toBeDefined();
    expect(cap!.met).toBe(true);
  });

  // --- ISO 9001 ---

  it("marks ISO 9001 as met when present", () => {
    const items = checkEligibility(
      makeTender(),
      makeProfile({ certifications: ["ISO 9001"] })
    );
    const iso = items.find((i) => i.requirement.includes("ISO 9001"));
    expect(iso).toBeDefined();
    expect(iso!.met).toBe(true);
  });

  it("marks ISO 9001 as unmet when missing", () => {
    const items = checkEligibility(
      makeTender(),
      makeProfile({ certifications: [] })
    );
    const iso = items.find((i) => i.requirement.includes("ISO 9001"));
    expect(iso).toBeDefined();
    expect(iso!.met).toBe(false);
  });

  // --- SOA ---

  it("checks SOA for Italian works contracts > €150k", () => {
    const items = checkEligibility(
      makeTender({
        country: "ITA",
        value: 200_000,
        contract_nature: "works",
      }),
      makeProfile({ certifications: ["SOA"] })
    );
    const soa = items.find((i) => i.requirement.includes("SOA"));
    expect(soa).toBeDefined();
    expect(soa!.met).toBe(true);
  });

  it("marks SOA as unmet when required but missing", () => {
    const items = checkEligibility(
      makeTender({
        country: "ITA",
        value: 200_000,
        contract_nature: "works",
      }),
      makeProfile({ certifications: ["ISO 9001"] })
    );
    const soa = items.find((i) => i.requirement.includes("SOA"));
    expect(soa).toBeDefined();
    expect(soa!.met).toBe(false);
  });

  // --- SME ---

  it("marks SME eligibility as met for small company", () => {
    const items = checkEligibility(
      makeTender({ sme_participation: true }),
      makeProfile({ employee_count: 50, annual_revenue: 5_000_000 })
    );
    const sme = items.find((i) => i.requirement.includes("PMI"));
    expect(sme).toBeDefined();
    expect(sme!.met).toBe(true);
  });

  it("does not check SME when tender has sme_participation=false", () => {
    const items = checkEligibility(
      makeTender({ sme_participation: false }),
      makeProfile({ employee_count: 500 })
    );
    const sme = items.find((i) => i.requirement.includes("PMI"));
    expect(sme).toBeUndefined();
  });

  // --- Deadline ---

  it("marks deadline as met when not passed", () => {
    const items = checkEligibility(
      makeTender({ deadline: futureDate(10) }),
      makeProfile()
    );
    const dl = items.find((i) => i.requirement.includes("Scadenza non superata"));
    expect(dl).toBeDefined();
    expect(dl!.met).toBe(true);
  });

  it("marks deadline as unmet when passed", () => {
    const items = checkEligibility(
      makeTender({ deadline: pastDate(5) }),
      makeProfile()
    );
    const dl = items.find((i) => i.requirement.includes("Scadenza non superata"));
    expect(dl).toBeDefined();
    expect(dl!.met).toBe(false);
  });

  // --- Profile completeness ---

  it("marks profile completeness as met when ≥ 80%", () => {
    const items = checkEligibility(
      makeTender(),
      makeProfile({ completeness_score: 95 })
    );
    const pc = items.find((i) => i.requirement.includes("Profilo aziendale completo"));
    expect(pc).toBeDefined();
    expect(pc!.met).toBe(true);
  });

  it("marks profile completeness as unmet when < 80%", () => {
    const items = checkEligibility(
      makeTender(),
      makeProfile({ completeness_score: 50 })
    );
    const pc = items.find((i) => i.requirement.includes("Profilo aziendale completo"));
    expect(pc).toBeDefined();
    expect(pc!.met).toBe(false);
  });
});

function futureDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}
