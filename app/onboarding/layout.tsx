import { Sparkles } from "lucide-react";
import { auth } from "@clerk/nextjs/server";

/**
 * Onboarding layout — minimal, no Header/Footer.
 * Centered card with brand logo.
 *
 * Also guards the segment: this replaces the `createRouteMatcher` entry that
 * used to protect /onboarding from the proxy.
 */
export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await auth.protect();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-background to-muted/30 px-4 py-12">
      <div className="flex items-center gap-2 mb-8">
        <Sparkles className="h-6 w-6 text-primary" />
        <span className="text-xl font-bold">Bandifinder</span>
      </div>
      <div className="w-full max-w-lg">{children}</div>
    </div>
  );
}
