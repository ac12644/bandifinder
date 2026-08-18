"use client";

import { useApiQuery, useApiMutation } from "@/lib/hooks/useAuthedFetch";
import { useQueryClient } from "@tanstack/react-query";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OutcomeType = "won" | "lost" | "withdrawn" | "no_response";

export interface BidOutcome {
  id: string;
  bid_id: string;
  organization_id: string;
  outcome: OutcomeType;
  winning_bidder: string | null;
  winning_amount: number | null;
  num_bidders: number | null;
  reason: string | null;
  lessons_learned: string | null;
  tender_value: number | null;
  tender_buyer: string | null;
  tender_country: string | null;
  contract_nature: string | null;
  outcome_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface OutcomeStats {
  total: number;
  won: number;
  lost: number;
  withdrawn: number;
  noResponse: number;
  winRate: number;
  totalWonValue: number;
  avgWonValue: number;
}

export interface SegmentStat {
  segment: string;
  won: number;
  lost: number;
  total: number;
  winRate: number;
}

export interface CompetitorInfo {
  name: string;
  winsAgainstUs: number;
  avgWinningAmount: number;
}

export interface LessonLearned {
  outcome: OutcomeType;
  tender_buyer: string | null;
  tender_value: number | null;
  lessons_learned: string;
  outcome_date: string | null;
}

export interface OutcomesAnalytics {
  stats: OutcomeStats;
  byValueRange: SegmentStat[];
  byBuyer: SegmentStat[];
  competitors: CompetitorInfo[];
  lessons: LessonLearned[];
}

export interface MarketCompetitor {
  name: string;
  totalWins: number;
  totalValue: number;
  avgValue: number;
  countries: string[];
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useOutcomesAnalytics() {
  return useApiQuery<OutcomesAnalytics>(
    ["outcomes-analytics"],
    "/analytics/outcomes"
  );
}

export function useBidOutcome(bidId: string) {
  return useApiQuery<{ outcome: BidOutcome | null }>(
    ["bid-outcome", bidId],
    `/bids/${bidId}/outcome`,
    { enabled: !!bidId }
  );
}

export function useMarketCompetitors(params?: { country?: string; cpvPrefix?: string }) {
  const queryString = new URLSearchParams(
    Object.entries(params || {}).filter(([, v]) => v !== undefined) as [string, string][]
  ).toString();
  const url = `/analytics/market-competitors${queryString ? `?${queryString}` : ""}`;

  return useApiQuery<{ competitors: MarketCompetitor[] }>(
    ["market-competitors", params?.country, params?.cpvPrefix],
    url
  );
}

export function useRecordOutcome(bidId: string) {
  const qc = useQueryClient();
  return useApiMutation<
    { outcome: BidOutcome },
    {
      outcome: OutcomeType;
      winning_bidder?: string;
      winning_amount?: number;
      num_bidders?: number;
      reason?: string;
      lessons_learned?: string;
      outcome_date?: string;
    }
  >(`/bids/${bidId}/outcome`, "POST", {
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bid-outcome", bidId] });
      qc.invalidateQueries({ queryKey: ["bid-detail", bidId] });
      qc.invalidateQueries({ queryKey: ["bids"] });
      qc.invalidateQueries({ queryKey: ["bid-counts"] });
      qc.invalidateQueries({ queryKey: ["outcomes-analytics"] });
    },
  });
}
