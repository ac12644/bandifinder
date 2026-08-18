/**
 * Supabase Client
 *
 * Admin client (service_role) for server-side operations.
 * Bypasses RLS for full data access from the API.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";

let adminClient: SupabaseClient | null = null;

/**
 * Get the admin Supabase client (service_role key).
 * Bypasses RLS — use only from the API server.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (!adminClient) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      throw new Error(
        "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set"
      );
    }

    adminClient = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  return adminClient;
}

/**
 * Get a Supabase client scoped to a specific user (anon key + JWT).
 * Respects RLS policies. Use for client-proxied requests if needed.
 */
export function getSupabaseForUser(accessToken: string): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY must be set");
  }

  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type { SupabaseClient };
