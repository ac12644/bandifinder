/**
 * Users DB Layer
 */

import { getSupabaseAdmin } from "../supabase";

export interface DbUser {
  id: string;
  clerk_user_id: string;
  organization_id: string | null;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  image_url: string | null;
  role: string;
  onboarding_completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function getUserByClerkId(
  clerkUserId: string
): Promise<DbUser | null> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("users")
    .select("*")
    .eq("clerk_user_id", clerkUserId)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return data;
}

export async function getUserById(id: string): Promise<DbUser | null> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("users")
    .select("*")
    .eq("id", id)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return data;
}

export async function createUser(params: {
  clerk_user_id: string;
  organization_id?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  image_url?: string;
  role?: string;
}): Promise<DbUser> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("users")
    .insert(params)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateUser(
  id: string,
  params: Partial<Omit<DbUser, "id" | "created_at" | "updated_at">>
): Promise<DbUser> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("users")
    .update(params)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function upsertUserByClerkId(params: {
  clerk_user_id: string;
  organization_id?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  image_url?: string;
  role?: string;
}): Promise<DbUser> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("users")
    .upsert(params, { onConflict: "clerk_user_id" })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteUserByClerkId(
  clerkUserId: string
): Promise<void> {
  const sb = getSupabaseAdmin();
  const { error } = await sb
    .from("users")
    .delete()
    .eq("clerk_user_id", clerkUserId);

  if (error) throw error;
}
