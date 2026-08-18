"use client";

import { cn } from "@/lib/utils";
import { ThumbsUp, Eye, SkipForward } from "lucide-react";

type Recommendation = "BID" | "REVIEW" | "SKIP";

interface RecommendationBadgeProps {
  recommendation: Recommendation;
  size?: "sm" | "md";
}

const config: Record<
  Recommendation,
  { label: string; color: string; Icon: React.ElementType }
> = {
  BID: {
    label: "Candidati",
    color: "border-bid/25 bg-bid-soft text-bid",
    Icon: ThumbsUp,
  },
  REVIEW: {
    label: "Da valutare",
    color: "border-review/25 bg-review-soft text-review",
    Icon: Eye,
  },
  SKIP: {
    label: "Salta",
    color: "border-skip/25 bg-skip-soft text-skip",
    Icon: SkipForward,
  },
};

export function RecommendationBadge({
  recommendation,
  size = "md",
}: RecommendationBadgeProps) {
  const { label, color, Icon } = config[recommendation];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border font-medium",
        color,
        size === "sm" ? "text-xs px-1.5 py-0.5" : "text-sm px-2 py-1"
      )}
    >
      <Icon className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} />
      {label}
    </span>
  );
}
