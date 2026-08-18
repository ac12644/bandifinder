"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Bot, User, Network } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  ProgressiveTenderCard,
  type AnalysisResult,
} from "./ProgressiveTenderCard";
import { ContractReviewCard } from "./ContractReviewCard";
import {
  AIExplainabilityCard,
  type AIMetadata,
} from "@/components/explainability";
import { cn } from "@/lib/utils";
import type { AIExplainability, GraphRAGInfo } from "../hooks/useAgentStream";

/* -------------------------------------------------------
 * Helpers
 * ----------------------------------------------------- */

function cleanAssistantText(s: string): string {
  if (!s) return "";
  const withoutToolBlocks = s.replace(/^```[\s\S]*?```[\r\n]*/g, "").trim();
  return withoutToolBlocks.replace(/\n{3,}/g, "\n\n");
}

/**
 * Extract complete JSON object from text by finding matching braces
 */
function extractCompleteJSON(text: string, startIndex: number): string | null {
  let braceCount = 0;
  let inString = false;
  let escapeNext = false;
  let start = -1;

  for (let i = startIndex; i < text.length; i++) {
    if (text[i] === "{") {
      start = i;
      braceCount = 1;
      break;
    }
  }

  if (start === -1) return null;

  for (let i = start + 1; i < text.length; i++) {
    const char = text[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === "\\") {
      escapeNext = true;
      continue;
    }

    if (char === '"' && !escapeNext) {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === "{") braceCount++;
      if (char === "}") braceCount--;

      if (braceCount === 0) {
        return text.substring(start, i + 1);
      }
    }
  }

  return null;
}

/**
 * Parse JSON tender data from agent response
 */
function parseTendersFromJSON(text: string): Array<Record<string, unknown>> {
  if (!text || typeof text !== "string") return [];

  try {
    // Strategy 1: Look for JSON object with "tenders" key
    const tendersKeyPattern = /"tenders"\s*:\s*\[/;
    const tendersMatch = text.search(tendersKeyPattern);
    if (tendersMatch !== -1) {
      let objectStart = -1;
      for (let i = tendersMatch; i >= 0; i--) {
        if (text[i] === "{") {
          objectStart = i;
          break;
        }
      }

      if (objectStart !== -1) {
        const jsonStr = extractCompleteJSON(text, objectStart);
        if (jsonStr) {
          try {
            const parsed = JSON.parse(jsonStr);
            if (parsed.tenders && Array.isArray(parsed.tenders)) {
              return parsed.tenders;
            }
          } catch {
            // Continue to next strategy
          }
        }
      }
    }

    // Strategy 2: Look for JSON object with "results" or "data" key
    const resultsPattern = /"(?:results|data)"\s*:\s*\[/;
    const resultsMatch = text.search(resultsPattern);
    if (resultsMatch !== -1) {
      let objectStart = -1;
      for (let i = resultsMatch; i >= 0; i--) {
        if (text[i] === "{") {
          objectStart = i;
          break;
        }
      }

      if (objectStart !== -1) {
        const jsonStr = extractCompleteJSON(text, objectStart);
        if (jsonStr) {
          try {
            const parsed = JSON.parse(jsonStr);
            if (parsed.results && Array.isArray(parsed.results)) {
              return parsed.results;
            }
            if (parsed.data && Array.isArray(parsed.data)) {
              return parsed.data;
            }
          } catch {
            // Continue
          }
        }
      }
    }

    // Strategy 3: Try to parse entire text as JSON
    try {
      const trimmed = text.trim();
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        const fullJson = JSON.parse(trimmed);
        if (Array.isArray(fullJson)) {
          return fullJson;
        }
        if (fullJson.tenders && Array.isArray(fullJson.tenders)) {
          return fullJson.tenders;
        }
      }
    } catch {
      // Not valid JSON
    }
  } catch {
    // Error parsing
  }

  return [];
}

/* -------------------------------------------------------
 * Types
 * ----------------------------------------------------- */

export type ChatMsg = { role: "user" | "assistant"; content: string };

interface AssistantMessageProps {
  text: string;
  tenders?: unknown[];
  contractReview?: { contractId?: string; review?: unknown };
  analyzeEligibility?: (tenderId: string) => Promise<AnalysisResult | null>;
  analyzingTender?: string | null;
  explainability?: AIExplainability;
  graphrag?: GraphRAGInfo;
}

/* -------------------------------------------------------
 * AssistantMessage Component
 * ----------------------------------------------------- */

/**
 * Extract a clean summary message from text (remove JSON and raw data)
 */
function extractCleanSummary(text: string): string {
  if (!text) return "";

  // Remove JSON blocks
  let clean = text.replace(/\{[\s\S]*?\}/g, "").replace(/\[[\s\S]*?\]/g, "");

  // Remove query strings like (FT~"software") AND...
  clean = clean.replace(/\(FT~[^)]+\)[^.]*\./g, "");
  clean = clean.replace(/\(FT~[^)]+\)[^\n]*/g, "");

  // Remove lines that look like raw data
  clean = clean
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return (
        trimmed.length > 0 &&
        !trimmed.startsWith("{") &&
        !trimmed.startsWith("[") &&
        !trimmed.includes("publication-date") &&
        !trimmed.includes("organisation-country") &&
        !trimmed.includes("publicationNumber") &&
        !trimmed.includes("noticeId")
      );
    })
    .join("\n");

  // Extract just the first meaningful sentence
  const firstSentence = clean.match(/^[^.!?]*[.!?]/);
  if (firstSentence && firstSentence[0].length > 10) {
    return firstSentence[0].trim();
  }

  // If we have "Ho trovato X bandi", use that
  const foundMatch = clean.match(/Ho\s+trovato\s+\d+\s+bandi[^.]*[.:]/i);
  if (foundMatch) {
    return foundMatch[0].trim();
  }

  return clean.trim().slice(0, 200);
}

export function AssistantMessage({
  text,
  tenders: structuredTenders,
  contractReview: structuredContractReview,
  analyzeEligibility,
  analyzingTender,
  explainability,
  graphrag,
}: AssistantMessageProps) {
  // Check if this is a contract review response
  const contractReview = React.useMemo(() => {
    if (structuredContractReview?.review) {
      return structuredContractReview.review as Record<string, unknown>;
    }

    try {
      const jsonMatch = text.match(/\{[\s\S]*"review"[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.review || parsed.contractId) {
          return parsed.review || parsed;
        }
      }
      const directMatch = text.match(
        /\{[\s\S]*"summary"[\s\S]*"risks"[\s\S]*\}/
      );
      if (directMatch) {
        return JSON.parse(directMatch[0]);
      }
    } catch {
      // Not a contract review
    }
    return null;
  }, [text, structuredContractReview]);

  const contractId = React.useMemo(() => {
    if (structuredContractReview?.contractId) {
      return structuredContractReview.contractId;
    }
    const idMatch = text.match(/"contractId"\s*:\s*"([^"]+)"/);
    return idMatch ? idMatch[1] : undefined;
  }, [text, structuredContractReview]);

  const jsonTenders = React.useMemo(() => parseTendersFromJSON(text), [text]);

  // Clean summary for display when we have tenders
  const cleanSummary = React.useMemo(() => extractCleanSummary(text), [text]);

  // If it's a contract review, display it
  if (contractReview) {
    return (
      <div className="space-y-4">
        <ContractReviewCard review={contractReview} contractId={contractId} />
        {text && text.trim() && !text.includes('"review"') && (
          <div className="text-sm text-gray-600 mt-4">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {cleanAssistantText(text)}
            </ReactMarkdown>
          </div>
        )}
      </div>
    );
  }

  const tenders =
    structuredTenders && structuredTenders.length > 0
      ? structuredTenders
      : jsonTenders;

  // Explainability metadata display
  const explainabilityCard = explainability && (
    <AIExplainabilityCard
      metadata={explainability as AIMetadata}
      compact
      className="mt-3"
    />
  );

  // GraphRAG stats display
  const graphragStats = graphrag?.graphStats && (
    <div className="mt-3 pt-3 border-t border-gray-100">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Network className="h-3 w-3" />
        <span>GraphRAG:</span>
        <span>{graphrag.graphStats.nodesTraversed} nodi</span>
        <span>·</span>
        <span>{graphrag.graphStats.edgesTraversed} archi</span>
        {graphrag.timing && (
          <>
            <span>·</span>
            <span>{graphrag.timing.totalMs}ms</span>
          </>
        )}
      </div>
    </div>
  );

  if (tenders.length > 0) {
    return (
      <div className="space-y-4 w-full">
        {/* Results header */}
        <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-emerald-50 to-green-50 rounded-xl border border-emerald-100">
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-br from-emerald-500 to-green-500 text-white shadow-lg shadow-emerald-200">
            <span className="text-xl font-bold">{tenders.length}</span>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              {tenders.length === 1 ? "Bando Trovato" : "Bandi Trovati"}
            </h3>
            <p className="text-sm text-emerald-700">
              Risultati rilevanti per la tua ricerca
            </p>
          </div>
        </div>

        {/* Render tender cards */}
        {tenders.map((tender, i: number) => {
          const tenderObj = tender as Record<string, unknown>;

          // Parse value safely
          let parsedValue: number | undefined;
          if (typeof tenderObj.value === "number") {
            parsedValue = tenderObj.value;
          } else if (typeof tenderObj.value === "string") {
            const cleaned = (tenderObj.value as string).replace(/[€,\s]/g, "").replace(/\./g, "");
            parsedValue = parseFloat(cleaned) || undefined;
          } else if (typeof tenderObj.estimatedValue === "number") {
            parsedValue = tenderObj.estimatedValue;
          }

          const normalizedTender = {
            publicationNumber:
              (tenderObj.publicationNumber as string) ||
              (tenderObj.pubno as string) ||
              (tenderObj.id as string),
            noticeId:
              (tenderObj.noticeId as string) ||
              (tenderObj.publicationNumber as string) ||
              (tenderObj.id as string),
            title: (tenderObj.title as string) || "Bando senza titolo",
            buyer:
              (tenderObj.buyer as string) ||
              (tenderObj.buyerName as string) ||
              (tenderObj.organisation as string) ||
              "Ente non specificato",
            publicationDate: tenderObj.publicationDate as string | undefined,
            deadline: tenderObj.deadline as string | undefined,
            cpv: tenderObj.cpv as string | string[] | undefined,
            cpvCodes: tenderObj.cpvCodes as string[] | undefined,
            value: parsedValue,
            valueFormatted: tenderObj.valueFormatted as string | undefined,
            country: tenderObj.country as string | undefined,
            pdf:
              (tenderObj.pdf as string | undefined) ||
              ((tenderObj.links as { pdf?: string })?.pdf as string | undefined),
            description: tenderObj.description as string | undefined,
            procedureType: tenderObj.procedureType as string | undefined,
            contractNature: tenderObj.contractNature as string | undefined,
            isFrameworkAgreement: tenderObj.isFrameworkAgreement as boolean | undefined,
          };

          return (
            <ProgressiveTenderCard
              key={`${
                normalizedTender.noticeId || normalizedTender.publicationNumber
              }-${i}`}
              tender={normalizedTender}
              onAnalyzeEligibility={analyzeEligibility}
              analyzingTender={analyzingTender}
            />
          );
        })}
        {graphragStats}
        {explainabilityCard}
      </div>
    );
  }

  return (
    <div className="space-y-0">
      <div className="prose prose-sm dark:prose-invert max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {cleanAssistantText(text)}
        </ReactMarkdown>
      </div>
      {graphragStats}
      {explainabilityCard}
    </div>
  );
}

/* -------------------------------------------------------
 * ChatMessages Component
 * ----------------------------------------------------- */

interface ChatMessagesProps {
  messages: ChatMsg[];
  streamingContent?: string;
  streamingTenders?: unknown[];
  streamContractReview?: { contractId?: string; review?: unknown };
  isStreaming: boolean;
  analyzeEligibility?: (tenderId: string) => Promise<AnalysisResult | null>;
  analyzingTender?: string | null;
  explainability?: AIExplainability;
  graphrag?: GraphRAGInfo;
}

export function ChatMessages({
  messages,
  streamingContent,
  streamingTenders,
  streamContractReview,
  isStreaming,
  analyzeEligibility,
  analyzingTender,
  explainability,
  graphrag,
}: ChatMessagesProps) {
  return (
    <div className="space-y-4">
      {messages.map((m, i) => (
        <div
          key={i}
          className={cn(
            "flex gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300",
            m.role === "user" ? "justify-end" : "justify-start"
          )}
          style={{
            animationDelay: `${Math.min(i * 50, 200)}ms`,
            animationFillMode: "both",
          }}
        >
          {/* Assistant Avatar */}
          {m.role === "assistant" && (
            <Avatar className="h-8 w-8 shrink-0 border border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50">
              <AvatarFallback className="bg-transparent">
                <Bot className="h-4 w-4 text-blue-600" />
              </AvatarFallback>
            </Avatar>
          )}

          <div
            className={cn(
              "px-4 py-3 text-sm",
              m.role === "user"
                ? "max-w-[80%] bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-2xl rounded-br-md shadow-md"
                : "flex-1 max-w-[calc(100%-3rem)] bg-white text-gray-800 rounded-2xl rounded-tl-md border border-gray-100 shadow-sm"
            )}
          >
            {m.role === "assistant" ? (
              <AssistantMessage
                text={m.content}
                contractReview={
                  streamingContent === m.content
                    ? streamContractReview
                    : undefined
                }
                analyzeEligibility={analyzeEligibility}
                analyzingTender={analyzingTender}
              />
            ) : (
              <span className="leading-relaxed">{m.content}</span>
            )}
          </div>

          {/* User Avatar */}
          {m.role === "user" && (
            <Avatar className="h-8 w-8 shrink-0 border border-blue-200 bg-gradient-to-br from-blue-500 to-blue-600">
              <AvatarFallback className="bg-transparent text-white">
                <User className="h-4 w-4" />
              </AvatarFallback>
            </Avatar>
          )}
        </div>
      ))}

      {/* Streaming content preview */}
      {isStreaming && streamingContent && (
        <div className="flex gap-3 justify-start animate-in fade-in slide-in-from-bottom-2 duration-300">
          <Avatar className="h-8 w-8 shrink-0 border border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50">
            <AvatarFallback className="bg-transparent">
              <Bot className="h-4 w-4 text-blue-600 animate-pulse" />
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 max-w-[calc(100%-3rem)] px-4 py-3 text-sm bg-white text-gray-800 rounded-2xl rounded-tl-md border border-blue-100 shadow-sm">
            <AssistantMessage
              text={streamingContent}
              tenders={streamingTenders}
              contractReview={streamContractReview}
              analyzeEligibility={analyzeEligibility}
              analyzingTender={analyzingTender}
              explainability={explainability}
              graphrag={graphrag}
            />
            <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2">
              <div className="flex gap-1">
                <span
                  className="w-2 h-2 rounded-full bg-blue-400 animate-bounce"
                  style={{ animationDelay: "0ms" }}
                />
                <span
                  className="w-2 h-2 rounded-full bg-blue-400 animate-bounce"
                  style={{ animationDelay: "150ms" }}
                />
                <span
                  className="w-2 h-2 rounded-full bg-blue-400 animate-bounce"
                  style={{ animationDelay: "300ms" }}
                />
              </div>
              <span className="text-xs text-gray-500">
                Elaborando risposta...
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
