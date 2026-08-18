"use client";

import { use } from "react";
import { useBidDetail } from "@/lib/hooks/useBids";
import { BidHeader } from "./components/BidHeader";
import { ComplianceChecklist } from "./components/ComplianceChecklist";
import { BidComments } from "./components/BidComments";
import { BidTimeline } from "./components/BidTimeline";
import { OutcomeForm } from "./components/OutcomeForm";
import { Loader2 } from "lucide-react";
import { Separator } from "@/components/ui/separator";

export default function BidDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data, isLoading, error } = useBidDetail(id);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">
          Caricamento dettaglio gara...
        </span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-20">
        <p className="text-sm text-red-600">Gara non trovata</p>
      </div>
    );
  }

  const { bid, assignments, comments, checklist, checklistProgress } = data;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <BidHeader bid={bid} />

      <Separator />

      {/* Notes */}
      {bid.notes && (
        <div className="bg-muted/30 rounded-lg p-4">
          <p className="text-sm font-medium mb-1">Note</p>
          <p className="text-sm text-muted-foreground">{bid.notes}</p>
        </div>
      )}

      {/* Main content: 2-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Checklist + Comments */}
        <div className="lg:col-span-2 space-y-6">
          <ComplianceChecklist
            bidId={bid.id}
            checklist={checklist}
            progress={checklistProgress}
          />
          <BidComments bidId={bid.id} comments={comments} />
        </div>

        {/* Right column: Outcome + Timeline + Assignments */}
        <div className="space-y-6">
          {/* Outcome form for submitted/won/lost bids */}
          {(bid.status === "submitted" ||
            bid.status === "won" ||
            bid.status === "lost") && <OutcomeForm bidId={bid.id} />}

          <BidTimeline bid={bid} />

          {/* Assignments */}
          <div className="rounded-lg border p-4 space-y-3">
            <h3 className="text-sm font-semibold">Team Assegnato</h3>
            {assignments.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nessun membro assegnato</p>
            ) : (
              <div className="space-y-2">
                {assignments.map((a) => (
                  <div key={a.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center">
                        <span className="text-[10px] font-medium text-primary">
                          {a.role[0].toUpperCase()}
                        </span>
                      </div>
                      <span className="text-xs capitalize">{a.role}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
