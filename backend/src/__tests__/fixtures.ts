/**
 * Test Fixtures
 *
 * Mock factories for DbTender and DbCompanyProfile with sensible defaults.
 * Use Partial<> overrides for specific test scenarios.
 */

import type { DbTender } from "../lib/db/tenders";
import type { DbCompanyProfile } from "../lib/db/company-profiles";

export function makeTender(overrides: Partial<DbTender> = {}): DbTender {
  return {
    id: "tender-001",
    source: "ted",
    external_id: "TED-2025-001",
    publication_number: "2025/S 001-000001",
    title: "Servizi di consulenza informatica",
    buyer: "Ministero dell'Economia",
    description: "Fornitura di servizi IT per la PA",
    cpv_codes: ["72000000"],
    country: "ITA",
    city: "Roma",
    value: 500_000,
    currency: "EUR",
    publication_date: "2025-01-01",
    deadline: futureDate(30),
    procedure_type: "open",
    contract_nature: "services",
    is_framework_agreement: false,
    sme_participation: false,
    pdf_url: null,
    raw_data: null,
    award_status: "pending",
    award_winner_name: null,
    award_winner_country: null,
    award_value: null,
    award_date: null,
    award_num_tenders_received: null,
    award_notice_id: null,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

export function makeProfile(
  overrides: Partial<DbCompanyProfile> = {}
): DbCompanyProfile {
  return {
    id: "profile-001",
    organization_id: "org-001",
    company_name: "Acme Consulting Srl",
    description: "Consulenza IT e sviluppo software",
    industry: "Information Technology",
    annual_revenue: 2_000_000,
    employee_count: 30,
    legal_form: "SRL",
    years_in_business: 12,
    website: "https://acme-consulting.it",
    cpv_codes: ["72000000"],
    certifications: ["ISO 9001", "ISO 27001"],
    technical_skills: ["cloud", "AI", "devops"],
    operating_regions: ["ITA"],
    services: ["consulenza IT", "sviluppo software"],
    contract_size_min: 50_000,
    contract_size_max: 1_000_000,
    completeness_score: 95,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

/** Return an ISO date string N days in the future. */
function futureDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

/** Return an ISO date string N days in the past. */
export function pastDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0];
}
