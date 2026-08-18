/**
 * Bid Assignments DB Layer
 *
 * Team role assignments on bids (lead, contributor, reviewer).
 */

import { getSupabaseAdmin } from "../supabase";

export interface DbBidAssignment {
  id: string;
  bid_id: string;
  user_id: string;
  role: "lead" | "contributor" | "reviewer";
  assigned_by: string | null;
  created_at: string;
}

export async function addAssignment(params: {
  bid_id: string;
  user_id: string;
  role: DbBidAssignment["role"];
  assigned_by?: string;
}): Promise<DbBidAssignment> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("bid_assignments")
    .upsert(params, { onConflict: "bid_id,user_id" })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function removeAssignment(
  bidId: string,
  userId: string
): Promise<void> {
  const sb = getSupabaseAdmin();
  const { error } = await sb
    .from("bid_assignments")
    .delete()
    .eq("bid_id", bidId)
    .eq("user_id", userId);

  if (error) throw error;
}

export async function getAssignments(
  bidId: string
): Promise<DbBidAssignment[]> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("bid_assignments")
    .select("*")
    .eq("bid_id", bidId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function getBidsForUser(
  userId: string
): Promise<DbBidAssignment[]> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("bid_assignments")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}
