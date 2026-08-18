/**
 * Ranking Agent Tools
 *
 * Ranking and shortlisting, delegated to the deterministic scoring engine.
 *
 * These tools previously carried their own weighted scorers, which duplicated
 * lib/scoring with weaker logic: exact-match-only CPV comparison (the engine
 * does four levels of prefix matching), a hardcoded "competition level" of 60,
 * and a value score that rewarded larger contracts regardless of whether the
 * company could deliver them. They also took the tender list as JSON from the
 * model, which meant serialising every tender through the context window just
 * to sort an array.
 *
 * Tools now take tender ids, load the rows themselves, and score with the same
 * engine that backs the REST API and the tender detail page.
 */

import { z } from "zod";
import { tool } from "@langchain/core/tools";
import { getUserByClerkId } from "../../lib/db/users";
import { getCompanyProfile } from "../../lib/db/company-profiles";
import { getTendersByIds } from "../../lib/db/tenders";
import { addFavorite } from "../../lib/db/favorites";
import { scoreTender } from "../../lib/scoring";
import type { ScoreResult } from "../../lib/scoring";

/** Read the caller's Clerk id from graph config. Never model-supplied. */
function callerId(config: unknown): string | undefined {
  return (
    (config as { configurable?: { user_id?: string } } | undefined)?.configurable
      ?.user_id
  );
}

/**
 * Condense a component breakdown into the few points worth narrating.
 *
 * Returning all six components for every tender would flood the context with
 * near-duplicate prose. Strengths are components at 80%+ of their maximum,
 * concerns are those under 40%.
 */
function summarise(components: ScoreResult[]): {
  strengths: string[];
  concerns: string[];
} {
  const ratio = (c: ScoreResult) => (c.maxScore > 0 ? c.score / c.maxScore : 0);

  return {
    strengths: components
      .filter((c) => ratio(c) >= 0.8)
      .sort((a, b) => ratio(b) - ratio(a))
      .slice(0, 3)
      .map((c) => c.explanation),
    concerns: components
      .filter((c) => ratio(c) < 0.4)
      .sort((a, b) => ratio(a) - ratio(b))
      .slice(0, 3)
      .map((c) => c.explanation),
  };
}

/**
 * Rank tenders for the caller's company using the scoring engine.
 */
export const rankTendersTool = tool(
  async ({ tenderIds }, config) => {
    try {
      const clerkUserId = callerId(config);
      if (!clerkUserId) {
        return JSON.stringify({
          error: "NOT_AUTHENTICATED",
          message: "Nessun utente autenticato. Chiedi all'utente di accedere.",
          rankedTenders: [],
        });
      }

      const dbUser = await getUserByClerkId(clerkUserId);
      const orgId = dbUser?.organization_id;
      const profile = orgId ? await getCompanyProfile(orgId) : null;

      if (!profile) {
        return JSON.stringify({
          error: "PROFILE_INCOMPLETE",
          message:
            "Profilo aziendale mancante: completa il profilo per ordinare i bandi per compatibilità.",
          rankedTenders: [],
        });
      }

      const tenders = await getTendersByIds(tenderIds);
      if (tenders.length === 0) {
        return JSON.stringify({
          error: "NO_TENDERS_FOUND",
          message: "Nessuno dei bandi indicati è presente nel database.",
          rankedTenders: [],
        });
      }

      const ranked = tenders
        .map((tender) => {
          const result = scoreTender(tender, profile);
          const { strengths, concerns } = summarise(result.components);

          return {
            tenderId: tender.id,
            title: tender.title,
            score: result.overallScore,
            recommendation: result.recommendation,
            deadline: tender.deadline,
            value: tender.value,
            strengths,
            concerns,
          };
        })
        .sort((a, b) => b.score - a.score)
        .map((t, i) => ({ rank: i + 1, ...t }));

      const missing = tenderIds.length - tenders.length;

      return JSON.stringify({
        rankedTenders: ranked,
        count: ranked.length,
        ...(missing > 0 ? { notFound: missing } : {}),
      });
    } catch (error) {
      return JSON.stringify({
        error: "RANKING_FAILED",
        message: error instanceof Error ? error.message : "Ranking failed",
        rankedTenders: [],
      });
    }
  },
  {
    name: "rank_tenders",
    description:
      "Rank tenders for the current user's company by compatibility score, using the deterministic scoring engine. Returns real computed scores, a BID/REVIEW/SKIP recommendation and the strongest/weakest factors per tender. Report these values exactly; never invent or adjust a score.",
    schema: z.object({
      tenderIds: z
        .array(z.string())
        .min(1)
        .describe("Tender UUIDs or TED publication numbers to rank"),
    }),
  }
);

/**
 * Save the top-ranked tenders to the caller's favourites.
 */
export const createShortlistTool = tool(
  async ({ tenderIds, maxItems }, config) => {
    try {
      const clerkUserId = callerId(config);
      if (!clerkUserId) {
        return JSON.stringify({
          error: "NOT_AUTHENTICATED",
          message: "Nessun utente autenticato. Chiedi all'utente di accedere.",
          shortlist: [],
        });
      }

      const dbUser = await getUserByClerkId(clerkUserId);
      if (!dbUser?.organization_id) {
        return JSON.stringify({
          error: "NO_ORGANIZATION",
          message: "Utente senza organizzazione.",
          shortlist: [],
        });
      }

      const selected = tenderIds.slice(0, maxItems ?? 5);
      const tenders = await getTendersByIds(selected);

      // Favourites were previously written one await at a time.
      const saved = await Promise.allSettled(
        tenders.map((tender) =>
          addFavorite({
            user_id: dbUser.id,
            organization_id: dbUser.organization_id!,
            tender_id: tender.id,
            tender_title: tender.title || "Untitled",
            tender_value: tender.value ?? undefined,
            tender_deadline: tender.deadline ?? undefined,
          })
        )
      );

      const failed = saved.filter((r) => r.status === "rejected").length;

      return JSON.stringify({
        shortlist: tenders.map((t) => ({ tenderId: t.id, title: t.title })),
        count: tenders.length,
        saved: tenders.length - failed,
        ...(failed > 0 ? { failedToSave: failed } : {}),
      });
    } catch (error) {
      return JSON.stringify({
        error: "SHORTLIST_FAILED",
        message: error instanceof Error ? error.message : "Shortlist failed",
        shortlist: [],
      });
    }
  },
  {
    name: "create_shortlist",
    description:
      "Save the given tenders to the current user's favourites as a shortlist. Pass ids already ordered by rank; the user is resolved automatically.",
    schema: z.object({
      tenderIds: z
        .array(z.string())
        .min(1)
        .describe("Tender ids to shortlist, best first"),
      maxItems: z.number().optional().default(5).describe("Max shortlist size"),
    }),
  }
);
