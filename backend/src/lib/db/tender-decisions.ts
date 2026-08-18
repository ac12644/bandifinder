/**
 * Tender Decisions DB Layer
 */

import { getSupabaseAdmin } from "../supabase";

export interface DbTenderDecision {
  id: string;
  user_id: string;
  organization_id: string;
  tender_id: string | null;
  external_tender_id: string | null;
  decision: "proceed" | "skip";
  reason: string | null;
  reason_text: string | null;
  created_at: string;
}

export async function createDecision(params: {
  user_id: string;
  organization_id: string;
  tender_id?: string;
  external_tender_id?: string;
  decision: "proceed" | "skip";
  reason?: string;
  reason_text?: string;
}): Promise<DbTenderDecision> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("tender_decisions")
    .insert(params)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getDecisions(
  organizationId: string,
  limit: number = 50
): Promise<DbTenderDecision[]> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("tender_decisions")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

export async function getDecisionForTender(
  organizationId: string,
  externalTenderId: string
): Promise<DbTenderDecision | null> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("tender_decisions")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("external_tender_id", externalTenderId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return data;
}

export async function getSkipReasonStats(
  organizationId: string
): Promise<Record<string, number>> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("tender_decisions")
    .select("reason")
    .eq("organization_id", organizationId)
    .eq("decision", "skip")
    .not("reason", "is", null);

  if (error) throw error;

  const stats: Record<string, number> = {};
  for (const row of data || []) {
    stats[row.reason] = (stats[row.reason] || 0) + 1;
  }
  return stats;
}
