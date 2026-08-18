/**
 * Tender Scores DB Layer
 *
 * Caches per-org scoring breakdown to avoid recomputation.
 */

import { getSupabaseAdmin } from "../supabase";

export interface DbTenderScore {
  id: string;
  tender_id: string;
  organization_id: string;
  overall_score: number;
  recommendation: "BID" | "REVIEW" | "SKIP";
  components: Array<{
    name: string;
    score: number;
    maxScore: number;
    explanation: string;
  }>;
  eligibility: Array<{
    requirement: string;
    met: boolean;
    detail?: string;
  }>;
  computed_at: string;
}

export async function getTenderScore(
  tenderId: string,
  organizationId: string
): Promise<DbTenderScore | null> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("tender_scores")
    .select("*")
    .eq("tender_id", tenderId)
    .eq("organization_id", organizationId)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return data;
}

export async function upsertTenderScore(params: {
  tender_id: string;
  organization_id: string;
  overall_score: number;
  recommendation: "BID" | "REVIEW" | "SKIP";
  components: DbTenderScore["components"];
  eligibility: DbTenderScore["eligibility"];
}): Promise<DbTenderScore> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("tender_scores")
    .upsert(
      {
        ...params,
        computed_at: new Date().toISOString(),
      },
      { onConflict: "tender_id,organization_id" }
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getScoresForOrg(
  organizationId: string,
  tenderIds: string[]
): Promise<Map<string, DbTenderScore>> {
  if (tenderIds.length === 0) return new Map();

  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("tender_scores")
    .select("*")
    .eq("organization_id", organizationId)
    .in("tender_id", tenderIds);

  if (error) throw error;

  const map = new Map<string, DbTenderScore>();
  for (const score of data || []) {
    map.set(score.tender_id, score);
  }
  return map;
}

export async function invalidateScoresForTender(
  tenderId: string
): Promise<void> {
  const sb = getSupabaseAdmin();
  const { error } = await sb
    .from("tender_scores")
    .delete()
    .eq("tender_id", tenderId);

  if (error) throw error;
}
