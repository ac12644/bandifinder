/**
 * Response Formatter
 *
 * Extracts structured data from agent responses.
 */

export interface Tender {
  publicationNumber?: string;
  noticeId?: string;
  title?: string;
  buyer?: string;
  publicationDate?: string;
  deadline?: string;
  cpv?: string;
  value?: number;
  valueFormatted?: string;
  pdf?: string;
  description?: string;
  score?: number;
}

export interface ContractReview {
  summary?: string;
  keyTerms?: Record<string, unknown>;
  clauses?: Array<{
    type: string;
    content: string;
    riskLevel: string;
    notes?: string;
  }>;
  risks?: Array<{
    category: string;
    description: string;
    severity: string;
    mitigation?: string;
  }>;
  recommendations?: string[];
  overallRiskScore?: number;
}

export interface StructuredResponse {
  tenders?: Tender[];
  contractReview?: ContractReview;
  metadata?: {
    query?: string;
    count?: number;
    searchType?: string;
    timestamp?: string;
  };
}

/**
 * Format structured response from agent messages.
 */
export function formatStructuredResponse(
  messages: unknown[],
  accumulatedContent: string
): StructuredResponse {
  const result: StructuredResponse = {};

  // Try to extract tenders from tool messages
  for (const message of messages) {
    const content = extractMessageContent(message);
    if (!content) continue;

    // Try to parse as JSON
    try {
      const parsed = typeof content === "string" ? JSON.parse(content) : content;

      // Check for tenders
      if (parsed.tenders && Array.isArray(parsed.tenders)) {
        result.tenders = parsed.tenders;
        result.metadata = {
          query: parsed.query,
          count: parsed.count || parsed.tenders.length,
          searchType: parsed.searchType,
          timestamp: new Date().toISOString(),
        };
      }

      // Check for contract review
      if (parsed.contractReview || parsed.analysis) {
        result.contractReview = parsed.contractReview || parsed.analysis;
      }

      // Check for ranked tenders
      if (parsed.rankedTenders && Array.isArray(parsed.rankedTenders)) {
        result.tenders = parsed.rankedTenders;
        result.metadata = {
          count: parsed.rankedTenders.length,
          timestamp: new Date().toISOString(),
        };
      }

      // Check for suggestions
      if (parsed.suggestions && Array.isArray(parsed.suggestions)) {
        result.tenders = parsed.suggestions;
        result.metadata = {
          count: parsed.suggestions.length,
          searchType: "personalized",
          timestamp: new Date().toISOString(),
        };
      }
    } catch {
      // Not JSON, skip
    }
  }

  // Try to extract from accumulated content if not found
  if (!result.tenders && accumulatedContent) {
    try {
      // Look for JSON in the content
      const jsonMatch = accumulatedContent.match(/\{[\s\S]*"tenders"[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.tenders) {
          result.tenders = parsed.tenders;
          result.metadata = {
            count: parsed.tenders.length,
            timestamp: new Date().toISOString(),
          };
        }
      }
    } catch {
      // Ignore parsing errors
    }
  }

  return result;
}

/**
 * Extract content from a message object.
 */
function extractMessageContent(message: unknown): string | null {
  if (!message || typeof message !== "object") return null;

  const msg = message as { content?: unknown; name?: string };

  // Skip non-tool messages for structured data extraction
  const type = getMessageType(message);
  if (type !== "tool" && type !== "ai") return null;

  if (typeof msg.content === "string") {
    return msg.content;
  }

  if (Array.isArray(msg.content)) {
    return msg.content
      .map((p) => {
        if (typeof p === "string") return p;
        const part = p as { text?: string };
        return part?.text || "";
      })
      .filter(Boolean)
      .join("\n");
  }

  return null;
}

/**
 * Get message type.
 */
function getMessageType(message: unknown): string {
  if (!message || typeof message !== "object") return "unknown";

  const msg = message as { _getType?: () => string; type?: string };

  if (typeof msg._getType === "function") {
    return msg._getType();
  }

  return msg.type || "unknown";
}
