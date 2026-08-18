/**
 * Activity Log DB Layer
 */

import { getSupabaseAdmin } from "../supabase";

export interface DbActivity {
  id: string;
  user_id: string | null;
  organization_id: string | null;
  event: string;
  properties: Record<string, unknown>;
  created_at: string;
}

export async function logActivity(params: {
  user_id?: string;
  organization_id?: string;
  event: string;
  properties?: Record<string, unknown>;
}): Promise<void> {
  const sb = getSupabaseAdmin();
  const { error } = await sb.from("activity_log").insert({
    user_id: params.user_id || null,
    organization_id: params.organization_id || null,
    event: params.event,
    properties: params.properties || {},
  });

  if (error) throw error;
}

export async function getActivity(
  userId: string,
  limit: number = 20
): Promise<DbActivity[]> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("activity_log")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

export async function getActivityByOrg(
  organizationId: string,
  limit: number = 50
): Promise<DbActivity[]> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("activity_log")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

export async function getDashboardMetrics(
  userId: string,
  organizationId?: string
): Promise<{
  totalSearches: number;
  applications: number;
  savedTenders: number;
}> {
  const sb = getSupabaseAdmin();

  // Count searches
  const { count: searches } = await sb
    .from("activity_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("event", "search");

  // Count applications
  const { count: applications } = await sb
    .from("activity_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("event", "application");

  // Count favorites
  const { count: savedTenders } = await sb
    .from("favorites")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  return {
    totalSearches: searches || 0,
    applications: applications || 0,
    savedTenders: savedTenders || 0,
  };
}
