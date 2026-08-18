"use client";

import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";

interface ProfileCompletenessBarProps {
  score: number;
  showLabel?: boolean;
  className?: string;
}

export function ProfileCompletenessBar({
  score,
  showLabel = true,
  className,
}: ProfileCompletenessBarProps) {
  const color =
    score >= 80
      ? "text-emerald-600"
      : score >= 50
        ? "text-amber-600"
        : "text-red-600";

  return (
    <div className={cn("space-y-1", className)}>
      {showLabel && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Completezza profilo</span>
          <span className={cn("font-semibold tabular-nums", color)}>
            {Math.round(score)}%
          </span>
        </div>
      )}
      <Progress value={score} className="h-2" />
    </div>
  );
}
