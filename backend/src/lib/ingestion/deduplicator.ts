/**
 * Deduplicator & Amendment Detector
 *
 * Handles:
 * - Upserting tenders (ON CONFLICT dedup via Supabase)
 * - Detecting field changes on existing tenders (amendments)
 * - Recording amendments in tender_amendments table
 */

import { getSupabaseAdmin } from "../supabase";
import { createAmendmentsBatch } from "../db/tender-amendments";
import type { RawTenderRecord } from "./connector";

/** Fields to track for amendment detection */
const TRACKED_FIELDS = [
  "title",
  "buyer",
  "description",
  "value",
  "deadline",
  "cpv_codes",
  "procedure_type",
  "contract_nature",
] as const;

export interface DeduplicationResult {
  tendersNew: number;
  tendersUpdated: number;
  amendmentsDetected: number;
  /** Map of DB tender IDs for all processed records */
  tenderIdMap: Map<string, string>;
}

/**
 * Deduplicate and upsert a batch of tender records.
 * Detects amendments on existing tenders before upserting.
 */
export async function deduplicateAndUpsert(
  records: RawTenderRecord[],
  ingestionJobId?: string
): Promise<DeduplicationResult> {
  if (records.length === 0) {
    return { tendersNew: 0, tendersUpdated: 0, amendmentsDetected: 0, tenderIdMap: new Map() };
  }

  const sb = getSupabaseAdmin();
  const tenderIdMap = new Map<string, string>();

  // Step 1: Fetch existing tenders that match these external IDs
  const externalIds = records.map((r) => r.external_id);
  const { data: existing, error: fetchError } = await sb
    .from("tenders")
    .select("id, source, external_id, title, buyer, description, value, deadline, cpv_codes, procedure_type, contract_nature")
    .eq("source", records[0].source)
    .in("external_id", externalIds);

  if (fetchError) throw fetchError;

  // Build lookup of existing tenders
  const existingMap = new Map<string, typeof existing[0]>();
  for (const t of existing || []) {
    existingMap.set(t.external_id, t);
  }

  // Step 2: Detect amendments
  const amendments: Array<{
    tender_id: string;
    field_changed: string;
    old_value?: string;
    new_value?: string;
    ingestion_job_id?: string;
  }> = [];

  for (const record of records) {
    const existingTender = existingMap.get(record.external_id);
    if (!existingTender) continue; // New tender, no amendments

    for (const field of TRACKED_FIELDS) {
      const oldVal = existingTender[field];
      const newVal = record[field];

      // Normalize for comparison
      const oldStr = normalizeValue(oldVal);
      const newStr = normalizeValue(newVal);

      if (oldStr !== newStr && newStr !== "") {
        amendments.push({
          tender_id: existingTender.id,
          field_changed: field,
          old_value: oldStr || undefined,
          new_value: newStr || undefined,
          ingestion_job_id: ingestionJobId,
        });
      }
    }
  }

  // Step 3: Record amendments
  if (amendments.length > 0) {
    await createAmendmentsBatch(amendments);
  }

  // Step 4: Upsert all records in batches of 100
  let tendersNew = 0;
  let tendersUpdated = 0;
  const batchSize = 100;

  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    const rows = batch.map((r) => ({
      source: r.source,
      external_id: r.external_id,
      publication_number: r.publication_number || null,
      title: r.title,
      buyer: r.buyer || null,
      description: r.description || null,
      cpv_codes: r.cpv_codes || [],
      country: r.country || null,
      city: r.city || null,
      value: r.value || null,
      currency: r.currency || "EUR",
      publication_date: r.publication_date || null,
      deadline: r.deadline || null,
      procedure_type: r.procedure_type || null,
      contract_nature: r.contract_nature || null,
      is_framework_agreement: r.is_framework_agreement || false,
      sme_participation: r.sme_participation || false,
      pdf_url: r.pdf_url || null,
      raw_data: r.raw_data || null,
    }));

    const { data: upserted, error: upsertError } = await sb
      .from("tenders")
      .upsert(rows, { onConflict: "source,external_id" })
      .select("id, external_id");

    if (upsertError) throw upsertError;

    for (const row of upserted || []) {
      tenderIdMap.set(row.external_id, row.id);
      if (existingMap.has(row.external_id)) {
        tendersUpdated++;
      } else {
        tendersNew++;
      }
    }
  }

  return {
    tendersNew,
    tendersUpdated,
    amendmentsDetected: amendments.length,
    tenderIdMap,
  };
}

/** Normalize a value to string for comparison */
function normalizeValue(val: unknown): string {
  if (val === null || val === undefined) return "";
  if (Array.isArray(val)) return JSON.stringify(val);
  return String(val);
}
