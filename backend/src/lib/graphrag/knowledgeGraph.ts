/**
 * In-Memory Knowledge Graph
 *
 * Provides graph storage and traversal for GraphRAG.
 * Nodes and edges are stored in memory with optional persistence to Pinecone.
 */

import {
  GraphNode,
  GraphEdge,
  NodeType,
  EdgeType,
  TraversalOptions,
  TraversalResult,
  GraphQueryResult,
} from './entities';

// ============================================================================
// Knowledge Graph Class
// ============================================================================

export class KnowledgeGraph {
  private nodes: Map<string, GraphNode> = new Map();
  private edges: Map<string, GraphEdge> = new Map();

  // Adjacency lists for fast traversal
  private outgoing: Map<string, Set<string>> = new Map(); // nodeId -> edgeIds
  private incoming: Map<string, Set<string>> = new Map(); // nodeId -> edgeIds

  // Indexes for fast lookup
  private nodesByType: Map<NodeType, Set<string>> = new Map();
  private edgesByType: Map<EdgeType, Set<string>> = new Map();

  constructor() {
    // Initialize type indexes
    const nodeTypes: NodeType[] = [
      'tender', 'contracting_authority', 'cpv_code',
      'company', 'region', 'certification'
    ];
    const edgeTypes: EdgeType[] = [
      'ISSUED_BY', 'HAS_CPV', 'WON_BY', 'PARENT_OF', 'SIMILAR_TO',
      'OPERATES_IN', 'HAS_CERTIFICATION', 'REQUIRES_CERTIFICATION',
      'LOCATED_IN', 'PREVIOUSLY_WON'
    ];

    nodeTypes.forEach(t => this.nodesByType.set(t, new Set()));
    edgeTypes.forEach(t => this.edgesByType.set(t, new Set()));
  }

  // ==========================================================================
  // Node Operations
  // ==========================================================================

  addNode(node: GraphNode): void {
    this.nodes.set(node.id, node);
    this.nodesByType.get(node.type)?.add(node.id);

    // Initialize adjacency lists
    if (!this.outgoing.has(node.id)) this.outgoing.set(node.id, new Set());
    if (!this.incoming.has(node.id)) this.incoming.set(node.id, new Set());
  }

  getNode(id: string): GraphNode | undefined {
    return this.nodes.get(id);
  }

  getNodesByType(type: NodeType): GraphNode[] {
    const ids = this.nodesByType.get(type) || new Set();
    return Array.from(ids).map(id => this.nodes.get(id)!).filter(Boolean);
  }

  updateNode(id: string, updates: Partial<GraphNode>): void {
    const node = this.nodes.get(id);
    if (node) {
      this.nodes.set(id, {
        ...node,
        ...updates,
        updatedAt: new Date(),
      } as GraphNode);
    }
  }

  removeNode(id: string): void {
    const node = this.nodes.get(id);
    if (!node) return;

    // Remove all connected edges
    const outEdges = this.outgoing.get(id) || new Set();
    const inEdges = this.incoming.get(id) || new Set();

    [...outEdges, ...inEdges].forEach(edgeId => this.removeEdge(edgeId));

    // Remove from indexes
    this.nodesByType.get(node.type)?.delete(id);
    this.outgoing.delete(id);
    this.incoming.delete(id);
    this.nodes.delete(id);
  }

  // ==========================================================================
  // Edge Operations
  // ==========================================================================

  addEdge(edge: GraphEdge): void {
    // Ensure both nodes exist
    if (!this.nodes.has(edge.sourceId) || !this.nodes.has(edge.targetId)) {
      console.warn(`Cannot add edge: nodes ${edge.sourceId} or ${edge.targetId} not found`);
      return;
    }

    this.edges.set(edge.id, edge);
    this.edgesByType.get(edge.type)?.add(edge.id);

    // Update adjacency lists
    this.outgoing.get(edge.sourceId)?.add(edge.id);
    this.incoming.get(edge.targetId)?.add(edge.id);
  }

  getEdge(id: string): GraphEdge | undefined {
    return this.edges.get(id);
  }

  getEdgesByType(type: EdgeType): GraphEdge[] {
    const ids = this.edgesByType.get(type) || new Set();
    return Array.from(ids).map(id => this.edges.get(id)!).filter(Boolean);
  }

  getOutgoingEdges(nodeId: string, edgeType?: EdgeType): GraphEdge[] {
    const edgeIds = this.outgoing.get(nodeId) || new Set();
    const edges = Array.from(edgeIds).map(id => this.edges.get(id)!).filter(Boolean);
    return edgeType ? edges.filter(e => e.type === edgeType) : edges;
  }

  getIncomingEdges(nodeId: string, edgeType?: EdgeType): GraphEdge[] {
    const edgeIds = this.incoming.get(nodeId) || new Set();
    const edges = Array.from(edgeIds).map(id => this.edges.get(id)!).filter(Boolean);
    return edgeType ? edges.filter(e => e.type === edgeType) : edges;
  }

  removeEdge(id: string): void {
    const edge = this.edges.get(id);
    if (!edge) return;

    this.edgesByType.get(edge.type)?.delete(id);
    this.outgoing.get(edge.sourceId)?.delete(id);
    this.incoming.get(edge.targetId)?.delete(id);
    this.edges.delete(id);
  }

  // ==========================================================================
  // Graph Traversal
  // ==========================================================================

  /**
   * Breadth-first traversal from a starting node
   */
  traverse(startId: string, options: TraversalOptions): TraversalResult[] {
    const results: TraversalResult[] = [];
    const visited = new Set<string>();
    const queue: { nodeId: string; depth: number; path: string[]; score: number }[] = [];

    const startNode = this.nodes.get(startId);
    if (!startNode) return results;

    queue.push({ nodeId: startId, depth: 0, path: [startId], score: 1.0 });

    while (queue.length > 0) {
      const { nodeId, depth, path, score } = queue.shift()!;

      if (visited.has(nodeId)) continue;
      visited.add(nodeId);

      const node = this.nodes.get(nodeId);
      if (!node) continue;

      // Check node type filter
      if (options.nodeTypes && !options.nodeTypes.includes(node.type)) continue;

      // Add to results (skip start node)
      if (nodeId !== startId) {
        results.push({ node, depth, path, score });
      }

      // Stop if max depth reached
      if (depth >= options.maxDepth) continue;

      // Get neighbors
      const outEdges = this.getOutgoingEdges(nodeId);
      const inEdges = this.getIncomingEdges(nodeId);

      for (const edge of [...outEdges, ...inEdges]) {
        // Check edge type filter
        if (options.edgeTypes && !options.edgeTypes.includes(edge.type)) continue;

        // Check weight threshold
        if (options.minWeight && edge.weight < options.minWeight) continue;

        const neighborId = edge.sourceId === nodeId ? edge.targetId : edge.sourceId;
        if (!visited.has(neighborId)) {
          queue.push({
            nodeId: neighborId,
            depth: depth + 1,
            path: [...path, neighborId],
            score: score * edge.weight,
          });
        }
      }
    }

    // Sort by score descending and apply limit
    results.sort((a, b) => b.score - a.score);
    return options.limit ? results.slice(0, options.limit) : results;
  }

  /**
   * Find shortest path between two nodes
   */
  findPath(sourceId: string, targetId: string, maxDepth = 5): string[] | null {
    const visited = new Set<string>();
    const queue: { nodeId: string; path: string[] }[] = [];

    queue.push({ nodeId: sourceId, path: [sourceId] });

    while (queue.length > 0) {
      const { nodeId, path } = queue.shift()!;

      if (nodeId === targetId) return path;
      if (path.length > maxDepth) continue;
      if (visited.has(nodeId)) continue;

      visited.add(nodeId);

      const outEdges = this.getOutgoingEdges(nodeId);
      const inEdges = this.getIncomingEdges(nodeId);

      for (const edge of [...outEdges, ...inEdges]) {
        const neighborId = edge.sourceId === nodeId ? edge.targetId : edge.sourceId;
        if (!visited.has(neighborId)) {
          queue.push({ nodeId: neighborId, path: [...path, neighborId] });
        }
      }
    }

    return null;
  }

  /**
   * Get neighbors of a node
   */
  getNeighbors(nodeId: string, direction: 'outgoing' | 'incoming' | 'both' = 'both'): GraphNode[] {
    const neighborIds = new Set<string>();

    if (direction === 'outgoing' || direction === 'both') {
      for (const edge of this.getOutgoingEdges(nodeId)) {
        neighborIds.add(edge.targetId);
      }
    }

    if (direction === 'incoming' || direction === 'both') {
      for (const edge of this.getIncomingEdges(nodeId)) {
        neighborIds.add(edge.sourceId);
      }
    }

    return Array.from(neighborIds)
      .map(id => this.nodes.get(id)!)
      .filter(Boolean);
  }

  /**
   * Find related tenders through multi-hop traversal
   */
  findRelatedTenders(tenderId: string, options: Partial<TraversalOptions> = {}): GraphQueryResult {
    const traversalOptions: TraversalOptions = {
      maxDepth: options.maxDepth || 3,
      nodeTypes: options.nodeTypes || ['tender'],
      minWeight: options.minWeight || 0.3,
      limit: options.limit || 20,
    };

    const traversalPaths = this.traverse(tenderId, traversalOptions);

    const nodeIds = new Set<string>();
    const edgeIds = new Set<string>();

    // Collect all nodes and edges in the paths
    for (const result of traversalPaths) {
      for (let i = 0; i < result.path.length; i++) {
        nodeIds.add(result.path[i]);

        if (i > 0) {
          // Find edge between consecutive nodes
          const prevId = result.path[i - 1];
          const currId = result.path[i];

          for (const edge of this.getOutgoingEdges(prevId)) {
            if (edge.targetId === currId) edgeIds.add(edge.id);
          }
          for (const edge of this.getIncomingEdges(prevId)) {
            if (edge.sourceId === currId) edgeIds.add(edge.id);
          }
        }
      }
    }

    return {
      nodes: Array.from(nodeIds).map(id => this.nodes.get(id)!).filter(Boolean),
      edges: Array.from(edgeIds).map(id => this.edges.get(id)!).filter(Boolean),
      traversalPaths,
    };
  }

  // ==========================================================================
  // Graph Statistics
  // ==========================================================================

  getStats(): {
    nodeCount: number;
    edgeCount: number;
    nodesByType: Record<string, number>;
    edgesByType: Record<string, number>;
  } {
    const nodesByType: Record<string, number> = {};
    const edgesByType: Record<string, number> = {};

    for (const [type, ids] of this.nodesByType) {
      nodesByType[type] = ids.size;
    }

    for (const [type, ids] of this.edgesByType) {
      edgesByType[type] = ids.size;
    }

    return {
      nodeCount: this.nodes.size,
      edgeCount: this.edges.size,
      nodesByType,
      edgesByType,
    };
  }

  // ==========================================================================
  // Serialization
  // ==========================================================================

  toJSON(): { nodes: GraphNode[]; edges: GraphEdge[] } {
    return {
      nodes: Array.from(this.nodes.values()),
      edges: Array.from(this.edges.values()),
    };
  }

  fromJSON(data: { nodes: GraphNode[]; edges: GraphEdge[] }): void {
    this.clear();
    data.nodes.forEach(node => this.addNode(node));
    data.edges.forEach(edge => this.addEdge(edge));
  }

  clear(): void {
    this.nodes.clear();
    this.edges.clear();
    this.outgoing.clear();
    this.incoming.clear();

    for (const set of this.nodesByType.values()) set.clear();
    for (const set of this.edgesByType.values()) set.clear();
  }
}

// ============================================================================
// Lifetime
// ============================================================================
//
// There is deliberately no process-wide singleton here.
//
// A KnowledgeGraph is a mutable accumulator: callers add nodes and edges to it
// and then traverse. Sharing one instance across requests meant every query's
// results stayed in the graph forever — the graph grew without bound for the
// lifetime of the serverless instance, and each query's traversal walked
// whatever every previous caller had searched for. Results depended on the
// instance's history rather than on the query.
//
// Construct one per unit of work (see GraphRAGRetriever) and let it be
// collected when that work finishes.
