"use client";

import { useState } from "react";
import type { CompetitorInfo, MarketCompetitor } from "@/lib/hooks/useOutcomes";
import { useMarketCompetitors } from "@/lib/hooks/useOutcomes";
import { Users, Globe, Loader2 } from "lucide-react";
import { formatEUR } from "@/lib/utils/formatters";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";

interface CompetitorAnalysisProps {
  competitors: CompetitorInfo[];
}

function RankBadge({ rank }: { rank: number }) {
  return (
    <span
      className={cn(
        "flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold shrink-0",
        rank === 1 && "bg-amber-100 text-amber-700",
        rank === 2 && "bg-slate-100 text-slate-600",
        rank === 3 && "bg-orange-100 text-orange-700",
        rank > 3 && "bg-muted text-muted-foreground"
      )}
    >
      {rank}
    </span>
  );
}

function DirectCompetitors({ competitors }: { competitors: CompetitorInfo[] }) {
  if (competitors.length === 0) {
    return (
      <Empty className="py-8">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Users />
          </EmptyMedia>
          <EmptyTitle>Nessun competitor</EmptyTitle>
          <EmptyDescription>
            Registra il vincitore quando perdi una gara per popolare questa sezione.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="space-y-2">
      {competitors.map((comp, i) => (
        <div
          key={comp.name}
          className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/30 transition-colors"
        >
          <div className="flex items-center gap-3">
            <RankBadge rank={i + 1} />
            <div>
              <p className="text-sm font-medium">{comp.name}</p>
              <p className="text-xs text-muted-foreground">
                Vinto {comp.winsAgainstUs}{" "}
                {comp.winsAgainstUs === 1 ? "gara" : "gare"} contro di noi
              </p>
            </div>
          </div>
          <div className="text-right shrink-0 ml-3">
            <p className="text-sm font-semibold tabular-nums">
              {formatEUR(comp.avgWinningAmount)}
            </p>
            <p className="text-[10px] text-muted-foreground">importo medio</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function MarketCompetitorsSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-center justify-between rounded-lg border p-3">
          <div className="flex items-center gap-3">
            <Skeleton className="h-6 w-6 rounded-full" />
            <div className="space-y-1">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
          <div className="space-y-1 text-right">
            <Skeleton className="h-4 w-16 ml-auto" />
            <Skeleton className="h-3 w-20 ml-auto" />
          </div>
        </div>
      ))}
    </div>
  );
}

function MarketCompetitorsView({
  competitors,
  isLoading,
}: {
  competitors: MarketCompetitor[];
  isLoading: boolean;
}) {
  if (isLoading) {
    return <MarketCompetitorsSkeleton />;
  }

  if (competitors.length === 0) {
    return (
      <Empty className="py-8">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Globe />
          </EmptyMedia>
          <EmptyTitle>Nessun dato di mercato</EmptyTitle>
          <EmptyDescription>
            I dati appariranno dopo l&apos;importazione delle aggiudicazioni TED.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="space-y-2">
      {competitors.map((comp, i) => (
        <div
          key={comp.name}
          className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/30 transition-colors"
        >
          <div className="flex items-center gap-3">
            <RankBadge rank={i + 1} />
            <div>
              <p className="text-sm font-medium">{comp.name}</p>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Globe className="h-3 w-3 shrink-0" />
                <span>
                  {comp.totalWins} aggiudicazion{comp.totalWins === 1 ? "e" : "i"}
                  {comp.countries.length > 0 && ` · ${comp.countries.join(", ")}`}
                </span>
              </div>
            </div>
          </div>
          <div className="text-right shrink-0 ml-3">
            <p className="text-sm font-semibold tabular-nums">
              {formatEUR(comp.avgValue)}
            </p>
            <p className="text-[10px] text-muted-foreground">
              totale {formatEUR(comp.totalValue)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function CompetitorAnalysis({ competitors }: CompetitorAnalysisProps) {
  const [tab, setTab] = useState<"direct" | "market">("direct");
  const { data: marketData, isLoading: marketLoading } = useMarketCompetitors();
  const marketCompetitors = marketData?.competitors || [];

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-primary/10 p-1.5">
            <Users className="h-3.5 w-3.5 text-primary" />
          </div>
          <h3 className="text-sm font-semibold">Competitor Principali</h3>
        </div>
        <div className="flex rounded-lg border p-0.5">
          <Button
            variant={tab === "direct" ? "default" : "ghost"}
            size="sm"
            className="h-6 px-2.5 text-[11px] rounded-md"
            onClick={() => setTab("direct")}
          >
            Diretti
          </Button>
          <Button
            variant={tab === "market" ? "default" : "ghost"}
            size="sm"
            className="h-6 px-2.5 text-[11px] rounded-md"
            onClick={() => setTab("market")}
          >
            Mercato
          </Button>
        </div>
      </div>

      {tab === "direct" ? (
        <DirectCompetitors competitors={competitors} />
      ) : (
        <MarketCompetitorsView
          competitors={marketCompetitors}
          isLoading={marketLoading}
        />
      )}
    </div>
  );
}
