/**
 * Pinecone Vector Search Service
 *
 * Vector-only operations:
 * - Tender storage with semantic search
 * - Embedding generation
 *
 * Structured data (favorites, preferences, etc.) moved to Supabase.
 * Index: "tender" (512 dimensions, text-embedding-3-small)
 */

import { Pinecone, RecordMetadata } from "@pinecone-database/pinecone";
import OpenAI from "openai";
import { logger } from "./observability";

// ============================================================================
// TYPES
// ============================================================================

export interface TenderDocument {
  id: string;
  title: string;
  description: string;
  category?: string;
  country?: string;
  value?: number;
  currency?: string;
  deadline?: string;
  publishedDate?: string;
  contractingAuthority?: string;
  cpvCodes?: string[];
  requirements?: string[];
}

export interface TenderSearchResult {
  id: string;
  score: number;
  tender: TenderDocument;
}

export interface SearchOptions {
  topK?: number;
  filter?: {
    country?: string;
    category?: string;
    minValue?: number;
    maxValue?: number;
  };
  namespace?: string;
}

// ============================================================================
// PINECONE SERVICE
// ============================================================================

class PineconeService {
  private client: Pinecone | null = null;
  private openai: OpenAI | null = null;
  private indexName = "tender";
  private embeddingModel = "text-embedding-3-small";
  private embeddingDimensions = 512;

  /**
   * Initialize Pinecone and OpenAI clients.
   * Supports OpenRouter as a fallback for embeddings.
   */
  private async init(): Promise<{ pinecone: Pinecone; openai: OpenAI }> {
    if (!this.client) {
      const apiKey = process.env.PINECONE_API_KEY;
      if (!apiKey) {
        throw new Error("PINECONE_API_KEY is not set");
      }
      this.client = new Pinecone({ apiKey });
    }

    if (!this.openai) {
      // Try OpenAI first, then fall back to OpenRouter
      const openaiKey = process.env.OPENAI_API_KEY;
      const openrouterKey = process.env.OPENROUTER_API_KEY;

      if (openaiKey) {
        this.openai = new OpenAI({ apiKey: openaiKey });
      } else if (openrouterKey) {
        this.openai = new OpenAI({
          apiKey: openrouterKey,
          baseURL: "https://openrouter.ai/api/v1",
        });
      } else {
        throw new Error("OPENAI_API_KEY or OPENROUTER_API_KEY is required for embeddings");
      }
    }

    return { pinecone: this.client, openai: this.openai };
  }

  /**
   * Generate embedding for text using OpenAI.
   */
  private async embed(text: string): Promise<number[]> {
    const { openai } = await this.init();

    const response = await openai.embeddings.create({
      model: this.embeddingModel,
      input: text,
      dimensions: this.embeddingDimensions,
    });

    return response.data[0].embedding;
  }

  /**
   * Generate embeddings for multiple texts (batch).
   */
  private async embedBatch(texts: string[]): Promise<number[][]> {
    const { openai } = await this.init();

    const response = await openai.embeddings.create({
      model: this.embeddingModel,
      input: texts,
      dimensions: this.embeddingDimensions,
    });

    return response.data.map((d) => d.embedding);
  }

  /**
   * Create searchable text from tender document.
   */
  private tenderToText(tender: TenderDocument): string {
    const parts = [
      tender.title,
      tender.description,
      tender.category && `Categoria: ${tender.category}`,
      tender.contractingAuthority && `Ente: ${tender.contractingAuthority}`,
      tender.cpvCodes?.length && `CPV: ${tender.cpvCodes.join(", ")}`,
      tender.requirements?.length && `Requisiti: ${tender.requirements.join(", ")}`,
    ].filter(Boolean);

    return parts.join("\n");
  }

  /**
   * Upsert a single tender document.
   */
  async upsertTender(tender: TenderDocument, namespace = "default"): Promise<void> {
    const { pinecone } = await this.init();
    const index = pinecone.index(this.indexName);

    const text = this.tenderToText(tender);
    const embedding = await this.embed(text);

    const metadata: RecordMetadata = {
      title: tender.title,
      description: tender.description.slice(0, 1000), // Truncate for metadata limit
      category: tender.category || "",
      country: tender.country || "",
      value: tender.value || 0,
      currency: tender.currency || "EUR",
      deadline: tender.deadline || "",
      publishedDate: tender.publishedDate || "",
      contractingAuthority: tender.contractingAuthority || "",
      cpvCodes: tender.cpvCodes || [],
    };

    await index.namespace(namespace).upsert({
      records: [
        {
          id: tender.id,
          values: embedding,
          metadata,
        },
      ],
    });

    logger.info("[Pinecone] Upserted tender", { tenderId: tender.id, namespace });
  }

  /**
   * Upsert multiple tender documents (batch).
   */
  async upsertTenders(
    tenders: TenderDocument[],
    namespace = "default"
  ): Promise<{ success: number; failed: number }> {
    const { pinecone } = await this.init();
    const index = pinecone.index(this.indexName);

    // Generate all embeddings
    const texts = tenders.map((t) => this.tenderToText(t));
    const embeddings = await this.embedBatch(texts);

    // Prepare vectors
    const vectors = tenders.map((tender, i) => ({
      id: tender.id,
      values: embeddings[i],
      metadata: {
        title: tender.title,
        description: tender.description.slice(0, 1000),
        category: tender.category || "",
        country: tender.country || "",
        value: tender.value || 0,
        currency: tender.currency || "EUR",
        deadline: tender.deadline || "",
        publishedDate: tender.publishedDate || "",
        contractingAuthority: tender.contractingAuthority || "",
        cpvCodes: tender.cpvCodes || [],
      } as RecordMetadata,
    }));

    // Upsert in batches of 100
    const batchSize = 100;
    let success = 0;
    let failed = 0;

    for (let i = 0; i < vectors.length; i += batchSize) {
      const batch = vectors.slice(i, i + batchSize);
      try {
        await index.namespace(namespace).upsert({ records: batch });
        success += batch.length;
      } catch (error) {
        logger.error("[Pinecone] Batch upsert failed", error as Error, {
          batchStart: i,
          batchSize: batch.length,
        });
        failed += batch.length;
      }
    }

    logger.info("[Pinecone] Batch upsert complete", { success, failed, namespace });
    return { success, failed };
  }

  /**
   * Semantic search for tenders.
   */
  async search(
    query: string,
    options: SearchOptions = {}
  ): Promise<TenderSearchResult[]> {
    const { pinecone } = await this.init();
    const index = pinecone.index(this.indexName);

    const { topK = 10, filter, namespace = "default" } = options;

    // Generate query embedding
    const queryEmbedding = await this.embed(query);

    // Build metadata filter
    const metadataFilter: Record<string, unknown> = {};
    if (filter?.country) {
      metadataFilter.country = { $eq: filter.country };
    }
    if (filter?.category) {
      metadataFilter.category = { $eq: filter.category };
    }
    if (filter?.minValue !== undefined) {
      metadataFilter.value = { $gte: filter.minValue };
    }
    if (filter?.maxValue !== undefined) {
      metadataFilter.value = {
        ...(metadataFilter.value as object || {}),
        $lte: filter.maxValue,
      };
    }

    // Query Pinecone
    const results = await index.namespace(namespace).query({
      vector: queryEmbedding,
      topK,
      includeMetadata: true,
      filter: Object.keys(metadataFilter).length > 0 ? metadataFilter : undefined,
    });

    // Transform results
    return (results.matches || []).map((match) => ({
      id: match.id,
      score: match.score || 0,
      tender: {
        id: match.id,
        title: String(match.metadata?.title || ""),
        description: String(match.metadata?.description || ""),
        category: String(match.metadata?.category || ""),
        country: String(match.metadata?.country || ""),
        value: Number(match.metadata?.value || 0),
        currency: String(match.metadata?.currency || "EUR"),
        deadline: String(match.metadata?.deadline || ""),
        publishedDate: String(match.metadata?.publishedDate || ""),
        contractingAuthority: String(match.metadata?.contractingAuthority || ""),
        cpvCodes: (match.metadata?.cpvCodes as string[]) || [],
      },
    }));
  }

  /**
   * Find similar tenders to a given tender ID.
   */
  async findSimilar(
    tenderId: string,
    options: SearchOptions = {}
  ): Promise<TenderSearchResult[]> {
    const { pinecone } = await this.init();
    const index = pinecone.index(this.indexName);

    const { topK = 10, namespace = "default" } = options;

    // Fetch the tender's vector
    const fetchResult = await index.namespace(namespace).fetch({ ids: [tenderId] });
    const record = fetchResult.records[tenderId];

    if (!record?.values) {
      throw new Error(`Tender ${tenderId} not found in index`);
    }

    // Query for similar
    const results = await index.namespace(namespace).query({
      vector: record.values,
      topK: topK + 1, // +1 to exclude the source tender
      includeMetadata: true,
    });

    // Filter out the source tender and transform
    return (results.matches || [])
      .filter((match) => match.id !== tenderId)
      .slice(0, topK)
      .map((match) => ({
        id: match.id,
        score: match.score || 0,
        tender: {
          id: match.id,
          title: String(match.metadata?.title || ""),
          description: String(match.metadata?.description || ""),
          category: String(match.metadata?.category || ""),
          country: String(match.metadata?.country || ""),
          value: Number(match.metadata?.value || 0),
          currency: String(match.metadata?.currency || "EUR"),
          deadline: String(match.metadata?.deadline || ""),
          publishedDate: String(match.metadata?.publishedDate || ""),
          contractingAuthority: String(match.metadata?.contractingAuthority || ""),
          cpvCodes: (match.metadata?.cpvCodes as string[]) || [],
        },
      }));
  }

  /**
   * Delete a tender from the index.
   */
  async deleteTender(tenderId: string, namespace = "default"): Promise<void> {
    const { pinecone } = await this.init();
    const index = pinecone.index(this.indexName);

    await index.namespace(namespace).deleteOne({ id: tenderId });
    logger.info("[Pinecone] Deleted tender", { tenderId, namespace });
  }

  /**
   * Get index statistics.
   */
  async getStats(): Promise<{
    dimension: number;
    totalRecordCount: number;
    namespaces: Record<string, { recordCount: number }>;
  }> {
    const { pinecone } = await this.init();
    const index = pinecone.index(this.indexName);

    const stats = await index.describeIndexStats();
    return {
      dimension: stats.dimension || 0,
      totalRecordCount: stats.totalRecordCount || 0,
      namespaces: stats.namespaces || {},
    };
  }
}

// Singleton instance
export const pineconeService = new PineconeService();
