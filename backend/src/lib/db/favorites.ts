/**
 * Favorites DB Layer
 */

import { getSupabaseAdmin } from "../supabase";

export interface DbFavorite {
  id: string;
  user_id: string;
  organization_id: string;
  tender_id: string | null;
  external_tender_id: string | null;
  tender_title: string;
  tender_value: number | null;
  tender_deadline: string | null;
  notes: string | null;
  created_at: string;
}

export async function getFavorites(
  userId: string,
  limit: number = 50
): Promise<DbFavorite[]> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("favorites")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

export async function addFavorite(params: {
  user_id: string;
  organization_id: string;
  tender_id?: string;
  external_tender_id?: string;
  tender_title: string;
  tender_value?: number;
  tender_deadline?: string;
  notes?: string;
}): Promise<DbFavorite> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("favorites")
    .insert(params)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function removeFavorite(
  userId: string,
  favoriteId: string
): Promise<void> {
  const sb = getSupabaseAdmin();
  const { error } = await sb
    .from("favorites")
    .delete()
    .eq("id", favoriteId)
    .eq("user_id", userId);

  if (error) throw error;
}

export async function removeFavoriteByTenderId(
  userId: string,
  externalTenderId: string
): Promise<void> {
  const sb = getSupabaseAdmin();
  const { error } = await sb
    .from("favorites")
    .delete()
    .eq("user_id", userId)
    .eq("external_tender_id", externalTenderId);

  if (error) throw error;
}

export async function isFavorited(
  userId: string,
  externalTenderId: string
): Promise<boolean> {
  const sb = getSupabaseAdmin();
  const { count, error } = await sb
    .from("favorites")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("external_tender_id", externalTenderId);

  if (error) throw error;
  return (count || 0) > 0;
}
