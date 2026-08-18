"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useUrgentTenders } from "@/lib/hooks/useDashboardData";
import { daysUntilDeadline, formatDate } from "@/lib/utils/formatters";
import { Clock, AlertTriangle, ArrowRight, CalendarCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";

function DaysLabel({ days }: { days: number | null }) {
  if (days === null) return null;
  const isCritical = days <= 3;
  const isToday = days === 0;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums shrink-0",
        isCritical
          ? "bg-red-100 text-red-700"
          : "bg-amber-100 text-amber-700"
      )}
    >
      {isCritical && <AlertTriangle className="h-3 w-3" />}
      {isToday ? "Oggi" : days === 1 ? "Domani" : `${days}g`}
    </span>
  );
}

export function UrgentDeadlines() {
  const { data, isLoading } = useUrgentTenders(7);
  const tenders = data?.tenders ?? [];

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4 text-amber-600" />
          Scadenze urgenti
          {!isLoading && tenders.length > 0 && (
            <span className="text-xs font-normal text-muted-foreground">
              ({tenders.length})
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 py-2">
                <Skeleton className="h-6 w-12 rounded-md shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : tenders.length === 0 ? (
          <Empty className="py-8 border-0">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CalendarCheck />
              </EmptyMedia>
              <EmptyTitle className="text-base">Nessuna scadenza urgente</EmptyTitle>
              <EmptyDescription>
                Non ci sono bandi in scadenza nei prossimi 7 giorni.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="space-y-1">
            {tenders.map((tender) => {
              const days = daysUntilDeadline(tender.deadline);
              const isCritical = days !== null && days <= 3;

              return (
                <li key={tender.id}>
                  <Link
                    href={`/tenders/${tender.id}`}
                    className={cn(
                      "group flex items-center gap-3 rounded-lg px-2 py-2.5 -mx-2 transition-colors hover:bg-muted/50",
                      isCritical && "border-l-2 border-l-red-400 pl-3"
                    )}
                  >
                    <DaysLabel days={days} />

                    <div className="flex-1 min-w-0">
                      <p className="text-sm leading-snug line-clamp-1 group-hover:text-primary transition-colors">
                        {tender.title}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatDate(tender.deadline)}
                      </p>
                    </div>

                    <ArrowRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-primary shrink-0 transition-colors" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
