"use client";

import { cn } from "@/lib/utils";
import { ScoreMeter } from "@/components/tender/ScoreMeter";
import type { ScoreComponent } from "@/lib/hooks/useTenderDetail";

interface ScoreBreakdownProps {
  components: ScoreComponent[];
  overallScore: number;
}

/**
 * The scoring readout.
 *
 * Ordered so the eye lands on the verdict, then the shape of it, then the
 * reasoning. The explanations sit under the meter rather than beside each bar
 * because they are sentences, and sentences want a column — reading six of
 * them in a narrow gutter next to a progress bar is what made this panel hard
 * to scan before.
 */
export function ScoreBreakdown({
  components,
  overallScore,
}: ScoreBreakdownProps) {
  const rounded = Math.round(overallScore);
  const band =
    rounded >= 70 ? "bid" : rounded >= 40 ? "review" : "skip";

  const bandText = {
    bid: "text-bid",
    review: "text-review",
    skip: "text-skip",
  }[band];

  // Worth surfacing: the heavy components you are losing most of. Sorted by
  // points forgone, not by percentage, so a weak 25-point component outranks
  // an empty 10-point one.
  const shortfalls = [...components]
    .map((c) => ({ ...c, lost: c.maxScore - c.score }))
    .filter((c) => c.lost > 0)
    .sort((a, b) => b.lost - a.lost)
    .slice(0, 2);

  return (
    <section className="rounded-lg border bg-card">
      <header className="flex items-end justify-between gap-4 border-b px-5 py-4">
        <div>
          <p className="eyebrow">Compatibilità</p>
          <h3 className="mt-1 text-sm font-medium text-muted-foreground">
            Punteggio complessivo
          </h3>
        </div>

        <p className="flex items-baseline gap-1">
          <span
            className={cn(
              "font-display text-4xl leading-none tabular-nums",
              bandText
            )}
          >
            {rounded}
          </span>
          <span className="font-mono text-sm text-muted-foreground">/100</span>
        </p>
      </header>

      <div className="space-y-5 px-5 py-5">
        <ScoreMeter components={components} />

        {shortfalls.length > 0 && (
          <p className="text-xs leading-relaxed text-muted-foreground">
            <span className="text-foreground">Dove perdi di più:</span>{" "}
            {shortfalls
              .map((c) => `${c.name} (−${c.lost})`)
              .join(", ")}
            .
          </p>
        )}

        <dl className="divide-y border-t">
          {components.map((comp) => (
            <div key={comp.name} className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
              <dt className="text-sm font-medium">{comp.name}</dt>
              <dd className="text-sm leading-relaxed text-muted-foreground">
                {comp.explanation}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
