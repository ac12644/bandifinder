/**
 * Scoring Context
 *
 * Resolves the company profile a request should be scored against, for either
 * a signed-in user or a guest.
 *
 * The `clerkUserId -> organization -> profile` lookup was repeated at seven
 * call sites in the tender routes. Centralising it removes that duplication
 * and gives guest support a single place to hook into, rather than seven.
 */

import type { Context } from "hono";
import type { Env } from "../app";
import type { DbCompanyProfile } from "./db/company-profiles";
import { getCompanyProfile } from "./db/company-profiles";
import { getUserByClerkId } from "./db/users";
import { isGuestProfile } from "./guest";

export interface ScoringContext {
  /** Profile to score against, or null when none is available. */
  profile: DbCompanyProfile | null;
  /** Organization id, present only for signed-in users. */
  orgId?: string;
  /** True when the profile came from a guest and must not be persisted. */
  isGuest: boolean;
}

/**
 * Resolve the profile for the current request.
 *
 * Signed-in users get their organization's stored profile. Guests get the
 * profile supplied with the request, which is never written to the database —
 * `orgId` stays undefined for them, so score caching is skipped rather than
 * being keyed on a fabricated organization.
 */
export async function resolveScoringContext(
  c: Context<Env>
): Promise<ScoringContext> {
  const clerkUserId = c.get("userId");

  if (clerkUserId) {
    const dbUser = await getUserByClerkId(clerkUserId);
    const orgId = dbUser?.organization_id ?? undefined;
    const profile = orgId ? await getCompanyProfile(orgId) : null;
    return { profile, orgId, isGuest: false };
  }

  const guest = c.get("guest");
  return { profile: guest?.profile ?? null, isGuest: true };
}

/**
 * Whether a computed score may be cached for this context.
 *
 * Guest profiles are per-request and unauthenticated, so caching them would
 * both be meaningless and risk a guest's input being served to someone else.
 */
export function canCacheScore(ctx: ScoringContext): ctx is ScoringContext & {
  orgId: string;
} {
  return (
    !ctx.isGuest &&
    typeof ctx.orgId === "string" &&
    ctx.profile !== null &&
    !isGuestProfile(ctx.profile)
  );
}
