"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Award, Target, TrendingUp, Clock, BarChart2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SuccessMetric {
  label: string;
  value: number;
  total?: number;
  icon?: string;
  color?: string;
}

interface SuccessMetricsProps {
  metrics: SuccessMetric[];
  title?: string;
}

const iconMap = {
  award: Award,
  target: Target,
  trending: TrendingUp,
  clock: Clock,
};

export function SuccessMetrics({
  metrics,
  title = "Metriche Successo",
}: SuccessMetricsProps) {
  if (!metrics || metrics.length === 0) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-base text-gray-500 flex items-center gap-2">
            <BarChart2 className="h-5 w-5" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            Nessun dato disponibile
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b bg-gradient-to-r from-purple-50/50 to-pink-50/50">
        <CardTitle className="text-base flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-purple-100">
            <BarChart2 className="h-4 w-4 text-purple-600" />
          </div>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="grid grid-cols-2 gap-3">
          {metrics.map((metric, i) => {
            const iconKey = metric.icon as keyof typeof iconMap;
            const Icon = iconKey && iconMap[iconKey] ? iconMap[iconKey] : Target;
            const percentage =
              metric.total && metric.total > 0
                ? (metric.value / metric.total) * 100
                : null;

            return (
              <TooltipProvider key={i}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className={cn(
                        "p-4 rounded-xl border transition-all duration-200 cursor-default",
                        "hover:shadow-md hover:scale-[1.02]",
                        "animate-in fade-in slide-in-from-bottom-2"
                      )}
                      style={{
                        animationDelay: `${i * 100}ms`,
                        animationFillMode: "both",
                        backgroundColor: `${metric.color || "#3b82f6"}08`,
                        borderColor: `${metric.color || "#3b82f6"}20`,
                      }}
                    >
                      <div className="flex items-center gap-2 mb-3">
                        <div
                          className="p-1.5 rounded-lg"
                          style={{ backgroundColor: `${metric.color || "#3b82f6"}15` }}
                        >
                          <Icon
                            className="h-4 w-4"
                            style={{ color: metric.color || "#3b82f6" }}
                          />
                        </div>
                        <span className="text-xs text-gray-600 font-medium truncate">
                          {metric.label}
                        </span>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span
                          className="text-2xl font-bold"
                          style={{ color: metric.color || "#3b82f6" }}
                        >
                          {metric.value}
                        </span>
                        {metric.total !== undefined && (
                          <span className="text-sm text-gray-400">/ {metric.total}</span>
                        )}
                      </div>
                      {percentage !== null && (
                        <div className="mt-3 space-y-1">
                          <Progress
                            value={Math.min(percentage, 100)}
                            className="h-1.5"
                            style={{
                              // @ts-expect-error CSS variable
                              "--progress-color": metric.color || "#3b82f6",
                            }}
                          />
                          <div className="flex justify-end">
                            <Badge
                              variant="outline"
                              className="text-[10px] py-0 px-1.5"
                              style={{
                                color: metric.color || "#3b82f6",
                                borderColor: `${metric.color || "#3b82f6"}30`,
                              }}
                            >
                              {percentage.toFixed(1)}%
                            </Badge>
                          </div>
                        </div>
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="font-medium">{metric.label}</p>
                    {percentage !== null && (
                      <p className="text-xs text-gray-500">
                        {metric.value} su {metric.total} ({percentage.toFixed(1)}%)
                      </p>
                    )}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

interface DonutChartProps {
  value: number;
  total: number;
  label: string;
  color?: string;
  size?: number;
}

export function DonutChart({
  value,
  total,
  label,
  color = "#3b82f6",
  size = 80,
}: DonutChartProps) {
  const percentage = total > 0 ? (value / total) * 100 : 0;
  const radius = (size - 16) / 2; // Account for stroke width
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex flex-col items-center group cursor-default">
            <div
              className="relative transition-transform duration-200 group-hover:scale-105"
              style={{ width: size, height: size }}
            >
              <svg width={size} height={size} className="-rotate-90">
                {/* Background circle */}
                <circle
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke="#e5e7eb"
                  strokeWidth="8"
                  className="transition-opacity group-hover:opacity-60"
                />
                {/* Progress circle */}
                <circle
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={color}
                  strokeWidth="8"
                  strokeLinecap="round"
                  className="drop-shadow-sm"
                  style={{
                    strokeDasharray: circumference,
                    strokeDashoffset,
                    transition: "stroke-dashoffset 0.8s ease-out",
                  }}
                />
              </svg>
              {/* Center text */}
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span
                  className="text-lg font-bold transition-transform group-hover:scale-110"
                  style={{ color }}
                >
                  {Math.round(percentage)}%
                </span>
              </div>
            </div>
            <span className="text-xs font-medium text-gray-600 mt-2 text-center">
              {label}
            </span>
            <span className="text-[10px] text-gray-400">
              {value} / {total}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-center">
            <p className="font-medium">{label}</p>
            <p className="text-xs text-gray-500">
              {value} su {total} ({percentage.toFixed(1)}%)
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
