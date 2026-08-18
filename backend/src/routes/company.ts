/**
 * Company Routes
 *
 * Company profile management using Supabase.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Env } from "../app";
import { pineconeService } from "../lib/pinecone";
import {
  getCompanyProfile,
  upsertCompanyProfile,
  getCompleteness,
  getMissingFields,
} from "../lib/db/company-profiles";
import { getUserByClerkId } from "../lib/db/users";

export const companyRoutes = new Hono<Env>();

const profileSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  industry: z.string().optional(),
  size: z.enum(["micro", "small", "medium", "large"]).optional(),
  annualRevenue: z.number().optional(),
  employees: z.number().optional(),
  regions: z.array(z.string()).optional(),
  cpvCodes: z.array(z.string()).optional(),
  certifications: z.array(z.string()).optional(),
  services: z.array(z.string()).optional(),
  contractSizeMin: z.number().optional(),
  contractSizeMax: z.number().optional(),
  website: z.string().url().optional().or(z.literal("")),
});

/**
 * Helper: resolve clerkUserId -> dbUser + orgId
 */
async function resolveUser(clerkUserId: string | undefined) {
  if (!clerkUserId) return null;
  const dbUser = await getUserByClerkId(clerkUserId);
  if (!dbUser?.organization_id) return null;
  return dbUser;
}

/**
 * GET /company - Get company profile (backward compatible)
 */
companyRoutes.get("/", async (c) => {
  const clerkUserId = c.get("userId");
  const dbUser = await resolveUser(clerkUserId);

  if (!dbUser) {
    return c.json({ error: "User ID required" }, 400);
  }

  try {
    const profile = await getCompanyProfile(dbUser.organization_id!);

    if (!profile) {
      return c.json({ error: "Profile not found" }, 404);
    }

    // Return in the format expected by frontend
    return c.json({
      uid: clerkUserId,
      companyName: profile.company_name,
      annualRevenue: profile.annual_revenue ? Number(profile.annual_revenue) : undefined,
      employeeCount: profile.employee_count,
      certifications: profile.certifications || [],
      technicalSkills: profile.technical_skills || [],
      operatingRegions: profile.operating_regions || [],
      cpvCodes: profile.cpv_codes || [],
      preferredCpvs: profile.cpv_codes || [],
      services: profile.services || [],
      contractSizeMin: profile.contract_size_min ? Number(profile.contract_size_min) : undefined,
      contractSizeMax: profile.contract_size_max ? Number(profile.contract_size_max) : undefined,
      completenessScore: profile.completeness_score,
    });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to get profile",
      },
      500
    );
  }
});

/**
 * POST /company - Create/Update profile (backward compatible)
 */
companyRoutes.post("/", async (c) => {
  const clerkUserId = c.get("userId");
  const dbUser = await resolveUser(clerkUserId);

  if (!dbUser) {
    return c.json({ error: "User ID required" }, 400);
  }

  try {
    const body = await c.req.json();

    await upsertCompanyProfile(dbUser.organization_id!, {
      company_name: body.companyName,
      annual_revenue: body.annualRevenue,
      employee_count: body.employeeCount || body.employees,
      certifications: body.certifications || [],
      technical_skills: body.technicalSkills || [],
      operating_regions: body.operatingRegions || [],
      cpv_codes: body.cpvCodes || body.preferredCpvs || [],
      services: body.services || [],
      contract_size_min: body.contractSizeMin,
      contract_size_max: body.contractSizeMax,
    });

    return c.json({ success: true });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to save profile",
      },
      500
    );
  }
});

/**
 * GET /company/completeness - Completeness score + missing fields
 */
companyRoutes.get("/completeness", async (c) => {
  const clerkUserId = c.get("userId");
  const dbUser = await resolveUser(clerkUserId);

  if (!dbUser) {
    return c.json({ error: "User ID required" }, 400);
  }

  try {
    const result = await getCompleteness(dbUser.organization_id!);
    return c.json(result);
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to get completeness",
      },
      500
    );
  }
});

/**
 * GET /company/gaps - Profile gaps that affect tender matching
 */
companyRoutes.get("/gaps", async (c) => {
  const clerkUserId = c.get("userId");
  const dbUser = await resolveUser(clerkUserId);

  if (!dbUser) {
    return c.json({ error: "User ID required" }, 400);
  }

  try {
    const profile = await getCompanyProfile(dbUser.organization_id!);
    const missing = getMissingFields(profile || {});

    // Map missing fields to actionable gaps
    const gaps = missing.map((field) => {
      const gapMap: Record<string, { label: string; impact: string }> = {
        cpv_codes: { label: "CPV Codes", impact: "Cannot match tenders by sector" },
        certifications: { label: "Certifications", impact: "Missing eligibility checks (e.g. ISO 27001)" },
        operating_regions: { label: "Operating Regions", impact: "Cannot filter by geography" },
        annual_revenue: { label: "Annual Revenue", impact: "Cannot assess contract size fit" },
        services: { label: "Services", impact: "Cannot match service requirements" },
        contract_size_range: { label: "Contract Size Range", impact: "Cannot filter by value" },
        employee_count: { label: "Employee Count", impact: "Cannot assess capacity" },
        industry: { label: "Industry", impact: "Cannot match sector tenders" },
        company_name: { label: "Company Name", impact: "Profile incomplete" },
        description: { label: "Company Description", impact: "Cannot generate AI recommendations" },
        website: { label: "Website", impact: "Minor — used for verification" },
      };
      return { field, ...(gapMap[field] || { label: field, impact: "Profile incomplete" }) };
    });

    return c.json({ gaps, totalGaps: gaps.length });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to get gaps",
      },
      500
    );
  }
});

/**
 * GET /company/profile - Get company profile
 */
companyRoutes.get("/profile", async (c) => {
  const clerkUserId = c.get("userId");
  const dbUser = await resolveUser(clerkUserId);

  if (!dbUser) {
    return c.json({ profile: null, exists: false });
  }

  try {
    const profile = await getCompanyProfile(dbUser.organization_id!);

    if (!profile) {
      return c.json({ profile: null, exists: false });
    }

    return c.json({
      profile: {
        name: profile.company_name,
        description: profile.description,
        industry: profile.industry,
        annualRevenue: profile.annual_revenue ? Number(profile.annual_revenue) : undefined,
        employees: profile.employee_count,
        certifications: profile.certifications,
        cpvCodes: profile.cpv_codes,
        regions: profile.operating_regions,
        services: profile.services,
        contractSizeMin: profile.contract_size_min ? Number(profile.contract_size_min) : undefined,
        contractSizeMax: profile.contract_size_max ? Number(profile.contract_size_max) : undefined,
        completenessScore: profile.completeness_score,
      },
      exists: true,
    });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to get profile",
      },
      500
    );
  }
});

/**
 * POST /company/profile - Create/Update profile
 */
companyRoutes.post(
  "/profile",
  zValidator("json", profileSchema),
  async (c) => {
    const clerkUserId = c.get("userId");
    const body = c.req.valid("json");
    const dbUser = await resolveUser(clerkUserId);

    if (!dbUser) {
      return c.json({ error: "User ID required" }, 400);
    }

    try {
      const profile = await upsertCompanyProfile(dbUser.organization_id!, {
        company_name: body.name,
        description: body.description,
        industry: body.industry,
        annual_revenue: body.annualRevenue,
        employee_count: body.employees,
        certifications: body.certifications || [],
        cpv_codes: body.cpvCodes || [],
        operating_regions: body.regions || [],
        services: body.services || [],
        contract_size_min: body.contractSizeMin,
        contract_size_max: body.contractSizeMax,
        website: body.website || undefined,
      });

      return c.json({ success: true, profile });
    } catch (error) {
      return c.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Failed to save profile",
        },
        500
      );
    }
  }
);

/**
 * GET /company/recommendations - Get tender recommendations via semantic search
 */
companyRoutes.get("/recommendations", async (c) => {
  const clerkUserId = c.get("userId");
  const limit = Number(c.req.query("limit")) || 10;
  const dbUser = await resolveUser(clerkUserId);

  if (!dbUser) {
    return c.json({ error: "User ID required" }, 400);
  }

  try {
    const profile = await getCompanyProfile(dbUser.organization_id!);

    if (!profile) {
      return c.json({
        recommendations: [],
        message: "Please create a company profile first",
      });
    }

    const cpvCodes = (profile.cpv_codes as string[]) || [];
    const regions = (profile.operating_regions as string[]) || [];

    // Build search query from company profile
    const searchQuery = [
      profile.company_name,
      cpvCodes.length > 0 ? `CPV: ${cpvCodes.join(", ")}` : "",
      regions.length > 0 ? `Regions: ${regions.join(", ")}` : "",
      ((profile.certifications as string[]) || []).join(", "),
    ]
      .filter(Boolean)
      .join(" ");

    // Semantic search for matching tenders
    const results = await pineconeService.search(searchQuery, {
      topK: limit,
      filter: regions.length > 0 ? { country: regions[0] } : undefined,
    });

    return c.json({
      recommendations: results.map((r) => ({
        tender: r.tender,
        matchScore: r.score,
        matchReason:
          r.score > 0.8
            ? "High relevance to company profile"
            : r.score > 0.6
              ? "Moderate match"
              : "Potential opportunity",
      })),
      count: results.length,
      profile: {
        name: profile.company_name,
        cpvCodes,
        regions,
      },
    });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to get recommendations",
      },
      500
    );
  }
});
