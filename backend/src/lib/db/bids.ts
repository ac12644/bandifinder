/**
 * Bids DB Layer
 *
 * CRUD for the bid pipeline (new → reviewing → preparing → submitted → won/lost).
 */

import { getSupabaseAdmin } from "../supabase";

export interface DbBid {
  id: string;
  organization_id: string;
  tender_id: string | null;
  external_tender_id: string | null;
  tender_title: string;
  tender_buyer: string | null;
  tender_value: number | null;
  tender_deadline: string | null;
  status: "new" | "reviewing" | "preparing" | "submitted" | "won" | "lost";
  priority: "low" | "medium" | "high";
  notes: string | null;
  created_by: string;
  submitted_at: string | null;
  outcome_at: string | null;
  outcome_notes: string | null;
  created_at: string;
  updated_at: string;
}

export async function createBid(params: {
  organization_id: string;
  tender_id?: string;
  external_tender_id?: string;
  tender_title: string;
  tender_buyer?: string;
  tender_value?: number;
  tender_deadline?: string;
  status?: DbBid["status"];
  priority?: DbBid["priority"];
  notes?: string;
  created_by: string;
}): Promise<DbBid> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("bids")
    .insert(params)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getBid(bidId: string): Promise<DbBid | null> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("bids")
    .select("*")
    .eq("id", bidId)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return data;
}

export async function listBids(
  organizationId: string,
  filters?: {
    status?: DbBid["status"] | DbBid["status"][];
    limit?: number;
  }
): Promise<DbBid[]> {
  const sb = getSupabaseAdmin();
  let query = sb
    .from("bids")
    .select("*")
    .eq("organization_id", organizationId)
    .order("updated_at", { ascending: false });

  if (filters?.status) {
    if (Array.isArray(filters.status)) {
      query = query.in("status", filters.status);
    } else {
      query = query.eq("status", filters.status);
    }
  }

  if (filters?.limit) {
    query = query.limit(filters.limit);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function updateBid(
  bidId: string,
  updates: Partial<
    Pick<
      DbBid,
      "status" | "priority" | "notes" | "submitted_at" | "outcome_at" | "outcome_notes"
    >
  >
): Promise<DbBid> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("bids")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", bidId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteBid(bidId: string): Promise<void> {
  const sb = getSupabaseAdmin();
  const { error } = await sb.from("bids").delete().eq("id", bidId);
  if (error) throw error;
}

export async function getBidByTender(
  organizationId: string,
  tenderId?: string,
  externalTenderId?: string
): Promise<DbBid | null> {
  const sb = getSupabaseAdmin();
  let query = sb
    .from("bids")
    .select("*")
    .eq("organization_id", organizationId);

  if (tenderId) {
    query = query.eq("tender_id", tenderId);
  } else if (externalTenderId) {
    query = query.eq("external_tender_id", externalTenderId);
  } else {
    return null;
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return data;
}

export async function getBidCountsByStatus(
  organizationId: string
): Promise<Record<string, number>> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("bids")
    .select("status")
    .eq("organization_id", organizationId);

  if (error) throw error;

  const counts: Record<string, number> = {};
  for (const row of data || []) {
    counts[row.status] = (counts[row.status] || 0) + 1;
  }
  return counts;
}
