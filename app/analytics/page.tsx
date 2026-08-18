"use client";

import Link from "next/link";
import { useOutcomesAnalytics } from "@/lib/hooks/useOutcomes";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { TrendingUp, BarChart3, AlertCircle, Kanban } from "lucide-react";
import { OutcomeOverview } from "./components/OutcomeOverview";
import { WinRateBySegment } from "./components/WinRateBySegment";
import { CompetitorAnalysis } from "./components/CompetitorAnalysis";
import { LessonsLearnedList } from "./components/LessonsLearnedList";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty";

function AnalyticsSkeleton() {
  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <Skeleton className="h-3 w-16" />
            </div>
            <Skeleton className="h-6 w-12" />
          </div>
        ))}
      </div>
      {/* Two columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
      {/* Lessons */}
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}

export default function AnalyticsPage() {
  const { data, isLoading, error } = useOutcomesAnalytics();

  const hasData = data && data.stats.total > 0;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <BarChart3 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Analisi</h1>
            <p className="text-sm text-muted-foreground">
              Intelligence competitiva e lezioni apprese
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/pipeline">
            <Kanban className="h-3.5 w-3.5 mr-1.5" />
            Pipeline
          </Link>
        </Button>
      </div>

      {/* Content */}
      {isLoading ? (
        <AnalyticsSkeleton />
      ) : error ? (
        <Empty className="py-20">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <AlertCircle />
            </EmptyMedia>
            <EmptyTitle>Errore nel caricamento</EmptyTitle>
            <EmptyDescription>
              Non è stato possibile caricare le analisi. Riprova più tardi.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : !hasData ? (
        <Empty className="py-20">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <TrendingUp />
            </EmptyMedia>
            <EmptyTitle>Nessun esito registrato</EmptyTitle>
            <EmptyDescription>
              Registra gli esiti delle tue gare dalla pagina di dettaglio bid per
              vedere le analisi win/loss, i competitor e le lezioni apprese.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild>
              <Link href="/pipeline">
                <Kanban className="h-4 w-4 mr-2" />
                Vai alla Pipeline
              </Link>
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="space-y-6">
          {/* Overview cards */}
          <OutcomeOverview stats={data.stats} />

          {/* Two column layout: segments + competitors */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <WinRateBySegment
              byValueRange={data.byValueRange}
              byBuyer={data.byBuyer}
            />
            <CompetitorAnalysis competitors={data.competitors} />
          </div>

          {/* Lessons learned */}
          <LessonsLearnedList lessons={data.lessons} />
        </div>
      )}
    </div>
  );
}
