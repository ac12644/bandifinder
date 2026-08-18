"use client";

import { useState, useCallback } from "react";
import { useAuth } from "@/components/AuthProvider";
import { API_BASE_URL, ENDPOINTS } from "@/lib/apiConfig";

export interface GraphRAGExplanation {
  vectorMatch: string;
  graphPaths: string[];
  relatedEntities: {
    type: string;
    name: string;
    relationship: string;
  }[];
}

export interface GraphRAGResult {
  tenderId: string;
  title: string;
  description: string;
  score: number;
  vectorScore: number;
  graphScore: number;
  metadata: Record<string, unknown>;
  explanation?: GraphRAGExplanation;
}

export interface GraphRAGResponse {
  success: boolean;
  results: GraphRAGResult[];
  count: number;
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
  error?: string;
}

export interface GraphRAGFilters {
  cpvCodes?: string[];
  countries?: string[];
  minValue?: number;
  maxValue?: number;
  deadline?: string;
}

export interface GraphRAGOptions {
  vectorTopK?: number;
  graphDepth?: number;
  graphExpansion?: number;
  finalTopK?: number;
  includeExplanation?: boolean;
}

export function useGraphRAGSearch() {
  const { uid, idToken } = useAuth();
  const [results, setResults] = useState<GraphRAGResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<GraphRAGResponse["graphStats"] | null>(null);
  const [timing, setTiming] = useState<GraphRAGResponse["timing"] | null>(null);

  const search = useCallback(
    async (
      query: string,
      filters?: GraphRAGFilters,
      options?: GraphRAGOptions
    ): Promise<GraphRAGResult[]> => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`${API_BASE_URL}${ENDPOINTS.graphragSearch}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-user-id": uid ?? "anon",
            ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
          },
          body: JSON.stringify({
            query,
            filters,
            options: {
              vectorTopK: options?.vectorTopK ?? 20,
              graphDepth: options?.graphDepth ?? 2,
              graphExpansion: options?.graphExpansion ?? 10,
              finalTopK: options?.finalTopK ?? 10,
              includeExplanation: options?.includeExplanation ?? true,
            },
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data: GraphRAGResponse = await response.json();

        if (!data.success) {
          throw new Error(data.error || "GraphRAG search failed");
        }

        setResults(data.results);
        setStats(data.graphStats);
        setTiming(data.timing);

        return data.results;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error";
        setError(errorMessage);
        return [];
      } finally {
        setIsLoading(false);
      }
    },
    [uid, idToken]
  );

  const reset = useCallback(() => {
    setResults([]);
    setError(null);
    setStats(null);
    setTiming(null);
  }, []);

  return {
    results,
    isLoading,
    error,
    stats,
    timing,
    search,
    reset,
  };
}
