"use client";

import type { LessonLearned } from "@/lib/hooks/useOutcomes";
import { Trophy, XCircle, MinusCircle, Clock, BookOpen, Lightbulb } from "lucide-react";
import { formatEUR } from "@/lib/utils/formatters";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";

interface LessonsLearnedListProps {
  lessons: LessonLearned[];
}

const outcomeConfig: Record<
  string,
  { icon: typeof Trophy; color: string; bgColor: string; label: string }
> = {
  won: {
    icon: Trophy,
    color: "text-emerald-700",
    bgColor: "bg-emerald-50 border-emerald-200",
    label: "Vinto",
  },
  lost: {
    icon: XCircle,
    color: "text-red-700",
    bgColor: "bg-red-50 border-red-200",
    label: "Perso",
  },
  withdrawn: {
    icon: MinusCircle,
    color: "text-amber-700",
    bgColor: "bg-amber-50 border-amber-200",
    label: "Ritirato",
  },
  no_response: {
    icon: Clock,
    color: "text-slate-600",
    bgColor: "bg-slate-50 border-slate-200",
    label: "Nessuna risposta",
  },
};

export function LessonsLearnedList({ lessons }: LessonsLearnedListProps) {
  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <div className="rounded-lg bg-primary/10 p-1.5">
          <BookOpen className="h-3.5 w-3.5 text-primary" />
        </div>
        <h3 className="text-sm font-semibold">Lezioni Apprese</h3>
        {lessons.length > 0 && (
          <span className="text-xs text-muted-foreground ml-1">
            ({lessons.length})
          </span>
        )}
      </div>

      {lessons.length === 0 ? (
        <Empty className="py-8">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Lightbulb />
            </EmptyMedia>
            <EmptyTitle>Nessuna lezione registrata</EmptyTitle>
            <EmptyDescription>
              Aggiungi le lezioni apprese negli esiti delle tue gare per costruire
              la base di conoscenza del team.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-3">
          {lessons.map((lesson, i) => {
            const cfg = outcomeConfig[lesson.outcome] || outcomeConfig.lost;
            const Icon = cfg.icon;
            return (
              <div
                key={i}
                className="rounded-lg border p-4 space-y-2.5 hover:bg-muted/20 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                        cfg.bgColor,
                        cfg.color
                      )}
                    >
                      <Icon className="h-3 w-3" />
                      {cfg.label}
                    </span>
                    {lesson.tender_buyer && (
                      <span className="text-xs text-muted-foreground font-medium">
                        {lesson.tender_buyer}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2.5 text-xs text-muted-foreground shrink-0">
                    {lesson.tender_value && (
                      <span className="font-medium tabular-nums">
                        {formatEUR(lesson.tender_value)}
                      </span>
                    )}
                    {lesson.outcome_date && (
                      <span className="tabular-nums">
                        {format(new Date(lesson.outcome_date), "d MMM yyyy", {
                          locale: it,
                        })}
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-sm leading-relaxed">{lesson.lessons_learned}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
