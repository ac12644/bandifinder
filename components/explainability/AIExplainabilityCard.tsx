"use client";

import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Bot,
  Brain,
  Search,
  FileText,
  BarChart3,
  User,
  FileSearch,
  Clock,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle,
  ExternalLink,
} from "lucide-react";
import { QualityScoreBadge } from "./QualityScoreBadge";
import { ReflectionFeedback } from "./ReflectionFeedback";
import { useState } from "react";

// Agent metadata for display
const AGENT_INFO: Record<
  string,
  {
    icon: React.ElementType;
    name: string;
    description: string;
    color: string;
  }
> = {
  search: {
    icon: Search,
    name: "Agente Ricerca",
    description: "Ricerca bandi tramite TED API",
    color: "text-green-600 bg-green-100",
  },
  analyze: {
    icon: FileText,
    name: "Agente Analisi",
    description: "Valuta eligibilità e compatibilità",
    color: "text-purple-600 bg-purple-100",
  },
  rank: {
    icon: BarChart3,
    name: "Agente Ranking",
    description: "Classifica opportunità per priorità",
    color: "text-blue-600 bg-blue-100",
  },
  personalize: {
    icon: User,
    name: "Agente Personalizzazione",
    description: "Raccomandazioni personalizzate",
    color: "text-orange-600 bg-orange-100",
  },
  review_contract: {
    icon: FileSearch,
    name: "Agente Contratti",
    description: "Revisione clausole e rischi",
    color: "text-red-600 bg-red-100",
  },
  general: {
    icon: Brain,
    name: "Assistente Generale",
    description: "Risponde a domande generali",
    color: "text-gray-600 bg-gray-100",
  },
};

export interface AIMetadata {
  agentUsed: string;
  qualityScore: number;
  reflectionCount: number;
  qualityIssues?: string[];
  reflectionFeedback?: string;
  executionTimeMs?: number;
  humanReviewRequired?: boolean;
  humanReviewReason?: string;
}

interface AIExplainabilityCardProps {
  metadata: AIMetadata;
  className?: string;
  compact?: boolean;
}

export function AIExplainabilityCard({
  metadata,
  className,
  compact = false,
}: AIExplainabilityCardProps) {
  const [isExpanded, setIsExpanded] = useState(!compact);
  const agentInfo = AGENT_INFO[metadata.agentUsed] || AGENT_INFO.general;
  const AgentIcon = agentInfo.icon;

  if (compact && !isExpanded) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg border bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors",
          className
        )}
        onClick={() => setIsExpanded(true)}
      >
        <Bot className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">
          {agentInfo.name}
        </span>
        <QualityScoreBadge score={metadata.qualityScore} size="sm" />
        {metadata.reflectionCount > 0 && (
          <Badge variant="secondary" className="text-xs">
            {metadata.reflectionCount}x riflessione
          </Badge>
        )}
        <ChevronDown className="h-3 w-3 text-muted-foreground ml-auto" />
      </div>
    );
  }

  return (
    <Card className={cn("border-dashed", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className={cn("p-2 rounded-lg", agentInfo.color.split(" ")[1])}>
              <AgentIcon className={cn("h-4 w-4", agentInfo.color.split(" ")[0])} />
            </div>
            <div>
              <CardTitle className="text-sm">{agentInfo.name}</CardTitle>
              <CardDescription className="text-xs">
                {agentInfo.description}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <QualityScoreBadge score={metadata.qualityScore} />
            {compact && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => setIsExpanded(false)}
              >
                <ChevronUp className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Human Review Warning */}
        {metadata.humanReviewRequired && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-amber-800">
                Verifica Umana Richiesta
              </p>
              <p className="text-amber-700 text-xs mt-1">
                {metadata.humanReviewReason ||
                  "Questa risposta richiede revisione da parte di un esperto prima di procedere."}
              </p>
            </div>
          </div>
        )}

        {/* Execution Stats */}
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {metadata.executionTimeMs && (
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              <span>{(metadata.executionTimeMs / 1000).toFixed(1)}s</span>
            </div>
          )}

          {metadata.qualityScore >= 0.7 && (
            <div className="flex items-center gap-1 text-emerald-600">
              <CheckCircle className="h-3 w-3" />
              <span>Verificato</span>
            </div>
          )}

          {metadata.reflectionCount > 0 && (
            <Badge variant="outline" className="text-xs">
              {metadata.reflectionCount} cicl{metadata.reflectionCount === 1 ? "o" : "i"} di riflessione
            </Badge>
          )}
        </div>

        {/* Reflection Details */}
        {metadata.reflectionCount > 0 && (
          <ReflectionFeedback
            reflectionCount={metadata.reflectionCount}
            qualityIssues={metadata.qualityIssues}
            improvements={metadata.reflectionFeedback}
          />
        )}

        {/* Quality Breakdown */}
        <div className="pt-2 border-t">
          <p className="text-xs font-medium text-muted-foreground mb-2">
            Come interpreto il punteggio?
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <QualityItem
              score={metadata.qualityScore}
              threshold={0.9}
              label="Eccellente"
              description="Risposta completa e verificata"
            />
            <QualityItem
              score={metadata.qualityScore}
              threshold={0.7}
              label="Buono"
              description="Affidabile con margini di miglioramento"
            />
            <QualityItem
              score={metadata.qualityScore}
              threshold={0.5}
              label="Moderato"
              description="Consigliata verifica"
            />
            <QualityItem
              score={metadata.qualityScore}
              threshold={0}
              label="Da verificare"
              description="Richiede revisione esperta"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function QualityItem({
  score,
  threshold,
  label,
  description,
}: {
  score: number;
  threshold: number;
  label: string;
  description: string;
}) {
  const isActive = threshold === 0
    ? score < 0.5
    : threshold === 0.5
    ? score >= 0.5 && score < 0.7
    : threshold === 0.7
    ? score >= 0.7 && score < 0.9
    : score >= 0.9;

  return (
    <div
      className={cn(
        "p-2 rounded border",
        isActive
          ? "bg-primary/10 border-primary text-primary"
          : "bg-muted/30 border-muted text-muted-foreground"
      )}
    >
      <p className="font-medium">{label}</p>
      <p className="text-[10px] opacity-80">{description}</p>
    </div>
  );
}
