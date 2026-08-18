"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useRouter, usePathname } from "next/navigation";
import { API_BASE_URL, ENDPOINTS } from "@/lib/apiConfig";

interface OnboardingState {
  hasOrg: boolean;
  completeness: number;
  isReady: boolean;
  isLoading: boolean;
}

/**
 * Hook that checks onboarding state and optionally redirects.
 *
 * @param redirect - If true, redirects to the appropriate onboarding step.
 */
export function useOnboardingState(redirect = false): OnboardingState {
  const { uid, idToken, orgId, isSignedIn, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<OnboardingState>({
    hasOrg: false,
    completeness: 0,
    isReady: false,
    isLoading: true,
  });

  useEffect(() => {
    if (loading || !isSignedIn) {
      setState((s) => ({ ...s, isLoading: loading }));
      return;
    }

    const check = async () => {
      const hasOrg = !!orgId;

      if (!hasOrg) {
        setState({ hasOrg: false, completeness: 0, isReady: false, isLoading: false });
        if (redirect && !pathname.startsWith("/onboarding")) {
          router.replace("/onboarding/organization");
        }
        return;
      }

      // Check profile completeness
      try {
        const res = await fetch(
          `${API_BASE_URL}${ENDPOINTS.companyCompleteness}`,
          {
            headers: {
              "Content-Type": "application/json",
              ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
              ...(uid ? { "x-user-id": uid } : {}),
            },
            cache: "no-store",
          }
        );

        if (res.ok) {
          const data = await res.json();
          const score = data.completeness?.score ?? data.score ?? 0;
          const isReady = score >= 80;

          setState({ hasOrg: true, completeness: score, isReady, isLoading: false });

          if (redirect && !isReady && !pathname.startsWith("/onboarding")) {
            router.replace("/onboarding/profile");
          }
        } else {
          // API error — allow through
          setState({ hasOrg: true, completeness: 0, isReady: true, isLoading: false });
        }
      } catch {
        // Network error — allow through
        setState({ hasOrg: true, completeness: 0, isReady: true, isLoading: false });
      }
    };

    check();
  }, [loading, isSignedIn, orgId, uid, idToken, redirect, pathname, router]);

  return state;
}
