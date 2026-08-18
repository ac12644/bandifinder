/**
 * Input Sanitization Middleware
 *
 * Protects against:
 * - XSS attacks
 * - SQL injection patterns
 * - NoSQL injection
 * - Command injection
 * - Prompt injection (LLM-specific)
 */

import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../app";

// ============================================================================
// DANGEROUS PATTERNS
// ============================================================================

const INJECTION_PATTERNS = {
  // SQL Injection patterns
  sql: [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE|TRUNCATE)\b)/i,
    /('|")\s*(OR|AND)\s*('|"|\d)/i,
    /;\s*--/,
    /\/\*[\s\S]*?\*\//,
  ],

  // NoSQL Injection patterns
  nosql: [
    /\$where\s*:/i,
    /\$regex\s*:/i,
    /\$gt\s*:/i,
    /\$ne\s*:/i,
    /\{\s*\$\w+/,
  ],

  // Command injection patterns
  command: [
    /[;&|`$]|\$\(/,
    /\b(eval|exec|system|spawn|fork)\s*\(/i,
    /\|\||\&\&/,
  ],

  // XSS patterns
  xss: [
    /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
    /javascript\s*:/gi,
    /on\w+\s*=/gi,
    /<iframe/gi,
    /<object/gi,
    /<embed/gi,
  ],

  // Prompt injection patterns (LLM-specific)
  promptInjection: [
    /ignore\s+(previous|above|all)\s+(instructions?|prompts?)/gi,
    /disregard\s+(previous|above|all)/gi,
    /new\s+instructions?:/gi,
    /system\s*:\s*you\s+are/gi,
    /\[INST\]|\[\/INST\]/gi,
    /<<SYS>>|<\/SYS>>/gi,
    /forget\s+(everything|all|your)/gi,
    /pretend\s+(you|to\s+be)/gi,
    /roleplay\s+as/gi,
    /act\s+as\s+if/gi,
    /jailbreak/gi,
    /DAN\s+mode/gi,
  ],
};

// ============================================================================
// SANITIZATION FUNCTIONS
// ============================================================================

/**
 * Check if a string contains dangerous patterns.
 */
function containsDangerousPattern(
  value: string,
  category: keyof typeof INJECTION_PATTERNS
): { detected: boolean; pattern?: string } {
  const patterns = INJECTION_PATTERNS[category];

  for (const pattern of patterns) {
    if (pattern.test(value)) {
      return { detected: true, pattern: pattern.source };
    }
  }

  return { detected: false };
}

/**
 * Recursively check an object for dangerous patterns.
 */
function scanObject(
  obj: unknown,
  path: string[] = []
): { safe: boolean; violations: { path: string; category: string; pattern: string }[] } {
  const violations: { path: string; category: string; pattern: string }[] = [];

  if (typeof obj === "string") {
    for (const category of Object.keys(INJECTION_PATTERNS) as Array<keyof typeof INJECTION_PATTERNS>) {
      const result = containsDangerousPattern(obj, category);
      if (result.detected) {
        violations.push({
          path: path.join(".") || "root",
          category,
          pattern: result.pattern || "unknown",
        });
      }
    }
  } else if (Array.isArray(obj)) {
    obj.forEach((item, index) => {
      const result = scanObject(item, [...path, `[${index}]`]);
      violations.push(...result.violations);
    });
  } else if (obj && typeof obj === "object") {
    for (const [key, value] of Object.entries(obj)) {
      const result = scanObject(value, [...path, key]);
      violations.push(...result.violations);
    }
  }

  return { safe: violations.length === 0, violations };
}

/**
 * Sanitize a string by removing dangerous characters.
 */
function sanitizeString(value: string): string {
  return value
    .replace(/<[^>]*>/g, "") // Remove HTML tags
    .replace(/[<>"'`]/g, "") // Remove dangerous characters
    .trim();
}

// ============================================================================
// MIDDLEWARE
// ============================================================================

export interface SanitizationConfig {
  /** Whether to block requests with detected patterns (default: true) */
  blockOnDetection: boolean;
  /** Categories to check (default: all) */
  categories: Array<keyof typeof INJECTION_PATTERNS>;
  /** Paths to skip sanitization */
  skipPaths: string[];
  /** Log violations */
  logViolations: boolean;
}

const DEFAULT_CONFIG: SanitizationConfig = {
  blockOnDetection: true,
  categories: ["sql", "nosql", "command", "xss", "promptInjection"],
  skipPaths: ["/health", "/"],
  logViolations: true,
};

/**
 * Input sanitization middleware.
 */
export function sanitizationMiddleware(config: Partial<SanitizationConfig> = {}) {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  return createMiddleware<Env>(async (c, next) => {
    const path = c.req.path;

    // Skip excluded paths
    if (finalConfig.skipPaths.some((p) => path.startsWith(p))) {
      return next();
    }

    // Check query parameters
    const queryParams = c.req.query();
    const queryResult = scanObject(queryParams);

    if (!queryResult.safe) {
      if (finalConfig.logViolations) {
        console.warn("[Sanitization] Query param violation:", {
          path,
          violations: queryResult.violations,
          ip: c.req.header("x-forwarded-for")?.split(",")[0],
          userId: c.get("userId"),
        });
      }

      if (finalConfig.blockOnDetection) {
        throw new HTTPException(400, {
          message: "Request contains potentially malicious content",
        });
      }
    }

    // Check request body for POST/PUT/PATCH
    if (["POST", "PUT", "PATCH"].includes(c.req.method)) {
      try {
        const body = await c.req.json();
        const bodyResult = scanObject(body);

        if (!bodyResult.safe) {
          if (finalConfig.logViolations) {
            console.warn("[Sanitization] Request body violation:", {
              path,
              method: c.req.method,
              violations: bodyResult.violations,
              ip: c.req.header("x-forwarded-for")?.split(",")[0],
              userId: c.get("userId"),
            });
          }

          if (finalConfig.blockOnDetection) {
            throw new HTTPException(400, {
              message: "Request contains potentially malicious content",
            });
          }
        }
      } catch (e) {
        // Body parsing failed or already handled
        if (e instanceof HTTPException) throw e;
      }
    }

    return next();
  });
}

/**
 * Prompt-specific sanitization for LLM inputs.
 */
export function sanitizePrompt(input: string): {
  sanitized: string;
  wasModified: boolean;
  detectedPatterns: string[];
} {
  const detectedPatterns: string[] = [];
  let sanitized = input;

  for (const pattern of INJECTION_PATTERNS.promptInjection) {
    if (pattern.test(sanitized)) {
      detectedPatterns.push(pattern.source);
      sanitized = sanitized.replace(pattern, "[FILTERED]");
    }
  }

  return {
    sanitized,
    wasModified: detectedPatterns.length > 0,
    detectedPatterns,
  };
}

// Export patterns for testing
export { INJECTION_PATTERNS };
