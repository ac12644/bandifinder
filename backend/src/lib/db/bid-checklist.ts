/**
 * Bid Checklist DB Layer
 *
 * Checklist items for bid preparation tracking.
 */

import { getSupabaseAdmin } from "../supabase";

export interface DbBidChecklistItem {
  id: string;
  bid_id: string;
  label: string;
  completed: boolean;
  completed_by: string | null;
  completed_at: string | null;
  sort_order: number;
  created_at: string;
}

export async function createChecklistItem(params: {
  bid_id: string;
  label: string;
  sort_order?: number;
}): Promise<DbBidChecklistItem> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("bid_checklist_items")
    .insert(params)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function createChecklistItemsBatch(
  items: Array<{ bid_id: string; label: string; sort_order: number }>
): Promise<DbBidChecklistItem[]> {
  if (items.length === 0) return [];
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("bid_checklist_items")
    .insert(items)
    .select();

  if (error) throw error;
  return data || [];
}

export async function getChecklist(
  bidId: string
): Promise<DbBidChecklistItem[]> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("bid_checklist_items")
    .select("*")
    .eq("bid_id", bidId)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function toggleChecklistItem(
  itemId: string,
  completed: boolean,
  userId?: string
): Promise<DbBidChecklistItem> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("bid_checklist_items")
    .update({
      completed,
      completed_by: completed ? userId || null : null,
      completed_at: completed ? new Date().toISOString() : null,
    })
    .eq("id", itemId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteChecklistItem(
  itemId: string
): Promise<void> {
  const sb = getSupabaseAdmin();
  const { error } = await sb
    .from("bid_checklist_items")
    .delete()
    .eq("id", itemId);

  if (error) throw error;
}

export async function getChecklistProgress(
  bidId: string
): Promise<{ total: number; completed: number }> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("bid_checklist_items")
    .select("completed")
    .eq("bid_id", bidId);

  if (error) throw error;
  const items = data || [];
  return {
    total: items.length,
    completed: items.filter((i) => i.completed).length,
  };
}
