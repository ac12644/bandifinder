/**
 * Saved Searches DB Layer
 */

import { getSupabaseAdmin } from "../supabase";

export interface DbSavedSearch {
  id: string;
  user_id: string;
  organization_id: string;
  name: string;
  query: string | null;
  filters: Record<string, unknown>;
  notify: boolean;
  created_at: string;
  updated_at: string;
}

export async function getSavedSearches(
  userId: string
): Promise<DbSavedSearch[]> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("saved_searches")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function createSavedSearch(params: {
  user_id: string;
  organization_id: string;
  name: string;
  query?: string;
  filters?: Record<string, unknown>;
  notify?: boolean;
}): Promise<DbSavedSearch> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("saved_searches")
    .insert({
      user_id: params.user_id,
      organization_id: params.organization_id,
      name: params.name,
      query: params.query || null,
      filters: params.filters || {},
      notify: params.notify ?? true,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateSavedSearch(
  id: string,
  userId: string,
  params: Partial<Pick<DbSavedSearch, "name" | "query" | "filters" | "notify">>
): Promise<DbSavedSearch> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("saved_searches")
    .update(params)
    .eq("id", id)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteSavedSearch(
  id: string,
  userId: string
): Promise<void> {
  const sb = getSupabaseAdmin();
  const { error } = await sb
    .from("saved_searches")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) throw error;
}

export async function getSavedSearchesWithNotify(): Promise<DbSavedSearch[]> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("saved_searches")
    .select("*")
    .eq("notify", true);

  if (error) throw error;
  return data || [];
}
