/**
 * Admin Metrics DB Layer
 *
 * Aggregated queries for the admin dashboard.
 * All queries use the service-role Supabase client (bypasses RLS).
 */

import { getSupabaseAdmin } from "../supabase";

// ============================================================================
// TYPES
// ============================================================================

export interface PlatformStats {
  totalOrganizations: number;
  totalUsers: number;
  totalTenders: number;
  tendersBySource: Record<string, number>;
  planDistribution: Record<string, number>;
}

export interface PipelineStats {
  totalBids: number;
  bidsByStatus: Record<string, number>;
  winRate: number;
  totalWonValue: number;
  avgWonValue: number;
  totalOutcomes: number;
}

export interface IngestionStats {
  totalJobsInPeriod: number;
  completedJobsInPeriod: number;
  failedJobsInPeriod: number;
  totalTendersNewInPeriod: number;
  totalTendersFoundInPeriod: number;
  lastCompletedBySource: Record<
    string,
    {
      completedAt: string;
      tendersNew: number;
      tendersFound: number;
      durationSeconds: number;
    } | null
  >;
}

export interface ActivityStats {
  totalEventsInPeriod: number;
  eventsByType: Record<string, number>;
  totalSearches: number;
  avgResultsPerSearch: number;
  topUsers: Array<{
    email: string;
    firstName: string | null;
    lastName: string | null;
    eventCount: number;
    lastActive: string;
  }>;
}

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Platform-wide stats (not period-scoped — these are totals).
 */
export async function getAdminPlatformStats(): Promise<PlatformStats> {
  const sb = getSupabaseAdmin();

  // Run counts in parallel
  const [orgsResult, usersResult, tendersResult, tendersBySourceResult, plansResult] =
    await Promise.all([
      sb.from("organizations").select("id", { count: "exact", head: true }),
      sb.from("users").select("id", { count: "exact", head: true }),
      sb.from("tenders").select("id", { count: "exact", head: true }),
      sb.from("tenders").select("source"),
      sb.from("organizations").select("plan"),
    ]);

  // Group tenders by source
  const tendersBySource: Record<string, number> = {};
  for (const row of tendersBySourceResult.data || []) {
    const src = row.source || "unknown";
    tendersBySource[src] = (tendersBySource[src] || 0) + 1;
  }

  // Group orgs by plan
  const planDistribution: Record<string, number> = {};
  for (const row of plansResult.data || []) {
    const plan = row.plan || "free";
    planDistribution[plan] = (planDistribution[plan] || 0) + 1;
  }

  return {
    totalOrganizations: orgsResult.count || 0,
    totalUsers: usersResult.count || 0,
    totalTenders: tendersResult.count || 0,
    tendersBySource,
    planDistribution,
  };
}

/**
 * Bid pipeline stats (all-time, across all orgs).
 */
export async function getAdminPipelineStats(): Promise<PipelineStats> {
  const sb = getSupabaseAdmin();

  const [bidsResult, outcomesResult] = await Promise.all([
    sb.from("bids").select("status"),
    sb.from("bid_outcomes").select("outcome, winning_amount"),
  ]);

  // Group bids by status
  const bidsByStatus: Record<string, number> = {};
  let totalBids = 0;
  for (const row of bidsResult.data || []) {
    const status = row.status || "new";
    bidsByStatus[status] = (bidsByStatus[status] || 0) + 1;
    totalBids++;
  }

  // Compute win rate from outcomes
  const outcomes = outcomesResult.data || [];
  const totalOutcomes = outcomes.length;
  const wonOutcomes = outcomes.filter((o) => o.outcome === "won");
  const winRate = totalOutcomes > 0 ? (wonOutcomes.length / totalOutcomes) * 100 : 0;
  const totalWonValue = wonOutcomes.reduce(
    (sum, o) => sum + (Number(o.winning_amount) || 0),
    0
  );
  const avgWonValue = wonOutcomes.length > 0 ? totalWonValue / wonOutcomes.length : 0;

  return {
    totalBids,
    bidsByStatus,
    winRate: Math.round(winRate * 10) / 10,
    totalWonValue,
    avgWonValue: Math.round(avgWonValue),
    totalOutcomes,
  };
}

/**
 * Ingestion stats for a given period.
 */
export async function getAdminIngestionStats(
  since: Date
): Promise<IngestionStats> {
  const sb = getSupabaseAdmin();
  const sinceISO = since.toISOString();

  // Jobs in period
  const { data: jobs } = await sb
    .from("ingestion_jobs")
    .select("source, status, started_at, completed_at, tenders_found, tenders_new")
    .gte("created_at", sinceISO)
    .order("created_at", { ascending: false });

  const allJobs = jobs || [];
  const totalJobsInPeriod = allJobs.length;
  const completedJobsInPeriod = allJobs.filter((j) => j.status === "completed").length;
  const failedJobsInPeriod = allJobs.filter((j) => j.status === "failed").length;
  const totalTendersNewInPeriod = allJobs.reduce(
    (sum, j) => sum + (j.tenders_new || 0),
    0
  );
  const totalTendersFoundInPeriod = allJobs.reduce(
    (sum, j) => sum + (j.tenders_found || 0),
    0
  );

  // Latest completed per source (across all time, not just period)
  const sources = ["ted", "anac", "ted_awards"];
  const lastCompletedBySource: IngestionStats["lastCompletedBySource"] = {};

  for (const source of sources) {
    const { data: latest } = await sb
      .from("ingestion_jobs")
      .select("completed_at, started_at, tenders_new, tenders_found")
      .eq("source", source)
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(1);

    if (latest && latest.length > 0) {
      const job = latest[0];
      const duration =
        job.started_at && job.completed_at
          ? (new Date(job.completed_at).getTime() -
              new Date(job.started_at).getTime()) /
            1000
          : 0;

      lastCompletedBySource[source] = {
        completedAt: job.completed_at!,
        tendersNew: job.tenders_new || 0,
        tendersFound: job.tenders_found || 0,
        durationSeconds: Math.round(duration * 10) / 10,
      };
    } else {
      lastCompletedBySource[source] = null;
    }
  }

  return {
    totalJobsInPeriod,
    completedJobsInPeriod,
    failedJobsInPeriod,
    totalTendersNewInPeriod,
    totalTendersFoundInPeriod,
    lastCompletedBySource,
  };
}

/**
 * User activity stats for a given period.
 */
export async function getAdminActivityStats(
  since: Date
): Promise<ActivityStats> {
  const sb = getSupabaseAdmin();
  const sinceISO = since.toISOString();

  // Activity events in period
  const { data: events } = await sb
    .from("activity_log")
    .select("event, user_id, created_at")
    .gte("created_at", sinceISO);

  const allEvents = events || [];
  const totalEventsInPeriod = allEvents.length;

  // Group by event type
  const eventsByType: Record<string, number> = {};
  for (const ev of allEvents) {
    const type = ev.event || "unknown";
    eventsByType[type] = (eventsByType[type] || 0) + 1;
  }

  // Search history stats
  const { data: searches, count: searchCount } = await sb
    .from("search_history")
    .select("result_count", { count: "exact" })
    .gte("created_at", sinceISO);

  const totalSearches = searchCount || 0;
  const searchResults = searches || [];
  const totalResults = searchResults.reduce(
    (sum, s) => sum + (s.result_count || 0),
    0
  );
  const avgResultsPerSearch =
    totalSearches > 0 ? Math.round((totalResults / totalSearches) * 10) / 10 : 0;

  // Top users by event count
  const userEventCounts: Record<
    string,
    { count: number; lastActive: string }
  > = {};
  for (const ev of allEvents) {
    if (!ev.user_id) continue;
    if (!userEventCounts[ev.user_id]) {
      userEventCounts[ev.user_id] = { count: 0, lastActive: ev.created_at };
    }
    userEventCounts[ev.user_id].count++;
    if (ev.created_at > userEventCounts[ev.user_id].lastActive) {
      userEventCounts[ev.user_id].lastActive = ev.created_at;
    }
  }

  // Sort by count and take top 5
  const topUserIds = Object.entries(userEventCounts)
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, 5);

  // Fetch user details
  const topUsers: ActivityStats["topUsers"] = [];
  if (topUserIds.length > 0) {
    const { data: users } = await sb
      .from("users")
      .select("id, email, first_name, last_name")
      .in(
        "id",
        topUserIds.map(([id]) => id)
      );

    const userMap = new Map(
      (users || []).map((u) => [u.id, u])
    );

    for (const [userId, stats] of topUserIds) {
      const user = userMap.get(userId);
      topUsers.push({
        email: user?.email || userId.substring(0, 12) + "...",
        firstName: user?.first_name || null,
        lastName: user?.last_name || null,
        eventCount: stats.count,
        lastActive: stats.lastActive,
      });
    }
  }

  return {
    totalEventsInPeriod,
    eventsByType,
    totalSearches,
    avgResultsPerSearch,
    topUsers,
  };
}
