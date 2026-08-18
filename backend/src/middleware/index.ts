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
import { auditLogMiddleware } from "./auditLog";

/**
 * Security configuration for different endpoint types.
 */
export interface SecurityStackConfig {
  /** Rate limit preset */
  rateLimit?: "standard" | "search" | "agent" | "export" | "auth" | "none";
  /** Enable input sanitization */
  sanitization?: boolean;
  /** Enable PII detection */
  piiDetection?: boolean;
  /** Block high-sensitivity PII */
  blockPII?: boolean;
  /** Enable audit logging */
  auditLogging?: boolean;
}

const DEFAULT_SECURITY_CONFIG: SecurityStackConfig = {
  rateLimit: "standard",
  sanitization: true,
  piiDetection: true,
  blockPII: false,
  auditLogging: true,
};

/**
 * Create a combined security middleware stack.
 */
export function createSecurityStack(config: SecurityStackConfig = {}) {
  const finalConfig = { ...DEFAULT_SECURITY_CONFIG, ...config };
  const middlewares: ReturnType<typeof createMiddleware<Env>>[] = [];

  // Add audit logging first (captures all requests)
  if (finalConfig.auditLogging) {
    middlewares.push(auditLogMiddleware());
  }

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
    middlewares.push(
      piiDetectionMiddleware({
        blockHighSensitivity: finalConfig.blockPII,
      })
    );
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
    auditLogging: true,
  }),

  /** Search endpoints - stricter rate limiting */
  search: createSecurityStack({
    rateLimit: "search",
    sanitization: true,
    piiDetection: false, // Search queries may contain names
    auditLogging: true,
  }),

  /** Agent endpoints - strict controls */
  agent: createSecurityStack({
    rateLimit: "agent",
    sanitization: true,
    piiDetection: true,
    blockPII: false, // Don't block, but log
    auditLogging: true,
  }),

  /** Export endpoints - strict rate limiting */
  export: createSecurityStack({
    rateLimit: "export",
    sanitization: true,
    piiDetection: true,
    auditLogging: true,
  }),

  /** Auth endpoints - very strict */
  auth: createSecurityStack({
    rateLimit: "auth",
    sanitization: true,
    piiDetection: true,
    blockPII: true, // Block PII in auth requests
    auditLogging: true,
  }),

  /** Health/info endpoints - minimal */
  health: createSecurityStack({
    rateLimit: "none",
    sanitization: false,
    piiDetection: false,
    auditLogging: false,
  }),
};
