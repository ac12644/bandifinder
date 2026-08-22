/**
 * Security Middleware Stack
 *
 * Enterprise-grade security middleware for:
 * - Rate limiting
 * - Input sanitization (XSS, SQL injection, prompt injection)
 * - PII detection
 * - Audit logging
 * - Authentication
 */

// Core middleware
export { rateLimitMiddleware, rateLimits } from "./rateLimit";
export {
  sanitizationMiddleware,
  sanitizePrompt,
  INJECTION_PATTERNS,
} from "./sanitization";
export {
  piiDetectionMiddleware,
  redactPII,
  PII_PATTERNS,
  type PIICategory,
  type PIIDetection,
} from "./piiDetection";
export {
  auditLogMiddleware,
  auditManager,
  inMemoryAuditStorage,
  logSecurityViolation,
  logAuthEvent,
  type AuditLogEntry,
  type AuditAction,
  type AuditSeverity,
} from "./auditLog";
export {
  authMiddleware,
  optionalAuthMiddleware,
  adminMiddleware,
  ingestionAuthMiddleware,
  type AuthenticatedUser,
} from "./auth";
export {
  requireFeature,
  searchLimitMiddleware,
  checkBidLimit,
} from "./billing";
export {
  guestOrAuthMiddleware,
  requireAccount,
  readGuestProfileHeader,
} from "./guest";

// ============================================================================
// COMBINED SECURITY STACK
// ============================================================================

import { createMiddleware } from "hono/factory";
import type { Env } from "../app";
import { rateLimits } from "./rateLimit";
import { sanitizationMiddleware } from "./sanitization";
import { piiDetectionMiddleware } from "./piiDetection";

/**
 * Security configuration for different endpoint types.
 */
export interface SecurityStackConfig {
  /** Rate limit preset */
  rateLimit?: "standard" | "search" | "agent" | "export" | "none";
  /** Enable input sanitization */
  sanitization?: boolean;
  /** Enable PII detection */
  piiDetection?: boolean;
}

const DEFAULT_SECURITY_CONFIG: SecurityStackConfig = {
  rateLimit: "standard",
  sanitization: true,
  piiDetection: true,
};

/**
 * Create a combined security middleware stack.
 */
export function createSecurityStack(config: SecurityStackConfig = {}) {
  const finalConfig = { ...DEFAULT_SECURITY_CONFIG, ...config };
  const middlewares: ReturnType<typeof createMiddleware<Env>>[] = [];

  // Audit logging is mounted globally in app.ts; adding it here too would
  // write every request twice.

  // Add rate limiting
  if (finalConfig.rateLimit && finalConfig.rateLimit !== "none") {
    middlewares.push(rateLimits[finalConfig.rateLimit]);
  }

  // Add input sanitization
  if (finalConfig.sanitization) {
    middlewares.push(sanitizationMiddleware());
  }

  // Add PII detection
  if (finalConfig.piiDetection) {
    middlewares.push(piiDetectionMiddleware());
  }

  // Return combined middleware
  return createMiddleware<Env>(async (c, next) => {
    for (const middleware of middlewares) {
      let proceeded = false;
      await middleware(c, async () => {
        proceeded = true;
      });
      if (!proceeded) return; // Middleware blocked the request
    }
    return next();
  });
}

// ============================================================================
// PRESET SECURITY STACKS
// ============================================================================

/**
 * Preset security stacks for different endpoint types.
 */
export const securityStacks = {
  /** Standard API endpoints */
  standard: createSecurityStack({
    rateLimit: "standard",
    sanitization: true,
    piiDetection: true,
  }),

  /** Search endpoints - stricter rate limiting */
  search: createSecurityStack({
    rateLimit: "search",
    sanitization: true,
    piiDetection: false, // Search queries may contain names
  }),

  /** Agent endpoints - strict controls */
  agent: createSecurityStack({
    rateLimit: "agent",
    sanitization: true,
    piiDetection: true,
  }),

  /** Export endpoints - strict rate limiting */
  export: createSecurityStack({
    rateLimit: "export",
    sanitization: true,
    piiDetection: true,
  }),


};
