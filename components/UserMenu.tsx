"use client";

import { SignInButton, UserButton, useAuth } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * User authentication menu.
 *
 * Shows a sign-in button when logged out and the account button when logged
 * in. Clerk v7 ("Core 3") removed the `<SignedIn>` / `<SignedOut>` control
 * components, so the branch is an explicit conditional on `useAuth()`.
 *
 * `isLoaded` is handled separately rather than folded into the signed-out
 * branch: treating "still loading" as "signed out" would flash a sign-in
 * button at users who are in fact signed in.
 */
export function UserMenu() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return <Skeleton className="h-8 w-8 rounded-full" />;
  }

  if (!isSignedIn) {
    return (
      <SignInButton mode="modal">
        <Button size="sm">Accedi</Button>
      </SignInButton>
    );
  }

  return (
    <UserButton
      appearance={{
        elements: {
          avatarBox: "h-8 w-8",
          userButtonPopoverCard: "shadow-lg",
          userButtonPopoverActionButton: "text-sm",
        },
      }}
    />
  );
}
