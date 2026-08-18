"use client";

import {
  Euro,
  Clock,
  MapPin,
  Calendar,
  ExternalLink,
  FileText,
  Loader2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { RecommendationBadge } from "@/components/tender/RecommendationBadge";
import { formatEUR, formatDate } from "@/lib/utils/formatters";

/** Strip array brackets and quotes from city values like '["Roma"]' */
function cleanCity(city: string): string {
  return city.replace(/[\[\]"]/g, "").trim();
}
import { cn } from "@/lib/utils";
import type { TenderDetail, TenderAnalysis } from "@/lib/hooks/useTenderDetail";

interface TenderSidebarProps {
  tender: TenderDetail;
  analysis: TenderAnalysis | undefined;
  analysisLoading: boolean;
}

function ScoreRing({
  score,
  size = 120,
}: {
  score: number;
  size?: number;
}) {
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  // Bands match the engine's BID / REVIEW / SKIP thresholds. A weak fit is
  // graphite, not red — red belongs to deadlines.
  const color =
    score >= 70 ? "text-bid" : score >= 40 ? "text-review" : "text-skip";

  const bgColor =
    score >= 70
      ? "stroke-bid-soft"
      : score >= 40
        ? "stroke-review-soft"
        : "stroke-skip-soft";

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={10}
          className={bgColor}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={cn("transition-all duration-700 ease-out", color)}
          style={{ stroke: "currentColor" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn("text-2xl font-bold tabular-nums", color)}>
          {Math.round(score)}%
        </span>
        <span className="text-[11px] text-muted-foreground">compatibilità</span>
      </div>
    </div>
  );
}

export function TenderSidebar({
  tender,
  analysis,
  analysisLoading,
}: TenderSidebarProps) {
  const hasScore = analysis?.overallScore != null;
  const hasValue = tender.value != null && tender.value > 0;

  return (
    <div className="space-y-4">
      {/* Score + Recommendation Card */}
      <Card>
        <CardContent className="pt-6 flex flex-col items-center gap-4">
          {analysisLoading ? (
            <div className="flex flex-col items-center gap-2 py-4">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Calcolo score...</span>
            </div>
          ) : hasScore ? (
            <>
              <ScoreRing score={analysis!.overallScore} />
              {analysis!.recommendation && (
                <RecommendationBadge recommendation={analysis!.recommendation} />
              )}
            </>
          ) : (
            <div className="py-4 text-center">
              <p className="text-sm text-muted-foreground">
                Score non disponibile
              </p>
            </div>
          )}

          <Separator />

          {/* Key metrics */}
          <div className="w-full space-y-3">
            {hasValue && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <Euro className="h-3.5 w-3.5" />
                  Valore
                </span>
                <span className="text-sm font-semibold">
                  {formatEUR(tender.value)}
                </span>
              </div>
            )}

            {tender.deadline && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  Scadenza
                </span>
                <span className="text-sm font-medium">
                  {formatDate(tender.deadline)}
                </span>
              </div>
            )}

            {tender.country && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" />
                  Luogo
                </span>
                <span className="text-sm font-medium">
                  {tender.country}
                  {tender.city ? `, ${cleanCity(tender.city)}` : ""}
                </span>
              </div>
            )}

            {tender.publishedDate && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  Pubblicato
                </span>
                <span className="text-sm font-medium">
                  {formatDate(tender.publishedDate)}
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* External links */}
      {(tender.tedUrl || tender.pdfUrl) && (
        <Card>
          <CardContent className="pt-6 space-y-2">
            {tender.tedUrl && (
              <Button variant="outline" size="sm" className="w-full justify-start" asChild>
                <a href={tender.tedUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3.5 w-3.5 mr-2" />
                  Vedi su TED
                </a>
              </Button>
            )}
            {tender.pdfUrl && (
              <Button variant="outline" size="sm" className="w-full justify-start" asChild>
                <a href={tender.pdfUrl} target="_blank" rel="noopener noreferrer">
                  <FileText className="h-3.5 w-3.5 mr-2" />
                  Scarica PDF
                </a>
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
