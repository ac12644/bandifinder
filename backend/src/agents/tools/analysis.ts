/**
 * Analysis Agent Tools
 *
 * Tools for analyzing tender eligibility and compatibility.
 * Uses Supabase for user/company data and Pinecone for semantic search.
 */

import { z } from "zod";
import { tool } from "@langchain/core/tools";
import { pineconeService } from "../../lib/pinecone";
import { getUserByClerkId } from "../../lib/db/users";
import { getCompanyProfile } from "../../lib/db/company-profiles";
import { getTenderById, getTenderByExternalId } from "../../lib/db/tenders";
import { getTenderScore, upsertTenderScore } from "../../lib/db/tender-scores";
import { scoreTender } from "../../lib/scoring";

/**
 * Analyze eligibility for a specific tender.
 *
 * Delegates to the deterministic scoring engine (lib/scoring) — the same
 * engine backing GET /tenders/:id/analysis — so the chat agent and the REST
 * API can never disagree about a tender's score. The LLM narrates this
 * result; it does not produce it.
 *
 * The Clerk user id comes from the graph config (`configurable.user_id`),
 * never from the model, so the caller's identity cannot be hallucinated.
 */
export const analyzeEligibilityTool = tool(
  async ({ tenderId }, config) => {
    try {
      const clerkUserId = (
        config?.configurable as { user_id?: string } | undefined
      )?.user_id;

      if (!clerkUserId) {
        return JSON.stringify({
          error: "NOT_AUTHENTICATED",
          message:
            "Nessun utente autenticato: impossibile calcolare il punteggio. Chiedi all'utente di accedere.",
        });
      }

      // Resolve the tender by UUID first, then by TED external id.
      let tender = await getTenderById(tenderId).catch(() => null);
      if (!tender) {
        tender = await getTenderByExternalId("ted", tenderId).catch(() => null);
      }
      if (!tender) {
        return JSON.stringify({
          error: "TENDER_NOT_FOUND",
          tenderId,
          message: `Bando ${tenderId} non trovato nel database.`,
        });
      }

      // Resolve the company profile for the caller's organization.
      const dbUser = await getUserByClerkId(clerkUserId);
      const orgId = dbUser?.organization_id;
      const profile = orgId ? await getCompanyProfile(orgId) : null;

      if (!profile) {
        return JSON.stringify({
          error: "PROFILE_INCOMPLETE",
          tenderId,
          tenderTitle: tender.title,
          message:
            "Profilo aziendale mancante: completa il profilo per ottenere un punteggio di compatibilità.",
        });
      }

      // Reuse a cached score when it is still inside the 24h TTL.
      if (orgId) {
        const cached = await getTenderScore(tender.id, orgId).catch(() => null);
        if (cached) {
          const age = Date.now() - new Date(cached.computed_at).getTime();
          if (age < 24 * 60 * 60 * 1000) {
            return JSON.stringify({
              tenderId: tender.id,
              tenderTitle: tender.title,
              overallScore: Number(cached.overall_score),
              recommendation: cached.recommendation,
              components: cached.components,
              eligibility: cached.eligibility,
              cached: true,
            });
          }
        }
      }

      // Compute with the deterministic engine.
      const result = scoreTender(tender, profile);

      // Persist for the REST path and the 24h cache. Non-critical.
      if (orgId) {
        try {
          await upsertTenderScore({
            tender_id: tender.id,
            organization_id: orgId,
            overall_score: result.overallScore,
            recommendation: result.recommendation,
            components: result.components,
            eligibility: result.eligibility,
          });
        } catch {
          // Caching is best-effort; never fail the analysis over it.
        }
      }

      return JSON.stringify({
        tenderId: tender.id,
        tenderTitle: tender.title,
        overallScore: result.overallScore,
        recommendation: result.recommendation,
        components: result.components,
        eligibility: result.eligibility,
        cached: false,
      });
    } catch (error) {
      return JSON.stringify({
        error: "ANALYSIS_FAILED",
        message: error instanceof Error ? error.message : "Analysis failed",
        tenderId,
      });
    }
  },
  {
    name: "analyze_eligibility",
    description:
      "Calculate the deterministic compatibility score (0-100), BID/REVIEW/SKIP recommendation, per-component breakdown and eligibility checklist for a tender against the current user's company profile. Returns real computed values — report them exactly as given and never invent scores.",
    schema: z.object({
      tenderId: z
        .string()
        .describe("Tender UUID or TED publication number to analyze"),
    }),
  }
);

/**
 * Get best matching tenders for a company using semantic search.
 */
export const getBestTendersTool = tool(
  async ({ limit }, config) => {
    try {
      // Identity comes from the graph config, never from the model.
      const userId = (
        config?.configurable as { user_id?: string } | undefined
      )?.user_id;

      if (!userId) {
        return JSON.stringify({
          error: "NOT_AUTHENTICATED",
          recommendations: [],
        });
      }

      // Resolve Clerk user -> DB user -> company profile
      const dbUser = await getUserByClerkId(userId);
      if (!dbUser?.organization_id) {
        return JSON.stringify({
          error: "User profile not found",
          recommendations: [],
        });
      }

      const profile = await getCompanyProfile(dbUser.organization_id);
      if (!profile) {
        return JSON.stringify({
          error: "Company profile not found",
          recommendations: [],
        });
      }

      // Build search query from profile
      const searchQuery = [
        profile.company_name,
        profile.cpv_codes.length > 0 ? `CPV: ${profile.cpv_codes.join(", ")}` : "",
        profile.operating_regions.length > 0 ? `Regions: ${profile.operating_regions.join(", ")}` : "",
        profile.certifications?.join(", ") || "",
      ].filter(Boolean).join(" ");

      // Semantic search for matching tenders
      const results = await pineconeService.search(searchQuery, {
        topK: limit,
        filter: profile.operating_regions.length > 0
          ? { country: profile.operating_regions[0] }
          : undefined,
      });

      return JSON.stringify({
        recommendations: results.map((r) => ({
          tenderId: r.id,
          title: r.tender.title,
          matchScore: Math.round(r.score * 100),
          reasons: [
            r.score > 0.8 ? "High relevance to company profile" : "Moderate match",
            r.tender.country === profile.operating_regions[0] ? "Located in target region" : null,
          ].filter(Boolean),
        })),
        profile: {
          companyName: profile.company_name,
          cpvCodes: profile.cpv_codes,
          regions: profile.operating_regions,
        },
      });
    } catch (error) {
      return JSON.stringify({
        error: error instanceof Error ? error.message : "Failed to get recommendations",
        recommendations: [],
      });
    }
  },
  {
    name: "get_best_tenders",
    description:
      "Get the best matching tenders for the current user based on their company profile using semantic search. The user is resolved automatically — do not pass a user id.",
    schema: z.object({
      limit: z.number().optional().default(10).describe("Max results"),
    }),
  }
);

/**
 * Compare tender requirements with company profile.
 */
export const compareWithProfileTool = tool(
  async ({ tenderRequirements, companyCapabilities }) => {
    try {
      const requirements =
        typeof tenderRequirements === "string"
          ? JSON.parse(tenderRequirements)
          : tenderRequirements;

      const capabilities =
        typeof companyCapabilities === "string"
          ? JSON.parse(companyCapabilities)
          : companyCapabilities;

      // Comparison analysis
      const comparison = {
        overallMatch: 0,
        details: [] as Array<{
          requirement: string;
          met: boolean;
          gap?: string;
        }>,
        strengths: [] as string[],
        gaps: [] as string[],
      };

      // Check each requirement
      let matchCount = 0;
      const reqKeys = Object.keys(requirements);

      for (const key of reqKeys) {
        const required = requirements[key];
        const has = capabilities[key];

        if (has && has >= required) {
          matchCount++;
          comparison.details.push({
            requirement: key,
            met: true,
          });
          comparison.strengths.push(`${key}: exceeds requirements`);
        } else {
          comparison.details.push({
            requirement: key,
            met: false,
            gap: `Required: ${required}, Have: ${has || "N/A"}`,
          });
          comparison.gaps.push(`${key}: needs improvement`);
        }
      }

      comparison.overallMatch = Math.round((matchCount / reqKeys.length) * 100);

      return JSON.stringify(comparison);
    } catch (error) {
      return JSON.stringify({
        error: error instanceof Error ? error.message : "Comparison failed",
        overallMatch: 0,
      });
    }
  },
  {
    name: "compare_with_profile",
    description:
      "Compare tender requirements against company capabilities to identify matches and gaps.",
    schema: z.object({
      tenderRequirements: z
        .union([z.string(), z.record(z.string(), z.unknown())])
        .describe("Tender requirements"),
      companyCapabilities: z
        .union([z.string(), z.record(z.string(), z.unknown())])
        .describe("Company capabilities"),
    }),
  }
);
