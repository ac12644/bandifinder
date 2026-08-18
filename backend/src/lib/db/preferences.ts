/**
 * User Preferences DB Layer
 */

import { getSupabaseAdmin } from "../supabase";

export interface DbUserPreferences {
  id: string;
  user_id: string;
  organization_id: string;
  default_days_back: number;
  default_min_value: number | null;
  default_max_value: number | null;
  default_countries: string[];
  default_cpv_codes: string[];
  keywords: string[];
  exclude_keywords: string[];
  notification_email: boolean;
  notification_in_app: boolean;
  email_digest: string;
  created_at: string;
  updated_at: string;
}

export async function getPreferences(
  userId: string
): Promise<DbUserPreferences | null> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("user_preferences")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return data;
}

export async function upsertPreferences(
  userId: string,
  organizationId: string,
  params: Partial<
    Omit<
      DbUserPreferences,
      "id" | "user_id" | "organization_id" | "created_at" | "updated_at"
    >
  >
): Promise<DbUserPreferences> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("user_preferences")
    .upsert(
      {
        user_id: userId,
        organization_id: organizationId,
        ...params,
      },
      { onConflict: "user_id" }
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deletePreferences(userId: string): Promise<void> {
  const sb = getSupabaseAdmin();
  const { error } = await sb
    .from("user_preferences")
    .delete()
    .eq("user_id", userId);

  if (error) throw error;
}
