/**
 * Tenders DB Layer
 */

import { getSupabaseAdmin } from "../supabase";

export interface DbTender {
  id: string;
  source: string;
  external_id: string;
  publication_number: string | null;
  title: string;
  buyer: string | null;
  description: string | null;
  cpv_codes: string[];
  country: string | null;
  city: string | null;
  value: number | null;
  currency: string;
  publication_date: string | null;
  deadline: string | null;
  procedure_type: string | null;
  contract_nature: string | null;
  is_framework_agreement: boolean;
  sme_participation: boolean;
  pdf_url: string | null;
  raw_data: Record<string, unknown> | null;
  award_status: string;
  award_winner_name: string | null;
  award_winner_country: string | null;
  award_value: number | null;
  award_date: string | null;
  award_num_tenders_received: number | null;
  award_notice_id: string | null;
  created_at: string;
  updated_at: string;
}

export async function upsertTender(params: {
  source: string;
  external_id: string;
  publication_number?: string;
  title: string;
  buyer?: string;
  description?: string;
  cpv_codes?: string[];
  country?: string;
  city?: string;
  value?: number;
  currency?: string;
  publication_date?: string;
  deadline?: string;
  procedure_type?: string;
  contract_nature?: string;
  is_framework_agreement?: boolean;
  sme_participation?: boolean;
  pdf_url?: string;
  raw_data?: Record<string, unknown>;
}): Promise<DbTender> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("tenders")
    .upsert(
      {
        ...params,
        cpv_codes: params.cpv_codes || [],
      },
      { onConflict: "source,external_id" }
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function upsertTenders(
  tenders: Array<{
    source: string;
    external_id: string;
    publication_number?: string;
    title: string;
    buyer?: string;
    description?: string;
    cpv_codes?: string[];
    country?: string;
    city?: string;
    value?: number;
    currency?: string;
    publication_date?: string;
    deadline?: string;
    procedure_type?: string;
    contract_nature?: string;
    is_framework_agreement?: boolean;
    sme_participation?: boolean;
    pdf_url?: string;
    raw_data?: Record<string, unknown>;
  }>
): Promise<{ inserted: number; updated: number }> {
  const sb = getSupabaseAdmin();
  const rows = tenders.map((t) => ({
    ...t,
    cpv_codes: t.cpv_codes || [],
  }));

  const { data, error } = await sb
    .from("tenders")
    .upsert(rows, { onConflict: "source,external_id" })
    .select("id");

  if (error) throw error;
  return { inserted: data?.length || 0, updated: 0 };
}

export async function getTenderById(id: string): Promise<DbTender | null> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("tenders")
    .select("*")
    .eq("id", id)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return data;
}

export async function getTenderByExternalId(
  source: string,
  externalId: string
): Promise<DbTender | null> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("tenders")
    .select("*")
    .eq("source", source)
    .eq("external_id", externalId)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return data;
}

/**
 * Fetch several tenders by id in one round trip.
 *
 * Ids may be internal UUIDs or TED external ids; both are matched so callers
 * do not need to know which form they hold. Missing ids are simply absent from
 * the result rather than raising.
 */
export async function getTendersByIds(ids: string[]): Promise<DbTender[]> {
  if (ids.length === 0) return [];

  const sb = getSupabaseAdmin();
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  const uuids = ids.filter((id) => uuidPattern.test(id));
  const externalIds = ids.filter((id) => !uuidPattern.test(id));

  const [byId, byExternal] = await Promise.all([
    uuids.length
      ? sb.from("tenders").select("*").in("id", uuids)
      : Promise.resolve({ data: [], error: null }),
    externalIds.length
      ? sb.from("tenders").select("*").in("external_id", externalIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (byId.error) throw byId.error;
  if (byExternal.error) throw byExternal.error;

  // De-duplicate: an id could match both columns across different rows.
  const merged = new Map<string, DbTender>();
  for (const row of [...(byId.data || []), ...(byExternal.data || [])]) {
    merged.set((row as DbTender).id, row as DbTender);
  }
  return Array.from(merged.values());
}

export async function searchTenders(params: {
  query?: string;
  country?: string;
  cpvCodes?: string[];
  deadlineBefore?: string;
  deadlineAfter?: string;
  minValue?: number;
  maxValue?: number;
  limit?: number;
  offset?: number;
}): Promise<{ tenders: DbTender[]; count: number }> {
  const sb = getSupabaseAdmin();
  let q = sb.from("tenders").select("*", { count: "exact" });

  if (params.query) {
    q = q.ilike("title", `%${params.query}%`);
  }
  if (params.country) {
    q = q.eq("country", params.country);
  }
  if (params.deadlineAfter) {
    q = q.gte("deadline", params.deadlineAfter);
  }
  if (params.deadlineBefore) {
    q = q.lte("deadline", params.deadlineBefore);
  }
  if (params.minValue !== undefined) {
    q = q.gte("value", params.minValue);
  }
  if (params.maxValue !== undefined) {
    q = q.lte("value", params.maxValue);
  }

  q = q
    .order("publication_date", { ascending: false })
    .range(
      params.offset || 0,
      (params.offset || 0) + (params.limit || 20) - 1
    );

  const { data, error, count } = await q;
  if (error) throw error;
  return { tenders: data || [], count: count || 0 };
}

export interface MarketCompetitor {
  name: string;
  totalWins: number;
  totalValue: number;
  avgValue: number;
  countries: string[];
}

/**
 * Get market competitors from awarded tenders.
 * Aggregates award_winner_name across tenders matching optional CPV/country filters.
 */
export async function getMarketCompetitors(params?: {
  cpvPrefix?: string;
  country?: string;
  limit?: number;
}): Promise<MarketCompetitor[]> {
  const sb = getSupabaseAdmin();
  let q = sb
    .from("tenders")
    .select("award_winner_name, award_winner_country, award_value")
    .eq("award_status", "awarded")
    .not("award_winner_name", "is", null);

  if (params?.country) {
    q = q.eq("country", params.country);
  }

  const { data, error } = await q.limit(2000);
  if (error) throw error;
  if (!data || data.length === 0) return [];

  // Filter by CPV prefix in application code if needed
  // (cpv_codes is an array, harder to filter in Supabase)

  // Aggregate by winner name
  const map = new Map<string, {
    totalWins: number;
    totalValue: number;
    countries: Set<string>;
  }>();

  for (const row of data) {
    const name = row.award_winner_name;
    if (!name) continue;

    const existing = map.get(name) || {
      totalWins: 0,
      totalValue: 0,
      countries: new Set<string>(),
    };
    existing.totalWins++;
    existing.totalValue += row.award_value || 0;
    if (row.award_winner_country) {
      existing.countries.add(row.award_winner_country);
    }
    map.set(name, existing);
  }

  const competitors: MarketCompetitor[] = Array.from(map.entries())
    .map(([name, info]) => ({
      name,
      totalWins: info.totalWins,
      totalValue: info.totalValue,
      avgValue: info.totalWins > 0 ? info.totalValue / info.totalWins : 0,
      countries: Array.from(info.countries),
    }))
    .sort((a, b) => b.totalWins - a.totalWins)
    .slice(0, params?.limit || 20);

  return competitors;
}

export async function getUrgentTenders(
  days: number = 7
): Promise<DbTender[]> {
  const sb = getSupabaseAdmin();
  const now = new Date().toISOString().split("T")[0];
  const future = new Date(Date.now() + days * 86400000)
    .toISOString()
    .split("T")[0];

  const { data, error } = await sb
    .from("tenders")
    .select("*")
    .gte("deadline", now)
    .lte("deadline", future)
    .order("deadline", { ascending: true })
    .limit(20);

  if (error) throw error;
  return data || [];
}
