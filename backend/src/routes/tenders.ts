/**
 * Tenders Routes
 *
 * CRUD operations for tenders and search.
 * Now uses Supabase for structured data and Pinecone for vectors only.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Env } from "../app";
import {
  transformTEDNotice,
  type TEDSearchResponse,
  type TEDNotice,
  type Tender,
} from "../lib/types";
import { pineconeService, type TenderDocument } from "../lib/pinecone";
import { createGraphRAGRetriever, type GraphRAGQuery } from "../lib/graphrag";
import {
  upsertTender,
  upsertTenders as dbUpsertTenders,
  getTenderByExternalId,
  getTenderById,
  getUrgentTenders,
} from "../lib/db/tenders";
import {
  addFavorite,
  getFavorites,
  removeFavoriteByTenderId,
} from "../lib/db/favorites";
import {
  getCompanyProfile,
} from "../lib/db/company-profiles";
import {
  createDecision,
} from "../lib/db/tender-decisions";
import {
  getTenderScore,
  upsertTenderScore,
} from "../lib/db/tender-scores";
import { getUserByClerkId } from "../lib/db/users";
import {
  resolveScoringContext,
  canCacheScore,
} from "../lib/scoringContext";
import { scoreTender, quickScore } from "../lib/scoring";
import type { DbCompanyProfile } from "../lib/db/company-profiles";
import type { DbTender } from "../lib/db/tenders";

export const tenderRoutes = new Hono<Env>();

const TED_API_BASE = "https://api.ted.europa.eu/v3";

/** Default fields to request from TED API */
const DEFAULT_FIELDS = [
  "publication-number",
  "notice-identifier",
  "notice-title",
  "buyer-name",
  "publication-date",
  "deadline-date-lot",
  "deadline-receipt-tender-date-lot",
  "classification-cpv",
  "estimated-value-glo",
  "total-value",
  "links",
  "procedure-type",
  "contract-nature-main-proc",
  "contract-nature-main-lot",
  "organisation-country-buyer",
  "place-of-performance-country-proc",
  "place-of-performance-city-proc",
  "description-lot",
  "sme-part",
  "framework-agreement-lot",
];

const searchSchema = z.object({
  query: z.string().optional(),
  cpvCodes: z.array(z.string()).optional(),
  country: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  valueMin: z.number().optional(),
  valueMax: z.number().optional(),
  limit: z.number().optional().default(20),
  offset: z.number().optional().default(0),
});

const advancedSearchSchema = z.object({
  procedureType: z.string().optional(),
  contractNature: z.string().optional(),
  frameworkAgreement: z.boolean().optional(),
  electronicAuction: z.boolean().optional(),
  subcontractingAllowed: z.boolean().optional(),
  minValue: z.number().optional(),
  maxValue: z.number().optional(),
  countries: z.array(z.string()).optional(),
  cities: z.array(z.string()).optional(),
  cpvCodes: z.array(z.string()).optional(),
  daysBack: z.number().optional().default(30),
  limit: z.number().optional().default(20),
});

const bestTendersSchema = z.object({
  daysBack: z.number().optional().default(7),
  limit: z.number().optional().default(20),
  regions: z.array(z.string()).optional(),
  cpvCodes: z.array(z.string()).optional(),
});

const eligibilitySchema = z.object({
  tenderId: z.string(),
  tenderData: z
    .object({
      title: z.string().optional(),
      buyer: z.string().optional(),
      cpv: z.string().optional(),
      deadline: z.string().optional(),
      value: z.number().optional(),
    })
    .optional(),
});

const decisionSchema = z.object({
  decision: z.enum(["proceed", "skip"]),
  reason: z
    .enum(["not_eligible", "too_competitive", "low_value", "capacity", "other"])
    .optional(),
  reason_text: z.string().optional(),
});

/**
 * Helper: Build TED API query
 */
function buildTedQuery(params: {
  query?: string;
  country?: string;
  cpvCodes?: string[];
  dateFrom?: string;
  dateTo?: string;
}): string {
  const parts: string[] = [];

  if (params.query) {
    parts.push(`FT~"${params.query}"`);
  }

  if (params.country) {
    parts.push(`organisation-country-buyer=${params.country}`);
  }

  if (params.cpvCodes && params.cpvCodes.length > 0) {
    const cpvQuery = params.cpvCodes
      .map((c) => `classification-cpv=${c}`)
      .join(" OR ");
    parts.push(`(${cpvQuery})`);
  }

  if (params.dateFrom) {
    parts.push(
      `publication-date>=${params.dateFrom.replace(/-/g, "")}`
    );
  }

  if (params.dateTo) {
    parts.push(
      `publication-date<=${params.dateTo.replace(/-/g, "")}`
    );
  }

  return parts.length > 0
    ? parts.join(" AND ")
    : "publication-date>=today(-30)";
}

/**
 * Helper: Search TED API
 */
async function searchTedApi(
  query: string,
  limit: number,
  page: number
): Promise<TEDSearchResponse> {
  const body = {
    query,
    fields: DEFAULT_FIELDS,
    page,
    limit,
    paginationMode: "PAGE_NUMBER",
    scope: "ACTIVE",
  };

  const response = await fetch(`${TED_API_BASE}/notices/search`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`TED API error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

/**
 * Helper: Cache TED results to Supabase
 */
async function cacheTendersToDb(tenders: Tender[]): Promise<void> {
  try {
    const rows = tenders.map((t) => ({
      source: "ted" as const,
      external_id: t.id,
      publication_number: t.publicationNumber,
      title: t.title,
      buyer: t.buyer,
      description: t.description,
      cpv_codes: t.cpvCodes || [],
      country: t.country,
      city: t.city,
      value: t.value,
      publication_date: t.publicationDate,
      deadline: t.deadline,
      procedure_type: t.procedureType,
      contract_nature: t.contractNature,
      is_framework_agreement: t.isFrameworkAgreement,
      sme_participation: t.smeParticipation,
      pdf_url: t.pdfUrl,
    }));
    await dbUpsertTenders(rows);
  } catch {
    // Non-critical: log but don't fail the request
    console.error("[Tenders] Failed to cache tenders to DB");
  }
}

/**
 * GET /tenders - List tenders
 */
tenderRoutes.get("/", async (c) => {
  const query = c.req.query("q") || "";
  const limit = Number(c.req.query("limit")) || 20;
  const offset = Number(c.req.query("offset")) || 0;

  try {
    const tedQuery = query
      ? `FT~"${query}"`
      : "publication-date>=today(-7)";
    const page = Math.floor(offset / limit) + 1;
    const data = await searchTedApi(tedQuery, limit, page);

    const tenders = (data.notices || []).map(transformTEDNotice);

    // Cache to Supabase in background
    cacheTendersToDb(tenders);

    return c.json({
      tenders,
      count: data.totalNoticeCount || tenders.length,
      query,
      limit,
      offset,
    });
  } catch (error) {
    console.error("[Tenders] Error:", error);
    return c.json(
      {
        tenders: [],
        count: 0,
        error:
          error instanceof Error ? error.message : "Search failed",
      },
      500
    );
  }
});

/**
 * GET /tenders/search - Search tenders via query params
 */
tenderRoutes.get("/search", async (c) => {
  const query = c.req.query("query") || "";
  const country = c.req.query("country");
  const minValue = c.req.query("minValue") ? Number(c.req.query("minValue")) : undefined;
  const maxValue = c.req.query("maxValue") ? Number(c.req.query("maxValue")) : undefined;
  const daysBack = Number(c.req.query("daysBack")) || 30;
  const cpvCodesParam = c.req.query("cpvCodes");
  const cpvCodes = cpvCodesParam ? cpvCodesParam.split(",") : undefined;
  const limit = Number(c.req.query("limit")) || 20;

  try {
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - daysBack);

    const tedQuery = buildTedQuery({
      query: query || undefined,
      country,
      cpvCodes,
      dateFrom: dateFrom.toISOString().split("T")[0],
    });

    const data = await searchTedApi(tedQuery, limit, 1);
    let notices = data.notices || [];

    // Post-filter by value
    if (minValue !== undefined || maxValue !== undefined) {
      notices = notices.filter((n: TEDNotice) => {
        const value = n["estimated-value-glo"] || n["total-value"];
        if (!value) return true;
        if (minValue && value < minValue) return false;
        if (maxValue && value > maxValue) return false;
        return true;
      });
    }

    const tenders = notices.map(transformTEDNotice);
    cacheTendersToDb(tenders);

    // Score if user is logged in
    let scoredTenders = tenders.map((t) => ({ ...t, fitScore: undefined as number | undefined, recommendation: undefined as string | undefined }));

    // Signed-in users score against their stored profile; guests score against
    // the profile supplied with the request, so both see real numbers.
    {
      const { profile } = await resolveScoringContext(c);
      {
        if (profile) {
          scoredTenders = tenders.map((t) => {
            const fakeTender = {
              cpv_codes: t.cpvCodes || [],
              value: t.value ? String(t.value) : null,
              country: t.country || null,
              deadline: t.deadline || null,
            } as DbTender;
            try {
              const { overallScore, recommendation } = quickScore(fakeTender, profile as DbCompanyProfile);
              return { ...t, fitScore: overallScore, recommendation };
            } catch {
              return { ...t, fitScore: undefined, recommendation: undefined };
            }
          });
          scoredTenders.sort((a, b) => (b.fitScore ?? 0) - (a.fitScore ?? 0));
        }
      }
    }

    return c.json({
      tenders: scoredTenders,
      total: data.totalNoticeCount || scoredTenders.length,
    });
  } catch (error) {
    console.error("[Tenders Search GET] Error:", error);
    return c.json({ tenders: [], total: 0, error: error instanceof Error ? error.message : "Search failed" }, 500);
  }
});

/**
 * POST /tenders/search - Search tenders
 */
tenderRoutes.post(
  "/search",
  zValidator("json", searchSchema),
  async (c) => {
    const params = c.req.valid("json");

    try {
      const query = buildTedQuery(params);
      const page =
        Math.floor((params.offset || 0) / params.limit) + 1;
      const data = await searchTedApi(query, params.limit, page);

      let notices = data.notices || [];

      // Post-filter by value range if specified
      if (
        params.valueMin !== undefined ||
        params.valueMax !== undefined
      ) {
        notices = notices.filter((n: TEDNotice) => {
          const value =
            n["estimated-value-glo"] || n["total-value"];
          if (!value) return true;
          if (params.valueMin && value < params.valueMin) return false;
          if (params.valueMax && value > params.valueMax) return false;
          return true;
        });
      }

      const tenders = notices.map(transformTEDNotice);

      // Cache to Supabase in background
      cacheTendersToDb(tenders);

      return c.json({
        tenders,
        count: data.totalNoticeCount || tenders.length,
        query,
      });
    } catch (error) {
      console.error("[Tenders Search] Error:", error);
      return c.json(
        {
          tenders: [],
          count: 0,
          error:
            error instanceof Error
              ? error.message
              : "Search failed",
        },
        500
      );
    }
  }
);

/**
 * POST /tenders/advanced - Advanced search with filters
 */
tenderRoutes.post(
  "/advanced",
  zValidator("json", advancedSearchSchema),
  async (c) => {
    const params = c.req.valid("json");

    try {
      const parts: string[] = [];

      // Date filter
      const dateFrom = new Date();
      dateFrom.setDate(
        dateFrom.getDate() - (params.daysBack || 30)
      );
      parts.push(
        `publication-date>=${dateFrom.toISOString().split("T")[0].replace(/-/g, "")}`
      );

      // Country filter
      if (params.countries && params.countries.length > 0) {
        const countryQuery = params.countries
          .map((c) => `organisation-country-buyer=${c}`)
          .join(" OR ");
        parts.push(`(${countryQuery})`);
      }

      // CPV filter
      if (params.cpvCodes && params.cpvCodes.length > 0) {
        const cpvQuery = params.cpvCodes
          .map((c) => `classification-cpv=${c}`)
          .join(" OR ");
        parts.push(`(${cpvQuery})`);
      }

      const query = parts.join(" AND ");
      const data = await searchTedApi(query, params.limit || 20, 1);

      let notices = data.notices || [];

      // Post-filter by additional criteria
      if (params.minValue || params.maxValue) {
        notices = notices.filter((n: TEDNotice) => {
          const value =
            n["estimated-value-glo"] || n["total-value"];
          if (!value) return params.minValue === undefined;
          if (params.minValue && value < params.minValue)
            return false;
          if (params.maxValue && value > params.maxValue)
            return false;
          return true;
        });
      }

      if (params.procedureType) {
        notices = notices.filter(
          (n: TEDNotice) =>
            n["procedure-type"] === params.procedureType
        );
      }

      if (params.contractNature) {
        notices = notices.filter(
          (n: TEDNotice) =>
            n["contract-nature-main-proc"] ===
              params.contractNature ||
            n["contract-nature-main-lot"] ===
              params.contractNature
        );
      }

      const tenders = notices.map(transformTEDNotice);

      // Cache to Supabase in background
      cacheTendersToDb(tenders);

      return c.json({
        tenders,
        count: tenders.length,
        filters: params,
      });
    } catch (error) {
      console.error("[Advanced Search] Error:", error);
      return c.json(
        {
          tenders: [],
          count: 0,
          error:
            error instanceof Error
              ? error.message
              : "Advanced search failed",
        },
        500
      );
    }
  }
);

/**
 * GET /tenders/best - Get best personalized tenders (query string params)
 */
tenderRoutes.get("/best", async (c) => {
  const limit = Number(c.req.query("limit")) || 10;
  const daysBack = Number(c.req.query("daysBack")) || 14;
  const countryFilter = c.req.query("country");
  const minValue = c.req.query("minValue") ? Number(c.req.query("minValue")) : undefined;
  const maxValue = c.req.query("maxValue") ? Number(c.req.query("maxValue")) : undefined;

  try {
    let userCpvCodes: string[] = [];
    let userRegions: string[] = [];

    {
      const { profile } = await resolveScoringContext(c);
      if (profile) {
        userCpvCodes = (profile.cpv_codes as string[]) || [];
        userRegions = (profile.operating_regions as string[]) || [];
      }
    }

    const parts: string[] = [];
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - daysBack);
    parts.push(
      `publication-date>=${dateFrom.toISOString().split("T")[0].replace(/-/g, "")}`
    );

    // Country filter: use explicit filter if provided, otherwise use profile regions
    if (countryFilter) {
      parts.push(`organisation-country-buyer=${countryFilter}`);
    } else if (userRegions.length > 0) {
      const regionQuery = userRegions
        .map((r: string) => `organisation-country-buyer=${r}`)
        .join(" OR ");
      parts.push(`(${regionQuery})`);
    }

    if (userCpvCodes.length > 0) {
      const cpvQuery = userCpvCodes
        .slice(0, 5)
        .map((c: string) => `classification-cpv=${c}`)
        .join(" OR ");
      parts.push(`(${cpvQuery})`);
    }

    const query = parts.join(" AND ");
    const data = await searchTedApi(query, limit, 1);
    let notices = data.notices || [];

    // Post-filter by value range
    if (minValue !== undefined || maxValue !== undefined) {
      notices = notices.filter((n: TEDNotice) => {
        const value = n["estimated-value-glo"] || n["total-value"];
        if (!value) return true;
        if (minValue && value < minValue) return false;
        if (maxValue && value > maxValue) return false;
        return true;
      });
    }

    const tenders = notices.map(transformTEDNotice);

    cacheTendersToDb(tenders);

    // Score and sort by fit if we have a profile
    let scoredTenders = tenders.map((t) => ({ ...t, fitScore: undefined as number | undefined, recommendation: undefined as string | undefined }));

    // Signed-in users score against their stored profile; guests score against
    // the profile supplied with the request, so both see real numbers.
    {
      const { profile } = await resolveScoringContext(c);
      {
        if (profile) {
          scoredTenders = tenders.map((t) => {
            const fakeTender = {
              cpv_codes: t.cpvCodes || [],
              value: t.value ? String(t.value) : null,
              country: t.country || null,
              deadline: t.deadline || null,
            } as DbTender;
            try {
              const { overallScore, recommendation } = quickScore(fakeTender, profile as DbCompanyProfile);
              return { ...t, fitScore: overallScore, recommendation };
            } catch {
              return { ...t, fitScore: undefined, recommendation: undefined };
            }
          });
          // Sort by fit score descending
          scoredTenders.sort((a, b) => (b.fitScore ?? 0) - (a.fitScore ?? 0));
        }
      }
    }

    return c.json({
      tenders: scoredTenders,
      total: scoredTenders.length,
      count: scoredTenders.length,
      stats: {
        totalFound: data.totalNoticeCount || tenders.length,
        daysBack,
        filters: { regions: userRegions, cpvCodes: userCpvCodes },
      },
    });
  } catch (error) {
    console.error("[Best Tenders GET] Error:", error);
    return c.json(
      {
        tenders: [],
        count: 0,
        error: error instanceof Error ? error.message : "Failed to get best tenders",
      },
      500
    );
  }
});

/**
 * POST /tenders/best - Get best personalized tenders
 */
tenderRoutes.post(
  "/best",
  zValidator("json", bestTendersSchema),
  async (c) => {
    const params = c.req.valid("json");

    try {
      let userCpvCodes = params.cpvCodes || [];
      let userRegions = params.regions || [];

      // Get company profile from Supabase
      {
        const { profile } = await resolveScoringContext(c);
        if (profile) {
          if (!userCpvCodes.length)
            userCpvCodes = (profile.cpv_codes as string[]) || [];
          if (!userRegions.length)
            userRegions = (profile.operating_regions as string[]) || [];
        }
      }

      // Build query
      const parts: string[] = [];

      const dateFrom = new Date();
      dateFrom.setDate(dateFrom.getDate() - params.daysBack);
      parts.push(
        `publication-date>=${dateFrom.toISOString().split("T")[0].replace(/-/g, "")}`
      );

      if (userRegions.length > 0) {
        const regionQuery = userRegions
          .map((r: string) => `organisation-country-buyer=${r}`)
          .join(" OR ");
        parts.push(`(${regionQuery})`);
      }

      if (userCpvCodes.length > 0) {
        const cpvQuery = userCpvCodes
          .slice(0, 5)
          .map((c: string) => `classification-cpv=${c}`)
          .join(" OR ");
        parts.push(`(${cpvQuery})`);
      }

      const query = parts.join(" AND ");
      const data = await searchTedApi(query, params.limit, 1);

      const tenders = (data.notices || []).map(transformTEDNotice);

      // Cache to Supabase in background
      cacheTendersToDb(tenders);

      return c.json({
        tenders,
        count: tenders.length,
        stats: {
          totalFound:
            data.totalNoticeCount || tenders.length,
          daysBack: params.daysBack,
          filters: {
            regions: userRegions,
            cpvCodes: userCpvCodes,
          },
        },
      });
    } catch (error) {
      console.error("[Best Tenders] Error:", error);
      return c.json(
        {
          tenders: [],
          count: 0,
          error:
            error instanceof Error
              ? error.message
              : "Failed to get best tenders",
        },
        500
      );
    }
  }
);

/**
 * GET /tenders/urgent - Get tenders with upcoming deadlines
 */
tenderRoutes.get("/urgent", async (c) => {
  const days = Number(c.req.query("days")) || 7;

  try {
    const tenders = await getUrgentTenders(days);
    return c.json({ tenders, count: tenders.length });
  } catch (error) {
    return c.json(
      {
        tenders: [],
        count: 0,
        error:
          error instanceof Error
            ? error.message
            : "Failed to get urgent tenders",
      },
      500
    );
  }
});

/**
 * POST /tenders/eligibility - Analyze tender eligibility
 */
tenderRoutes.post(
  "/eligibility",
  zValidator("json", eligibilitySchema),
  async (c) => {
    const { tenderId, tenderData } = c.req.valid("json");

    try {
      // Get company profile from Supabase
      const companyProfile = (await resolveScoringContext(c)).profile;

      // Simple eligibility scoring
      let eligibilityScore = 70;
      const reasons: string[] = [];
      const opportunities: string[] = [];
      const riskFactors: string[] = [];
      const missingRequirements: string[] = [];

      if (companyProfile) {
        const cpvCodes =
          (companyProfile.cpv_codes as string[]) || [];
        const certs =
          (companyProfile.certifications as string[]) || [];

        // Check CPV match
        if (
          tenderData?.cpv &&
          cpvCodes.some((c) =>
            tenderData.cpv!.startsWith(c.substring(0, 5))
          )
        ) {
          eligibilityScore += 15;
          reasons.push("CPV code matches company expertise");
        } else {
          reasons.push("Consider expanding to this CPV sector");
        }

        // Check revenue
        if (
          tenderData?.value &&
          companyProfile.annual_revenue
        ) {
          if (
            tenderData.value <=
            Number(companyProfile.annual_revenue) * 0.5
          ) {
            eligibilityScore += 10;
            reasons.push(
              "Contract value is within company capacity"
            );
          } else {
            riskFactors.push(
              "Contract value exceeds 50% of annual revenue"
            );
            eligibilityScore -= 10;
          }
        }

        // Check certifications
        if (certs.length > 2) {
          eligibilityScore += 5;
          opportunities.push(
            "Strong certification portfolio increases competitiveness"
          );
        } else {
          missingRequirements.push(
            "Consider obtaining additional certifications"
          );
        }
      } else {
        missingRequirements.push(
          "Complete company profile for accurate eligibility analysis"
        );
      }

      // Normalize score
      eligibilityScore = Math.max(
        0,
        Math.min(100, eligibilityScore)
      );

      return c.json({
        tenderId,
        eligible: eligibilityScore >= 50,
        eligibilityScore,
        reasons,
        riskFactors,
        opportunities,
        missingRequirements,
        recommendation:
          eligibilityScore >= 75
            ? "Highly recommended - strong match"
            : eligibilityScore >= 50
              ? "Consider applying - moderate match"
              : "Review requirements carefully before applying",
      });
    } catch (error) {
      console.error("[Eligibility] Error:", error);
      return c.json(
        {
          tenderId,
          eligible: false,
          eligibilityScore: 0,
          error:
            error instanceof Error
              ? error.message
              : "Eligibility analysis failed",
        },
        500
      );
    }
  }
);

/**
 * GET /tenders/favorites - Get user's favorite tenders
 */
tenderRoutes.get("/favorites", async (c) => {
  const clerkUserId = c.get("userId");

  if (!clerkUserId) {
    return c.json({ error: "Authentication required" }, 401);
  }

  try {
    const dbUser = await getUserByClerkId(clerkUserId);
    if (!dbUser) {
      return c.json({ favorites: [], count: 0 });
    }

    const favorites = await getFavorites(dbUser.id);

    return c.json({ favorites, count: favorites.length });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to get favorites",
        favorites: [],
      },
      500
    );
  }
});

/**
 * GET /tenders/:id/analysis - Compute scoring analysis for a tender
 */
tenderRoutes.get("/:id/analysis", async (c) => {
  const id = c.req.param("id");

  try {
    // Get tender from DB (try by UUID first, then by external_id)
    let dbTender = await getTenderById(id).catch(() => null);
    if (!dbTender) {
      dbTender = await getTenderByExternalId("ted", id);
    }

    if (!dbTender) {
      return c.json({ error: "Tender not found" }, 404);
    }

    // Signed-in users score against their stored profile; guests score against
    // the profile supplied with the request.
    const scoringCtx = await resolveScoringContext(c);
    const profile = scoringCtx.profile;

    // Check cache (scores computed in last 24h). Guests are never cached:
    // their profile is per-request and unauthenticated, so a cached entry
    // would be meaningless and could serve one visitor's input to another.
    const orgId = canCacheScore(scoringCtx) ? scoringCtx.orgId : undefined;
    if (orgId) {
      const cached = await getTenderScore(dbTender.id, orgId);
      if (cached) {
        const cacheAge = Date.now() - new Date(cached.computed_at).getTime();
        if (cacheAge < 24 * 60 * 60 * 1000) {
          return c.json({
            overallScore: Number(cached.overall_score),
            recommendation: cached.recommendation,
            components: cached.components,
            eligibility: cached.eligibility,
          });
        }
      }
    }

    // Compute scoring
    const result = scoreTender(dbTender, profile);

    // Cache result (never for guests — orgId is undefined above)
    if (orgId && profile) {
      try {
        await upsertTenderScore({
          tender_id: dbTender.id,
          organization_id: orgId,
          overall_score: result.overallScore,
          recommendation: result.recommendation,
          components: result.components,
          eligibility: result.eligibility,
        });
      } catch {
        // Non-critical: don't fail the request
      }
    }

    return c.json(result);
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Analysis failed",
      },
      500
    );
  }
});

/**
 * GET /tenders/:id - Get tender by ID
 */
tenderRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");

  try {
    // Try DB first (by UUID)
    let dbTender = await getTenderById(id).catch(() => null);

    // Try by external_id
    if (!dbTender) {
      dbTender = await getTenderByExternalId("ted", id);
    }

    if (dbTender) {
      const pubNum = dbTender.publication_number || "";
      const tedUrl = pubNum
        ? `https://ted.europa.eu/en/notice/-/detail/${pubNum}`
        : undefined;

      return c.json({
        tender: {
          id: dbTender.external_id || dbTender.id,
          publicationNumber: pubNum,
          title: dbTender.title,
          buyer: dbTender.buyer || "Unknown",
          description: dbTender.description,
          cpvCodes: dbTender.cpv_codes,
          country: dbTender.country,
          city: dbTender.city,
          value: dbTender.value ? Number(dbTender.value) : undefined,
          publicationDate: dbTender.publication_date,
          deadline: dbTender.deadline,
          procedureType: dbTender.procedure_type,
          contractNature: dbTender.contract_nature,
          isFrameworkAgreement: dbTender.is_framework_agreement,
          smeParticipation: dbTender.sme_participation,
          tedUrl,
          pdfUrl: dbTender.pdf_url || (pubNum
            ? `https://ted.europa.eu/it/notice/${pubNum}/pdfs`
            : undefined),
        },
      });
    }

    // Fallback to TED API
    const response = await fetch(
      `${TED_API_BASE}/notices/${id}`,
      {
        headers: { Accept: "application/json" },
      }
    );

    if (!response.ok) {
      return c.json({ error: "Tender not found" }, 404);
    }

    const rawTender = await response.json();
    const transformed = transformTEDNotice(rawTender as TEDNotice);

    // Cache for next time
    cacheTendersToDb([transformed]);

    return c.json({ tender: transformed });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch tender",
      },
      500
    );
  }
});

/**
 * POST /tenders/:id/decision - Record bid/skip decision
 */
tenderRoutes.post(
  "/:id/decision",
  zValidator("json", decisionSchema),
  async (c) => {
    const tenderId = c.req.param("id");
    const clerkUserId = c.get("userId");
    const body = c.req.valid("json");

    if (!clerkUserId) {
      return c.json({ error: "Authentication required" }, 401);
    }

    try {
      const dbUser = await getUserByClerkId(clerkUserId);
      if (!dbUser || !dbUser.organization_id) {
        return c.json(
          { error: "User or organization not found" },
          404
        );
      }

      const decision = await createDecision({
        user_id: dbUser.id,
        organization_id: dbUser.organization_id,
        external_tender_id: tenderId,
        decision: body.decision,
        reason: body.reason,
        reason_text: body.reason_text,
      });

      return c.json({ success: true, decision });
    } catch (error) {
      return c.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Failed to record decision",
        },
        500
      );
    }
  }
);

/**
 * POST /tenders/favorite - Save tender to favorites
 */
tenderRoutes.post("/favorite", async (c) => {
  const clerkUserId = c.get("userId");
  const body = await c.req.json();
  const tenderId = body.tenderId;

  if (!clerkUserId) {
    return c.json({ error: "Authentication required" }, 401);
  }

  if (!tenderId) {
    return c.json({ error: "Tender ID required" }, 400);
  }

  try {
    const dbUser = await getUserByClerkId(clerkUserId);
    if (!dbUser || !dbUser.organization_id) {
      return c.json(
        { error: "User or organization not found" },
        404
      );
    }

    await addFavorite({
      user_id: dbUser.id,
      organization_id: dbUser.organization_id,
      external_tender_id: tenderId,
      tender_title: body.tenderData?.title || "",
      tender_value: body.tenderData?.value,
      tender_deadline: body.tenderData?.deadline,
    });

    return c.json({
      success: true,
      message: "Tender saved to favorites",
    });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to save tender",
      },
      500
    );
  }
});

/**
 * DELETE /tenders/favorite/:id - Remove from favorites
 */
tenderRoutes.delete("/favorite/:id", async (c) => {
  const tenderId = c.req.param("id");
  const clerkUserId = c.get("userId");

  if (!clerkUserId) {
    return c.json({ error: "Authentication required" }, 401);
  }

  try {
    const dbUser = await getUserByClerkId(clerkUserId);
    if (!dbUser) {
      return c.json({ error: "User not found" }, 404);
    }

    await removeFavoriteByTenderId(dbUser.id, tenderId);

    return c.json({
      success: true,
      message: "Tender removed from favorites",
    });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to remove tender",
      },
      500
    );
  }
});

// ============================================================================
// SEMANTIC SEARCH (PINECONE) — vectors only
// ============================================================================

const semanticSearchSchema = z.object({
  query: z.string().min(1, "Query is required"),
  topK: z.number().optional().default(10),
  filter: z
    .object({
      country: z.string().optional(),
      category: z.string().optional(),
      minValue: z.number().optional(),
      maxValue: z.number().optional(),
    })
    .optional(),
  namespace: z.string().optional().default("default"),
});

const upsertTendersSchema = z.object({
  tenders: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      description: z.string(),
      category: z.string().optional(),
      country: z.string().optional(),
      value: z.number().optional(),
      currency: z.string().optional(),
      deadline: z.string().optional(),
      publishedDate: z.string().optional(),
      contractingAuthority: z.string().optional(),
      cpvCodes: z.array(z.string()).optional(),
      requirements: z.array(z.string()).optional(),
    })
  ),
  namespace: z.string().optional().default("default"),
});

const similarTendersSchema = z.object({
  tenderId: z.string(),
  topK: z.number().optional().default(5),
  namespace: z.string().optional().default("default"),
});

/**
 * POST /tenders/semantic - Semantic search using Pinecone
 */
tenderRoutes.post(
  "/semantic",
  zValidator("json", semanticSearchSchema),
  async (c) => {
    const { query, topK, filter, namespace } =
      c.req.valid("json");

    try {
      const results = await pineconeService.search(query, {
        topK,
        filter,
        namespace,
      });

      return c.json({
        results,
        count: results.length,
        query,
        searchType: "semantic",
      });
    } catch (error) {
      console.error("[Semantic Search] Error:", error);
      return c.json(
        {
          results: [],
          count: 0,
          error:
            error instanceof Error
              ? error.message
              : "Semantic search failed",
        },
        500
      );
    }
  }
);

/**
 * POST /tenders/similar - Find similar tenders
 */
tenderRoutes.post(
  "/similar",
  zValidator("json", similarTendersSchema),
  async (c) => {
    const { tenderId, topK, namespace } = c.req.valid("json");

    try {
      const results = await pineconeService.findSimilar(
        tenderId,
        {
          topK,
          namespace,
        }
      );

      return c.json({
        results,
        count: results.length,
        sourceTenderId: tenderId,
      });
    } catch (error) {
      console.error("[Similar Tenders] Error:", error);
      return c.json(
        {
          results: [],
          count: 0,
          error:
            error instanceof Error
              ? error.message
              : "Failed to find similar tenders",
        },
        500
      );
    }
  }
);

/**
 * POST /tenders/index - Upsert tenders to Pinecone
 */
tenderRoutes.post(
  "/index",
  zValidator("json", upsertTendersSchema),
  async (c) => {
    const { tenders, namespace } = c.req.valid("json");

    try {
      const result = await pineconeService.upsertTenders(
        tenders as TenderDocument[],
        namespace
      );

      return c.json({
        success: true,
        indexed: result.success,
        failed: result.failed,
        namespace,
      });
    } catch (error) {
      console.error("[Index Tenders] Error:", error);
      return c.json(
        {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Indexing failed",
        },
        500
      );
    }
  }
);

/**
 * DELETE /tenders/index/:id - Remove tender from Pinecone
 */
tenderRoutes.delete("/index/:id", async (c) => {
  const id = c.req.param("id");
  const namespace = c.req.query("namespace") || "default";

  try {
    await pineconeService.deleteTender(id, namespace);

    return c.json({
      success: true,
      message: `Tender ${id} removed from index`,
    });
  } catch (error) {
    console.error("[Delete Index] Error:", error);
    return c.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to delete from index",
      },
      500
    );
  }
});

/**
 * GET /tenders/index/stats - Get Pinecone index statistics
 */
tenderRoutes.get("/index/stats", async (c) => {
  try {
    const stats = await pineconeService.getStats();

    return c.json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error("[Index Stats] Error:", error);
    return c.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to get stats",
      },
      500
    );
  }
});

// ============================================================================
// GRAPHRAG ENDPOINTS
// ============================================================================

const graphRAGSearchSchema = z.object({
  query: z.string().min(1, "Query is required"),
  filters: z
    .object({
      cpvCodes: z.array(z.string()).optional(),
      countries: z.array(z.string()).optional(),
      minValue: z.number().optional(),
      maxValue: z.number().optional(),
      deadline: z.string().optional(),
    })
    .optional(),
  options: z
    .object({
      vectorTopK: z.number().optional(),
      graphDepth: z.number().optional(),
      graphExpansion: z.number().optional(),
      finalTopK: z.number().optional(),
      includeExplanation: z.boolean().optional(),
    })
    .optional(),
});

const graphRAGIndexSchema = z.object({
  tender: z.object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    cpvCodes: z.array(z.string()).optional(),
    buyerName: z.string().optional(),
    country: z.string().optional(),
    value: z.number().optional(),
    currency: z.string().optional(),
    deadline: z.string().optional(),
    publicationDate: z.string().optional(),
  }),
});

tenderRoutes.post(
  "/graphrag",
  zValidator("json", graphRAGSearchSchema),
  async (c) => {
    const { query, filters, options } = c.req.valid("json");
    const userId = c.get("userId");

    try {
      const retriever = createGraphRAGRetriever();

      const graphQuery: GraphRAGQuery = {
        query,
        userId,
        filters,
        options: {
          vectorTopK: options?.vectorTopK || 20,
          graphDepth: options?.graphDepth || 2,
          graphExpansion: options?.graphExpansion || 10,
          finalTopK: options?.finalTopK || 10,
          includeExplanation:
            options?.includeExplanation ?? true,
        },
      };

      const response = await retriever.retrieve(graphQuery);

      return c.json({
        success: true,
        results: response.results,
        count: response.results.length,
        graphStats: response.graphStats,
        timing: response.timing,
        searchType: "graphrag",
      });
    } catch (error) {
      console.error("[GraphRAG Search] Error:", error);
      return c.json(
        {
          success: false,
          results: [],
          count: 0,
          error:
            error instanceof Error
              ? error.message
              : "GraphRAG search failed",
        },
        500
      );
    }
  }
);

tenderRoutes.post(
  "/graphrag/index",
  zValidator("json", graphRAGIndexSchema),
  async (c) => {
    const { tender } = c.req.valid("json");

    try {
      // Pinecone is the durable index. The knowledge graph is derived per query
      // from vector hits, so indexing here reaches retrieval through Pinecone;
      // writing to a request-scoped graph that is immediately discarded would
      // be dead work.
      await pineconeService.upsertTenders([
        tender as TenderDocument,
      ]);

      return c.json({
        success: true,
        message: `Tender ${tender.id} indexed to vector store`,
      });
    } catch (error) {
      console.error("[GraphRAG Index] Error:", error);
      return c.json(
        {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to index tender",
        },
        500
      );
    }
  }
);

tenderRoutes.get("/graphrag/stats", async (c) => {
  try {
    // The knowledge graph is built per query from that query's vector hits and
    // discarded afterwards, so there is no persistent graph to report on. The
    // vector store is the durable index and the only meaningful statistic.
    const pineconeStats = await pineconeService.getStats();

    return c.json({
      success: true,
      knowledgeGraph: {
        scope: "per-request",
        note: "Built from each query's vector results; not persisted.",
      },
      vectorStore: pineconeStats,
    });
  } catch (error) {
    console.error("[GraphRAG Stats] Error:", error);
    return c.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to get stats",
      },
      500
    );
  }
});

tenderRoutes.delete("/graphrag/clear", async (c) => {
  try {
    // Retained for API compatibility. There is no longer a shared graph to
    // clear: each request builds and discards its own, so this is a no-op.
    return c.json({
      success: true,
      message:
        "No-op: the knowledge graph is per-request and is discarded automatically.",
    });
  } catch (error) {
    console.error("[GraphRAG Clear] Error:", error);
    return c.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to clear graph",
      },
      500
    );
  }
});
