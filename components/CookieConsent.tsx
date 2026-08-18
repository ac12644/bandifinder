"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { getConsent, setConsent } from "@/lib/cookieConsent";
import * as Sentry from "@sentry/nextjs";

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Only show if user hasn't made a choice yet
    if (getConsent() === null) {
      setVisible(true);
    }
  }, []);

  const accept = () => {
    setConsent("accepted");
    setVisible(false);

    // Dynamically enable Sentry replay now that user consented
    const client = Sentry.getClient();
    if (client) {
      client.addIntegration(Sentry.replayIntegration());
    }
  };

  const reject = () => {
    setConsent("rejected");
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-[100] p-4 pointer-events-none">
      <div className="mx-auto max-w-2xl pointer-events-auto rounded-xl border bg-background/95 backdrop-blur shadow-lg p-5">
        <div className="space-y-3">
          <p className="text-sm leading-relaxed text-foreground">
            Questo sito utilizza cookie tecnici necessari al funzionamento e
            cookie analitici per migliorare l&apos;esperienza utente. I cookie
            analitici includono il monitoraggio degli errori e le statistiche
            d&apos;uso anonime.
          </p>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:justify-end">
            <Button variant="outline" size="sm" onClick={reject}>
              Solo essenziali
            </Button>
            <Button size="sm" onClick={accept}>
              Accetta tutti
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
