"use client";

import Link from "next/link";
import { Building2, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { FitScoreBadge } from "./FitScoreBadge";
import { DeadlineCountdown } from "./DeadlineCountdown";
import { RecommendationBadge } from "./RecommendationBadge";
import { formatEUR } from "@/lib/utils/formatters";

export interface TenderCardData {
  id: string;
  title: string;
  buyer?: string;
  value?: number;
  currency?: string;
  deadline?: string;
  country?: string;
  cpv?: string;
  fitScore?: number;
  recommendation?: "BID" | "REVIEW" | "SKIP";
}

interface TenderCardProps {
  tender: TenderCardData;
  compact?: boolean;
}

export function TenderCard({ tender, compact = false }: TenderCardProps) {
  const recommendation =
    tender.recommendation ??
    (tender.fitScore != null
      ? tender.fitScore >= 75
        ? "BID"
        : tender.fitScore >= 50
          ? "REVIEW"
          : "SKIP"
      : undefined);

  return (
    <Card className="hover:border-primary/30 transition-colors">
      <CardContent className={compact ? "p-3" : "p-4"}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <Link
              href={`/tenders/${tender.id}`}
              className="font-medium text-sm hover:underline line-clamp-2"
            >
              {tender.title || "Senza titolo"}
            </Link>

            {tender.buyer && (
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                <Building2 className="h-3 w-3 shrink-0" />
                <span className="truncate">{tender.buyer}</span>
              </p>
            )}

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
              {tender.fitScore != null && (
                <FitScoreBadge score={tender.fitScore} size="sm" />
              )}
              {tender.value != null && tender.value > 0 && (
                <span className="text-xs text-muted-foreground">
                  {formatEUR(tender.value)}
                </span>
              )}
              <DeadlineCountdown deadline={tender.deadline} />
              {tender.country && (
                <span className="text-xs text-muted-foreground">
                  {tender.country}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col items-end gap-2 shrink-0">
            {recommendation && (
              <RecommendationBadge recommendation={recommendation} size="sm" />
            )}
            <Link
              href={`/tenders/${tender.id}`}
              className="text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
