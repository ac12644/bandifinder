/**
 * Bid Outcomes DB Layer
 *
 * Post-mortem intelligence: record and analyze bid results.
 */

import { getSupabaseAdmin } from "../supabase";

export type BidOutcomeType = "won" | "lost" | "withdrawn" | "no_response";

export interface DbBidOutcome {
  id: string;
  bid_id: string;
  organization_id: string;
  outcome: BidOutcomeType;
  winning_bidder: string | null;
  winning_amount: number | null;
  num_bidders: number | null;
  reason: string | null;
  lessons_learned: string | null;
  tender_value: number | null;
  tender_buyer: string | null;
  tender_country: string | null;
  contract_nature: string | null;
  outcome_date: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function createOutcome(params: {
  bid_id: string;
  organization_id: string;
  outcome: BidOutcomeType;
  winning_bidder?: string;
  winning_amount?: number;
  num_bidders?: number;
  reason?: string;
  lessons_learned?: string;
  tender_value?: number;
  tender_buyer?: string;
  tender_country?: string;
  contract_nature?: string;
  outcome_date?: string;
}): Promise<DbBidOutcome> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("bid_outcomes")
    .upsert(params, { onConflict: "bid_id" })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getOutcome(
  bidId: string
): Promise<DbBidOutcome | null> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("bid_outcomes")
    .select("*")
    .eq("bid_id", bidId)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return data;
}

export async function updateOutcome(
  bidId: string,
  updates: Partial<
    Pick<
      DbBidOutcome,
      | "outcome"
      | "winning_bidder"
      | "winning_amount"
      | "num_bidders"
      | "reason"
      | "lessons_learned"
      | "outcome_date"
    >
  >
): Promise<DbBidOutcome> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("bid_outcomes")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("bid_id", bidId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// Analytics Queries
// ---------------------------------------------------------------------------

export interface OutcomeStats {
  total: number;
  won: number;
  lost: number;
  withdrawn: number;
  noResponse: number;
  winRate: number;
  totalWonValue: number;
  avgWonValue: number;
}

export async function getOutcomeStats(
  organizationId: string
): Promise<OutcomeStats> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("bid_outcomes")
    .select("outcome, tender_value")
    .eq("organization_id", organizationId);

  if (error) throw error;

  const rows = data || [];
  const won = rows.filter((r) => r.outcome === "won");
  const lost = rows.filter((r) => r.outcome === "lost");
  const withdrawn = rows.filter((r) => r.outcome === "withdrawn");
  const noResponse = rows.filter((r) => r.outcome === "no_response");

  const contested = won.length + lost.length;
  const winRate = contested > 0 ? Math.round((won.length / contested) * 100) : 0;

  const wonValues = won
    .map((r) => Number(r.tender_value) || 0)
    .filter((v) => v > 0);
  const totalWonValue = wonValues.reduce((s, v) => s + v, 0);
  const avgWonValue =
    wonValues.length > 0 ? Math.round(totalWonValue / wonValues.length) : 0;

  return {
    total: rows.length,
    won: won.length,
    lost: lost.length,
    withdrawn: withdrawn.length,
    noResponse: noResponse.length,
    winRate,
    totalWonValue,
    avgWonValue,
  };
}

export interface SegmentStat {
  segment: string;
  won: number;
  lost: number;
  total: number;
  winRate: number;
}

/**
 * Win rate by value range bucket.
 */
export async function getWinRateByValueRange(
  organizationId: string
): Promise<SegmentStat[]> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("bid_outcomes")
    .select("outcome, tender_value")
    .eq("organization_id", organizationId)
    .in("outcome", ["won", "lost"]);

  if (error) throw error;

  const buckets: Record<string, { won: number; lost: number }> = {
    "< €50K": { won: 0, lost: 0 },
    "€50K–€200K": { won: 0, lost: 0 },
    "€200K–€1M": { won: 0, lost: 0 },
    "> €1M": { won: 0, lost: 0 },
    "N/D": { won: 0, lost: 0 },
  };

  for (const row of data || []) {
    const v = Number(row.tender_value) || 0;
    let bucket: string;
    if (!v) bucket = "N/D";
    else if (v < 50_000) bucket = "< €50K";
    else if (v < 200_000) bucket = "€50K–€200K";
    else if (v < 1_000_000) bucket = "€200K–€1M";
    else bucket = "> €1M";

    if (row.outcome === "won") buckets[bucket].won++;
    else buckets[bucket].lost++;
  }

  return Object.entries(buckets)
    .filter(([, v]) => v.won + v.lost > 0)
    .map(([segment, v]) => ({
      segment,
      won: v.won,
      lost: v.lost,
      total: v.won + v.lost,
      winRate: Math.round((v.won / (v.won + v.lost)) * 100),
    }));
}

/**
 * Win rate by buyer.
 */
export async function getWinRateByBuyer(
  organizationId: string,
  limit: number = 10
): Promise<SegmentStat[]> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("bid_outcomes")
    .select("outcome, tender_buyer")
    .eq("organization_id", organizationId)
    .in("outcome", ["won", "lost"])
    .not("tender_buyer", "is", null);

  if (error) throw error;

  const byBuyer: Record<string, { won: number; lost: number }> = {};

  for (const row of data || []) {
    const buyer = row.tender_buyer || "Sconosciuto";
    if (!byBuyer[buyer]) byBuyer[buyer] = { won: 0, lost: 0 };
    if (row.outcome === "won") byBuyer[buyer].won++;
    else byBuyer[buyer].lost++;
  }

  return Object.entries(byBuyer)
    .map(([segment, v]) => ({
      segment,
      won: v.won,
      lost: v.lost,
      total: v.won + v.lost,
      winRate: Math.round((v.won / (v.won + v.lost)) * 100),
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

/**
 * Get competitors that beat us (from losing bids).
 */
export interface CompetitorInfo {
  name: string;
  winsAgainstUs: number;
  avgWinningAmount: number;
}

export async function getTopCompetitors(
  organizationId: string,
  limit: number = 10
): Promise<CompetitorInfo[]> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("bid_outcomes")
    .select("winning_bidder, winning_amount")
    .eq("organization_id", organizationId)
    .eq("outcome", "lost")
    .not("winning_bidder", "is", null);

  if (error) throw error;

  const competitors: Record<
    string,
    { count: number; totalAmount: number }
  > = {};

  for (const row of data || []) {
    const name = row.winning_bidder!;
    if (!competitors[name]) competitors[name] = { count: 0, totalAmount: 0 };
    competitors[name].count++;
    competitors[name].totalAmount += Number(row.winning_amount) || 0;
  }

  return Object.entries(competitors)
    .map(([name, v]) => ({
      name,
      winsAgainstUs: v.count,
      avgWinningAmount:
        v.count > 0 ? Math.round(v.totalAmount / v.count) : 0,
    }))
    .sort((a, b) => b.winsAgainstUs - a.winsAgainstUs)
    .slice(0, limit);
}

/**
 * Get lessons learned from past bids.
 */
export async function getLessonsLearned(
  organizationId: string,
  limit: number = 20
): Promise<
  Array<{
    outcome: BidOutcomeType;
    tender_buyer: string | null;
    tender_value: number | null;
    lessons_learned: string;
    outcome_date: string | null;
  }>
> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("bid_outcomes")
    .select("outcome, tender_buyer, tender_value, lessons_learned, outcome_date")
    .eq("organization_id", organizationId)
    .not("lessons_learned", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data || []).filter((r) => r.lessons_learned);
}
