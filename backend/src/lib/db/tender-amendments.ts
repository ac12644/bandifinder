/**
 * Tender Amendments DB Layer
 */

import { getSupabaseAdmin } from "../supabase";

export interface DbTenderAmendment {
  id: string;
  tender_id: string;
  field_changed: string;
  old_value: string | null;
  new_value: string | null;
  detected_at: string;
  ingestion_job_id: string | null;
}

export async function createAmendment(params: {
  tender_id: string;
  field_changed: string;
  old_value?: string;
  new_value?: string;
  ingestion_job_id?: string;
}): Promise<DbTenderAmendment> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("tender_amendments")
    .insert(params)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function createAmendmentsBatch(
  amendments: Array<{
    tender_id: string;
    field_changed: string;
    old_value?: string;
    new_value?: string;
    ingestion_job_id?: string;
  }>
): Promise<void> {
  if (amendments.length === 0) return;

  const sb = getSupabaseAdmin();
  const { error } = await sb.from("tender_amendments").insert(amendments);

  if (error) throw error;
}

export async function getAmendmentsForTender(
  tenderId: string
): Promise<DbTenderAmendment[]> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("tender_amendments")
    .select("*")
    .eq("tender_id", tenderId)
    .order("detected_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getRecentAmendments(params?: {
  since?: string;
  limit?: number;
}): Promise<DbTenderAmendment[]> {
  const sb = getSupabaseAdmin();
  let q = sb.from("tender_amendments").select("*");

  if (params?.since) {
    q = q.gte("detected_at", params.since);
  }

  q = q
    .order("detected_at", { ascending: false })
    .limit(params?.limit || 50);

  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}
