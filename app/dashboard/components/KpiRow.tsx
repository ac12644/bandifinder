"use client";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle } from "lucide-react";
import { useKpis } from "@/lib/hooks/useDashboardData";
import { formatCompact } from "@/lib/utils/formatters";
import { cn } from "@/lib/utils";

/**
 * Dashboard headline figures.
 *
 * These are not five equivalent metrics, and drawing them as five identical
 * cards with five unrelated accent colours said they were. Four of them are a
 * funnel — every tender you analysed, the subset you bid on, the share you
 * won, and what those wins were worth — so they belong in one run, in order,
 * separated by rules rather than by card edges.
 *
 * Missed deadlines is a different kind of number: not a measure of how you're
 * doing but a count of opportunities lost to the clock, which is the failure
 * this product exists to prevent. It gets its own card, and turns vermilion
 * the moment it is non-zero.
 */

const FUNNEL = [
  {
    key: "tendersReviewed" as const,
    label: "Analizzati",
    format: (v: number) => String(v),
  },
  {
    key: "bidsSubmitted" as const,
    label: "Offerte inviate",
    format: (v: number) => String(v),
  },
  {
    key: "winRate" as const,
    label: "Tasso vittoria",
    format: (v: number) => `${Math.round(v)}%`,
  },
  {
    key: "avgValue" as const,
    label: "Valore medio",
    format: (v: number) => (v > 0 ? `${formatCompact(v)} €` : "—"),
  },
];

export function KpiRow() {
  const { data, isLoading } = useKpis();
  const missed = data?.missedDeadlines ?? 0;

  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
      <Card className="px-1 py-0">
        <ol className="grid grid-cols-2 divide-y sm:grid-cols-4 sm:divide-x sm:divide-y-0">
          {FUNNEL.map(({ key, label, format }, i) => (
            <li key={key} className="px-4 py-3.5">
              <p className="eyebrow flex items-center gap-1.5">
                <span className="text-muted-foreground/50">{i + 1}</span>
                {label}
              </p>
              {isLoading ? (
                <Skeleton className="mt-1.5 h-7 w-16" />
              ) : (
                <p className="font-display mt-1 text-2xl leading-none tabular-nums">
                  {format(data?.[key] ?? 0)}
                </p>
              )}
            </li>
          ))}
        </ol>
      </Card>

      <Card
        className={cn(
          "flex flex-row items-center gap-3 px-4 py-3.5 lg:flex-col lg:items-start lg:justify-center",
          missed > 0 && "border-urgent/30 bg-urgent-soft"
        )}
      >
        <div className="flex items-center gap-1.5">
          <AlertTriangle
            className={cn(
              "h-3.5 w-3.5 shrink-0",
              missed > 0 ? "text-urgent" : "text-muted-foreground/50"
            )}
          />
          <p className="eyebrow whitespace-nowrap">Scadenze perse</p>
        </div>

        {isLoading ? (
          <Skeleton className="h-7 w-10" />
        ) : (
          <p
            className={cn(
              "font-display text-2xl leading-none tabular-nums",
              missed > 0 ? "text-urgent" : "text-muted-foreground"
            )}
          >
            {missed}
          </p>
        )}
      </Card>
    </div>
  );
}
