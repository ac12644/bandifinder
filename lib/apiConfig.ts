/**
 * API Configuration - Centralized URL and endpoint management
 *
 * Configure via NEXT_PUBLIC_TENDER_API_BASE environment variable.
 */

function getBaseUrl(): string {
  // Priority 1: Explicit environment variable (highest priority)
  if (process.env.NEXT_PUBLIC_TENDER_API_BASE) {
    return process.env.NEXT_PUBLIC_TENDER_API_BASE;
  }

  // Default: Production Hono API on Vercel
  return "https://api-gold-phi.vercel.app";
}

export const API_BASE_URL = getBaseUrl();

/**
 * API endpoint paths.
 */
export const ENDPOINTS = {
  // Agent endpoints
  agentStream: "/agent/stream",
  agentChat: "/agent/chat",
  agentHealth: "/agent/health",

  // Tender endpoints
  tenders: "/tenders",
  tenderSearch: "/tenders/search",
  tenderGet: "/tenders", // + /:id
  bestTenders: "/tenders/best",
  advancedSearch: "/tenders/advanced",
  analyzeEligibility: "/tenders/eligibility",

  // Company endpoints
  companyProfile: "/company",
  getCompanyProfile: "/company",
  upsertCompanyProfile: "/company",

  // Preferences endpoints
  preferences: "/preferences",

  // Suggestions endpoints
  suggestions: "/suggestions",
  personalizedRecommendations: "/suggestions/personalized",

  // Export endpoints
  export: "/export",
  exportCsv: "/export/csv",
  exportPdf: "/export/pdf",

  // Compare endpoints
  compare: "/compare",
  compareTenders: "/compare",

  // Analytics endpoints
  analytics: "/analytics",
  getAnalytics: "/analytics",

  // Favorites
  saveFavorite: "/tenders/favorite",
  getFavorites: "/tenders/favorites",


  // Semantic search endpoints
  semanticSearch: "/tenders/semantic",
  similarTenders: "/tenders/similar",

  // Dashboard & KPIs
  dashboardMetrics: "/analytics/dashboard",
  kpis: "/analytics/kpis",
  urgentTenders: "/tenders/urgent",
  trackEvent: "/analytics/track",
  recentActivity: "/analytics/activity",

  // Company extended
  companyCompleteness: "/company/completeness",
  companyGaps: "/company/gaps",

  // Notifications
  notifications: "/notifications",
  notificationsReadAll: "/notifications/read-all",

  // Saved searches
  savedSearches: "/saved-searches",

  // Organizations
  organizationOnboarding: "/organizations",

  // Tender decisions
  tenderDecision: "/tenders", // + /:id/decision

  // Bids / Pipeline
  bids: "/bids",
  bidDetail: "/bids", // + /:id
  bidCounts: "/bids/counts",

  // Billing
  billing: "/billing",
  billingPlans: "/billing/plans",
  billingCheckout: "/billing/checkout",
  billingPortal: "/billing/portal",
  billingCancel: "/billing/cancel",

  // Analytics / Outcomes
  analyticsOutcomes: "/analytics/outcomes",
  analyticsMarketCompetitors: "/analytics/market-competitors",

  // Ingestion (admin)
  ingestionRun: "/ingestion/run",
  ingestionAwards: "/ingestion/awards",
  ingestionJobs: "/ingestion/jobs",

  // Health & monitoring
  health: "/health",
  metrics: "/metrics",
} as const;

/**
 * Build full API URL for an endpoint
 */
export function apiUrl(endpoint: keyof typeof ENDPOINTS, params?: Record<string, string>): string {
  let url = `${API_BASE_URL}${ENDPOINTS[endpoint]}`;

  if (params) {
    const searchParams = new URLSearchParams(params);
    url += `?${searchParams.toString()}`;
  }

  return url;
}

/**
 * Build full API URL with path parameters
 */
export function apiUrlWithPath(endpoint: keyof typeof ENDPOINTS, pathParam: string): string {
  return `${API_BASE_URL}${ENDPOINTS[endpoint]}/${pathParam}`;
}
