"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar, Euro, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate, daysUntilDeadline } from "@/lib/utils/formatters";
import type { Bid } from "@/lib/hooks/useBids";

const PRIORITY_BORDER: Record<string, string> = {
  high: "border-l-urgent",
  medium: "border-l-review",
  low: "border-l-slate-300",
};

const PRIORITY_DOT: Record<string, string> = {
  high: "bg-urgent",
  medium: "bg-review",
  low: "bg-slate-300",
};

const PRIORITY_LABELS: Record<string, string> = {
  high: "Alta",
  medium: "Media",
  low: "Bassa",
};

function formatValue(value: number | null): string | null {
  if (!value) return null;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M €`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K €`;
  return `${value.toLocaleString("it-IT")} €`;
}

export function BidCard({ bid }: { bid: Bid }) {
  const value = formatValue(bid.tender_value);
  const days = daysUntilDeadline(bid.tender_deadline);
  const isExpired = days !== null && days < 0;
  const isUrgent = days !== null && days >= 0 && days <= 7;

  return (
    <Link href={`/bids/${bid.id}`}>
      <Card
        className={cn(
          "hover:shadow-md transition-shadow cursor-pointer border-l-[3px]",
          PRIORITY_BORDER[bid.priority]
        )}
      >
        <CardContent className="p-3 space-y-2">
          {/* Title */}
          <p className="text-sm font-medium line-clamp-2 leading-snug">
            {bid.tender_title}
          </p>

          {/* Buyer */}
          {bid.tender_buyer && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Building2 className="h-3 w-3 shrink-0" />
              <span className="truncate">{bid.tender_buyer}</span>
            </div>
          )}

          {/* Bottom metadata row */}
          <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
            <div className="flex items-center gap-3">
              {value && (
                <span className="flex items-center gap-1 font-medium tabular-nums">
                  <Euro className="h-3 w-3" />
                  {value}
                </span>
              )}
              {bid.tender_deadline && (
                <span
                  className={cn(
                    "flex items-center gap-1",
                    isExpired && "text-muted-foreground line-through",
                    isUrgent && !isExpired && "text-urgent font-medium"
                  )}
                >
                  <Calendar className="h-3 w-3" />
                  {formatDate(bid.tender_deadline)}
                </span>
              )}
            </div>

            {/* Priority dot */}
            <div
              className="flex items-center gap-1"
              title={`Priorità: ${PRIORITY_LABELS[bid.priority]}`}
            >
              <div className={cn("w-1.5 h-1.5 rounded-full", PRIORITY_DOT[bid.priority])} />
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
