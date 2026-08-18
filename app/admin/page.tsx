"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Activity,
  Users,
  Search,
  AlertTriangle,
  Loader2,
  RefreshCcw,
  Shield,
  Zap,
  Clock,
  Server,
  BarChart3,
  Database,
  Building2,
  FileText,
  Kanban,
  Trophy,
  XCircle,
  CheckCircle2,
  TrendingUp,
  Hash,
  ArrowUpRight,
  CalendarClock,
  CreditCard,
} from "lucide-react";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty";
import { API_BASE_URL } from "@/lib/apiConfig";
import { useAuth } from "@/components/AuthProvider";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/utils/formatters";

// ============================================================================
// TYPES — matches real API response
// ============================================================================

interface AdminMetrics {
  period: { start: string; end: string; days: number };
  platform: {
    totalOrganizations: number;
    totalUsers: number;
    totalTenders: number;
    tendersBySource: Record<string, number>;
    planDistribution: Record<string, number>;
  };
  pipeline: {
    totalBids: number;
    bidsByStatus: Record<string, number>;
    winRate: number;
    totalWonValue: number;
    avgWonValue: number;
    totalOutcomes: number;
  };
  ingestion: {
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
  };
  activity: {
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
  };
  runtime: {
    httpRequestsTotal: number;
    httpErrorsTotal: number;
    avgLatencyMs: number;
    errorRate: number;
    agentExecutions: Record<string, { count: number; errors: number }>;
  };
  timestamp: string;
}

// Set NEXT_PUBLIC_ADMIN_UID to enable the admin surfaces. Left unset, nothing
// admin renders — this only gates UI; the real check is adminMiddleware on the
// server. Deliberately has no fallback so a real user id is not shipped to
// every visitor in the client bundle.
const ADMIN_UID = process.env.NEXT_PUBLIC_ADMIN_UID;

const BID_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  new: { label: "Nuovi", color: "bg-blue-500" },
  reviewing: { label: "Revisione", color: "bg-amber-500" },
  preparing: { label: "Preparazione", color: "bg-orange-500" },
  submitted: { label: "Inviati", color: "bg-violet-500" },
  won: { label: "Vinti", color: "bg-emerald-500" },
  lost: { label: "Persi", color: "bg-red-500" },
};

const PLAN_COLORS: Record<string, string> = {
  free: "bg-slate-400",
  starter: "bg-blue-500",
  pro: "bg-violet-500",
  enterprise: "bg-amber-500",
};

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

function KpiCard({
  label,
  value,
  icon: Icon,
  iconColor,
  subtitle,
}: {
  label: string;
  value: string | number;
  icon: typeof Building2;
  iconColor: string;
  subtitle?: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-5 space-y-3 hover:shadow-sm transition-shadow">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] text-muted-foreground font-medium">{label}</p>
          <p className="text-3xl font-bold mt-1 tabular-nums">{value}</p>
        </div>
        <div className={cn("rounded-xl p-2.5", iconColor)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      {subtitle && (
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      )}
    </div>
  );
}

function HorizontalBar({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold tabular-nums">{value}</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500", color)}
          style={{ width: `${Math.max(pct, 1)}%` }}
        />
      </div>
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  iconColor,
}: {
  icon: typeof BarChart3;
  title: string;
  iconColor?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className={cn("rounded-lg p-1.5", iconColor || "bg-primary/10")}>
        <Icon className={cn("h-3.5 w-3.5", iconColor ? "" : "text-primary")} />
      </div>
      <h3 className="text-sm font-semibold">{title}</h3>
    </div>
  );
}

function SourceBadge({ source }: { source: string }) {
  return (
    <Badge variant="outline" className="text-[10px] font-mono uppercase">
      {source === "ted_awards" ? "TED Awards" : source.toUpperCase()}
    </Badge>
  );
}

function formatEurShort(value: number): string {
  if (!value) return "0 €";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M €`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K €`;
  return `${value.toLocaleString("it-IT")} €`;
}

// ============================================================================
// SKELETON
// ============================================================================

function AdminSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div className="space-y-1">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-72" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-24 rounded-md" />
          <Skeleton className="h-8 w-8 rounded-md" />
          <Skeleton className="h-8 w-24 rounded-md" />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-8 w-16" />
              </div>
              <Skeleton className="h-10 w-10 rounded-xl" />
            </div>
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-5">
            <Skeleton className="h-5 w-40 mb-4" />
            <Skeleton className="h-48" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function AdminMetricsPage() {
  const { uid, idToken } = useAuth();
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState("7d");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadMetrics = useCallback(async () => {
    if (!ADMIN_UID || uid !== ADMIN_UID) return;

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `${API_BASE_URL}/getAdminMetrics?period=${period}`,
        {
          headers: {
            "x-user-id": uid ?? "anon",
            ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      setMetrics(data);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel caricamento");
    } finally {
      setLoading(false);
    }
  }, [uid, idToken, period]);

  useEffect(() => {
    if (ADMIN_UID && uid === ADMIN_UID) {
      loadMetrics();
    } else {
      setLoading(false);
    }
  }, [uid, loadMetrics]);

  useEffect(() => {
    if (!autoRefresh || !ADMIN_UID || uid !== ADMIN_UID) return;
    const interval = setInterval(loadMetrics, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, uid, loadMetrics]);

  // Access denied
  if (!uid || !ADMIN_UID || uid !== ADMIN_UID) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Empty className="py-20">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Shield />
            </EmptyMedia>
            <EmptyTitle>Accesso Negato</EmptyTitle>
            <EmptyDescription>
              Questa sezione è riservata agli amministratori.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  if (loading && !metrics) return <AdminSkeleton />;

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Empty className="py-20">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <AlertTriangle />
            </EmptyMedia>
            <EmptyTitle>Errore nel caricamento</EmptyTitle>
            <EmptyDescription>{error}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={loadMetrics}>
              <RefreshCcw className="h-4 w-4 mr-2" />
              Riprova
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  if (!metrics) return null;

  // Defensive defaults for potentially missing sections
  const pipeline = metrics.pipeline || { totalBids: 0, bidsByStatus: {}, winRate: 0, totalWonValue: 0, avgWonValue: 0, totalOutcomes: 0 };
  const platform = metrics.platform || { totalOrganizations: 0, totalUsers: 0, totalTenders: 0, tendersBySource: {}, planDistribution: {} };
  const ingestion = metrics.ingestion || { totalJobsInPeriod: 0, completedJobsInPeriod: 0, failedJobsInPeriod: 0, totalTendersNewInPeriod: 0, totalTendersFoundInPeriod: 0, lastCompletedBySource: {} };
  const activity = metrics.activity || { totalEventsInPeriod: 0, eventsByType: {}, totalSearches: 0, avgResultsPerSearch: 0, topUsers: [] };
  const runtime = metrics.runtime || { httpRequestsTotal: 0, httpErrorsTotal: 0, avgLatencyMs: 0, errorRate: 0, agentExecutions: {} };

  const activeBids = Object.entries(pipeline.bidsByStatus)
    .filter(([status]) => !["won", "lost"].includes(status))
    .reduce((sum, [, count]) => sum + count, 0);

  const maxBidsByStatus = Math.max(
    ...Object.values(pipeline.bidsByStatus),
    1
  );

  const maxEventsByType = Math.max(
    ...Object.values(activity.eventsByType),
    1
  );

  return (
    <TooltipProvider>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2">
              <BarChart3 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Dashboard Admin</h1>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Dati reali dalla piattaforma</span>
                {lastUpdated && (
                  <>
                    <span className="text-muted-foreground/30">|</span>
                    <Clock className="h-3 w-3" />
                    <span className="tabular-nums">
                      {lastUpdated.toLocaleTimeString("it-IT")}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border p-0.5">
              {["7d", "30d", "90d"].map((p) => (
                <Button
                  key={p}
                  variant={period === p ? "default" : "ghost"}
                  size="sm"
                  className="h-7 px-2.5 text-[11px] rounded-md"
                  onClick={() => setPeriod(p)}
                >
                  {p === "7d" ? "7g" : p === "30d" ? "30g" : "90g"}
                </Button>
              ))}
            </div>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={autoRefresh ? "default" : "outline"}
                  size="icon"
                  className={cn("h-8 w-8", autoRefresh && "bg-emerald-600 hover:bg-emerald-700")}
                  onClick={() => setAutoRefresh(!autoRefresh)}
                >
                  <Zap className={cn("h-3.5 w-3.5", autoRefresh && "animate-pulse")} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {autoRefresh ? "Auto-refresh attivo (30s)" : "Attiva auto-refresh"}
              </TooltipContent>
            </Tooltip>

            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={loadMetrics}
              disabled={loading}
            >
              <RefreshCcw className={cn("h-3.5 w-3.5 mr-1.5", loading && "animate-spin")} />
              Aggiorna
            </Button>

            <Button variant="outline" size="sm" className="h-8" asChild>
              <Link href="/admin/ingestion">
                <Database className="h-3.5 w-3.5 mr-1.5" />
                Ingestion
              </Link>
            </Button>
          </div>
        </div>

        {/* Row 1: Platform KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="Organizzazioni"
            value={platform.totalOrganizations}
            icon={Building2}
            iconColor="bg-blue-100 text-blue-600"
            subtitle={`${platform.totalUsers} utenti totali`}
          />
          <KpiCard
            label="Bandi Importati"
            value={platform.totalTenders.toLocaleString("it-IT")}
            icon={FileText}
            iconColor="bg-violet-100 text-violet-600"
            subtitle={Object.entries(platform.tendersBySource)
              .map(([src, count]) => `${src.toUpperCase()}: ${count}`)
              .join(" · ")}
          />
          <KpiCard
            label="Bid Attive"
            value={activeBids}
            icon={Kanban}
            iconColor="bg-amber-100 text-amber-600"
            subtitle={`${pipeline.totalBids} totali in pipeline`}
          />
          <KpiCard
            label="Win Rate"
            value={`${pipeline.winRate}%`}
            icon={pipeline.winRate >= 40 ? Trophy : TrendingUp}
            iconColor={
              pipeline.winRate >= 40
                ? "bg-emerald-100 text-emerald-600"
                : pipeline.winRate >= 20
                ? "bg-amber-100 text-amber-600"
                : "bg-red-100 text-red-600"
            }
            subtitle={
              pipeline.totalOutcomes > 0
                ? `${pipeline.totalOutcomes} esiti · ${formatEurShort(pipeline.totalWonValue)} vinto`
                : "Nessun esito registrato"
            }
          />
        </div>

        {/* Row 2: Pipeline + Ingestion */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Pipeline Funnel */}
          <div className="rounded-xl border bg-card p-5 space-y-4 hover:shadow-sm transition-shadow">
            <SectionHeader icon={Kanban} title="Pipeline Bids" />
            {pipeline.totalBids === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                Nessun bid in pipeline
              </p>
            ) : (
              <div className="space-y-2.5">
                {Object.entries(BID_STATUS_LABELS).map(([status, cfg]) => (
                  <HorizontalBar
                    key={status}
                    label={cfg.label}
                    value={pipeline.bidsByStatus[status] || 0}
                    max={maxBidsByStatus}
                    color={cfg.color}
                  />
                ))}
              </div>
            )}
            {pipeline.totalWonValue > 0 && (
              <div className="grid grid-cols-2 gap-3 pt-3 border-t">
                <div className="text-center p-2.5 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg">
                  <p className="text-sm font-bold text-emerald-600 tabular-nums">
                    {formatEurShort(pipeline.totalWonValue)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Valore vinto</p>
                </div>
                <div className="text-center p-2.5 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
                  <p className="text-sm font-bold text-blue-600 tabular-nums">
                    {formatEurShort(pipeline.avgWonValue)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Media vinto</p>
                </div>
              </div>
            )}
          </div>

          {/* Ingestion Health */}
          <div className="rounded-xl border bg-card p-5 space-y-4 hover:shadow-sm transition-shadow">
            <SectionHeader icon={Database} title="Ingestion" />
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border p-3 space-y-1">
                <div className="flex items-center gap-1.5">
                  <Hash className="h-3 w-3 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground font-medium">
                    Job ({metrics.period?.days || 7}g)
                  </span>
                </div>
                <p className="text-lg font-bold tabular-nums">
                  {ingestion.totalJobsInPeriod}
                </p>
              </div>
              <div className="rounded-lg border p-3 space-y-1">
                <div className="flex items-center gap-1.5">
                  <ArrowUpRight className="h-3 w-3 text-emerald-600" />
                  <span className="text-[10px] text-muted-foreground font-medium">
                    Nuovi bandi
                  </span>
                </div>
                <p className="text-lg font-bold tabular-nums text-emerald-600">
                  {ingestion.totalTendersNewInPeriod}
                </p>
              </div>
            </div>

            {ingestion.failedJobsInPeriod > 0 && (
              <div className="flex items-center gap-2 p-2.5 bg-red-50 dark:bg-red-950/30 rounded-lg text-xs">
                <XCircle className="h-3.5 w-3.5 text-red-600 shrink-0" />
                <span>
                  <strong className="text-red-600">{ingestion.failedJobsInPeriod}</strong>{" "}
                  job falliti nel periodo
                </span>
              </div>
            )}

            <div className="space-y-2 pt-2 border-t">
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                Ultimo completato per sorgente
              </p>
              {Object.entries(ingestion.lastCompletedBySource).map(
                ([source, info]) => (
                  <div
                    key={source}
                    className="flex items-center justify-between text-xs py-1.5"
                  >
                    <div className="flex items-center gap-2">
                      <SourceBadge source={source} />
                      {info ? (
                        <span className="text-muted-foreground">
                          {formatDate(info.completedAt)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground italic">Mai</span>
                      )}
                    </div>
                    {info && (
                      <span className="tabular-nums text-muted-foreground">
                        +{info.tendersNew} · {info.durationSeconds}s
                      </span>
                    )}
                  </div>
                )
              )}
            </div>
          </div>
        </div>

        {/* Row 3: Activity + Top Users */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* User Activity */}
          <div className="rounded-xl border bg-card p-5 space-y-4 hover:shadow-sm transition-shadow">
            <SectionHeader icon={Activity} title={`Attività (${metrics.period?.days || 7}g)`} />

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-xl text-center">
                <p className="text-2xl font-bold text-blue-600 tabular-nums">
                  {activity.totalSearches}
                </p>
                <p className="text-[10px] text-muted-foreground">Ricerche</p>
              </div>
              <div className="p-3 bg-violet-50 dark:bg-violet-950/30 rounded-xl text-center">
                <p className="text-2xl font-bold text-violet-600 tabular-nums">
                  {activity.avgResultsPerSearch}
                </p>
                <p className="text-[10px] text-muted-foreground">Risultati/ricerca</p>
              </div>
            </div>

            {Object.keys(activity.eventsByType).length > 0 && (
              <div className="space-y-2">
                {Object.entries(activity.eventsByType)
                  .sort(([, a], [, b]) => b - a)
                  .slice(0, 6)
                  .map(([event, count]) => (
                    <HorizontalBar
                      key={event}
                      label={event.replace(/_/g, " ")}
                      value={count}
                      max={maxEventsByType}
                      color="bg-primary"
                    />
                  ))}
              </div>
            )}
          </div>

          {/* Top Users */}
          <div className="rounded-xl border bg-card p-5 space-y-4 hover:shadow-sm transition-shadow">
            <SectionHeader icon={Users} title="Utenti Più Attivi" />

            {activity.topUsers.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                Nessuna attività nel periodo
              </p>
            ) : (
              <div className="space-y-2">
                {activity.topUsers.map((user, idx) => (
                  <div
                    key={user.email}
                    className="flex items-center gap-3 p-2.5 rounded-lg border hover:bg-muted/30 transition-colors"
                  >
                    <span
                      className={cn(
                        "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold shrink-0",
                        idx === 0 && "bg-amber-100 text-amber-700",
                        idx === 1 && "bg-slate-100 text-slate-600",
                        idx === 2 && "bg-orange-100 text-orange-700",
                        idx > 2 && "bg-muted text-muted-foreground"
                      )}
                    >
                      {idx + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {user.firstName && user.lastName
                          ? `${user.firstName} ${user.lastName}`
                          : user.email}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {user.eventCount} eventi · ultimo{" "}
                        {formatDate(user.lastActive)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Row 4: Runtime + Plans */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Runtime Metrics */}
          <div className="rounded-xl border bg-card p-5 space-y-4 hover:shadow-sm transition-shadow">
            <div className="flex items-center justify-between">
              <SectionHeader icon={Server} title="Runtime" />
              <Badge variant="outline" className="text-[9px] text-muted-foreground">
                Resets on deploy
              </Badge>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-2.5 bg-muted/40 rounded-lg">
                <p className="text-lg font-bold tabular-nums">
                  {runtime.httpRequestsTotal}
                </p>
                <p className="text-[10px] text-muted-foreground">Richieste</p>
              </div>
              <div className="text-center p-2.5 bg-muted/40 rounded-lg">
                <p className="text-lg font-bold tabular-nums">
                  {runtime.avgLatencyMs} ms
                </p>
                <p className="text-[10px] text-muted-foreground">Latenza media</p>
              </div>
              <div className="text-center p-2.5 bg-muted/40 rounded-lg">
                <p
                  className={cn(
                    "text-lg font-bold tabular-nums",
                    runtime.errorRate > 5
                      ? "text-red-600"
                      : runtime.errorRate > 1
                      ? "text-amber-600"
                      : "text-emerald-600"
                  )}
                >
                  {runtime.errorRate}%
                </p>
                <p className="text-[10px] text-muted-foreground">Error rate</p>
              </div>
            </div>

            {Object.keys(runtime.agentExecutions).length > 0 && (
              <div className="pt-3 border-t space-y-1.5">
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                  Agent Executions
                </p>
                {Object.entries(runtime.agentExecutions).map(
                  ([agent, stats]) => (
                    <div
                      key={agent}
                      className="flex items-center justify-between text-xs py-1"
                    >
                      <span className="capitalize text-muted-foreground">
                        {agent}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="tabular-nums font-medium">
                          {stats.count}
                        </span>
                        {stats.errors > 0 && (
                          <Badge variant="destructive" className="text-[9px] h-4">
                            {stats.errors} err
                          </Badge>
                        )}
                      </div>
                    </div>
                  )
                )}
              </div>
            )}
          </div>

          {/* Plan Distribution */}
          <div className="rounded-xl border bg-card p-5 space-y-4 hover:shadow-sm transition-shadow">
            <SectionHeader icon={CreditCard} title="Distribuzione Piani" />

            {Object.keys(platform.planDistribution).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                Nessuna organizzazione
              </p>
            ) : (
              <>
                <div className="space-y-2.5">
                  {Object.entries(platform.planDistribution)
                    .sort(([, a], [, b]) => b - a)
                    .map(([plan, count]) => (
                      <HorizontalBar
                        key={plan}
                        label={plan.charAt(0).toUpperCase() + plan.slice(1)}
                        value={count}
                        max={platform.totalOrganizations}
                        color={PLAN_COLORS[plan] || "bg-slate-400"}
                      />
                    ))}
                </div>
                <div className="pt-3 border-t">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Organizzazioni totali</span>
                    <span className="font-semibold text-foreground tabular-nums">
                      {platform.totalOrganizations}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                    <span>Utenti totali</span>
                    <span className="font-semibold text-foreground tabular-nums">
                      {platform.totalUsers}
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
