"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ChevronDown,
  Building2,
  Calendar,
  FileText,
  ExternalLink,
  Target,
  Award,
  Clock,
  AlertTriangle,
  Star,
  Euro,
  MapPin,
  Sparkles,
  TrendingUp,
  Bookmark,
  Share2,
} from "lucide-react";
import { AnalysisDialog } from "@/components/AnalysisDialog";
import { AddToCalendarButton } from "@/components/AddToCalendarButton";
import { cn } from "@/lib/utils";

export interface AnalysisResult {
  eligible: boolean;
  eligibilityScore: number;
  reasons: string[];
  riskFactors: string[];
  opportunities: string[];
  missingRequirements: string[];
  recommendation: "high" | "medium" | "low" | "skip";
}

interface Tender {
  publicationNumber: string;
  noticeId?: string;
  title: string;
  buyer: string;
  publicationDate?: string;
  deadline?: string;
  cpv?: string | string[];
  cpvCodes?: string[];
  value?: number | string;
  valueFormatted?: string;
  pdf?: string;
  description?: string;
  procedureType?: string;
  contractNature?: string;
  frameworkAgreement?: boolean;
  isFrameworkAgreement?: boolean;
  electronicAuction?: boolean;
  eligibilityScore?: number;
  recommendation?: "high" | "medium" | "low" | "skip";
  country?: string;
}

interface ProgressiveTenderCardProps {
  tender: Tender;
  onAnalyzeEligibility?: (
    tenderId: string,
    tenderData?: {
      title?: string;
      buyer?: string;
      cpv?: string | string[];
      deadline?: string;
      value?: number;
    }
  ) => Promise<AnalysisResult | null>;
  analyzingTender?: string | null;
}

export function ProgressiveTenderCard({
  tender,
  onAnalyzeEligibility,
}: ProgressiveTenderCardProps) {
  const [expanded, setExpanded] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  const formatValue = (value: number | string | undefined) => {
    if (!value) return null;
    if (typeof value === "number") {
      if (value >= 1000000) {
        return `€${(value / 1000000).toFixed(1)}M`;
      }
      if (value >= 1000) {
        return `€${(value / 1000).toFixed(0)}K`;
      }
      return new Intl.NumberFormat("it-IT", {
        style: "currency",
        currency: "EUR",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(value);
    }
    return value;
  };

  const formatFullValue = (value: number | string | undefined) => {
    if (!value) return null;
    if (typeof value === "number") {
      return new Intl.NumberFormat("it-IT", {
        style: "currency",
        currency: "EUR",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(value);
    }
    return value;
  };

  const formatDate = (date?: string) => {
    if (!date) return null;
    try {
      return new Date(date).toLocaleDateString("it-IT", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch {
      return date;
    }
  };

  const getDaysUntilDeadline = (deadline?: string) => {
    if (!deadline) return null;
    try {
      const deadlineDate = new Date(deadline);
      const today = new Date();
      const diffTime = deadlineDate.getTime() - today.getTime();
      return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    } catch {
      return null;
    }
  };

  const daysUntilDeadline = getDaysUntilDeadline(tender.deadline);
  const isUrgent = daysUntilDeadline !== null && daysUntilDeadline <= 7 && daysUntilDeadline > 0;
  const isExpired = daysUntilDeadline !== null && daysUntilDeadline <= 0;
  const formattedValue = formatValue(tender.value);
  const fullValue = formatFullValue(tender.value);
  const eligibilityPercent = tender.eligibilityScore !== undefined
    ? Math.round(tender.eligibilityScore * 100)
    : null;

  const getRecommendationConfig = (rec?: string) => {
    switch (rec) {
      case "high":
        return {
          label: "Ottima Corrispondenza",
          className: "bg-gradient-to-r from-emerald-500 to-green-500 text-white border-0 shadow-sm",
          icon: Sparkles,
          glow: "shadow-emerald-200"
        };
      case "medium":
        return {
          label: "Buona Corrispondenza",
          className: "bg-gradient-to-r from-blue-500 to-indigo-500 text-white border-0 shadow-sm",
          icon: TrendingUp,
          glow: "shadow-blue-200"
        };
      case "low":
        return {
          label: "Da Valutare",
          className: "bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0 shadow-sm",
          icon: AlertTriangle,
          glow: "shadow-amber-200"
        };
      default:
        return null;
    }
  };

  const recommendationConfig = getRecommendationConfig(tender.recommendation);
  const tenderId = tender.noticeId || tender.publicationNumber;

  // Get card border color based on recommendation
  const getCardStyle = () => {
    if (tender.recommendation === "high") {
      return "border-l-4 border-l-emerald-500 bg-gradient-to-r from-emerald-50/50 to-white";
    }
    if (tender.recommendation === "medium") {
      return "border-l-4 border-l-blue-500 bg-gradient-to-r from-blue-50/50 to-white";
    }
    if (tender.recommendation === "low") {
      return "border-l-4 border-l-amber-500 bg-gradient-to-r from-amber-50/50 to-white";
    }
    return "border-l-4 border-l-gray-200";
  };

  return (
    <Card className={cn(
      "group transition-all duration-300 overflow-hidden hover:shadow-xl",
      getCardStyle(),
      isExpired && "opacity-60 grayscale-[30%]"
    )}>
      {/* Main Content */}
      <div className="p-4 sm:p-5">
        {/* Top Row: Badges and Actions */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex flex-wrap gap-2">
            {/* Recommendation Badge */}
            {recommendationConfig && (
              <Badge className={cn("text-xs gap-1.5 font-medium", recommendationConfig.className, recommendationConfig.glow)}>
                <recommendationConfig.icon className="h-3 w-3" />
                {recommendationConfig.label}
              </Badge>
            )}

            {/* Urgent Badge */}
            {isUrgent && (
              <Badge className="bg-gradient-to-r from-red-500 to-rose-500 text-white border-0 text-xs gap-1 animate-pulse">
                <Clock className="h-3 w-3" />
                Scade tra {daysUntilDeadline}g
              </Badge>
            )}

            {isExpired && (
              <Badge variant="secondary" className="text-xs bg-gray-200 text-gray-600">
                Scaduto
              </Badge>
            )}
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-gray-400 hover:text-amber-500 hover:bg-amber-50"
                    onClick={() => setSaved(!saved)}
                  >
                    <Bookmark className={cn("h-4 w-4", saved && "fill-amber-500 text-amber-500")} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Salva nei preferiti</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-blue-500 hover:bg-blue-50">
                    <Share2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Condividi</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        {/* Title */}
        <h3 className="text-base sm:text-lg font-semibold text-gray-900 line-clamp-2 mb-3 leading-snug group-hover:text-blue-700 transition-colors">
          {tender.title}
        </h3>

        {/* Info Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {/* Buyer */}
          <div className="col-span-2 flex items-center gap-2 text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
            <Building2 className="h-4 w-4 text-gray-400 shrink-0" />
            <span className="truncate font-medium">{tender.buyer}</span>
          </div>

          {/* Value */}
          {formattedValue && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-2 text-sm bg-gradient-to-r from-emerald-50 to-green-50 text-emerald-700 rounded-lg px-3 py-2 font-bold">
                    <Euro className="h-4 w-4 shrink-0" />
                    <span>{formattedValue}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Valore: {fullValue}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {/* Deadline */}
          {tender.deadline && !isExpired && (
            <div className={cn(
              "flex items-center gap-2 text-sm rounded-lg px-3 py-2 font-medium",
              isUrgent
                ? "bg-gradient-to-r from-red-50 to-rose-50 text-red-700"
                : "bg-gradient-to-r from-amber-50 to-orange-50 text-amber-700"
            )}>
              <Calendar className="h-4 w-4 shrink-0" />
              <span>{formatDate(tender.deadline)}</span>
            </div>
          )}
        </div>

        {/* CPV and Country Tags */}
        <div className="flex flex-wrap gap-2 mb-4">
          {tender.cpv && (
            <Badge variant="outline" className="text-xs bg-indigo-50 text-indigo-700 border-indigo-200 font-mono">
              CPV {Array.isArray(tender.cpv) ? tender.cpv[0] : tender.cpv}
            </Badge>
          )}
          {tender.country && (
            <Badge variant="outline" className="text-xs bg-sky-50 text-sky-700 border-sky-200 gap-1">
              <MapPin className="h-3 w-3" />
              {tender.country}
            </Badge>
          )}
          {(tender.frameworkAgreement || tender.isFrameworkAgreement) && (
            <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200 gap-1">
              <Award className="h-3 w-3" />
              Accordo Quadro
            </Badge>
          )}
        </div>

        {/* Eligibility Score Bar */}
        {eligibilityPercent !== null && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-gray-600 flex items-center gap-1">
                <Target className="h-3 w-3" />
                Punteggio Eligibilità
              </span>
              <span className={cn(
                "text-sm font-bold",
                eligibilityPercent >= 70 ? "text-emerald-600" :
                eligibilityPercent >= 40 ? "text-amber-600" : "text-red-600"
              )}>
                {eligibilityPercent}%
              </span>
            </div>
            <Progress
              value={eligibilityPercent}
              className={cn(
                "h-2 rounded-full",
                eligibilityPercent >= 70
                  ? "[&>div]:bg-gradient-to-r [&>div]:from-emerald-500 [&>div]:to-green-400"
                  : eligibilityPercent >= 40
                  ? "[&>div]:bg-gradient-to-r [&>div]:from-amber-500 [&>div]:to-orange-400"
                  : "[&>div]:bg-gradient-to-r [&>div]:from-red-500 [&>div]:to-rose-400"
              )}
            />
          </div>
        )}

        {/* Quick Action Buttons */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="default"
            size="sm"
            asChild
            className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md hover:shadow-lg transition-all text-xs"
          >
            <a
              href={`https://ted.europa.eu/it/notice/-/detail/${encodeURIComponent(tenderId)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
              Vedi su TED
            </a>
          </Button>

          {tender.pdf &&
            tender.pdf !== "—" &&
            tender.pdf !== "null" &&
            typeof tender.pdf === "string" &&
            tender.pdf.startsWith("http") && (
              <Button variant="outline" size="sm" asChild className="text-xs border-gray-300 hover:bg-gray-50">
                <a href={tender.pdf} target="_blank" rel="noopener noreferrer">
                  <FileText className="h-3.5 w-3.5 mr-1.5" />
                  Documenti
                </a>
              </Button>
            )}

          {onAnalyzeEligibility && (
            <AnalysisDialog
              tenderId={tenderId}
              tenderTitle={tender.title}
              tenderData={{
                title: tender.title,
                buyer: tender.buyer,
                cpv: Array.isArray(tender.cpv) ? tender.cpv[0] : tender.cpv || undefined,
                deadline: tender.deadline || undefined,
                value: typeof tender.value === "number" ? tender.value : undefined,
              }}
              onAnalyze={onAnalyzeEligibility}
            >
              <Button variant="outline" size="sm" className="text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50">
                <Target className="h-3.5 w-3.5 mr-1.5" />
                Analizza
              </Button>
            </AnalysisDialog>
          )}
        </div>
      </div>

      {/* Expandable Details */}
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <CollapsibleContent>
          <CardContent className="pt-0 pb-4 px-4 sm:px-5 space-y-4 border-t border-gray-100 bg-gray-50/50">
            {/* Additional Details */}
            <div className="grid grid-cols-2 gap-4 text-sm pt-4">
              {tender.procedureType && (
                <div className="bg-white rounded-lg p-3 border border-gray-100">
                  <div className="text-xs text-gray-500 mb-1 font-medium uppercase tracking-wide">Tipo Procedura</div>
                  <div className="text-gray-900 font-medium">{tender.procedureType}</div>
                </div>
              )}
              {tender.contractNature && (
                <div className="bg-white rounded-lg p-3 border border-gray-100">
                  <div className="text-xs text-gray-500 mb-1 font-medium uppercase tracking-wide">Natura Contratto</div>
                  <div className="text-gray-900 font-medium">{tender.contractNature}</div>
                </div>
              )}
              {tender.publicationDate && (
                <div className="bg-white rounded-lg p-3 border border-gray-100">
                  <div className="text-xs text-gray-500 mb-1 font-medium uppercase tracking-wide">Data Pubblicazione</div>
                  <div className="text-gray-900 font-medium">{formatDate(tender.publicationDate)}</div>
                </div>
              )}
              {tender.noticeId && (
                <div className="bg-white rounded-lg p-3 border border-gray-100">
                  <div className="text-xs text-gray-500 mb-1 font-medium uppercase tracking-wide">ID Avviso</div>
                  <div className="font-mono text-xs text-gray-600">{tender.noticeId}</div>
                </div>
              )}
            </div>

            {/* Description */}
            {tender.description && (
              <div className="bg-white rounded-lg p-4 border border-gray-100">
                <div className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wide">Descrizione</div>
                <p className="text-sm text-gray-700 leading-relaxed">
                  {tender.description}
                </p>
              </div>
            )}

            {/* Calendar Action */}
            {tender.deadline && (
              <div className="flex justify-end pt-2">
                <AddToCalendarButton
                  tenderId={tenderId}
                  title={tender.title}
                  buyer={tender.buyer}
                  deadline={tender.deadline}
                  description={tender.description}
                  size="sm"
                  className="text-xs"
                />
              </div>
            )}
          </CardContent>
        </CollapsibleContent>

        {/* Expand Toggle */}
        <CollapsibleTrigger asChild>
          <button className="w-full py-2.5 px-4 flex items-center justify-center gap-2 text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-50 border-t border-gray-100 transition-colors">
            <ChevronDown className={cn(
              "h-4 w-4 transition-transform duration-200",
              expanded && "rotate-180"
            )} />
            {expanded ? "Mostra meno" : "Maggiori dettagli"}
          </button>
        </CollapsibleTrigger>
      </Collapsible>
    </Card>
  );
}
