"use client";

import { useOnboardingState } from "@/lib/hooks/useOnboardingState";
import { useAuth } from "@/components/AuthProvider";
import { usePathname } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";

const SKIP_PATHS = ["/onboarding", "/sign-in", "/sign-up", "/api"];

/**
 * Global onboarding gate.
 * Redirects authenticated users who haven't completed onboarding.
 * Placed in the root layout so every page is covered.
 */
export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { isSignedIn, loading } = useAuth();
  const pathname = usePathname();

  const shouldSkip =
    !isSignedIn || SKIP_PATHS.some((p) => pathname.startsWith(p));

  const { isLoading } = useOnboardingState(!shouldSkip);

  // Not signed in or on a skipped path — render immediately
  if (shouldSkip) return <>{children}</>;

  // Auth still loading or onboarding check in progress
  if (loading || isLoading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-12 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
