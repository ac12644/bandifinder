"use client";

import { useDroppable } from "@dnd-kit/core";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Inbox } from "lucide-react";

interface DroppableColumnProps {
  id: string;
  label: string;
  color: string;
  count: number;
  children: ReactNode;
}

export function DroppableColumn({
  id,
  label,
  color,
  count,
  children,
}: DroppableColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });

  const hasCards = count > 0;

  return (
    <div className="flex-shrink-0 w-[280px] flex flex-col">
      {/* Column header */}
      <div className="flex items-center gap-2 mb-3 px-1">
        <div className={cn("w-2.5 h-2.5 rounded-full", color)} />
        <h3 className="text-sm font-semibold">{label}</h3>
        <Badge
          variant="secondary"
          className={cn(
            "text-[10px] font-bold ml-auto h-5 min-w-[20px] justify-center tabular-nums",
            count === 0 && "opacity-50"
          )}
        >
          {count}
        </Badge>
      </div>

      {/* Column body — drop target */}
      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 space-y-2 min-h-[200px] rounded-lg p-2 transition-all duration-150",
          isOver
            ? "bg-primary/10 ring-2 ring-primary/30 ring-offset-1"
            : "bg-muted/30",
          !hasCards && !isOver && "border border-dashed border-muted-foreground/20"
        )}
      >
        {!hasCards && !isOver ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[160px] text-muted-foreground/40">
            <Inbox className="h-6 w-6 mb-1" />
            <span className="text-xs">Trascina qui</span>
          </div>
        ) : !hasCards && isOver ? (
          <div className="flex items-center justify-center h-full min-h-[160px] text-primary/50">
            <span className="text-xs font-medium">Rilascia qui</span>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
