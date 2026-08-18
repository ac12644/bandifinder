"use client";

import { useEffect, useState } from "react";
import { Analytics } from "@vercel/analytics/next";
import { hasAnalyticsConsent } from "@/lib/cookieConsent";

/**
 * Only renders Vercel Analytics if the user has accepted cookie consent.
 * Listens for storage changes so it activates immediately after consent.
 */
export function ConditionalAnalytics() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setEnabled(hasAnalyticsConsent());

    const onStorage = () => setEnabled(hasAnalyticsConsent());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  if (!enabled) return null;
  return <Analytics />;
}
