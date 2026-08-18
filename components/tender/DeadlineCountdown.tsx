"use client";

import { Clock, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatDeadline,
  getUrgencyLevel,
  type UrgencyLevel,
} from "@/lib/utils/formatters";

interface DeadlineCountdownProps {
  deadline: string | null | undefined;
  showIcon?: boolean;
  className?: string;
}

/**
 * Vermilion is spent here and nowhere else in the product.
 *
 * A poor fit is graphite, not red — being wrong for a contract is
 * information, not an emergency. Keeping the loud colour exclusive to time
 * running out is what makes an imminent deadline actually register.
 */
const urgencyStyles: Record<UrgencyLevel, string> = {
  critical: "text-urgent font-semibold",
  warning: "text-review font-medium",
  normal: "text-muted-foreground",
  expired: "text-muted-foreground line-through decoration-1",
};

export function DeadlineCountdown({
  deadline,
  showIcon = true,
  className,
}: DeadlineCountdownProps) {
  const urgency = getUrgencyLevel(deadline);
  const label = formatDeadline(deadline);

  if (!deadline) {
    return <span className="text-muted-foreground text-sm">-</span>;
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-sm",
        urgencyStyles[urgency],
        className
      )}
    >
      {showIcon &&
        (urgency === "critical" ? (
          <AlertTriangle className="h-3.5 w-3.5" />
        ) : (
          <Clock className="h-3.5 w-3.5" />
        ))}
      {label}
    </span>
  );
}
