/**
 * Bid Comments DB Layer
 *
 * Threaded comments on bids.
 */

import { getSupabaseAdmin } from "../supabase";

export interface DbBidComment {
  id: string;
  bid_id: string;
  user_id: string;
  parent_id: string | null;
  content: string;
  created_at: string;
  updated_at: string;
}

export async function createComment(params: {
  bid_id: string;
  user_id: string;
  parent_id?: string;
  content: string;
}): Promise<DbBidComment> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("bid_comments")
    .insert(params)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getComments(
  bidId: string
): Promise<DbBidComment[]> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("bid_comments")
    .select("*")
    .eq("bid_id", bidId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function updateComment(
  commentId: string,
  content: string
): Promise<DbBidComment> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("bid_comments")
    .update({ content, updated_at: new Date().toISOString() })
    .eq("id", commentId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteComment(commentId: string): Promise<void> {
  const sb = getSupabaseAdmin();
  const { error } = await sb
    .from("bid_comments")
    .delete()
    .eq("id", commentId);

  if (error) throw error;
}
