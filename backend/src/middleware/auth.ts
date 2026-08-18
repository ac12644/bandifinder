/**
 * Authentication Middleware
 *
 * Enterprise-grade auth middleware using Clerk.
 * Supports JWT verification, organization context, and role-based access.
 */

import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../app";
import { verifyClerkToken, type ClerkUser } from "../lib/clerk";
import { logger } from "../lib/observability";

// ============================================================================
// TYPES
// ============================================================================

/**
 * Authenticated user context available in routes.
 */
export interface AuthenticatedUser {
  uid: string;
  email?: string;
  emailVerified: boolean;
  displayName?: string;
  photoURL?: string;
  orgId?: string;
  orgRole?: string;
  customClaims?: Record<string, unknown>;
}

// ============================================================================
// TOKEN EXTRACTION
// ============================================================================

/**
 * Extract Bearer token from Authorization header.
 */
function extractBearerToken(authorization: string | undefined): string | null {
  if (!authorization) return null;
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

// ============================================================================
// CLERK USER TO AUTH USER CONVERSION
// ============================================================================

function clerkUserToAuthUser(clerkUser: ClerkUser): AuthenticatedUser {
  return {
    uid: clerkUser.userId,
    email: clerkUser.email,
    emailVerified: true, // Clerk handles email verification
    displayName: [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || undefined,
    photoURL: clerkUser.imageUrl,
    orgId: clerkUser.orgId,
    orgRole: clerkUser.orgRole,
    customClaims: clerkUser.metadata,
  };
}

// ============================================================================
// HEADER-AUTH ESCAPE HATCH
// ============================================================================

/**
 * Whether an unverified `x-user-id` header may establish identity.
 *
 * This is a local-development convenience and a total authentication bypass:
 * the header is attacker-controlled, so anything that trusts it lets a caller
 * act as any user.
 *
 * It is deliberately gated on an explicit opt-in rather than on NODE_ENV. The
 * deployed API runs with NODE_ENV="development" (set in the Vercel project),
 * so a `NODE_ENV !== "production"` check reads as "development" in production
 * and would leave the bypass wide open. Requiring an explicit flag fails
 * closed: absent configuration means disabled.
 *
 * Set ALLOW_INSECURE_HEADER_AUTH=true in local .env only. Never in a
 * deployed environment.
 */
function headerAuthAllowed(): boolean {
  return process.env.ALLOW_INSECURE_HEADER_AUTH === "true";
}

// ============================================================================
// AUTH MIDDLEWARE
// ============================================================================

/**
 * Authentication middleware.
 *
 * Verifies Clerk JWT tokens and sets user context.
 * Falls back to x-user-id header for development/testing.
 */
export const authMiddleware = createMiddleware<Env>(async (c, next) => {
  const authorization = c.req.header("Authorization");
  const token = extractBearerToken(authorization);

  // Try Clerk token verification first
  if (token) {
    const result = await verifyClerkToken(token);

    if (result.success && result.user) {
      const authUser = clerkUserToAuthUser(result.user);
      c.set("user", authUser);
      c.set("userId", authUser.uid);

      logger.debug("User authenticated via Clerk", {
        userId: authUser.uid,
        orgId: authUser.orgId,
      });

      return next();
    }

    // Token provided but invalid
    if (result.error && !result.error.includes("not configured")) {
      throw new HTTPException(401, {
        message: `Authentication failed: ${result.error}`,
      });
    }
  }

  // Fallback: allow x-user-id for local development only (see
  // headerAuthAllowed — explicit opt-in, never enabled in a deployment).
  const headerUserId = c.req.header("x-user-id");

  if (headerUserId && headerUserId !== "anon" && headerAuthAllowed()) {
    logger.debug("User authenticated via x-user-id header (dev mode)", {
      userId: headerUserId,
    });

    c.set("user", null);
    c.set("userId", headerUserId);
    return next();
  }

  // Authentication failed
  throw new HTTPException(401, {
    message: "Authentication required. Please provide a valid Bearer token.",
  });
});

// ============================================================================
// OPTIONAL AUTH MIDDLEWARE
// ============================================================================

/**
 * Optional auth middleware - doesn't throw on missing auth.
 * Sets user context if valid token provided, otherwise continues without auth.
 */
export const optionalAuthMiddleware = createMiddleware<Env>(async (c, next) => {
  const authorization = c.req.header("Authorization");
  const token = extractBearerToken(authorization);

  if (token) {
    const result = await verifyClerkToken(token);

    if (result.success && result.user) {
      const authUser = clerkUserToAuthUser(result.user);
      c.set("user", authUser);
      c.set("userId", authUser.uid);
    }
  }

  // Dev-only fallback. In production an unverified header must never establish
  // identity: agent tools resolve the company profile from this value, so
  // trusting it would let any caller read another org's data.
  if (!c.get("userId") && headerAuthAllowed()) {
    const headerUserId = c.req.header("x-user-id");
    if (headerUserId && headerUserId !== "anon") {
      c.set("userId", headerUserId);
    }
  }

  return next();
});

// ============================================================================
// ADMIN MIDDLEWARE
// ============================================================================

/**
 * Admin-only middleware.
 * Requires authenticated user with admin role or claim.
 */
export const adminMiddleware = createMiddleware<Env>(async (c, next) => {
  const user = c.get("user") as AuthenticatedUser | null;
  const userId = c.get("userId");

  // Check for admin in custom claims
  const isAdmin = user?.customClaims?.admin === true ||
    user?.customClaims?.role === "admin" ||
    user?.orgRole === "org:admin";

  // Also allow specific admin UID from env or default
  // No fallback on purpose. A hardcoded default means a misconfigured deploy
  // silently grants admin to one specific identity instead of failing closed,
  // and it publishes a real user id to anyone reading the source.
  const adminUid = process.env.ADMIN_UID;
  const isAdminUid = Boolean(adminUid) && userId === adminUid;

  if (!isAdmin && !isAdminUid) {
    throw new HTTPException(403, {
      message: "Admin access required",
    });
  }

  return next();
});

// ============================================================================
// ORGANIZATION MIDDLEWARE
// ============================================================================

/**
 * Organization member middleware.
 * Requires user to be a member of the specified organization.
 */
export const orgMemberMiddleware = (requiredOrgId?: string) =>
  createMiddleware<Env>(async (c, next) => {
    const user = c.get("user") as AuthenticatedUser | null;

    if (!user?.orgId) {
      throw new HTTPException(403, {
        message: "Organization membership required",
      });
    }

    // If specific org required, check it matches
    if (requiredOrgId && user.orgId !== requiredOrgId) {
      throw new HTTPException(403, {
        message: "Not a member of the required organization",
      });
    }

    return next();
  });

/**
 * Organization admin middleware.
 * Requires user to be an admin of their organization.
 */
export const orgAdminMiddleware = createMiddleware<Env>(async (c, next) => {
  const user = c.get("user") as AuthenticatedUser | null;

  if (!user?.orgId) {
    throw new HTTPException(403, {
      message: "Organization membership required",
    });
  }

  if (user.orgRole !== "org:admin") {
    throw new HTTPException(403, {
      message: "Organization admin access required",
    });
  }

  return next();
});

// ============================================================================
// SERVICE / CRON AUTHENTICATION
// ============================================================================

/**
 * Ingestion auth.
 *
 * Ingestion is triggered two ways, so it accepts two credentials:
 *
 *  1. A scheduler (Supabase pg_cron / Vercel cron) presenting
 *     `Authorization: Bearer $CRON_SECRET`. There is no Clerk session behind a
 *     scheduled job, so it authenticates with a shared service secret instead.
 *  2. A human admin in the dashboard, holding a valid Clerk token and passing
 *     the admin check.
 *
 * Anything else is rejected. Previously this route was guarded only by an
 * unverified `x-user-id` header compared against a UID that is also published
 * to the browser bundle, which made it effectively open.
 */
export const ingestionAuthMiddleware = createMiddleware<Env>(async (c, next) => {
  const cronSecret = process.env.CRON_SECRET;
  const token = extractBearerToken(c.req.header("Authorization"));

  if (cronSecret && token && timingSafeEqual(token, cronSecret)) {
    c.set("user", null);
    // The scheduler is not a user; identify it as the service it is.
    c.set("userId", "service:cron");
    logger.debug("Ingestion authenticated via service token");
    return next();
  }

  // Otherwise require a real admin session.
  await authMiddleware(c, async () => {
    await adminMiddleware(c, next);
  });
});

/**
 * Constant-time string comparison, to keep secret checks free of timing leaks.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
