/**
 * GraphRAG Module
 *
 * Graph-enhanced Retrieval Augmented Generation for tender discovery.
 * Combines Pinecone vector search with in-memory knowledge graph traversal.
 *
 * Architecture:
 * 1. Query → Vector Search (Pinecone) → Initial candidates
 * 2. Candidates → Entity Extraction → Knowledge Graph update
 * 3. Knowledge Graph → Multi-hop traversal → Related entities
 * 4. Vector results + Graph expansion → Re-ranking → Final results
 *
 * Key Features:
 * - Multi-hop relationship discovery (tender → CPV → related tenders)
 * - CPV code hierarchy traversal
 * - Contracting authority relationships
 * - Similarity-based tender linking
 * - Explainable results with graph paths
 */

// Entity types and utilities
export {
  // Node types
  type NodeType,
  type BaseNode,
  type TenderNode,
  type ContractingAuthorityNode,
  type CPVCodeNode,
  type CompanyNode,
  type RegionNode,
  type CertificationNode,
  type GraphNode,
  // Edge types
  type EdgeType,
  type GraphEdge,
  // Query types
  type TraversalOptions,
  type TraversalResult,
  type GraphQueryResult,
  type ExtractedEntities,
  // Utilities
  parseCPVCode,
  getCPVParents,
} from './entities';

// Knowledge Graph
export { KnowledgeGraph } from './knowledgeGraph';

// GraphRAG Retriever
export {
  type GraphRAGQuery,
  type GraphRAGResult,
  type GraphRAGResponse,
  GraphRAGRetriever,
  createGraphRAGRetriever,
} from './retriever';
