"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar, Euro, Building2, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import type { Bid, BidStatus } from "@/lib/hooks/useBids";
import { useUpdateBid } from "@/lib/hooks/useBids";

const STATUS_CONFIG: Record<
  BidStatus,
  { label: string; color: string }
> = {
  new: { label: "Nuovo", color: "bg-blue-100 text-blue-700 border-blue-200" },
  reviewing: {
    label: "In Revisione",
    color: "bg-yellow-100 text-yellow-700 border-yellow-200",
  },
  preparing: {
    label: "In Preparazione",
    color: "bg-orange-100 text-orange-700 border-orange-200",
  },
  submitted: {
    label: "Inviato",
    color: "bg-purple-100 text-purple-700 border-purple-200",
  },
  won: { label: "Vinto", color: "bg-green-100 text-green-700 border-green-200" },
  lost: { label: "Perso", color: "bg-red-100 text-red-700 border-red-200" },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  high: { label: "Alta", color: "bg-red-100 text-red-700" },
  medium: { label: "Media", color: "bg-yellow-100 text-yellow-700" },
  low: { label: "Bassa", color: "bg-gray-100 text-gray-600" },
};

export function BidHeader({ bid }: { bid: Bid }) {
  const updateBid = useUpdateBid(bid.id);
  const statusConf = STATUS_CONFIG[bid.status];
  const priorityConf = PRIORITY_CONFIG[bid.priority];

  const handleStatusChange = (newStatus: string) => {
    updateBid.mutate(
      { status: newStatus as BidStatus },
      {
        onSuccess: () => toast.success("Stato aggiornato"),
        onError: () => toast.error("Errore nell'aggiornamento"),
      }
    );
  };

  const handlePriorityChange = (newPriority: string) => {
    updateBid.mutate(
      { priority: newPriority as Bid["priority"] },
      {
        onSuccess: () => toast.success("Priorità aggiornata"),
        onError: () => toast.error("Errore nell'aggiornamento"),
      }
    );
  };

  const deadline = bid.tender_deadline
    ? new Date(bid.tender_deadline).toLocaleDateString("it-IT", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  const value = bid.tender_value
    ? `€${bid.tender_value.toLocaleString("it-IT")}`
    : null;

  return (
    <div className="space-y-4">
      <Link href="/pipeline">
        <Button variant="ghost" size="sm" className="gap-1 -ml-2">
          <ArrowLeft className="h-4 w-4" />
          Pipeline
        </Button>
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="space-y-2 min-w-0 flex-1">
          <h1 className="text-xl font-bold leading-tight">{bid.tender_title}</h1>

          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            {bid.tender_buyer && (
              <span className="flex items-center gap-1">
                <Building2 className="h-4 w-4" />
                {bid.tender_buyer}
              </span>
            )}
            {value && (
              <span className="flex items-center gap-1">
                <Euro className="h-4 w-4" />
                {value}
              </span>
            )}
            {deadline && (
              <span className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                {deadline}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Select value={bid.status} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-[160px]">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={statusConf.color}>
                  {statusConf.label}
                </Badge>
              </div>
            </SelectTrigger>
            <SelectContent>
              {Object.entries(STATUS_CONFIG).map(([key, conf]) => (
                <SelectItem key={key} value={key}>
                  {conf.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={bid.priority} onValueChange={handlePriorityChange}>
            <SelectTrigger className="w-[120px]">
              <Badge variant="outline" className={priorityConf.color}>
                {priorityConf.label}
              </Badge>
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PRIORITY_CONFIG).map(([key, conf]) => (
                <SelectItem key={key} value={key}>
                  {conf.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
