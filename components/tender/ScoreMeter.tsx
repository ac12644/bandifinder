"use client";

import { cn } from "@/lib/utils";
import type { ScoreComponent } from "@/lib/hooks/useTenderDetail";

/**
 * The weighted score meter.
 *
 * Six components decide a tender's fit, and they do not count equally: CPV
 * match is worth 25 points, certifications and economic fit 20 each,
 * geography 15, experience and deadline 10 each.
 *
 * Drawing them as six equal bars — as this previously did — hides that. A
 * full 10/10 on deadline looked identical to a full 25/25 on CPV, when one
 * carries two and a half times the weight.
 *
 * So each segment's WIDTH is its share of the 100 available points, and its
 * FILL is how much of that share was earned. Every fill is the same ink, which
 * makes the reading literal: the total ink in the bar IS the score out of 100,
 * and the gaps are exactly the points you are missing — sized by how much
 * those points were worth.
 *
 * Colouring each fill by its own band was tried and removed. It made a
 * half-empty ten-point segment the loudest thing in the bar, inverting the
 * emphasis the widths exist to establish. The per-component verdict lives in
 * the legend markers instead, where it does not compete.
 */

interface ScoreMeterProps {
  components: ScoreComponent[];
  /** Show the per-segment legend beneath the bar. */
  showLegend?: boolean;
  className?: string;
}

/** Which verdict band a fill ratio falls into. */
function bandFor(ratio: number): "bid" | "review" | "skip" {
  if (ratio >= 0.7) return "bid";
  if (ratio >= 0.4) return "review";
  return "skip";
}

const FILL: Record<"bid" | "review" | "skip", string> = {
  bid: "bg-bid",
  review: "bg-review",
  skip: "bg-skip",
};

export function ScoreMeter({
  components,
  showLegend = true,
  className,
}: ScoreMeterProps) {
  const totalMax = components.reduce((sum, c) => sum + c.maxScore, 0);
  if (totalMax <= 0) return null;

  const earned = components.reduce((sum, c) => sum + c.score, 0);

  return (
    <div className={cn("space-y-3", className)}>
      {/* The bar. One track, segmented by weight. */}
      <div
        className="flex h-9 w-full overflow-hidden rounded-md border border-border bg-secondary"
        role="img"
        aria-label={`Punteggio ${Math.round(
          (earned / totalMax) * 100
        )} su 100. ${components
          .map((c) => `${c.name}: ${c.score} su ${c.maxScore}`)
          .join(". ")}`}
      >
        {components.map((comp, i) => {
          const weight = (comp.maxScore / totalMax) * 100;
          const ratio = comp.maxScore > 0 ? comp.score / comp.maxScore : 0;

          return (
            <div
              key={comp.name}
              className={cn(
                "relative h-full",
                i > 0 && "border-l border-border"
              )}
              style={{ width: `${weight}%` }}
              title={`${comp.name}: ${comp.score}/${comp.maxScore}`}
            >
              <div
                className="h-full bg-primary transition-[width] duration-500 ease-out"
                style={{ width: `${Math.max(ratio * 100, 0)}%` }}
              />
            </div>
          );
        })}
      </div>

      {showLegend && (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
          {components.map((comp) => {
            const ratio = comp.maxScore > 0 ? comp.score / comp.maxScore : 0;

            return (
              <li key={comp.name} className="flex items-baseline gap-2">
                <span
                  className={cn(
                    "mt-[0.3rem] h-2 w-2 shrink-0 rounded-[2px]",
                    FILL[bandFor(ratio)]
                  )}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                  {comp.name}
                </span>
                <span className="font-mono text-xs tabular-nums text-foreground">
                  {comp.score}
                  <span className="text-muted-foreground">/{comp.maxScore}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
