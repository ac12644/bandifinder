/**
 * Clerk Authentication Integration
 *
 * Enterprise-grade authentication using Clerk.
 * Provides JWT verification and user management for the Hono.js API.
 */

import { createClerkClient, verifyToken } from "@clerk/backend";
import { logger } from "./observability";

// ============================================================================
// CLERK CLIENT
// ============================================================================

const clerkSecretKey = process.env.CLERK_SECRET_KEY;
const clerkPublishableKey = process.env.CLERK_PUBLISHABLE_KEY;

if (!clerkSecretKey) {
  logger.warn("CLERK_SECRET_KEY not set - auth will use fallback mode");
}

/**
 * Clerk client for admin operations (user management, org management, etc.)
 */
export const clerkClient = clerkSecretKey
  ? createClerkClient({ secretKey: clerkSecretKey })
  : null;

// ============================================================================
// TOKEN VERIFICATION
// ============================================================================

export interface ClerkUser {
  userId: string;
  sessionId: string;
  orgId?: string;
  orgRole?: string;
  orgSlug?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  imageUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface VerifyTokenResult {
  success: boolean;
  user?: ClerkUser;
  error?: string;
}

/**
 * Verify a Clerk JWT token and extract user information.
 *
 * The JWT payload already carries everything request handling needs (user id,
 * org id, org role), so the extra Clerk API round-trip to hydrate email/name is
 * opt-in via `fetchFullUser`. Leaving it off keeps auth to local signature
 * verification and avoids adding a network hop to every request.
 *
 * @param token - The JWT token from the Authorization header
 * @param options.fetchFullUser - Also fetch profile details from the Clerk API
 * @returns Verification result with user info or error
 */
export async function verifyClerkToken(
  token: string,
  options: { fetchFullUser?: boolean } = {}
): Promise<VerifyTokenResult> {
  if (!clerkSecretKey) {
    return {
      success: false,
      error: "Clerk not configured - CLERK_SECRET_KEY missing",
    };
  }

  try {
    // Verify the JWT token
    const payload = await verifyToken(token, {
      secretKey: clerkSecretKey,
      authorizedParties: process.env.CLERK_AUTHORIZED_PARTIES?.split(","),
    });

    // Extract user information from the token
    const user: ClerkUser = {
      userId: payload.sub,
      sessionId: payload.sid || "",
      orgId: payload.org_id,
      orgRole: payload.org_role,
      orgSlug: payload.org_slug,
    };

    // Optionally fetch full user details from Clerk (extra network round-trip)
    if (options.fetchFullUser && clerkClient) {
      try {
        const fullUser = await clerkClient.users.getUser(payload.sub);
        user.email = fullUser.emailAddresses[0]?.emailAddress;
        user.firstName = fullUser.firstName || undefined;
        user.lastName = fullUser.lastName || undefined;
        user.imageUrl = fullUser.imageUrl;
        user.metadata = fullUser.publicMetadata;
      } catch (fetchError) {
        // User details fetch failed, but token is valid
        logger.debug("Could not fetch full user details", { userId: payload.sub });
      }
    }

    logger.debug("Token verified successfully", { userId: user.userId });

    return { success: true, user };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Token verification failed";
    logger.warn("Token verification failed", { error: message });

    return {
      success: false,
      error: message,
    };
  }
}

// ============================================================================
// USER MANAGEMENT HELPERS
// ============================================================================

/**
 * Get a user by their Clerk user ID.
 */
export async function getUser(userId: string) {
  if (!clerkClient) {
    throw new Error("Clerk client not initialized");
  }
  return clerkClient.users.getUser(userId);
}

/**
 * Update user metadata.
 */
export async function updateUserMetadata(
  userId: string,
  publicMetadata?: Record<string, unknown>,
  privateMetadata?: Record<string, unknown>
) {
  if (!clerkClient) {
    throw new Error("Clerk client not initialized");
  }
  return clerkClient.users.updateUser(userId, {
    publicMetadata,
    privateMetadata,
  });
}

/**
 * List users with pagination.
 */
export async function listUsers(options?: {
  limit?: number;
  offset?: number;
  orderBy?: "-created_at" | "+created_at" | "-updated_at" | "+updated_at";
}) {
  if (!clerkClient) {
    throw new Error("Clerk client not initialized");
  }
  return clerkClient.users.getUserList({
    limit: options?.limit || 10,
    offset: options?.offset || 0,
    orderBy: options?.orderBy,
  });
}

// ============================================================================
// ORGANIZATION HELPERS
// ============================================================================

/**
 * Get organization by ID.
 */
export async function getOrganization(orgId: string) {
  if (!clerkClient) {
    throw new Error("Clerk client not initialized");
  }
  return clerkClient.organizations.getOrganization({ organizationId: orgId });
}

/**
 * List organization members.
 */
export async function getOrganizationMembers(orgId: string) {
  if (!clerkClient) {
    throw new Error("Clerk client not initialized");
  }
  return clerkClient.organizations.getOrganizationMembershipList({
    organizationId: orgId,
  });
}

// ============================================================================
// WEBHOOK VERIFICATION
// ============================================================================

import { Webhook } from "svix";

export interface WebhookVerifyResult {
  success: boolean;
  event?: {
    type: string;
    data: Record<string, unknown>;
  };
  error?: string;
}

/**
 * Verify a Clerk webhook payload using Svix.
 *
 * @param payload - Raw request body as string
 * @param headers - Request headers containing svix signature
 * @returns Verification result with event data or error
 */
export async function verifyClerkWebhook(
  payload: string,
  headers: {
    "svix-id": string;
    "svix-timestamp": string;
    "svix-signature": string;
  }
): Promise<WebhookVerifyResult> {
  const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return {
      success: false,
      error: "CLERK_WEBHOOK_SECRET not configured",
    };
  }

  try {
    const wh = new Webhook(webhookSecret);
    const event = wh.verify(payload, {
      "svix-id": headers["svix-id"],
      "svix-timestamp": headers["svix-timestamp"],
      "svix-signature": headers["svix-signature"],
    }) as { type: string; data: Record<string, unknown> };

    return {
      success: true,
      event: {
        type: event.type,
        data: event.data,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook verification failed";
    logger.warn("Webhook verification failed", { error: message });

    return {
      success: false,
      error: message,
    };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export { clerkClient as clerk };
