"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ThumbsUp, SkipForward, Bookmark } from "lucide-react";
import { toast } from "sonner";
import { useTenderDecision } from "@/lib/hooks/useTenderDetail";
import { useSaveFavorite } from "@/lib/hooks/useTenderSearch";
import { useCreateBid } from "@/lib/hooks/useBids";

const SKIP_REASONS = [
  { value: "not_eligible", label: "Non idoneo" },
  { value: "too_competitive", label: "Troppo competitivo" },
  { value: "low_value", label: "Valore troppo basso" },
  { value: "capacity", label: "Capacità insufficiente" },
];

interface TenderActionsProps {
  tenderId: string;
  tenderTitle: string;
  tenderBuyer?: string;
  tenderValue?: number;
  tenderDeadline?: string;
}

export function TenderActions({
  tenderId,
  tenderTitle,
  tenderBuyer,
  tenderValue,
  tenderDeadline,
}: TenderActionsProps) {
  const [skipOpen, setSkipOpen] = useState(false);
  const router = useRouter();
  const decision = useTenderDecision(tenderId);
  const favorite = useSaveFavorite();
  const createBid = useCreateBid();

  const handleProceed = () => {
    decision.mutate(
      { decision: "proceed" },
      {
        onSuccess: () => {
          createBid.mutate(
            {
              external_tender_id: tenderId,
              tender_title: tenderTitle,
              tender_buyer: tenderBuyer,
              tender_value: tenderValue,
              tender_deadline: tenderDeadline,
            },
            {
              onSuccess: () => {
                toast.success("Bando aggiunto alla pipeline");
                router.push("/pipeline");
              },
              onError: () => toast.error("Errore nella creazione della gara"),
            }
          );
        },
        onError: () => toast.error("Errore nel salvataggio"),
      }
    );
  };

  const handleSkip = (reason: string) => {
    decision.mutate(
      { decision: "skip", reason },
      {
        onSuccess: () => {
          toast.success("Bando saltato");
          setSkipOpen(false);
        },
        onError: () => toast.error("Errore nel salvataggio"),
      }
    );
  };

  const handleSave = () => {
    favorite.mutate(
      {
        tenderId,
        title: tenderTitle,
        value: tenderValue,
        deadline: tenderDeadline,
      },
      {
        onSuccess: () => toast.success("Salvato nei preferiti"),
        onError: () => toast.error("Errore nel salvataggio"),
      }
    );
  };

  const isPending = decision.isPending || createBid.isPending;

  return (
    <>
      <Card>
        <CardContent className="pt-6 space-y-2">
          <Button className="w-full" onClick={handleProceed} disabled={isPending}>
            <ThumbsUp className="h-4 w-4 mr-2" />
            Candidati
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              onClick={() => setSkipOpen(true)}
              disabled={isPending}
            >
              <SkipForward className="h-4 w-4 mr-2" />
              Salta
            </Button>
            <Button
              variant="outline"
              onClick={handleSave}
              disabled={favorite.isPending}
            >
              <Bookmark className="h-4 w-4 mr-2" />
              Salva
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Skip reason dialog */}
      <Dialog open={skipOpen} onOpenChange={setSkipOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Perché salti questo bando?</DialogTitle>
            <DialogDescription>
              Seleziona un motivo per migliorare le raccomandazioni future.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-2 pt-2">
            {SKIP_REASONS.map((reason) => (
              <Button
                key={reason.value}
                variant="outline"
                className="justify-start"
                onClick={() => handleSkip(reason.value)}
                disabled={decision.isPending}
              >
                {reason.label}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
