"use client";

import { useApiQuery, useApiMutation } from "@/lib/hooks/useAuthedFetch";

export interface TenderDetail {
  id: string;
  title: string;
  description?: string;
  buyer?: string;
  value?: number;
  currency?: string;
  deadline?: string;
  publishedDate?: string;
  publicationDate?: string;
  publicationNumber?: string;
  country?: string;
  city?: string;
  cpv?: string;
  cpvCodes?: string[];
  procedureType?: string;
  contractNature?: string;
  isFrameworkAgreement?: boolean;
  smeParticipation?: boolean;
  requirements?: string[];
  fitScore?: number;
  recommendation?: "BID" | "REVIEW" | "SKIP";
  tedUrl?: string;
  pdfUrl?: string;
  lots?: Array<{
    title: string;
    description?: string;
    value?: number;
    deadline?: string;
  }>;
}

export interface ScoreComponent {
  name: string;
  score: number;
  maxScore: number;
  explanation: string;
}

export interface TenderAnalysis {
  overallScore: number;
  recommendation: "BID" | "REVIEW" | "SKIP";
  components: ScoreComponent[];
  eligibility: Array<{
    requirement: string;
    met: boolean;
    detail?: string;
  }>;
}

export function useTenderDetail(tenderId: string) {
  return useApiQuery<{ tender: TenderDetail }>(
    ["tender-detail", tenderId],
    `/tenders/${tenderId}`,
    { enabled: !!tenderId }
  );
}

export function useTenderAnalysis(tenderId: string) {
  return useApiQuery<TenderAnalysis>(
    ["tender-analysis", tenderId],
    `/tenders/${tenderId}/analysis`,
    { enabled: !!tenderId, staleTime: 10 * 60 * 1000 }
  );
}

export interface DecisionPayload {
  decision: "proceed" | "skip";
  reason?: string;
  notes?: string;
}

export function useTenderDecision(tenderId: string) {
  return useApiMutation<{ success: boolean }, DecisionPayload>(
    `/tenders/${tenderId}/decision`,
    "POST"
  );
}
