"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { BidCard } from "./BidCard";
import type { Bid, BidStatus } from "@/lib/hooks/useBids";
import { cn } from "@/lib/utils";

interface DraggableBidCardProps {
  bid: Bid;
  children?: React.ReactNode; // MoveButtons overlay
}

export function DraggableBidCard({ bid, children }: DraggableBidCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: bid.id,
      data: { bid },
    });

  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn(
        "group relative touch-none",
        isDragging && "opacity-30 z-50"
      )}
    >
      <BidCard bid={bid} />
      {/* MoveButtons overlay */}
      {!isDragging && children}
    </div>
  );
}
