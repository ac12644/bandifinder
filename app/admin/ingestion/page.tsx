"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Play,
  Loader2,
  RefreshCcw,
  CheckCircle2,
  XCircle,
  Clock,
  Download,
  FileEdit,
  Bell,
  Database,
  CalendarClock,
  AlertTriangle,
  Hash,
  ArrowUpRight,
} from "lucide-react";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty";
import { useApiQuery, useApiMutation } from "@/lib/hooks/useAuthedFetch";
import { ENDPOINTS } from "@/lib/apiConfig";
import { formatDate } from "@/lib/utils/formatters";
import { cn } from "@/lib/utils";

interface IngestionJob {
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

interface IngestionResult {
  success: boolean;
  result?: {
    jobId: string;
    tendersFound: number;
    tendersNew: number;
    tendersUpdated: number;
    amendmentsDetected: number;
    notificationsCreated: number;
    vectorsUpserted: number;
    durationMs: number;
  };
  error?: string;
}

const statusConfig: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof Clock }
> = {
  pending: { label: "In attesa", variant: "outline", icon: Clock },
  running: { label: "In corso", variant: "default", icon: Loader2 },
  completed: { label: "Completato", variant: "secondary", icon: CheckCircle2 },
  failed: { label: "Fallito", variant: "destructive", icon: XCircle },
};

const SOURCE_LABELS: Record<string, string> = {
  ted: "TED",
  anac: "ANAC",
  all: "Tutti",
  ted_awards: "TED Awards",
};

function IngestionSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <Skeleton className="h-3 w-16" />
            </div>
            <Skeleton className="h-6 w-20" />
          </div>
        ))}
      </div>
      <div className="rounded-xl border bg-card p-5">
        <Skeleton className="h-5 w-40 mb-4" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 py-3 border-b last:border-0">
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 w-8 ml-auto" />
            <Skeleton className="h-4 w-8" />
            <Skeleton className="h-4 w-8" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-12" />
          </div>
        ))}
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  iconColor,
}: {
  label: string;
  value: string;
  icon: typeof Clock;
  iconColor: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 space-y-2">
      <div className="flex items-center gap-2">
        <div className={cn("rounded-lg p-1.5", iconColor)}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <span className="text-[11px] text-muted-foreground font-medium">
          {label}
        </span>
      </div>
      <p className="text-xl font-bold tabular-nums tracking-tight">{value}</p>
    </div>
  );
}

export default function AdminIngestionPage() {
  const [runningManual, setRunningManual] = useState(false);
  const [lastResult, setLastResult] = useState<IngestionResult | null>(null);
  const [selectedSource, setSelectedSource] = useState<string>("ted");

  const {
    data: jobsData,
    isLoading,
    refetch,
  } = useApiQuery<{ jobs: IngestionJob[]; total: number }>(
    ["ingestion-jobs"],
    `${ENDPOINTS.ingestionJobs}?limit=20`
  );

  const runMutation = useApiMutation<IngestionResult, { limit?: number }>(
    ENDPOINTS.ingestionRun,
    "POST"
  );

  const handleRunIngestion = async () => {
    setRunningManual(true);
    setLastResult(null);
    try {
      const result = await runMutation.mutateAsync({ limit: 500, source: selectedSource } as any);
      setLastResult(result);
      refetch();
    } catch (err) {
      setLastResult({
        success: false,
        error: err instanceof Error ? err.message : "Errore sconosciuto",
      });
    } finally {
      setRunningManual(false);
    }
  };

  const jobs = jobsData?.jobs || [];
  const lastCompleted = jobs.find((j) => j.status === "completed");
  const failedCount = jobs.filter((j) => j.status === "failed").length;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <Database className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Ingestion</h1>
            <p className="text-sm text-muted-foreground">
              Importazione bandi da TED e ANAC
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
          >
            <RefreshCcw className={cn("h-3.5 w-3.5 mr-1.5", isLoading && "animate-spin")} />
            Aggiorna
          </Button>
          <Select
            value={selectedSource}
            onValueChange={setSelectedSource}
            disabled={runningManual}
          >
            <SelectTrigger className="w-[100px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ted">TED</SelectItem>
              <SelectItem value="anac">ANAC</SelectItem>
              <SelectItem value="all">Tutti</SelectItem>
            </SelectContent>
          </Select>
          <Button
            size="sm"
            onClick={handleRunIngestion}
            disabled={runningManual}
          >
            {runningManual ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5 mr-1.5" />
            )}
            {runningManual ? "In esecuzione..." : "Avvia"}
          </Button>
        </div>
      </div>

      {/* Last result banner */}
      {lastResult && (
        <div
          className={cn(
            "rounded-xl border p-4",
            lastResult.success
              ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950"
              : "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950"
          )}
        >
          {lastResult.success && lastResult.result ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span className="text-sm font-medium">
                  Completata in {(lastResult.result.durationMs / 1000).toFixed(1)}s
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div className="flex items-center gap-1.5">
                  <Download className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="tabular-nums">
                    <strong>{lastResult.result.tendersFound}</strong> trovati
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <ArrowUpRight className="h-3.5 w-3.5 text-emerald-600" />
                  <span className="tabular-nums">
                    <strong>{lastResult.result.tendersNew}</strong> nuovi
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <FileEdit className="h-3.5 w-3.5 text-blue-600" />
                  <span className="tabular-nums">
                    <strong>{lastResult.result.amendmentsDetected}</strong> modifiche
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Bell className="h-3.5 w-3.5 text-amber-600" />
                  <span className="tabular-nums">
                    <strong>{lastResult.result.notificationsCreated}</strong> notifiche
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-red-600" />
              <span className="text-sm font-medium">
                Errore: {lastResult.error}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <IngestionSkeleton />
      ) : (
        <>
          {/* Summary cards */}
          {jobs.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <SummaryCard
                label="Ultimo completato"
                value={lastCompleted ? formatDate(lastCompleted.completed_at!) : "Mai"}
                icon={CalendarClock}
                iconColor="text-blue-600 bg-blue-100"
              />
              <SummaryCard
                label="Totale importazioni"
                value={String(jobsData?.total || 0)}
                icon={Hash}
                iconColor="text-violet-600 bg-violet-100"
              />
              <SummaryCard
                label="Nuovi bandi (ultimo)"
                value={String(lastCompleted?.tenders_new || 0)}
                icon={ArrowUpRight}
                iconColor="text-emerald-600 bg-emerald-100"
              />
              <SummaryCard
                label="Errori recenti"
                value={String(failedCount)}
                icon={AlertTriangle}
                iconColor={
                  failedCount > 0
                    ? "text-red-600 bg-red-100"
                    : "text-slate-600 bg-slate-100"
                }
              />
            </div>
          )}

          {/* Jobs table */}
          <div className="rounded-xl border bg-card">
            <div className="px-5 py-4 border-b">
              <h3 className="text-sm font-semibold">Storico importazioni</h3>
            </div>
            <div className="p-2">
              {jobs.length === 0 ? (
                <Empty className="py-12">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Database />
                    </EmptyMedia>
                    <EmptyTitle>Nessuna importazione</EmptyTitle>
                    <EmptyDescription>
                      Avvia la prima importazione con il pulsante sopra.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="text-left py-2.5 px-3 font-medium text-xs">Stato</th>
                        <th className="text-left py-2.5 px-3 font-medium text-xs">Sorgente</th>
                        <th className="text-right py-2.5 px-3 font-medium text-xs">Trovati</th>
                        <th className="text-right py-2.5 px-3 font-medium text-xs">Nuovi</th>
                        <th className="text-right py-2.5 px-3 font-medium text-xs">Aggiornati</th>
                        <th className="text-right py-2.5 px-3 font-medium text-xs">Modifiche</th>
                        <th className="text-left py-2.5 px-3 font-medium text-xs">Avviato</th>
                        <th className="text-left py-2.5 px-3 font-medium text-xs">Durata</th>
                      </tr>
                    </thead>
                    <tbody>
                      {jobs.map((job) => {
                        const statusInfo = statusConfig[job.status] || statusConfig.pending;
                        const StatusIcon = statusInfo.icon;
                        const duration =
                          job.started_at && job.completed_at
                            ? (
                                (new Date(job.completed_at).getTime() -
                                  new Date(job.started_at).getTime()) /
                                1000
                              ).toFixed(1) + "s"
                            : "-";

                        return (
                          <tr
                            key={job.id}
                            className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                          >
                            <td className="py-2.5 px-3">
                              <Badge variant={statusInfo.variant} className="gap-1 text-[10px]">
                                <StatusIcon className={cn("h-3 w-3", job.status === "running" && "animate-spin")} />
                                {statusInfo.label}
                              </Badge>
                              {job.error && (
                                <p className="text-[10px] text-destructive mt-1 max-w-[180px] truncate">
                                  {job.error}
                                </p>
                              )}
                            </td>
                            <td className="py-2.5 px-3">
                              <Badge variant="outline" className="text-[10px] font-mono">
                                {SOURCE_LABELS[job.source] || job.source.toUpperCase()}
                              </Badge>
                            </td>
                            <td className="py-2.5 px-3 text-right tabular-nums font-medium">
                              {job.tenders_found}
                            </td>
                            <td className="py-2.5 px-3 text-right tabular-nums">
                              <span className={cn(job.tenders_new > 0 && "text-emerald-600 font-medium")}>
                                {job.tenders_new}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right tabular-nums text-muted-foreground">
                              {job.tenders_updated}
                            </td>
                            <td className="py-2.5 px-3 text-right tabular-nums text-muted-foreground">
                              {job.amendments_detected}
                            </td>
                            <td className="py-2.5 px-3 text-xs text-muted-foreground">
                              {job.started_at
                                ? formatDate(job.started_at)
                                : formatDate(job.created_at)}
                            </td>
                            <td className="py-2.5 px-3 text-xs tabular-nums text-muted-foreground">
                              {duration}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
