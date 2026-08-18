/**
 * GraphRAG Retriever
 *
 * Combines vector search (Pinecone) with knowledge graph traversal
 * for enhanced, relationship-aware retrieval.
 */

import { pineconeService, type TenderDocument, type TenderSearchResult } from '../pinecone';
import { KnowledgeGraph } from './knowledgeGraph';
import {
  GraphNode,
  TenderNode,
  CPVCodeNode,
  ContractingAuthorityNode,
  parseCPVCode,
  getCPVParents,
} from './entities';
import { logger } from '../observability';

// ============================================================================
// Types
// ============================================================================

export interface GraphRAGQuery {
  query: string;
  userId?: string;
  filters?: {
    cpvCodes?: string[];
    countries?: string[];
    minValue?: number;
    maxValue?: number;
    deadline?: string;
  };
  options?: {
    vectorTopK?: number;       // Initial vector search results
    graphDepth?: number;       // Max graph traversal depth
    graphExpansion?: number;   // Max nodes to expand via graph
    finalTopK?: number;        // Final results to return
    includeExplanation?: boolean;
  };
}

export interface GraphRAGResult {
  tenderId: string;
  title: string;
  description: string;
  score: number;
  vectorScore: number;
  graphScore: number;
  metadata: Record<string, unknown>;
  // Explainability
  explanation?: {
    vectorMatch: string;
    graphPaths: string[];
    relatedEntities: {
      type: string;
      name: string;
      relationship: string;
    }[];
  };
}

export interface GraphRAGResponse {
  results: GraphRAGResult[];
  graphStats: {
    nodesTraversed: number;
    edgesTraversed: number;
    expansionPaths: number;
  };
  timing: {
    vectorSearchMs: number;
    graphTraversalMs: number;
    rerankingMs: number;
    totalMs: number;
  };
}

// Internal type for vector search results
interface VectorResult {
  id: string;
  score: number;
  title: string;
  description: string;
  cpvCodes: string[];
  buyerName: string;
  country: string;
  value?: number;
  currency?: string;
  deadline?: string;
}

// ============================================================================
// GraphRAG Retriever Class
// ============================================================================

export class GraphRAGRetriever {
  /**
   * Working graph for a single retrieval.
   *
   * Scoped to this retriever instance, never shared across requests: the graph
   * is derived from the current query's vector hits, so sharing it would make
   * one caller's traversal depend on what other callers had searched for, and
   * would grow the graph without bound.
   */
  private graph: KnowledgeGraph;

  constructor() {
    this.graph = new KnowledgeGraph();
  }

  /**
   * Main retrieval method combining vector search + graph traversal
   */
  async retrieve(query: GraphRAGQuery): Promise<GraphRAGResponse> {
    const startTime = Date.now();

    // Start from an empty graph so a result depends only on its query. Callers
    // should use a fresh retriever per request, but reuse must stay correct.
    this.graph.clear();
    const options = {
      vectorTopK: query.options?.vectorTopK || 20,
      graphDepth: query.options?.graphDepth || 2,
      graphExpansion: query.options?.graphExpansion || 10,
      finalTopK: query.options?.finalTopK || 10,
      includeExplanation: query.options?.includeExplanation ?? true,
    };

    logger.info('GraphRAG retrieval started', { query: query.query, options });

    // Step 1: Vector search via Pinecone
    const vectorStart = Date.now();
    const vectorResults = await this.vectorSearch(query, options.vectorTopK);
    const vectorSearchMs = Date.now() - vectorStart;

    // Step 2: Build/update graph from vector results
    await this.updateGraphFromResults(vectorResults);

    // Step 3: Graph traversal for expansion
    const graphStart = Date.now();
    const { expandedResults, stats } = await this.graphExpansion(
      vectorResults,
      options.graphDepth,
      options.graphExpansion
    );
    const graphTraversalMs = Date.now() - graphStart;

    // Step 4: Merge and re-rank results
    const rerankStart = Date.now();
    const mergedResults = this.mergeAndRerank(
      vectorResults,
      expandedResults,
      options.finalTopK,
      options.includeExplanation
    );
    const rerankingMs = Date.now() - rerankStart;

    const totalMs = Date.now() - startTime;

    logger.info('GraphRAG retrieval completed', {
      vectorResults: vectorResults.length,
      expandedResults: expandedResults.size,
      finalResults: mergedResults.length,
      timing: { vectorSearchMs, graphTraversalMs, rerankingMs, totalMs },
    });

    return {
      results: mergedResults,
      graphStats: stats,
      timing: {
        vectorSearchMs,
        graphTraversalMs,
        rerankingMs,
        totalMs,
      },
    };
  }

  /**
   * Step 1: Vector search via Pinecone
   */
  private async vectorSearch(
    query: GraphRAGQuery,
    topK: number
  ): Promise<VectorResult[]> {
    try {
      const filter: { country?: string; minValue?: number; maxValue?: number } = {};
      if (query.filters?.countries?.[0]) {
        filter.country = query.filters.countries[0];
      }
      if (query.filters?.minValue) {
        filter.minValue = query.filters.minValue;
      }
      if (query.filters?.maxValue) {
        filter.maxValue = query.filters.maxValue;
      }

      const results = await pineconeService.search(query.query, {
        topK,
        filter: Object.keys(filter).length > 0 ? filter : undefined,
      });

      return results.map((r: TenderSearchResult) => ({
        id: r.id,
        score: r.score,
        title: r.tender.title,
        description: r.tender.description,
        cpvCodes: r.tender.cpvCodes || [],
        buyerName: r.tender.contractingAuthority || '',
        country: r.tender.country || '',
        value: r.tender.value,
        currency: r.tender.currency,
        deadline: r.tender.deadline,
      }));
    } catch (error) {
      logger.error('Vector search failed', error as Error);
      return [];
    }
  }

  /**
   * Step 2: Update knowledge graph from search results
   */
  private async updateGraphFromResults(results: VectorResult[]): Promise<void> {
    for (const result of results) {
      // Create tender node
      const tenderNode = this.createTenderNode(result);
      this.graph.addNode(tenderNode);

      // Extract and add CPV codes
      const cpvCodes = result.cpvCodes || [];
      for (const cpv of cpvCodes) {
        const cpvNode = this.createCPVNode(cpv);
        this.graph.addNode(cpvNode);

        // Create HAS_CPV edge
        this.graph.addEdge({
          id: `${tenderNode.id}-HAS_CPV-${cpvNode.id}`,
          type: 'HAS_CPV',
          sourceId: tenderNode.id,
          targetId: cpvNode.id,
          weight: 0.9,
          metadata: {},
          createdAt: new Date(),
        });

        // Add CPV hierarchy
        const parents = getCPVParents(cpv);
        let childCode = cpv;
        for (const parentCode of parents.reverse()) {
          const parentNode = this.createCPVNode(parentCode);
          this.graph.addNode(parentNode);

          this.graph.addEdge({
            id: `${parentNode.id}-PARENT_OF-${childCode}`,
            type: 'PARENT_OF',
            sourceId: parentNode.id,
            targetId: `cpv-${childCode}`,
            weight: 0.8,
            metadata: {},
            createdAt: new Date(),
          });

          childCode = parentCode;
        }
      }

      // Extract contracting authority if available
      if (result.buyerName) {
        const authorityNode = this.createAuthorityNode(result);
        this.graph.addNode(authorityNode);

        this.graph.addEdge({
          id: `${tenderNode.id}-ISSUED_BY-${authorityNode.id}`,
          type: 'ISSUED_BY',
          sourceId: tenderNode.id,
          targetId: authorityNode.id,
          weight: 0.95,
          metadata: {},
          createdAt: new Date(),
        });
      }
    }

    // Create SIMILAR_TO edges based on shared CPV codes
    this.createSimilarityEdges(results);
  }

  /**
   * Step 3: Expand results through graph traversal
   */
  private async graphExpansion(
    vectorResults: VectorResult[],
    maxDepth: number,
    maxExpansion: number
  ): Promise<{
    expandedResults: Map<string, { node: TenderNode; graphScore: number; paths: string[][] }>;
    stats: { nodesTraversed: number; edgesTraversed: number; expansionPaths: number };
  }> {
    const expandedResults = new Map<
      string,
      { node: TenderNode; graphScore: number; paths: string[][] }
    >();
    let nodesTraversed = 0;
    let edgesTraversed = 0;
    let expansionPaths = 0;

    const vectorTenderIds = new Set(vectorResults.map(r => `tender-${r.id}`));

    for (const result of vectorResults) {
      const tenderId = `tender-${result.id}`;

      // Traverse from this tender
      const traversalResult = this.graph.findRelatedTenders(tenderId, {
        maxDepth,
        limit: maxExpansion,
        minWeight: 0.3,
      });

      nodesTraversed += traversalResult.nodes.length;
      edgesTraversed += traversalResult.edges.length;

      // Collect new tender nodes from traversal
      for (const pathResult of traversalResult.traversalPaths) {
        if (pathResult.node.type === 'tender' && !vectorTenderIds.has(pathResult.node.id)) {
          const existing = expandedResults.get(pathResult.node.id);
          const newScore = pathResult.score * result.score; // Combine vector score with graph score

          if (!existing || newScore > existing.graphScore) {
            expandedResults.set(pathResult.node.id, {
              node: pathResult.node as TenderNode,
              graphScore: newScore,
              paths: [...(existing?.paths || []), pathResult.path],
            });
          } else if (existing) {
            existing.paths.push(pathResult.path);
          }

          expansionPaths++;
        }
      }
    }

    return {
      expandedResults,
      stats: { nodesTraversed, edgesTraversed, expansionPaths },
    };
  }

  /**
   * Step 4: Merge vector and graph results, re-rank
   */
  private mergeAndRerank(
    vectorResults: VectorResult[],
    expandedResults: Map<string, { node: TenderNode; graphScore: number; paths: string[][] }>,
    topK: number,
    includeExplanation: boolean
  ): GraphRAGResult[] {
    const allResults: GraphRAGResult[] = [];

    // Weight factors for combining scores
    const VECTOR_WEIGHT = 0.7;
    const GRAPH_WEIGHT = 0.3;

    // Add vector results
    for (const result of vectorResults) {
      const tenderId = `tender-${result.id}`;
      const expanded = expandedResults.get(tenderId);
      const graphScore = expanded?.graphScore || 0.5;

      const combinedScore = VECTOR_WEIGHT * result.score + GRAPH_WEIGHT * graphScore;

      allResults.push({
        tenderId: result.id,
        title: result.title,
        description: result.description,
        score: combinedScore,
        vectorScore: result.score,
        graphScore,
        metadata: {
          cpvCodes: result.cpvCodes,
          buyerName: result.buyerName,
          country: result.country,
          value: result.value,
          currency: result.currency,
          deadline: result.deadline,
        },
        explanation: includeExplanation
          ? this.generateExplanation(tenderId, result, expanded?.paths || [])
          : undefined,
      });
    }

    // Add graph-expanded results (not in vector results)
    const vectorIds = new Set(vectorResults.map(r => `tender-${r.id}`));
    for (const [nodeId, { node, graphScore, paths }] of expandedResults) {
      if (!vectorIds.has(nodeId)) {
        const combinedScore = GRAPH_WEIGHT * graphScore; // No vector score

        allResults.push({
          tenderId: node.id.replace('tender-', ''),
          title: node.metadata.title,
          description: node.metadata.description,
          score: combinedScore,
          vectorScore: 0,
          graphScore,
          metadata: {
            ...node.metadata,
            discoveredViaGraph: true,
          },
          explanation: includeExplanation
            ? this.generateGraphOnlyExplanation(nodeId, paths)
            : undefined,
        });
      }
    }

    // Sort by combined score and return top K
    allResults.sort((a, b) => b.score - a.score);
    return allResults.slice(0, topK);
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  private createTenderNode(result: VectorResult): TenderNode {
    return {
      id: `tender-${result.id}`,
      type: 'tender',
      label: result.title,
      metadata: {
        title: result.title,
        description: result.description,
        value: result.value,
        currency: result.currency,
        deadline: result.deadline,
        status: 'open',
        country: result.country,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  private createCPVNode(code: string): CPVCodeNode {
    const parsed = parseCPVCode(code);
    return {
      id: `cpv-${code}`,
      type: 'cpv_code',
      label: `CPV ${code}`,
      metadata: {
        code,
        description: '',
        division: parsed.division || '',
        group: parsed.group || '',
        class: parsed.class || '',
        category: parsed.category || '',
        level: parsed.level || 5,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  private createAuthorityNode(result: VectorResult): ContractingAuthorityNode {
    return {
      id: `authority-${this.slugify(result.buyerName || 'unknown')}`,
      type: 'contracting_authority',
      label: result.buyerName || 'Unknown Authority',
      metadata: {
        name: result.buyerName || 'Unknown',
        country: result.country || '',
        type: 'other',
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  private createSimilarityEdges(results: VectorResult[]): void {
    // Create SIMILAR_TO edges based on shared CPV codes
    for (let i = 0; i < results.length; i++) {
      for (let j = i + 1; j < results.length; j++) {
        const cpvA = new Set(results[i].cpvCodes || []);
        const cpvB = new Set(results[j].cpvCodes || []);

        // Calculate Jaccard similarity
        const intersection = [...cpvA].filter(c => cpvB.has(c)).length;
        const union = new Set([...cpvA, ...cpvB]).size;
        const similarity = union > 0 ? intersection / union : 0;

        if (similarity > 0.3) {
          this.graph.addEdge({
            id: `tender-${results[i].id}-SIMILAR_TO-tender-${results[j].id}`,
            type: 'SIMILAR_TO',
            sourceId: `tender-${results[i].id}`,
            targetId: `tender-${results[j].id}`,
            weight: similarity,
            metadata: { sharedCpvCodes: intersection },
            createdAt: new Date(),
          });
        }
      }
    }
  }

  private generateExplanation(
    tenderId: string,
    result: VectorResult,
    graphPaths: string[][]
  ): GraphRAGResult['explanation'] {
    const relatedEntities: Array<{ type: string; name: string; relationship: string }> = [];

    // Add CPV relationships
    for (const cpv of result.cpvCodes || []) {
      relatedEntities.push({
        type: 'CPV Code',
        name: cpv,
        relationship: 'Classified under',
      });
    }

    // Add authority relationship
    if (result.buyerName) {
      relatedEntities.push({
        type: 'Contracting Authority',
        name: result.buyerName,
        relationship: 'Issued by',
      });
    }

    return {
      vectorMatch: `Semantic similarity score: ${(result.score * 100).toFixed(1)}%`,
      graphPaths: graphPaths.map(p =>
        p.map(id => this.graph.getNode(id)?.label || id).join(' → ')
      ),
      relatedEntities,
    };
  }

  private generateGraphOnlyExplanation(
    nodeId: string,
    paths: string[][]
  ): GraphRAGResult['explanation'] {
    return {
      vectorMatch: 'Discovered through graph relationships (not direct semantic match)',
      graphPaths: paths.map(p =>
        p.map(id => this.graph.getNode(id)?.label || id).join(' → ')
      ),
      relatedEntities: [],
    };
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  // ==========================================================================
  // Graph Management
  // ==========================================================================

  /**
   * Index a tender document into the knowledge graph
   */
  async indexTender(tender: TenderDocument): Promise<void> {
    const tenderNode: TenderNode = {
      id: `tender-${tender.id}`,
      type: 'tender',
      label: tender.title,
      metadata: {
        title: tender.title,
        description: tender.description,
        value: tender.value,
        currency: tender.currency,
        deadline: tender.deadline,
        status: 'open',
        country: tender.country,
        publicationDate: tender.publishedDate,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.graph.addNode(tenderNode);

    // Add CPV codes and relationships
    for (const cpv of tender.cpvCodes || []) {
      const cpvNode = this.createCPVNode(cpv);
      this.graph.addNode(cpvNode);

      this.graph.addEdge({
        id: `${tenderNode.id}-HAS_CPV-${cpvNode.id}`,
        type: 'HAS_CPV',
        sourceId: tenderNode.id,
        targetId: cpvNode.id,
        weight: 0.9,
        metadata: {},
        createdAt: new Date(),
      });
    }

    // Add contracting authority
    if (tender.contractingAuthority) {
      const authorityNode: ContractingAuthorityNode = {
        id: `authority-${this.slugify(tender.contractingAuthority)}`,
        type: 'contracting_authority',
        label: tender.contractingAuthority,
        metadata: {
          name: tender.contractingAuthority,
          country: tender.country || '',
          type: 'other',
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      this.graph.addNode(authorityNode);

      this.graph.addEdge({
        id: `${tenderNode.id}-ISSUED_BY-${authorityNode.id}`,
        type: 'ISSUED_BY',
        sourceId: tenderNode.id,
        targetId: authorityNode.id,
        weight: 0.95,
        metadata: {},
        createdAt: new Date(),
      });
    }

    logger.debug('Indexed tender to knowledge graph', { tenderId: tender.id });
  }

  /**
   * Get graph statistics
   */
  getStats(): ReturnType<KnowledgeGraph['getStats']> {
    return this.graph.getStats();
  }

  /**
   * Clear the knowledge graph
   */
  clear(): void {
    this.graph.clear();
  }
}

// ============================================================================
// Construction
// ============================================================================

/**
 * Create a retriever for one unit of work.
 *
 * Deliberately not a singleton. A retriever owns a mutable graph that it fills
 * from the query's vector hits, so instances must not be shared between
 * requests. Construction is cheap — an empty graph and its type indexes.
 */
export function createGraphRAGRetriever(): GraphRAGRetriever {
  return new GraphRAGRetriever();
}
