/**
 * Suggestions Routes
 *
 * AI-powered search suggestions and personalized recommendations.
 * Uses Supabase for user/company data and Pinecone for semantic search.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Env } from "../app";
import { pineconeService } from "../lib/pinecone";
import { getUserByClerkId } from "../lib/db/users";
import { getCompanyProfile } from "../lib/db/company-profiles";
import { transformTEDNotice, type TEDSearchResponse, type TEDNotice } from "../lib/types";

export const suggestionsRoutes = new Hono<Env>();

const TED_API_BASE = "https://api.ted.europa.eu/v3";

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
  "organisation-country-buyer",
  "description-lot",
];

const suggestionsSchema = z.object({
  query: z.string().optional(),
  limit: z.number().optional().default(5),
});

const personalizedSchema = z.object({
  limit: z.number().optional().default(10),
  excludeIds: z.array(z.string()).optional(),
});

// In-memory search history for demo
const searchHistory: Map<string, string[]> = new Map();

/**
 * GET /suggestions - Get personalized suggestions
 */
suggestionsRoutes.get("/", async (c) => {
  const userId = c.get("userId");
  const type = c.req.query("type") || "smart"; // smart, trending, recent

  try {
    let suggestions: string[] = [];

    switch (type) {
      case "smart":
        // Get personalized suggestions based on company profile
        if (userId) {
          const dbUser = await getUserByClerkId(userId);
          if (dbUser?.organization_id) {
            const profile = await getCompanyProfile(dbUser.organization_id);
            if (profile) {
              suggestions = [
                ...profile.cpv_codes.slice(0, 2).map((c) => `Bandi CPV ${c}`),
                ...profile.operating_regions.slice(0, 2).map((r) => `Bandi ${r}`),
              ];
            }
          }
        }
        if (suggestions.length === 0) {
          suggestions = [
            "Bandi informatica pubblica amministrazione",
            "Appalti servizi digitali",
            "Gare PNRR",
          ];
        }
        break;

      case "trending":
        // Return trending searches
        suggestions = [
          "PNRR digitalizzazione",
          "Appalti sanità 2024",
          "Bandi green energy",
          "Servizi cloud PA",
          "Cybersecurity pubblica amministrazione",
        ];
        break;

      case "recent":
        // Get user's recent searches from in-memory store
        if (userId) {
          suggestions = searchHistory.get(userId)?.slice(-5).reverse() || [];
        }
        break;
    }

    return c.json({
      suggestions,
      type,
      count: suggestions.length,
    });
  } catch (error) {
    return c.json({
      suggestions: [],
      error: error instanceof Error ? error.message : "Failed to get suggestions",
    }, 500);
  }
});

/**
 * POST /suggestions - Get AI-powered suggestions based on input
 */
suggestionsRoutes.post("/", zValidator("json", suggestionsSchema), async (c) => {
  const { query, limit } = c.req.valid("json");
  const userId = c.get("userId");

  try {
    // Base suggestions
    let suggestions: string[] = [
      "Bandi digitalizzazione PA",
      "Appalti servizi IT",
      "Gare telematiche",
      "Bandi PNRR",
      "Appalti green",
    ];

    // If user has company profile, personalize suggestions
    if (userId) {
      const dbUser = await getUserByClerkId(userId);
      if (dbUser?.organization_id) {
        const profile = await getCompanyProfile(dbUser.organization_id);
        if (profile && profile.cpv_codes.length > 0) {
          suggestions = [
            ...profile.cpv_codes.slice(0, 3).map((c) => `Bandi CPV ${c}`),
            ...suggestions.slice(0, 2),
          ];
        }
      }
    }

    // If query provided, filter/enhance suggestions
    if (query && query.length > 2) {
      const queryLower = query.toLowerCase();
      suggestions = suggestions.filter((s) =>
        s.toLowerCase().includes(queryLower) || queryLower.includes(s.toLowerCase().split(" ")[0])
      );

      // Add query-based suggestions
      suggestions = [
        `${query} pubblica amministrazione`,
        `${query} PNRR`,
        `${query} Italia`,
        ...suggestions,
      ];

      // Track search for recent suggestions
      if (userId) {
        const history = searchHistory.get(userId) || [];
        history.push(query);
        if (history.length > 20) history.shift();
        searchHistory.set(userId, history);
      }
    }

    return c.json({
      suggestions: suggestions.slice(0, limit),
      count: Math.min(suggestions.length, limit),
    });
  } catch (error) {
    return c.json({
      suggestions: [],
      error: error instanceof Error ? error.message : "Failed to get suggestions",
    }, 500);
  }
});

/**
 * POST /suggestions/personalized - Get personalized tender recommendations
 */
suggestionsRoutes.post("/personalized", zValidator("json", personalizedSchema), async (c) => {
  const { limit, excludeIds } = c.req.valid("json");
  const userId = c.get("userId");

  try {
    // Get company profile from Supabase
    let cpvCodes: string[] = [];
    let regions: string[] = [];

    if (userId) {
      const dbUser = await getUserByClerkId(userId);
      if (dbUser?.organization_id) {
        const profile = await getCompanyProfile(dbUser.organization_id);
        if (profile) {
          cpvCodes = profile.cpv_codes || [];
          regions = profile.operating_regions || [];
        }
      }
    }

    // Try semantic search first if we have preferences
    if (cpvCodes.length > 0 || regions.length > 0) {
      const searchQuery = [
        cpvCodes.length > 0 ? `CPV: ${cpvCodes.join(", ")}` : "",
        regions.length > 0 ? `Country: ${regions.join(", ")}` : "",
      ].filter(Boolean).join(" ");

      const semanticResults = await pineconeService.search(searchQuery, {
        topK: limit,
        filter: regions.length > 0 ? { country: regions[0] } : undefined,
      });

      if (semanticResults.length > 0) {
        return c.json({
          recommendations: semanticResults.map((r) => r.tender),
          count: semanticResults.length,
          source: "semantic",
          personalization: { cpvCodes, regions },
        });
      }
    }

    // Fallback to TED API
    const parts: string[] = [];

    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - 14);
    parts.push(`publication-date>=${dateFrom.toISOString().split("T")[0].replace(/-/g, "")}`);

    if (regions.length > 0) {
      const regionQuery = regions.map((r) => `organisation-country-buyer=${r}`).join(" OR ");
      parts.push(`(${regionQuery})`);
    } else {
      parts.push("organisation-country-buyer=ITA");
    }

    if (cpvCodes.length > 0) {
      const cpvQuery = cpvCodes.slice(0, 3).map((c) => `classification-cpv=${c}`).join(" OR ");
      parts.push(`(${cpvQuery})`);
    }

    const query = parts.join(" AND ");

    const body = {
      query,
      fields: DEFAULT_FIELDS,
      page: 1,
      limit: limit + (excludeIds?.length || 0),
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
      throw new Error(`TED API error: ${response.status}`);
    }

    const data: TEDSearchResponse = await response.json();
    let notices = data.notices || [];

    if (excludeIds && excludeIds.length > 0) {
      notices = notices.filter(
        (n: TEDNotice) => !excludeIds.includes(n["publication-number"] || "")
      );
    }

    const recommendations = notices.slice(0, limit).map(transformTEDNotice);

    return c.json({
      recommendations,
      count: recommendations.length,
      source: "ted_api",
      personalization: { cpvCodes, regions },
    });
  } catch (error) {
    console.error("[Personalized Recommendations] Error:", error);
    return c.json({
      recommendations: [],
      count: 0,
      error: error instanceof Error ? error.message : "Failed to get recommendations",
    }, 500);
  }
});

/**
 * POST /suggestions/feedback - Submit feedback on suggestions
 */
suggestionsRoutes.post("/feedback", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();

  if (!userId) {
    return c.json({ error: "User ID required" }, 400);
  }

  // Store feedback in-memory for demo (would go to analytics service in prod)
  console.log("[Feedback]", { userId, suggestion: body.suggestion, feedback: body.feedback });

  return c.json({ success: true });
});
