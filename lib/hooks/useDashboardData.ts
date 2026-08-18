"use client";

import { useApiQuery } from "@/lib/hooks/useAuthedFetch";

export interface KpiData {
  tendersReviewed: number;
  bidsSubmitted: number;
  winRate: number;
  avgValue: number;
  missedDeadlines: number;
}

export interface DashboardTender {
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
  riskReason?: string;
}

export interface GapsData {
  gaps: Array<{
    field: string;
    label: string;
    impact: string;
    affectedTenders: number;
  }>;
  completeness: number;
}

export function useKpis() {
  return useApiQuery<KpiData>(["kpis"], "/analytics/kpis");
}

export function useBestTenders(limit = 5) {
  return useApiQuery<{ tenders: DashboardTender[] }>(
    ["best-tenders", limit],
    `/tenders/best?limit=${limit}&daysBack=14`,
    { staleTime: 5 * 60 * 1000 }
  );
}

export function useUrgentTenders(days = 7) {
  return useApiQuery<{ tenders: DashboardTender[] }>(
    ["urgent-tenders", days],
    `/tenders/urgent?days=${days}`
  );
}

export function useProfileGaps() {
  return useApiQuery<GapsData>(["profile-gaps"], "/company/gaps");
}
