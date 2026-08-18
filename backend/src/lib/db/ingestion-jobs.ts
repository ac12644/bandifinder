/**
 * Ingestion Jobs DB Layer
 */

import { getSupabaseAdmin } from "../supabase";

export interface DbIngestionJob {
  id: string;
  source: string;
  status: "pending" | "running" | "completed" | "failed";
  started_at: string | null;
  completed_at: string | null;
  tenders_found: number;
  tenders_new: number;
  tenders_updated: number;
  amendments_detected: number;
  error: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export async function createIngestionJob(params: {
  source?: string;
  metadata?: Record<string, unknown>;
}): Promise<DbIngestionJob> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("ingestion_jobs")
    .insert({
      source: params.source || "ted",
      status: "pending",
      metadata: params.metadata || {},
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateIngestionJob(
  id: string,
  params: Partial<
    Pick<
      DbIngestionJob,
      | "status"
      | "started_at"
      | "completed_at"
      | "tenders_found"
      | "tenders_new"
      | "tenders_updated"
      | "amendments_detected"
      | "error"
      | "metadata"
    >
  >
): Promise<DbIngestionJob> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("ingestion_jobs")
    .update(params)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getIngestionJob(
  id: string
): Promise<DbIngestionJob | null> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("ingestion_jobs")
    .select("*")
    .eq("id", id)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return data;
}

export async function listIngestionJobs(params?: {
  source?: string;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<{ jobs: DbIngestionJob[]; total: number }> {
  const sb = getSupabaseAdmin();
  let q = sb.from("ingestion_jobs").select("*", { count: "exact" });

  if (params?.source) {
    q = q.eq("source", params.source);
  }
  if (params?.status) {
    q = q.eq("status", params.status);
  }

  q = q
    .order("created_at", { ascending: false })
    .range(
      params?.offset || 0,
      (params?.offset || 0) + (params?.limit || 20) - 1
    );

  const { data, error, count } = await q;
  if (error) throw error;
  return { jobs: data || [], total: count || 0 };
}

export async function getLatestCompletedJob(
  source: string = "ted"
): Promise<DbIngestionJob | null> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("ingestion_jobs")
    .select("*")
    .eq("source", source)
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return data;
}
