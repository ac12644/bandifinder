"use client";

import { useState } from "react";
import type { SegmentStat } from "@/lib/hooks/useOutcomes";
import { Button } from "@/components/ui/button";
import { BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";

interface WinRateBySegmentProps {
  byValueRange: SegmentStat[];
  byBuyer: SegmentStat[];
}

function WinRateBar({ segment }: { segment: SegmentStat }) {
  const barColor =
    segment.winRate >= 50
      ? "bg-emerald-500"
      : segment.winRate >= 25
      ? "bg-amber-500"
      : "bg-red-500";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="truncate max-w-[200px] font-medium" title={segment.segment}>
          {segment.segment}
        </span>
        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          <span className="font-semibold tabular-nums">{segment.winRate}%</span>
          <span className="text-[10px] text-muted-foreground tabular-nums">
            ({segment.won}/{segment.total})
          </span>
        </div>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500", barColor)}
          style={{ width: `${Math.max(segment.winRate, 2)}%` }}
        />
      </div>
    </div>
  );
}

export function WinRateBySegment({
  byValueRange,
  byBuyer,
}: WinRateBySegmentProps) {
  const [tab, setTab] = useState<"value" | "buyer">("value");
  const segments = tab === "value" ? byValueRange : byBuyer;

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-primary/10 p-1.5">
            <BarChart3 className="h-3.5 w-3.5 text-primary" />
          </div>
          <h3 className="text-sm font-semibold">Win Rate per Segmento</h3>
        </div>
        <div className="flex rounded-lg border p-0.5">
          <Button
            variant={tab === "value" ? "default" : "ghost"}
            size="sm"
            className="h-6 px-2.5 text-[11px] rounded-md"
            onClick={() => setTab("value")}
          >
            Per Valore
          </Button>
          <Button
            variant={tab === "buyer" ? "default" : "ghost"}
            size="sm"
            className="h-6 px-2.5 text-[11px] rounded-md"
            onClick={() => setTab("buyer")}
          >
            Per Ente
          </Button>
        </div>
      </div>

      {segments.length === 0 ? (
        <Empty className="py-8">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BarChart3 />
            </EmptyMedia>
            <EmptyTitle>Dati insufficienti</EmptyTitle>
            <EmptyDescription>
              Registra più esiti per visualizzare le statistiche per segmento.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-3">
          {segments.map((s) => (
            <WinRateBar key={s.segment} segment={s} />
          ))}
        </div>
      )}
    </div>
  );
}
