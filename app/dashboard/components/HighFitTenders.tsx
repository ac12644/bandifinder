"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FitScoreBadge } from "@/components/tender/FitScoreBadge";
import { useBestTenders } from "@/lib/hooks/useDashboardData";
import { formatCompact, formatDate } from "@/lib/utils/formatters";
import { Sparkles, ArrowRight, Building2, Clock } from "lucide-react";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";

export function HighFitTenders() {
  const { data, isLoading } = useBestTenders(5);
  const tenders = data?.tenders ?? [];

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Bandi più adatti a te
          </CardTitle>
          <Button variant="ghost" size="sm" className="text-xs h-7" asChild>
            <Link href="/tenders">
              Vedi tutti
              <ArrowRight className="h-3 w-3 ml-1" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex-1">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3 py-2">
                <Skeleton className="h-6 w-14 rounded-full shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : tenders.length === 0 ? (
          <Empty className="py-8 border-0">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Sparkles />
              </EmptyMedia>
              <EmptyTitle className="text-base">Nessun bando trovato</EmptyTitle>
              <EmptyDescription>
                Completa il tuo profilo per ricevere raccomandazioni personalizzate.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="space-y-1">
            {tenders.map((tender) => (
              <li key={tender.id}>
                <Link
                  href={`/tenders/${tender.id}`}
                  className="group flex items-start gap-3 rounded-lg px-2 py-2.5 -mx-2 transition-colors hover:bg-muted/50"
                >
                  {/* Score badge */}
                  <div className="shrink-0 pt-0.5">
                    {tender.fitScore != null ? (
                      <FitScoreBadge score={tender.fitScore} size="sm" showLabel={false} />
                    ) : (
                      <span className="inline-flex items-center rounded-full border px-1.5 py-0.5 text-xs text-muted-foreground">
                        --
                      </span>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-snug line-clamp-1 group-hover:text-primary transition-colors">
                      {tender.title}
                    </p>
                    <div className="flex items-center gap-3 mt-1">
                      {tender.buyer && (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground truncate max-w-[160px]">
                          <Building2 className="h-3 w-3 shrink-0" />
                          {tender.buyer}
                        </span>
                      )}
                      {tender.value != null && tender.value > 0 && (
                        <span className="text-xs text-muted-foreground font-medium tabular-nums">
                          {formatCompact(tender.value)} €
                        </span>
                      )}
                      {tender.deadline && (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3 shrink-0" />
                          {formatDate(tender.deadline)}
                        </span>
                      )}
                    </div>
                  </div>

                  <ArrowRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-primary shrink-0 mt-1 transition-colors" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
