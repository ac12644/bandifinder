"use client";

import { useAuth as useClerkAuth, useUser } from "@clerk/nextjs";
import { useCallback } from "react";

/**
 * Auth hook providing user state and authentication actions.
 * Uses Clerk under the hood.
 */
export function useAuth() {
  const { isLoaded, isSignedIn, userId, getToken, signOut } = useClerkAuth();
  const { user } = useUser();

  const refreshToken = useCallback(async () => {
    // Clerk handles token refresh automatically
    return getToken();
  }, [getToken]);

  return {
    // User state
    user: user ?? null,
    loading: !isLoaded,
    isAnon: !isSignedIn,
    uid: userId ?? null,

    // User details
    email: user?.primaryEmailAddress?.emailAddress ?? null,
    displayName: user?.fullName ?? user?.firstName ?? null,
    photoURL: user?.imageUrl ?? null,

    // Organization context
    orgId: user?.organizationMemberships?.[0]?.organization?.id ?? null,
    orgName: user?.organizationMemberships?.[0]?.organization?.name ?? null,
    orgRole: user?.organizationMemberships?.[0]?.role ?? null,

    // Token (for API calls)
    getToken,
    refreshToken,

    // Actions
    signOut: async () => {
      await signOut();
    },
  };
}

/**
 * Get auth token for API requests.
 * Returns null if not signed in.
 */
export async function getAuthToken(): Promise<string | null> {
  // This is a server-side helper
  // For client-side, use the useAuth hook
  return null;
}
