"use client";

import { CheckCircle2, XCircle, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface EligibilityItem {
  requirement: string;
  met: boolean;
  detail?: string;
}

interface EligibilitySectionProps {
  items: EligibilityItem[];
}

export function EligibilitySection({ items }: EligibilitySectionProps) {
  const metCount = items.filter((i) => i.met).length;

  return (
    <div className="rounded-lg border bg-card p-5 space-y-4">
      {/* Summary header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Checklist requisiti</h3>
        <span className="text-sm text-muted-foreground tabular-nums">
          {metCount}/{items.length} soddisfatti
        </span>
      </div>

      {/* Items list */}
      <ul className="space-y-2.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2.5">
            {item.met ? (
              <CheckCircle2 className="h-4 w-4 text-bid mt-0.5 shrink-0" />
            ) : (
              <XCircle className="h-4 w-4 text-skip mt-0.5 shrink-0" />
            )}
            <div>
              <p
                className={cn(
                  "text-sm leading-snug",
                  item.met ? "text-foreground" : "text-red-700 font-medium"
                )}
              >
                {item.requirement}
              </p>
              {item.detail && (
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  {item.detail}
                </p>
              )}
            </div>
          </li>
        ))}
        {items.length === 0 && (
          <li className="flex items-center gap-2 text-sm text-muted-foreground">
            <Minus className="h-4 w-4" />
            Nessun requisito specifico disponibile
          </li>
        )}
      </ul>
    </div>
  );
}
