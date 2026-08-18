/**
 * Company Profiles DB Layer
 */

import { getSupabaseAdmin } from "../supabase";

export interface DbCompanyProfile {
  id: string;
  organization_id: string;
  company_name: string;
  description: string | null;
  industry: string | null;
  annual_revenue: number | null;
  employee_count: number | null;
  legal_form: string | null;
  years_in_business: number | null;
  website: string | null;
  cpv_codes: string[];
  certifications: string[];
  technical_skills: string[];
  operating_regions: string[];
  services: string[];
  contract_size_min: number | null;
  contract_size_max: number | null;
  completeness_score: number;
  created_at: string;
  updated_at: string;
}

/**
 * Calculate completeness score (0-100) based on filled fields.
 */
function calculateCompleteness(
  profile: Partial<DbCompanyProfile>
): number {
  const fields: Array<{
    check: () => boolean;
    weight: number;
  }> = [
    { check: () => !!profile.company_name, weight: 15 },
    { check: () => !!profile.description, weight: 5 },
    { check: () => !!profile.industry, weight: 10 },
    { check: () => profile.annual_revenue != null && profile.annual_revenue > 0, weight: 10 },
    { check: () => profile.employee_count != null && profile.employee_count > 0, weight: 5 },
    {
      check: () =>
        Array.isArray(profile.cpv_codes) && profile.cpv_codes.length > 0,
      weight: 15,
    },
    {
      check: () =>
        Array.isArray(profile.certifications) &&
        profile.certifications.length > 0,
      weight: 10,
    },
    {
      check: () =>
        Array.isArray(profile.operating_regions) &&
        profile.operating_regions.length > 0,
      weight: 10,
    },
    {
      check: () =>
        Array.isArray(profile.services) && profile.services.length > 0,
      weight: 10,
    },
    {
      check: () =>
        profile.contract_size_min != null || profile.contract_size_max != null,
      weight: 5,
    },
    { check: () => !!profile.website, weight: 5 },
  ];

  let score = 0;
  for (const field of fields) {
    if (field.check()) score += field.weight;
  }
  return Math.min(100, score);
}

/**
 * Get the list of missing fields for completeness display.
 */
export function getMissingFields(
  profile: Partial<DbCompanyProfile>
): string[] {
  const missing: string[] = [];
  if (!profile.company_name) missing.push("company_name");
  if (!profile.description) missing.push("description");
  if (!profile.industry) missing.push("industry");
  if (!profile.annual_revenue) missing.push("annual_revenue");
  if (!profile.employee_count) missing.push("employee_count");
  if (!Array.isArray(profile.cpv_codes) || !profile.cpv_codes.length)
    missing.push("cpv_codes");
  if (
    !Array.isArray(profile.certifications) ||
    !profile.certifications.length
  )
    missing.push("certifications");
  if (
    !Array.isArray(profile.operating_regions) ||
    !profile.operating_regions.length
  )
    missing.push("operating_regions");
  if (!Array.isArray(profile.services) || !profile.services.length)
    missing.push("services");
  if (!profile.contract_size_min && !profile.contract_size_max)
    missing.push("contract_size_range");
  if (!profile.website) missing.push("website");
  return missing;
}

export async function getCompanyProfile(
  organizationId: string
): Promise<DbCompanyProfile | null> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("company_profiles")
    .select("*")
    .eq("organization_id", organizationId)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return data;
}

export async function upsertCompanyProfile(
  organizationId: string,
  params: Partial<
    Omit<
      DbCompanyProfile,
      | "id"
      | "organization_id"
      | "completeness_score"
      | "created_at"
      | "updated_at"
    >
  >
): Promise<DbCompanyProfile> {
  const completeness_score = calculateCompleteness({
    ...params,
    organization_id: organizationId,
  } as Partial<DbCompanyProfile>);

  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("company_profiles")
    .upsert(
      {
        organization_id: organizationId,
        company_name: params.company_name || "Unnamed",
        ...params,
        completeness_score,
      },
      { onConflict: "organization_id" }
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getCompleteness(
  organizationId: string
): Promise<{
  score: number;
  missingFields: string[];
}> {
  const profile = await getCompanyProfile(organizationId);
  if (!profile) {
    return { score: 0, missingFields: getMissingFields({}) };
  }
  return {
    score: profile.completeness_score,
    missingFields: getMissingFields(profile),
  };
}
