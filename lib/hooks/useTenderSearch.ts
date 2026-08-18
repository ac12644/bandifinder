"use client";

import { useState, useCallback } from "react";
import { useApiQuery, useApiMutation } from "@/lib/hooks/useAuthedFetch";

export interface TenderSearchFilters {
  query?: string;
  country?: string;
  minValue?: number;
  maxValue?: number;
  daysBack?: number;
  cpvCodes?: string[];
}

export interface SearchTender {
  id: string;
  title: string;
  buyer?: string;
  value?: number;
  currency?: string;
  deadline?: string;
  country?: string;
  cpv?: string;
  fitScore?: number;
  recommendation?: "BID" | "REVIEW" | "SKIP";
  publishedDate?: string;
  description?: string;
}

export interface SearchResult {
  tenders: SearchTender[];
  total: number;
}

export function useTenderSearch() {
  // Italy by default: this is an Italian product for Italian firms, and
  // opening on the full TED feed buries domestic tenders under Slovenian,
  // Belgian and Greek notices. Widening to the rest of the EU stays one
  // click away in the Paese filter.
  const [filters, setFilters] = useState<TenderSearchFilters>({
    country: "ITA",
    daysBack: 14,
  });

  const buildQueryString = useCallback(() => {
    const params = new URLSearchParams();
    if (filters.query) params.set("query", filters.query);
    if (filters.country) params.set("country", filters.country);
    if (filters.minValue) params.set("minValue", String(filters.minValue));
    if (filters.maxValue) params.set("maxValue", String(filters.maxValue));
    if (filters.daysBack) params.set("daysBack", String(filters.daysBack));
    if (filters.cpvCodes?.length)
      params.set("cpvCodes", filters.cpvCodes.join(","));
    return params.toString();
  }, [filters]);

  const queryString = buildQueryString();
  const hasQuery = !!filters.query;

  const searchResult = useApiQuery<SearchResult>(
    ["tender-search", queryString],
    hasQuery
      ? `/tenders/search?${queryString}`
      : `/tenders/best?${queryString}&limit=20`,
    {
      staleTime: 2 * 60 * 1000,
    }
  );

  const updateFilters = useCallback(
    (update: Partial<TenderSearchFilters>) => {
      setFilters((prev) => ({ ...prev, ...update }));
    },
    []
  );

  const resetFilters = useCallback(() => {
    setFilters({ country: "ITA", daysBack: 14 });
  }, []);

  return {
    filters,
    updateFilters,
    resetFilters,
    tenders: searchResult.data?.tenders ?? [],
    total: searchResult.data?.total ?? 0,
    isLoading: searchResult.isLoading,
    isFetching: searchResult.isFetching,
    isError: searchResult.isError,
    refetch: searchResult.refetch,
  };
}

export function useSaveFavorite() {
  return useApiMutation<{ success: boolean }, { tenderId: string; title: string; value?: number; deadline?: string }>(
    "/tenders/favorite",
    "POST"
  );
}
