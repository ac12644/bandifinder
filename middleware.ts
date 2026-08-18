import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/**
 * Routes that require a real account.
 *
 * Discovery routes are deliberately absent: /tenders and /analytics are open
 * to visitors without an account so the product can demonstrate itself before
 * asking anyone to sign up. Guests browsing them get real fit scores against a
 * profile they fill in inline, and the API refuses any write they attempt.
 *
 * Everything that persists or exposes an organization's own data stays gated.
 */
const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/admin(.*)",
  "/onboarding(.*)",
  "/settings(.*)",
  "/pipeline(.*)",
  "/bids(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  // Anything not listed above is reachable without an account; the API
  // enforces what a guest may actually do.
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals, static files, and Sentry tunnel route
    "/((?!monitoring|_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
