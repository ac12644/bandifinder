/**
 * Guest Access Middleware
 *
 * Lets visitors without an account reach read-only routes, so the product can
 * demonstrate itself before asking anyone to sign up.
 *
 * This deliberately does NOT reintroduce header-based identity. A guest gets
 * its own context type that carries no userId and no organization_id, so no
 * code path can mistake a guest for an authenticated user or resolve it to an
 * organization's data.
 */

import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../app";
import { verifyClerkToken } from "../lib/clerk";
import { parseGuestProfile, type GuestContext } from "../lib/guest";
import { logger } from "../lib/observability";

/** Extract Bearer token from an Authorization header. */
function bearer(authorization: string | undefined): string | null {
  return authorization?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
}

/** Guest ids are opaque; cap the length so they cannot bloat logs or keys. */
const MAX_GUEST_ID_LENGTH = 64;

function readGuestId(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_GUEST_ID_LENGTH) return null;
  // Restrict to an opaque token charset — it ends up in rate-limit keys.
  if (!/^[A-Za-z0-9_-]+$/.test(trimmed)) return null;
  return trimmed;
}

/**
 * Read the guest profile a request carries.
 *
 * Sent as a base64url-encoded JSON header so the same profile can accompany
 * GET requests, which have no body. Oversized or malformed values degrade to
 * "no profile" rather than failing the request.
 */
const MAX_GUEST_PROFILE_HEADER = 4096;

export function readGuestProfileHeader(raw: string | undefined) {
  if (!raw || raw.length > MAX_GUEST_PROFILE_HEADER) return null;

  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    return parseGuestProfile(JSON.parse(json));
  } catch {
    return null;
  }
}

/**
 * Accept either a signed-in user or a guest.
 *
 * Mounted on read-only route groups. A valid Clerk token wins and produces a
 * normal authenticated context; otherwise a guest context is established.
 * Requests with neither are still allowed through as an anonymous guest with
 * no profile, so public browsing works with no client changes at all.
 */
export const guestOrAuthMiddleware = createMiddleware<Env>(async (c, next) => {
  const token = bearer(c.req.header("Authorization"));

  if (token) {
    const result = await verifyClerkToken(token);

    if (result.success && result.user) {
      c.set("user", {
        uid: result.user.userId,
        email: result.user.email,
        emailVerified: true,
        orgId: result.user.orgId,
        orgRole: result.user.orgRole,
        customClaims: result.user.metadata,
      });
      c.set("userId", result.user.userId);
      c.set("guest", undefined);
      return next();
    }

    // A token was presented and is bad. Say so rather than silently
    // downgrading to guest — that would mask expired sessions as "logged out"
    // and hand the user someone else's view of the product.
    if (result.error && !result.error.includes("not configured")) {
      throw new HTTPException(401, {
        message: `Authentication failed: ${result.error}`,
      });
    }
  }

  const guest: GuestContext = {
    id: readGuestId(c.req.header("x-guest-id")) ?? "anonymous",
    profile: readGuestProfileHeader(c.req.header("x-guest-profile")),
  };

  // Never carries identity: a guest has no userId and no organization.
  c.set("user", null);
  c.set("userId", undefined);
  c.set("orgId", undefined);
  c.set("dbUserId", undefined);
  c.set("guest", guest);

  logger.debug("Guest request", {
    guestId: guest.id,
    hasProfile: guest.profile !== null,
  });

  return next();
});

/**
 * Require a real account.
 *
 * Mounted on writes and on anything that persists or exports data. Returns 403
 * with a signup prompt rather than 401, so the client can distinguish "you
 * need an account for this" from "your session expired" and show the right UI.
 */
export const requireAccount = createMiddleware<Env>(async (c, next) => {
  if (c.get("userId")) return next();

  return c.json(
    {
      error: "Registrazione richiesta",
      message:
        "Crea un account gratuito per salvare gare, gestire la pipeline ed esportare i risultati.",
      code: "ACCOUNT_REQUIRED",
    },
    403
  );
});
