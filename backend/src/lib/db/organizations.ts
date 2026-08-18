/**
 * Organizations DB Layer
 */

import { getSupabaseAdmin } from "../supabase";

export interface Organization {
  id: string;
  clerk_org_id: string;
  name: string;
  slug?: string;
  country?: string;
  industry?: string;
  size?: string;
  onboarding_state: string;
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  plan: string;
  created_at: string;
  updated_at: string;
}

export async function getOrganizationByClerkId(
  clerkOrgId: string
): Promise<Organization | null> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("organizations")
    .select("*")
    .eq("clerk_org_id", clerkOrgId)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return data;
}

export async function getOrganizationById(
  id: string
): Promise<Organization | null> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("organizations")
    .select("*")
    .eq("id", id)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return data;
}

export async function createOrganization(params: {
  clerk_org_id: string;
  name: string;
  slug?: string;
  country?: string;
  industry?: string;
  size?: string;
}): Promise<Organization> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("organizations")
    .insert(params)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateOrganization(
  id: string,
  params: Partial<Omit<Organization, "id" | "created_at" | "updated_at">>
): Promise<Organization> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("organizations")
    .update(params)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateOnboardingState(
  id: string,
  state: string
): Promise<Organization> {
  return updateOrganization(id, { onboarding_state: state });
}

export async function deleteOrganization(clerkOrgId: string): Promise<void> {
  const sb = getSupabaseAdmin();
  const { error } = await sb
    .from("organizations")
    .delete()
    .eq("clerk_org_id", clerkOrgId);

  if (error) throw error;
}
