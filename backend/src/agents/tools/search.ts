/**
 * Search Agent Tools
 *
 * Tools for searching tenders via TED API and Pinecone vector search.
 */

import { z } from "zod";
import { tool } from "@langchain/core/tools";
import { Pinecone } from "@pinecone-database/pinecone";
import { OpenAI } from "openai";
import {
  TEDSearchResponse,
  TEDNotice,
  transformTEDNotice,
} from "../../lib/types";

// Lazy-initialized clients (to avoid errors when env vars not set at import time)
let pineconeClient: Pinecone | null = null;
let openaiClient: OpenAI | null = null;

function getPinecone(): Pinecone {
  if (!pineconeClient) {
    if (!process.env.PINECONE_API_KEY) {
      throw new Error("PINECONE_API_KEY environment variable is required");
    }
    pineconeClient = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY,
    });
  }
  return pineconeClient;
}

function getOpenAI(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openaiClient;
}

const TED_API_BASE = "https://api.ted.europa.eu/v3";

/** Default fields to request from TED API (TED API v3 supported fields) */
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
  "place-of-performance-city-lot",
  "description-lot",
  "sme-part",
  "framework-agreement-lot",
];

/**
 * Build TED Expert Query from natural language parameters.
 */
export const buildTedExpertQueryTool = tool(
  async ({
    keywords,
    cpvCodes,
    country,
    dateFrom,
    dateTo,
    valueMin,
    valueMax,
  }) => {
    const parts: string[] = [];

    if (keywords) {
      parts.push(`(FT~"${keywords}")`);
    }

    if (cpvCodes && cpvCodes.length > 0) {
      const cpvQuery = cpvCodes.map((c) => `CPV="${c}"`).join(" OR ");
      parts.push(`(${cpvQuery})`);
    }

    if (country) {
      parts.push(`organisation-country-buyer=${country}`);
    }

    if (dateFrom) {
      parts.push(`publication-date>=${dateFrom.replace(/-/g, "")}`);
    }

    if (dateTo) {
      parts.push(`publication-date<=${dateTo.replace(/-/g, "")}`);
    }

    const query = parts.length > 0 ? parts.join(" AND ") : "*";

    // Return just the query string for easier use
    return query;
  },
  {
    name: "build_ted_query",
    description:
      "Costruisce una query TED. Restituisce una stringa query da passare a search_tenders.",
    schema: z.object({
      keywords: z.string().optional().describe("Free text search keywords"),
      cpvCodes: z
        .array(z.string())
        .optional()
        .describe("CPV codes (8-digit strings)"),
      country: z
        .string()
        .optional()
        .describe("Country code (ISO alpha-3, e.g., ITA, DEU)"),
      dateFrom: z.string().optional().describe("Start date (YYYY-MM-DD)"),
      dateTo: z.string().optional().describe("End date (YYYY-MM-DD)"),
      valueMin: z.number().optional().describe("Minimum contract value in EUR"),
      valueMax: z.number().optional().describe("Maximum contract value in EUR"),
    }),
  }
);

/**
 * Search TED API with expert query.
 */
export const searchTendersTool = tool(
  async ({ query, limit, offset }) => {
    try {
      const body = {
        query,
        paginationMode: "PAGE_NUMBER",
        page: Math.floor((offset || 0) / (limit || 20)) + 1,
        limit: limit || 20,
        onlyLatestVersions: true,
        fields: DEFAULT_FIELDS,
      };

      const response = await fetch(TED_API_BASE + "/notices/search", {
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
      const notices = data.notices || [];

      // Transform to our format
      const tenders = notices.map(transformTEDNotice);

      return JSON.stringify({
        tenders,
        count: data.totalNoticeCount || tenders.length,
        query,
      });
    } catch (error) {
      console.error("[searchTendersTool] Error:", error);
      return JSON.stringify({
        tenders: [],
        count: 0,
        error: error instanceof Error ? error.message : "Search failed",
      });
    }
  },
  {
    name: "search_tenders",
    description:
      "Cerca bandi su TED usando una query. Restituisce lista di bandi con titolo, ente, valore, scadenza.",
    schema: z.object({
      query: z.string().describe("Query TED (stringa da build_ted_query)"),
      limit: z
        .number()
        .optional()
        .default(20)
        .describe("Numero massimo risultati"),
      offset: z.number().optional().default(0).describe("Offset paginazione"),
    }),
  }
);

/**
 * Advanced search with multiple filters.
 */
export const advancedSearchTool = tool(
  async ({ keywords, cpvCodes, country, valueMin, valueMax, limit }) => {
    // Build a broader query for advanced search
    const parts: string[] = [];

    if (keywords) {
      parts.push(`FT~"${keywords}"`);
    }

    if (country) {
      parts.push(`organisation-country-buyer=${country}`);
    }

    const query = parts.length > 0 ? parts.join(" AND ") : "*";

    const body = {
      query,
      paginationMode: "PAGE_NUMBER",
      page: 1,
      limit: limit || 30,
      onlyLatestVersions: true,
      fields: DEFAULT_FIELDS,
    };

    try {
      const response = await fetch(TED_API_BASE + "/notices/search", {
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

      // Post-filter by value range
      if (valueMin !== undefined || valueMax !== undefined) {
        notices = notices.filter((n: TEDNotice) => {
          const value = n["estimated-value-glo"] || n["total-value"];
          if (!value) return true;
          if (valueMin && value < valueMin) return false;
          if (valueMax && value > valueMax) return false;
          return true;
        });
      }

      // Post-filter by CPV
      if (cpvCodes && cpvCodes.length > 0) {
        notices = notices.filter((n: TEDNotice) => {
          const noticeCpv =
            n["cpv-codes"] ||
            (Array.isArray(n["classification-cpv"])
              ? n["classification-cpv"]
              : n["classification-cpv"]
              ? [n["classification-cpv"]]
              : []);
          return cpvCodes.some((c) =>
            noticeCpv.some((nc: string) => nc.startsWith(c))
          );
        });
      }

      const tenders = notices.map(transformTEDNotice);

      return JSON.stringify({
        tenders,
        count: tenders.length,
        query,
        filters: { cpvCodes, country, valueMin, valueMax },
      });
    } catch (error) {
      return JSON.stringify({
        tenders: [],
        count: 0,
        error:
          error instanceof Error ? error.message : "Advanced search failed",
      });
    }
  },
  {
    name: "advanced_search",
    description:
      "Ricerca avanzata bandi con filtri multipli. Usa se search_tenders restituisce 0 risultati.",
    schema: z.object({
      keywords: z.string().optional().describe("Parole chiave"),
      cpvCodes: z.array(z.string()).optional().describe("Codici CPV"),
      country: z
        .string()
        .optional()
        .describe("Codice paese (ITA, DEU, FRA...)"),
      valueMin: z.number().optional().describe("Valore minimo EUR"),
      valueMax: z.number().optional().describe("Valore massimo EUR"),
      limit: z
        .number()
        .optional()
        .default(30)
        .describe("Numero massimo risultati"),
    }),
  }
);

/**
 * Semantic search using Pinecone vector database.
 */
export const semanticSearchTool = tool(
  async ({ query, topK, filters }) => {
    try {
      // Check if OPENAI_API_KEY is available for embeddings
      if (!process.env.OPENAI_API_KEY) {
        console.warn(
          "[semanticSearchTool] OPENAI_API_KEY not set - falling back to TED search"
        );
        return JSON.stringify({
          tenders: [],
          count: 0,
          searchType: "semantic",
          fallback: true,
          message:
            "Semantic search unavailable - use search_tenders or advanced_search instead",
        });
      }

      // Generate embedding for the query
      const embeddingResponse = await getOpenAI().embeddings.create({
        model: "text-embedding-3-small",
        input: query,
        dimensions: 512,
      });

      const queryVector = embeddingResponse.data[0].embedding;

      // Search Pinecone
      const index = getPinecone().index("tender");

      const searchResult = await index.query({
        vector: queryVector,
        topK: topK || 10,
        includeMetadata: true,
        filter: filters || undefined,
      });

      const tenders = searchResult.matches.map((match) => ({
        id: match.id,
        publicationNumber: match.metadata?.publicationNumber as string,
        title: match.metadata?.title as string,
        buyer: match.metadata?.buyer as string,
        publicationDate: match.metadata?.publicationDate as string,
        deadline: match.metadata?.deadline as string,
        cpv: match.metadata?.cpv as string,
        value: match.metadata?.value as number,
        valueFormatted: formatValue(match.metadata?.value as number),
        score: match.score,
        description: truncate(String(match.metadata?.description || ""), 140),
      }));

      return JSON.stringify({
        tenders,
        count: tenders.length,
        query,
        searchType: "semantic",
      });
    } catch (error) {
      console.error("[semanticSearchTool] Error:", error);
      return JSON.stringify({
        tenders: [],
        count: 0,
        error:
          error instanceof Error ? error.message : "Semantic search failed",
        searchType: "semantic",
      });
    }
  },
  {
    name: "semantic_search",
    description:
      "Ricerca semantica AI. NOTA: Richiede OPENAI_API_KEY. Se fallisce, usa search_tenders.",
    schema: z.object({
      query: z.string().describe("Query in linguaggio naturale"),
      topK: z.number().optional().default(10).describe("Numero risultati"),
      filters: z.record(z.string(), z.unknown()).optional().describe("Filtri metadata"),
    }),
  }
);

// Helper functions
function formatValue(value: unknown): string {
  if (!value || typeof value !== "number") return "N/A";
  return `€ ${value.toLocaleString("it-IT")}`;
}

function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.substring(0, length - 3) + "...";
}
