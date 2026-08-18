"use client";

import { useState, useCallback } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { BidCard } from "./BidCard";
import { DroppableColumn } from "./DroppableColumn";
import { DraggableBidCard } from "./DraggableBidCard";
import type { Bid, BidStatus } from "@/lib/hooks/useBids";
import { useUpdateBid, useMoveBid } from "@/lib/hooks/useBids";

interface Column {
  id: BidStatus;
  label: string;
  color: string;
}

/**
 * Pipeline stages.
 *
 * The first four are one journey, so they darken along a single teal ramp
 * rather than each taking an unrelated hue — position in the pipeline is
 * legible from the colour alone. Only the two terminal states break the ramp,
 * because won and lost are outcomes rather than stages.
 */
const COLUMNS: Column[] = [
  { id: "new", label: "Nuovi", color: "bg-primary/25" },
  { id: "reviewing", label: "In Revisione", color: "bg-primary/45" },
  { id: "preparing", label: "In Preparazione", color: "bg-primary/70" },
  { id: "submitted", label: "Inviati", color: "bg-primary" },
  { id: "won", label: "Vinti", color: "bg-bid" },
  { id: "lost", label: "Persi", color: "bg-skip" },
];

function MoveButtons({
  bid,
  columns,
  currentIndex,
}: {
  bid: Bid;
  columns: Column[];
  currentIndex: number;
}) {
  const canMoveLeft = currentIndex > 0;
  const canMoveRight = currentIndex < columns.length - 1;
  const updateBid = useUpdateBid(bid.id);

  const handleMove = (direction: "left" | "right") => {
    const newIndex = direction === "left" ? currentIndex - 1 : currentIndex + 1;
    const newStatus = columns[newIndex].id;
    updateBid.mutate(
      { status: newStatus },
      {
        onSuccess: () => toast.success(`Spostato in "${columns[newIndex].label}"`),
        onError: () => toast.error("Errore nello spostamento"),
      }
    );
  };

  return (
    <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
      {canMoveLeft && (
        <Button
          variant="secondary"
          size="icon"
          className="h-6 w-6 rounded-full shadow-sm"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleMove("left");
          }}
        >
          <ChevronLeft className="h-3 w-3" />
        </Button>
      )}
      {canMoveRight && (
        <Button
          variant="secondary"
          size="icon"
          className="h-6 w-6 rounded-full shadow-sm"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleMove("right");
          }}
        >
          <ChevronRight className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}

export function KanbanBoard({ bids }: { bids: Bid[] }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const moveBid = useMoveBid();

  // PointerSensor with 8px distance to distinguish click from drag
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor)
  );

  const activeBid = activeId ? bids.find((b) => b.id === activeId) : null;

  // Group bids by status
  const grouped: Record<BidStatus, Bid[]> = {
    new: [],
    reviewing: [],
    preparing: [],
    submitted: [],
    won: [],
    lost: [],
  };

  for (const bid of bids) {
    if (grouped[bid.status]) {
      grouped[bid.status].push(bid);
    }
  }

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null);
      const { active, over } = event;

      if (!over) return;

      const bidId = active.id as string;
      const targetStatus = over.id as BidStatus;
      const bid = bids.find((b) => b.id === bidId);

      if (!bid || bid.status === targetStatus) return;

      const targetCol = COLUMNS.find((c) => c.id === targetStatus);
      moveBid.mutate(
        { bidId, status: targetStatus },
        {
          onSuccess: () =>
            toast.success(`Spostato in "${targetCol?.label || targetStatus}"`),
          onError: () => toast.error("Errore nello spostamento"),
        }
      );
    },
    [bids, moveBid]
  );

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
  }, []);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        {COLUMNS.map((col, colIndex) => (
          <DroppableColumn
            key={col.id}
            id={col.id}
            label={col.label}
            color={col.color}
            count={grouped[col.id].length}
          >
            {grouped[col.id].map((bid) => (
              <DraggableBidCard key={bid.id} bid={bid}>
                <div className="absolute top-2 right-2 z-10">
                  <MoveButtons
                    bid={bid}
                    columns={COLUMNS}
                    currentIndex={colIndex}
                  />
                </div>
              </DraggableBidCard>
            ))}
          </DroppableColumn>
        ))}
      </div>

      {/* Drag overlay: visual ghost card */}
      <DragOverlay dropAnimation={{ duration: 200, easing: "ease" }}>
        {activeBid ? (
          <div className="w-[260px] opacity-90 shadow-xl rounded-lg rotate-2 scale-105">
            <BidCard bid={activeBid} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
