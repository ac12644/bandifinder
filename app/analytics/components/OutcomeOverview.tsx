"use client";

import type { OutcomeStats } from "@/lib/hooks/useOutcomes";
import { Trophy, XCircle, Target, Euro, TrendingUp, Percent } from "lucide-react";
import { formatEUR } from "@/lib/utils/formatters";
import { cn } from "@/lib/utils";

interface OutcomeOverviewProps {
  stats: OutcomeStats;
}

export function OutcomeOverview({ stats }: OutcomeOverviewProps) {
  const cards = [
    {
      label: "Gare Totali",
      value: String(stats.total),
      icon: Target,
      iconColor: "text-blue-600 bg-blue-100",
    },
    {
      label: "Vinte",
      value: String(stats.won),
      icon: Trophy,
      iconColor: "text-emerald-600 bg-emerald-100",
    },
    {
      label: "Perse",
      value: String(stats.lost),
      icon: XCircle,
      iconColor: "text-red-600 bg-red-100",
    },
    {
      label: "Win Rate",
      value: `${stats.winRate}%`,
      icon: stats.winRate >= 50 ? TrendingUp : Percent,
      iconColor:
        stats.winRate >= 50
          ? "text-emerald-600 bg-emerald-100"
          : stats.winRate >= 25
          ? "text-amber-600 bg-amber-100"
          : "text-red-600 bg-red-100",
      highlight: true,
    },
    {
      label: "Valore Vinto",
      value: formatEUR(stats.totalWonValue),
      icon: Euro,
      iconColor: "text-violet-600 bg-violet-100",
    },
    {
      label: "Valore Medio",
      value: formatEUR(stats.avgWonValue),
      icon: Euro,
      iconColor: "text-indigo-600 bg-indigo-100",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.label}
            className={cn(
              "rounded-xl border bg-card p-4 space-y-2 transition-shadow hover:shadow-sm",
              card.highlight && "ring-1 ring-primary/20"
            )}
          >
            <div className="flex items-center gap-2">
              <div className={cn("rounded-lg p-1.5", card.iconColor)}>
                <Icon className="h-3.5 w-3.5" />
              </div>
              <span className="text-[11px] text-muted-foreground font-medium leading-tight">
                {card.label}
              </span>
            </div>
            <p className="text-xl font-bold tabular-nums tracking-tight">
              {card.value}
            </p>
          </div>
        );
      })}
    </div>
  );
}
