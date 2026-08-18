"use client";

import { useState } from "react";
import {
  useBidOutcome,
  useRecordOutcome,
  type OutcomeType,
} from "@/lib/hooks/useOutcomes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Trophy,
  XCircle,
  MinusCircle,
  Clock,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { formatEUR } from "@/lib/utils/formatters";

const OUTCOME_OPTIONS: {
  value: OutcomeType;
  label: string;
  icon: React.ReactNode;
  color: string;
}[] = [
  {
    value: "won",
    label: "Vinto",
    icon: <Trophy className="h-4 w-4" />,
    color: "text-green-600",
  },
  {
    value: "lost",
    label: "Perso",
    icon: <XCircle className="h-4 w-4" />,
    color: "text-red-600",
  },
  {
    value: "withdrawn",
    label: "Ritirato",
    icon: <MinusCircle className="h-4 w-4" />,
    color: "text-orange-600",
  },
  {
    value: "no_response",
    label: "Nessuna risposta",
    icon: <Clock className="h-4 w-4" />,
    color: "text-muted-foreground",
  },
];

interface OutcomeFormProps {
  bidId: string;
}

export function OutcomeForm({ bidId }: OutcomeFormProps) {
  const { data, isLoading } = useBidOutcome(bidId);
  const recordMutation = useRecordOutcome(bidId);

  const existingOutcome = data?.outcome;

  const [outcome, setOutcome] = useState<OutcomeType | "">(
    existingOutcome?.outcome || ""
  );
  const [winningBidder, setWinningBidder] = useState(
    existingOutcome?.winning_bidder || ""
  );
  const [winningAmount, setWinningAmount] = useState(
    existingOutcome?.winning_amount?.toString() || ""
  );
  const [numBidders, setNumBidders] = useState(
    existingOutcome?.num_bidders?.toString() || ""
  );
  const [reason, setReason] = useState(existingOutcome?.reason || "");
  const [lessonsLearned, setLessonsLearned] = useState(
    existingOutcome?.lessons_learned || ""
  );
  const [editing, setEditing] = useState(!existingOutcome);

  if (isLoading) {
    return (
      <div className="rounded-lg border p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Caricamento esito...
        </div>
      </div>
    );
  }

  // Display existing outcome
  if (existingOutcome && !editing) {
    const opt = OUTCOME_OPTIONS.find((o) => o.value === existingOutcome.outcome);

    return (
      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Esito Gara</h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditing(true)}
            className="text-xs"
          >
            Modifica
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <span className={opt?.color}>{opt?.icon}</span>
          <span className="font-medium">{opt?.label}</span>
        </div>

        {existingOutcome.winning_bidder && (
          <div className="text-sm">
            <span className="text-muted-foreground">Vincitore: </span>
            {existingOutcome.winning_bidder}
          </div>
        )}

        {existingOutcome.winning_amount && (
          <div className="text-sm">
            <span className="text-muted-foreground">Importo vincente: </span>
            {formatEUR(existingOutcome.winning_amount)}
          </div>
        )}

        {existingOutcome.num_bidders && (
          <div className="text-sm">
            <span className="text-muted-foreground">N. partecipanti: </span>
            {existingOutcome.num_bidders}
          </div>
        )}

        {existingOutcome.reason && (
          <div className="text-sm">
            <span className="text-muted-foreground">Motivo: </span>
            {existingOutcome.reason}
          </div>
        )}

        {existingOutcome.lessons_learned && (
          <div className="text-sm">
            <span className="text-muted-foreground">Lezioni apprese: </span>
            {existingOutcome.lessons_learned}
          </div>
        )}
      </div>
    );
  }

  // Edit / create form
  const handleSubmit = () => {
    if (!outcome) return;

    recordMutation.mutate(
      {
        outcome: outcome as OutcomeType,
        winning_bidder: winningBidder || undefined,
        winning_amount: winningAmount ? Number(winningAmount) : undefined,
        num_bidders: numBidders ? Number(numBidders) : undefined,
        reason: reason || undefined,
        lessons_learned: lessonsLearned || undefined,
      },
      {
        onSuccess: () => setEditing(false),
      }
    );
  };

  return (
    <div className="rounded-lg border p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          {existingOutcome ? "Modifica Esito" : "Registra Esito"}
        </h3>
        {existingOutcome && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditing(false)}
            className="text-xs"
          >
            Annulla
          </Button>
        )}
      </div>

      {/* Outcome selection */}
      <div className="grid grid-cols-2 gap-2">
        {OUTCOME_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setOutcome(opt.value)}
            className={`flex items-center gap-2 rounded-md border p-2 text-sm transition-colors ${
              outcome === opt.value
                ? "border-primary bg-primary/5 font-medium"
                : "border-muted hover:border-primary/50"
            }`}
          >
            <span className={opt.color}>{opt.icon}</span>
            {opt.label}
          </button>
        ))}
      </div>

      {/* Competitive intel (shown for lost/won) */}
      {(outcome === "lost" || outcome === "won") && (
        <div className="space-y-3">
          {outcome === "lost" && (
            <div className="space-y-1.5">
              <Label className="text-xs">Chi ha vinto?</Label>
              <Input
                placeholder="Nome vincitore"
                value={winningBidder}
                onChange={(e) => setWinningBidder(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">
                {outcome === "won" ? "Importo offerto" : "Importo vincente"}
              </Label>
              <Input
                type="number"
                placeholder="€"
                value={winningAmount}
                onChange={(e) => setWinningAmount(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">N. partecipanti</Label>
              <Input
                type="number"
                placeholder="Es. 5"
                value={numBidders}
                onChange={(e) => setNumBidders(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          </div>
        </div>
      )}

      {/* Reason */}
      <div className="space-y-1.5">
        <Label className="text-xs">Motivo</Label>
        <Input
          placeholder={
            outcome === "won"
              ? "Perché abbiamo vinto?"
              : outcome === "lost"
              ? "Perché abbiamo perso?"
              : "Motivo"
          }
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="h-8 text-sm"
        />
      </div>

      {/* Lessons learned */}
      <div className="space-y-1.5">
        <Label className="text-xs">Lezioni apprese</Label>
        <Textarea
          placeholder="Cosa abbiamo imparato da questa gara?"
          value={lessonsLearned}
          onChange={(e) => setLessonsLearned(e.target.value)}
          rows={3}
          className="text-sm resize-none"
        />
      </div>

      <Button
        onClick={handleSubmit}
        disabled={!outcome || recordMutation.isPending}
        size="sm"
        className="w-full"
      >
        {recordMutation.isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin mr-1" />
            Salvataggio...
          </>
        ) : (
          <>
            <CheckCircle2 className="h-4 w-4 mr-1" />
            {existingOutcome ? "Aggiorna Esito" : "Registra Esito"}
          </>
        )}
      </Button>
    </div>
  );
}
