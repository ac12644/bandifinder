import { clerkMiddleware } from "@clerk/nextjs/server";

/**
 * Clerk still needs to run on every request to populate the auth context that
 * `auth()` reads in server components — but it no longer decides who may see
 * what.
 *
 * Route protection used to live here as a `createRouteMatcher` list. Clerk
 * deprecated that because a path glob is a second, parallel description of the
 * route tree: when the two drift, the glob silently stops covering a route and
 * the page is served to anyone. Each protected segment now calls
 * `auth.protect()` in its own server layout, so the check sits on the resource
 * it guards and cannot fall out of sync with it.
 *
 * The real boundary for data is the API, which authenticates every request
 * independently; these checks decide what the app renders.
 */
export default clerkMiddleware();

export const config = {
  matcher: [
    // Skip Next.js internals, static files, and Sentry tunnel route
    "/((?!monitoring|_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
