"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Sparkles, Target } from "lucide-react";
import { GuestProfileDialog } from "./GuestProfileDialog";
import {
  getGuestProfileSnapshot,
  getGuestProfileServerSnapshot,
  subscribeToGuestProfile,
  guestProfileCompleteness,
  hasUsableGuestProfile,
} from "@/lib/guestSession";

/**
 * Prompt shown to visitors without an account.
 *
 * Two states, because they ask for different things:
 *
 *  - No usable profile yet: scoring would return zeros for every tender, so
 *    the ask is "tell us about your company" — that is what turns the results
 *    into something worth looking at.
 *  - Profile present: scores are real, so the ask becomes "create an account
 *    to keep this", which is the actual conversion moment.
 *
 * Renders nothing for signed-in users.
 */
export function GuestBanner() {
  const { isSignedIn, loading } = useAuth();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);

  // localStorage is unavailable during SSR. Reading it as an external store
  // keeps the server and client renders consistent without a mount effect.
  const profile = useSyncExternalStore(
    subscribeToGuestProfile,
    getGuestProfileSnapshot,
    getGuestProfileServerSnapshot
  );

  const handleSaved = useCallback(() => {
    // Scores come from headers we now send, so refetch anything derived from
    // them. The profile itself arrives via the store subscription.
    queryClient.invalidateQueries();
  }, [queryClient]);

  if (loading || isSignedIn) return null;

  const scored = hasUsableGuestProfile(profile);
  const completeness = guestProfileCompleteness(profile);

  return (
    <>
      <Card className="border-primary/25 bg-accent/60 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-primary/10 p-2 shrink-0">
              {scored ? (
                <Target className="h-4 w-4 text-primary" />
              ) : (
                <Sparkles className="h-4 w-4 text-primary" />
              )}
            </div>

            <div className="space-y-1">
              {scored ? (
                <>
                  <p className="eyebrow">Sessione ospite</p>
                  <p className="text-sm font-medium">
                    Stai vedendo punteggi reali per la tua azienda
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Crea un account gratuito per salvare i bandi, gestire la
                    pipeline e ricevere avvisi sulle scadenze.
                  </p>
                  {completeness < 100 && (
                    <div className="flex items-center gap-2 pt-1">
                      <Progress value={completeness} className="h-1.5 w-32" />
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">
                        profilo {completeness}%
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <p className="eyebrow">Sessione ospite</p>
                  <p className="text-sm font-medium">
                    Scopri quali bandi sono adatti alla tua azienda
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Aggiungi settore, regione e fatturato per calcolare la
                    compatibilità di ogni bando. Nessuna registrazione.
                  </p>
                </>
              )}
            </div>
          </div>

          <div className="flex shrink-0 gap-2">
            <Button
              variant={scored ? "outline" : "default"}
              size="sm"
              onClick={() => setDialogOpen(true)}
            >
              {scored ? "Modifica profilo" : "Calcola compatibilità"}
            </Button>
            {scored && (
              <Button size="sm" asChild>
                <Link href="/sign-up">Crea account</Link>
              </Button>
            )}
          </div>
        </div>
      </Card>

      <GuestProfileDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={handleSaved}
      />
    </>
  );
}
