"use client";

import { cn } from "@/lib/utils";
import { Shield, ShieldCheck, ShieldAlert, ShieldQuestion } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface QualityScoreBadgeProps {
  score: number; // 0-1
  showLabel?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

function getScoreConfig(score: number) {
  if (score >= 0.9) {
    return {
      icon: ShieldCheck,
      label: "Eccellente",
      description: "Risposta verificata con alta affidabilità",
      bgColor: "bg-emerald-100",
      textColor: "text-emerald-700",
      borderColor: "border-emerald-300",
      iconColor: "text-emerald-600",
    };
  }
  if (score >= 0.7) {
    return {
      icon: Shield,
      label: "Buono",
      description: "Risposta affidabile con possibili margini di miglioramento",
      bgColor: "bg-blue-100",
      textColor: "text-blue-700",
      borderColor: "border-blue-300",
      iconColor: "text-blue-600",
    };
  }
  if (score >= 0.5) {
    return {
      icon: ShieldQuestion,
      label: "Moderato",
      description: "Si consiglia di verificare alcune informazioni",
      bgColor: "bg-amber-100",
      textColor: "text-amber-700",
      borderColor: "border-amber-300",
      iconColor: "text-amber-600",
    };
  }
  return {
    icon: ShieldAlert,
    label: "Richiede verifica",
    description: "Verifica raccomandata prima di procedere",
    bgColor: "bg-red-100",
    textColor: "text-red-700",
    borderColor: "border-red-300",
    iconColor: "text-red-600",
  };
}

const sizeConfig = {
  sm: {
    container: "px-2 py-0.5 text-xs gap-1",
    icon: "h-3 w-3",
    score: "text-xs",
  },
  md: {
    container: "px-2.5 py-1 text-sm gap-1.5",
    icon: "h-4 w-4",
    score: "text-sm",
  },
  lg: {
    container: "px-3 py-1.5 text-base gap-2",
    icon: "h-5 w-5",
    score: "text-base",
  },
};

export function QualityScoreBadge({
  score,
  showLabel = false,
  size = "md",
  className,
}: QualityScoreBadgeProps) {
  const config = getScoreConfig(score);
  const sizes = sizeConfig[size];
  const Icon = config.icon;
  const percentage = Math.round(score * 100);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "inline-flex items-center rounded-full border font-medium cursor-help",
              config.bgColor,
              config.textColor,
              config.borderColor,
              sizes.container,
              className
            )}
          >
            <Icon className={cn(sizes.icon, config.iconColor)} />
            {showLabel ? (
              <span>{config.label}</span>
            ) : (
              <span className={sizes.score}>{percentage}%</span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <div className="space-y-1">
            <p className="font-semibold">
              Punteggio Qualità: {percentage}%
            </p>
            <p className="text-muted-foreground text-sm">
              {config.description}
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
