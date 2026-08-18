/**
 * GraphRAG Entity Definitions
 *
 * Defines the node and edge types for the tender knowledge graph.
 */

// ============================================================================
// Node Types
// ============================================================================

export type NodeType =
  | 'tender'
  | 'contracting_authority'
  | 'cpv_code'
  | 'company'
  | 'region'
  | 'certification';

export interface BaseNode {
  id: string;
  type: NodeType;
  label: string;
  metadata: Record<string, unknown>;
  embedding?: number[];
  createdAt: Date;
  updatedAt: Date;
}

export interface TenderNode extends BaseNode {
  type: 'tender';
  metadata: {
    title: string;
    description: string;
    value?: number;
    currency?: string;
    deadline?: string;
    status: 'open' | 'closed' | 'awarded';
    publicationDate?: string;
    country?: string;
  };
}

export interface ContractingAuthorityNode extends BaseNode {
  type: 'contracting_authority';
  metadata: {
    name: string;
    country: string;
    type: 'central_government' | 'regional_authority' | 'local_authority' | 'public_body' | 'other';
    sector?: string;
  };
}

export interface CPVCodeNode extends BaseNode {
  type: 'cpv_code';
  metadata: {
    code: string;
    description: string;
    division: string;      // First 2 digits
    group: string;         // First 3 digits
    class: string;         // First 4 digits
    category: string;      // First 5 digits
    level: number;         // Hierarchy depth (1-5)
  };
}

export interface CompanyNode extends BaseNode {
  type: 'company';
  metadata: {
    name: string;
    country: string;
    size: 'micro' | 'small' | 'medium' | 'large';
    annualRevenue?: number;
    employeeCount?: number;
    foundedYear?: number;
  };
}

export interface RegionNode extends BaseNode {
  type: 'region';
  metadata: {
    name: string;
    country: string;
    nutsCode?: string;  // EU NUTS classification
    level: 'country' | 'region' | 'province' | 'city';
  };
}

export interface CertificationNode extends BaseNode {
  type: 'certification';
  metadata: {
    name: string;
    code: string;
    category: 'quality' | 'environmental' | 'security' | 'industry_specific' | 'other';
    issuingBody?: string;
  };
}

export type GraphNode =
  | TenderNode
  | ContractingAuthorityNode
  | CPVCodeNode
  | CompanyNode
  | RegionNode
  | CertificationNode;

// ============================================================================
// Edge Types
// ============================================================================

export type EdgeType =
  | 'ISSUED_BY'           // Tender → ContractingAuthority
  | 'HAS_CPV'             // Tender → CPVCode
  | 'WON_BY'              // Tender → Company
  | 'PARENT_OF'           // CPVCode → CPVCode (hierarchy)
  | 'SIMILAR_TO'          // Tender → Tender
  | 'OPERATES_IN'         // Company → Region
  | 'HAS_CERTIFICATION'   // Company → Certification
  | 'REQUIRES_CERTIFICATION' // Tender → Certification
  | 'LOCATED_IN'          // ContractingAuthority → Region
  | 'PREVIOUSLY_WON';     // Company → ContractingAuthority (past relationship)

export interface GraphEdge {
  id: string;
  type: EdgeType;
  sourceId: string;
  targetId: string;
  weight: number;         // Relationship strength (0-1)
  metadata: Record<string, unknown>;
  createdAt: Date;
}

// ============================================================================
// Graph Query Types
// ============================================================================

export interface TraversalOptions {
  maxDepth: number;
  edgeTypes?: EdgeType[];
  nodeTypes?: NodeType[];
  minWeight?: number;
  limit?: number;
}

export interface TraversalResult {
  node: GraphNode;
  depth: number;
  path: string[];
  score: number;
}

export interface GraphQueryResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  traversalPaths: TraversalResult[];
}

// ============================================================================
// Entity Extraction
// ============================================================================

export interface ExtractedEntities {
  tenders: Partial<TenderNode>[];
  authorities: Partial<ContractingAuthorityNode>[];
  cpvCodes: Partial<CPVCodeNode>[];
  companies: Partial<CompanyNode>[];
  regions: Partial<RegionNode>[];
  certifications: Partial<CertificationNode>[];
}

/**
 * Parse CPV code into hierarchy components
 */
export function parseCPVCode(code: string): Partial<CPVCodeNode['metadata']> {
  const cleanCode = code.replace(/[^0-9]/g, '').padEnd(8, '0');

  return {
    code: cleanCode,
    division: cleanCode.substring(0, 2),
    group: cleanCode.substring(0, 3),
    class: cleanCode.substring(0, 4),
    category: cleanCode.substring(0, 5),
    level: determineCodeLevel(cleanCode),
  };
}

function determineCodeLevel(code: string): number {
  // Determine hierarchy level based on trailing zeros
  if (code.endsWith('000000')) return 1; // Division
  if (code.endsWith('00000')) return 2;  // Group
  if (code.endsWith('0000')) return 3;   // Class
  if (code.endsWith('000')) return 4;    // Category
  return 5;                               // Full code
}

/**
 * Generate parent CPV codes for hierarchy
 */
export function getCPVParents(code: string): string[] {
  const cleanCode = code.replace(/[^0-9]/g, '').padEnd(8, '0');
  const parents: string[] = [];

  // Division (XX000000)
  const division = cleanCode.substring(0, 2) + '000000';
  if (division !== cleanCode) parents.push(division);

  // Group (XXX00000)
  const group = cleanCode.substring(0, 3) + '00000';
  if (group !== cleanCode && group !== division) parents.push(group);

  // Class (XXXX0000)
  const classCode = cleanCode.substring(0, 4) + '0000';
  if (classCode !== cleanCode && classCode !== group) parents.push(classCode);

  // Category (XXXXX000)
  const category = cleanCode.substring(0, 5) + '000';
  if (category !== cleanCode && category !== classCode) parents.push(category);

  return parents;
}
