"use client";

import { useApiQuery, useApiMutation } from "@/lib/hooks/useAuthedFetch";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlanLimits {
  searchesPerDay: number;
  favorites: number;
  users: number;
  bidsActive: number;
  sources: string[];
  exportEnabled: boolean;
  pipelineEnabled: boolean;
  apiAccess: boolean;
}

export interface PlanInfo {
  id: string;
  name: string;
  price: number;
  limits: PlanLimits;
}

export interface SubscriptionInfo {
  id: string;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface BillingData {
  plan: PlanInfo;
  subscription: SubscriptionInfo | null;
  hasCustomer: boolean;
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useBilling() {
  return useApiQuery<BillingData>(["billing"], "/billing");
}

export function usePlans() {
  return useApiQuery<{ plans: PlanInfo[] }>(["billing-plans"], "/billing/plans");
}

export function useCheckout() {
  return useApiMutation<{ url: string }, { planId: string }>(
    "/billing/checkout",
    "POST"
  );
}

export function usePortal() {
  return useApiMutation<{ url: string }, void>(
    "/billing/portal",
    "POST"
  );
}

export function useCancelSubscription() {
  return useApiMutation<{ success: boolean }, void>(
    "/billing/cancel",
    "POST"
  );
}
