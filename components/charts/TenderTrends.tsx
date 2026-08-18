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
import { TrendingUp, TrendingDown, Minus, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

interface TrendData {
  label: string;
  value: number;
  previousValue?: number;
}

interface TenderTrendsProps {
  data: TrendData[];
  title?: string;
  showChange?: boolean;
}

export function TenderTrends({
  data,
  title = "Tendenze Bandi",
  showChange = true,
}: TenderTrendsProps) {
  if (!data || data.length === 0) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-gray-500">
            <BarChart3 className="h-5 w-5" />
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

  const maxValue = Math.max(...data.map((d) => d.value));
  const totalValue = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b bg-gradient-to-r from-blue-50/50 to-indigo-50/50">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <div className="p-1.5 rounded-lg bg-blue-100">
              <TrendingUp className="h-4 w-4 text-blue-600" />
            </div>
            {title}
          </CardTitle>
          <Badge variant="secondary" className="text-xs">
            Totale: {totalValue}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="space-y-4">
          {data.map((item, i) => {
            const percentage = maxValue > 0 ? (item.value / maxValue) * 100 : 0;
            const change =
              showChange && item.previousValue !== undefined && item.previousValue > 0
                ? ((item.value - item.previousValue) / item.previousValue) * 100
                : null;

            const isPositive = change !== null && change > 0;
            const isNegative = change !== null && change < 0;

            return (
              <div
                key={i}
                className="space-y-2 animate-in fade-in slide-in-from-left-2"
                style={{ animationDelay: `${i * 100}ms`, animationFillMode: "both" }}
              >
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-gray-700">{item.label}</span>
                  <div className="flex items-center gap-2">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          <span className="font-semibold text-gray-900">{item.value}</span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{((item.value / totalValue) * 100).toFixed(1)}% del totale</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    {change !== null && (
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-xs gap-0.5 py-0",
                          isPositive && "bg-green-50 text-green-700 border-green-200",
                          isNegative && "bg-red-50 text-red-700 border-red-200",
                          !isPositive && !isNegative && "bg-gray-50 text-gray-600"
                        )}
                      >
                        {isPositive && <TrendingUp className="h-3 w-3" />}
                        {isNegative && <TrendingDown className="h-3 w-3" />}
                        {!isPositive && !isNegative && <Minus className="h-3 w-3" />}
                        {Math.abs(change).toFixed(1)}%
                      </Badge>
                    )}
                  </div>
                </div>
                <Progress
                  value={percentage}
                  className={cn(
                    "h-2",
                    isPositive && "[&>div]:bg-gradient-to-r [&>div]:from-green-400 [&>div]:to-green-500",
                    isNegative && "[&>div]:bg-gradient-to-r [&>div]:from-red-400 [&>div]:to-red-500",
                    !isPositive && !isNegative && "[&>div]:bg-gradient-to-r [&>div]:from-blue-400 [&>div]:to-blue-500"
                  )}
                />
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

interface MiniBarChartProps {
  data: { value: number; label?: string }[];
  height?: number;
  color?: string;
}

export function MiniBarChart({
  data,
  height = 60,
  color = "#3b82f6",
}: MiniBarChartProps) {
  if (!data || data.length === 0) return null;

  const maxValue = Math.max(...data.map((d) => d.value));

  return (
    <TooltipProvider>
      <div className="flex items-end gap-1" style={{ height }}>
        {data.map((item, i) => {
          const barHeight = maxValue > 0 ? (item.value / maxValue) * 100 : 0;
          return (
            <Tooltip key={i}>
              <TooltipTrigger asChild>
                <div
                  className="flex-1 rounded-t transition-all duration-300 hover:opacity-80 hover:scale-105 cursor-pointer"
                  style={{
                    height: `${barHeight}%`,
                    backgroundColor: color,
                    minHeight: item.value > 0 ? "4px" : "0",
                  }}
                />
              </TooltipTrigger>
              <TooltipContent>
                <p className="font-medium">{item.label || `Bar ${i + 1}`}</p>
                <p className="text-xs text-gray-500">Valore: {item.value}</p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
