"use client";

import { cn } from "@/lib/utils";

interface FitScoreBadgeProps {
  score: number;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}

export function FitScoreBadge({
  score,
  size = "md",
  showLabel = true,
}: FitScoreBadgeProps) {
  // Thresholds match the engine's BID / REVIEW / SKIP bands so the badge and
  // the recommendation can never disagree.
  const level = score >= 70 ? "high" : score >= 40 ? "medium" : "low";

  const colors = {
    high: "border-bid/25 bg-bid-soft text-bid",
    medium: "border-review/25 bg-review-soft text-review",
    low: "border-skip/25 bg-skip-soft text-skip",
  };

  const sizes = {
    sm: "text-[0.6875rem] px-1.5 py-0.5",
    md: "text-xs px-2 py-0.5",
    lg: "text-sm px-2.5 py-1",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm border font-mono font-medium tabular-nums",
        colors[level],
        sizes[size]
      )}
    >
      {Math.round(score)}%
      {showLabel && (
        <span className="font-normal">
          {level === "high" ? "Alta" : level === "medium" ? "Media" : "Bassa"}
        </span>
      )}
    </span>
  );
}
