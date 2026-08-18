/**
 * Personalization Agent Tools
 *
 * Tools for generating personalized recommendations using Supabase + Pinecone.
 */

import { z } from "zod";
import { tool } from "@langchain/core/tools";
import { pineconeService } from "../../lib/pinecone";
import { getUserByClerkId } from "../../lib/db/users";
import { getCompanyProfile } from "../../lib/db/company-profiles";
import { getFavorites, addFavorite } from "../../lib/db/favorites";
import { upsertCompanyProfile } from "../../lib/db/company-profiles";

/**
 * Get personalized tender suggestions based on user history and preferences.
 */
export const getPersonalizedSuggestionsTool = tool(
  async ({ userId, limit }) => {
    try {
      // Resolve Clerk user -> DB user -> company profile + favorites
      const dbUser = await getUserByClerkId(userId);
      if (!dbUser?.organization_id) {
        return JSON.stringify({
          error: "User profile not found",
          suggestions: [],
        });
      }

      const profile = await getCompanyProfile(dbUser.organization_id);
      if (!profile) {
        return JSON.stringify({
          error: "Company profile not found",
          suggestions: [],
        });
      }

      const favorites = await getFavorites(dbUser.id);

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

      const suggestions = results.map((r) => ({
        tenderId: r.id,
        title: r.tender.title,
        relevanceScore: Math.round(r.score * 100),
        reason: r.score > 0.8
          ? "High relevance to company profile"
          : "Based on your preferences and saved tenders",
        matchFactors: [
          r.tender.country === profile.operating_regions[0] ? "Location match" : null,
          "Industry match",
          r.tender.value ? "Value range" : null,
        ].filter(Boolean),
      }));

      return JSON.stringify({
        suggestions,
        patterns: {
          preferredCategories: profile.cpv_codes,
          preferredRegions: profile.operating_regions,
          saveCount: favorites.length,
        },
        profile: {
          companyName: profile.company_name,
          certifications: profile.certifications,
        },
      });
    } catch (error) {
      return JSON.stringify({
        error: error instanceof Error ? error.message : "Failed to get suggestions",
        suggestions: [],
      });
    }
  },
  {
    name: "get_personalized_suggestions",
    description:
      "Get personalized tender suggestions based on user history and preferences using semantic search.",
    schema: z.object({
      userId: z.string().describe("User ID"),
      limit: z.number().optional().default(10).describe("Max suggestions"),
    }),
  }
);

/**
 * Update user preferences.
 */
export const updatePreferencesTool = tool(
  async ({ userId, preferences }) => {
    try {
      const prefs =
        typeof preferences === "string" ? JSON.parse(preferences) : preferences;

      // Resolve Clerk user -> DB user -> organization
      const dbUser = await getUserByClerkId(userId);
      if (!dbUser?.organization_id) {
        return JSON.stringify({
          success: false,
          error: "User or organization not found",
        });
      }

      await upsertCompanyProfile(dbUser.organization_id, {
        cpv_codes: prefs.cpvCodes || [],
        operating_regions: prefs.regions || prefs.operatingRegions || [],
        company_name: prefs.companyName,
        annual_revenue: prefs.annualRevenue,
        certifications: prefs.certifications,
        employee_count: prefs.employeeCount,
      });

      return JSON.stringify({
        success: true,
        message: "Preferences updated successfully",
        preferences: prefs,
      });
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Failed to update preferences",
      });
    }
  },
  {
    name: "update_preferences",
    description: "Update user preferences based on their interactions and feedback.",
    schema: z.object({
      userId: z.string().describe("User ID"),
      preferences: z
        .union([z.string(), z.record(z.string(), z.unknown())])
        .describe("Preference updates"),
    }),
  }
);

/**
 * Get user's favorite tenders.
 */
export const getHistoryTool = tool(
  async ({ userId, limit }) => {
    try {
      // Resolve Clerk user -> DB user -> favorites
      const dbUser = await getUserByClerkId(userId);
      if (!dbUser) {
        return JSON.stringify({
          error: "User not found",
          history: [],
        });
      }

      const favorites = await getFavorites(dbUser.id, limit);

      return JSON.stringify({
        history: favorites.map((f) => ({
          id: f.external_tender_id || f.tender_id,
          action: "save",
          title: f.tender_title,
          timestamp: f.created_at,
        })),
        count: favorites.length,
        userId,
      });
    } catch (error) {
      return JSON.stringify({
        error: error instanceof Error ? error.message : "Failed to get history",
        history: [],
      });
    }
  },
  {
    name: "get_history",
    description: "Get user's saved tender history for personalization.",
    schema: z.object({
      userId: z.string().describe("User ID"),
      limit: z.number().optional().default(20).describe("Max history items"),
      actionType: z
        .enum(["view", "save", "apply", "dismiss"])
        .optional()
        .describe("Filter by action type (only 'save' supported currently)"),
    }),
  }
);
