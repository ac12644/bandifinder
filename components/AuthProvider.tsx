"use client";

import { ClerkProvider, useAuth as useClerkAuth, useUser } from "@clerk/nextjs";
import { itIT } from "@clerk/localizations";
import { useCallback, useEffect, useState } from "react";

/**
 * Clerk Auth Provider
 *
 * Wraps the app with Clerk authentication.
 * Provides Italian localization for auth UI.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      localization={itIT}
      // Clerk v7 moved this from <UserButton> to provider-level options.
      afterSignOutUrl="/"
      appearance={{
        elements: {
          formButtonPrimary:
            "bg-primary hover:bg-primary/90 text-primary-foreground",
          card: "shadow-lg",
          headerTitle: "text-foreground",
          headerSubtitle: "text-muted-foreground",
          socialButtonsBlockButton:
            "border border-input bg-background hover:bg-accent",
          formFieldInput:
            "border border-input bg-background text-foreground",
          footerActionLink: "text-primary hover:text-primary/80",
        },
      }}
    >
      {children}
    </ClerkProvider>
  );
}

/**
 * Auth hook providing user state and authentication actions.
 * Uses Clerk under the hood but maintains backward-compatible interface.
 */
export function useAuth() {
  const { isLoaded, isSignedIn, userId, getToken, signOut } = useClerkAuth();
  const { user } = useUser();
  const [idToken, setIdToken] = useState<string | null>(null);

  // Eagerly fetch and cache the token for backward compatibility
  useEffect(() => {
    if (isSignedIn && isLoaded) {
      getToken().then(setIdToken).catch(() => setIdToken(null));
    } else {
      setIdToken(null);
    }
  }, [isSignedIn, isLoaded, getToken]);

  // Auto-refresh token every 50 minutes
  useEffect(() => {
    if (!isSignedIn) return;

    const interval = setInterval(() => {
      getToken().then(setIdToken).catch(() => setIdToken(null));
    }, 50 * 60 * 1000);

    return () => clearInterval(interval);
  }, [isSignedIn, getToken]);

  const refreshToken = useCallback(async () => {
    const token = await getToken();
    setIdToken(token);
    return token;
  }, [getToken]);

  // Create a user-like object for backward compatibility
  const userObject = user ? {
    uid: userId,
    email: user.primaryEmailAddress?.emailAddress,
    displayName: user.fullName ?? user.firstName,
    photoURL: user.imageUrl,
    emailVerified: user.primaryEmailAddress?.verification?.status === "verified",
    isAnonymous: false,
    getIdToken: async () => await getToken(),
  } : null;

  return {
    // User state (backward compatible)
    user: userObject,
    loading: !isLoaded,
    isAnon: !isSignedIn,
    uid: userId ?? null,
    idToken, // Now eagerly fetched and cached

    // Clerk-specific
    clerkUser: user,
    isSignedIn,

    // Organization context
    orgId: user?.organizationMemberships?.[0]?.organization?.id ?? null,
    orgRole: user?.organizationMemberships?.[0]?.role ?? null,

    // Token functions
    getToken,
    refreshToken,

    // Actions (backward compatible names)
    signInGoogle: async () => {
      console.warn("Use Clerk SignInButton component instead of signInGoogle()");
    },
    signOut: async () => {
      await signOut();
    },
  };
}
