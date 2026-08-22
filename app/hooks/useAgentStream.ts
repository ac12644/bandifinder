"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useAuth } from "@/components/AuthProvider";
import { API_BASE_URL, ENDPOINTS } from "@/lib/apiConfig";

export type LLMProvider = "gemini" | "openrouter" | "openai" | "anthropic";

export interface AIExplainability {
  agentUsed: string;
  qualityScore: number;
  reflectionCount: number;
  qualityIssues?: string[];
  reflectionFeedback?: string;
  executionTimeMs?: number;
  humanReviewRequired?: boolean;
  humanReviewReason?: string;
}

export interface StreamChunk {
  content?: string;
  done?: boolean;
  error?: string;
  thread_id?: string;
  provider?: LLMProvider;
  model?: string;
  tenders?: unknown[];
  contractReview?: {
    contractId?: string;
    review?: unknown;
  };
  metadata?: {
    query?: string;
    filters?: Record<string, unknown>;
    resultCount?: number;
  };
  // Explainability data
  explainability?: AIExplainability;
}

export function useAgentStream() {
  const { uid, idToken } = useAuth();
  const [content, setContent] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [tenders, setTenders] = useState<unknown[]>([]);
  const [contractReview, setContractReview] =
    useState<StreamChunk["contractReview"]>(undefined);
  const [metadata, setMetadata] = useState<StreamChunk["metadata"]>(undefined);
  const [explainability, setExplainability] = useState<AIExplainability | undefined>(undefined);

  // AbortController for cancellation
  const abortControllerRef = useRef<AbortController | null>(null);
  // Track if component is mounted
  const isMountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      // Abort any in-flight request on unmount
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  const stream = useCallback(
    async (
      messages: Array<{ role: string; content: string }>,
      existingThreadId?: string,
      provider?: LLMProvider,
      model?: string
    ) => {
      // Abort any existing request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Create new AbortController for this request
      abortControllerRef.current = new AbortController();
      const { signal } = abortControllerRef.current;

      // Reset state
      setContent("");
      setIsStreaming(true);
      setError(null);
      setTenders([]);
      setContractReview(undefined);
      setMetadata(undefined);
      setExplainability(undefined);

      try {
        const response = await fetch(`${API_BASE_URL}${ENDPOINTS.agentStream}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-user-id": uid ?? "anon",
            ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
          },
          body: JSON.stringify({
            messages,
            thread_id: existingThreadId,
            ...(provider && { provider }),
            ...(model && { model }),
          }),
          signal, // Pass abort signal
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
          throw new Error("No response body");
        }

        let buffer = "";

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            // Check if aborted
            if (signal.aborted) {
              reader.cancel();
              break;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                try {
                  const data: StreamChunk = JSON.parse(line.slice(6));

                  // Only update state if still mounted and not aborted
                  if (!isMountedRef.current || signal.aborted) continue;

                  if (data.error) {
                    setError(data.error);
                    setIsStreaming(false);
                    return;
                  }

                  if (data.content) {
                    setContent((prev) => prev + data.content);
                  }

                  if (data.thread_id) {
                    setThreadId(data.thread_id);
                  }

                  if (data.tenders && Array.isArray(data.tenders)) {
                    setTenders(data.tenders);
                  }

                  if (data.contractReview) {
                    setContractReview(data.contractReview);
                  }

                  if (data.metadata) {
                    setMetadata(data.metadata);
                  }

                  if (data.explainability) {
                    setExplainability(data.explainability);
                  }

                  if (data.done) {
                    setIsStreaming(false);
                    return;
                  }
                } catch (e) {
                  console.warn("Failed to parse SSE data:", e);
                }
              }
            }
          }
        } finally {
          // Ensure reader is released
          reader.releaseLock();
        }

        if (isMountedRef.current && !signal.aborted) {
          setIsStreaming(false);
        }
      } catch (err) {
        // Don't report abort errors
        if (err instanceof Error && err.name === "AbortError") {
          console.log("[useAgentStream] Request aborted");
          return;
        }

        if (isMountedRef.current) {
          const errorMessage =
            err instanceof Error ? err.message : "Unknown error";
          setError(errorMessage);
          setIsStreaming(false);
        }
      } finally {
        // Clear the abort controller reference
        if (abortControllerRef.current?.signal === signal) {
          abortControllerRef.current = null;
        }
      }
    },
    [uid, idToken]
  );

  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  const reset = useCallback(() => {
    stop();
    setContent("");
    setError(null);
    setThreadId(null);
    setTenders([]);
    setContractReview(undefined);
    setMetadata(undefined);
    setExplainability(undefined);
  }, [stop]);

  return {
    content,
    isStreaming,
    error,
    threadId,
    tenders,
    contractReview,
    metadata,
    explainability,
    stream,
    stop,
    reset,
  };
}
