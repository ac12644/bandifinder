/**
 * Notification Generator
 *
 * Matches newly ingested tenders against saved searches
 * and generates notifications for users.
 */

import { getSavedSearchesWithNotify } from "../db/saved-searches";
import { createNotificationsBatch } from "../db/notifications";
import type { RawTenderRecord } from "./connector";

/**
 * Match new tenders against saved searches and create notifications.
 *
 * Matching logic:
 * - If saved search has a query, check if tender title/description contains it
 * - If saved search has country filter, match country
 * - If saved search has CPV filter, check overlap
 * - If saved search has value range, check tender value
 */
export async function generateNotificationsForNewTenders(
  newTenders: RawTenderRecord[],
  tenderIdMap: Map<string, string>
): Promise<number> {
  if (newTenders.length === 0) return 0;

  // Fetch all saved searches with notify=true
  const savedSearches = await getSavedSearchesWithNotify();
  if (savedSearches.length === 0) return 0;

  const notifications: Array<{
    user_id: string;
    organization_id: string;
    type: string;
    title: string;
    body?: string;
    link?: string;
    metadata?: Record<string, unknown>;
  }> = [];

  for (const search of savedSearches) {
    const matchingTenders = newTenders.filter((tender) =>
      matchesSavedSearch(tender, search.query, search.filters)
    );

    if (matchingTenders.length === 0) continue;

    // Create a single notification per saved search with match count
    if (matchingTenders.length === 1) {
      const tender = matchingTenders[0];
      const dbId = tenderIdMap.get(tender.external_id);
      notifications.push({
        user_id: search.user_id,
        organization_id: search.organization_id,
        type: "high_fit_tender",
        title: `Nuovo bando trovato: ${tender.title.substring(0, 80)}`,
        body: `Un nuovo bando corrisponde alla tua ricerca "${search.name}". Valore: ${tender.value ? `${tender.value.toLocaleString("it-IT")} EUR` : "N/D"}`,
        link: dbId ? `/tenders/${dbId}` : undefined,
        metadata: {
          saved_search_id: search.id,
          tender_external_id: tender.external_id,
        },
      });
    } else {
      notifications.push({
        user_id: search.user_id,
        organization_id: search.organization_id,
        type: "high_fit_tender",
        title: `${matchingTenders.length} nuovi bandi trovati`,
        body: `${matchingTenders.length} nuovi bandi corrispondono alla tua ricerca "${search.name}".`,
        link: `/tenders?search=${encodeURIComponent(search.name)}`,
        metadata: {
          saved_search_id: search.id,
          match_count: matchingTenders.length,
        },
      });
    }
  }

  if (notifications.length > 0) {
    await createNotificationsBatch(notifications);
  }

  return notifications.length;
}

/** Check if a tender matches a saved search */
function matchesSavedSearch(
  tender: RawTenderRecord,
  query: string | null,
  filters: Record<string, unknown>
): boolean {
  // Query match (substring in title or description)
  if (query) {
    const q = query.toLowerCase();
    const inTitle = tender.title.toLowerCase().includes(q);
    const inDesc = tender.description?.toLowerCase().includes(q) || false;
    if (!inTitle && !inDesc) return false;
  }

  // Country filter
  if (filters.country && typeof filters.country === "string") {
    if (tender.country !== filters.country) return false;
  }

  // CPV filter
  if (filters.cpvCodes && Array.isArray(filters.cpvCodes) && filters.cpvCodes.length > 0) {
    const tenderCpv = tender.cpv_codes || [];
    const hasOverlap = (filters.cpvCodes as string[]).some((code) =>
      tenderCpv.some((tc) => tc.startsWith(code.substring(0, 5)))
    );
    if (!hasOverlap) return false;
  }

  // Value range
  if (filters.minValue && typeof filters.minValue === "number") {
    if (!tender.value || tender.value < filters.minValue) return false;
  }
  if (filters.maxValue && typeof filters.maxValue === "number") {
    if (!tender.value || tender.value > filters.maxValue) return false;
  }

  return true;
}
