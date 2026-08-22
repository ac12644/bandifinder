/**
 * Input Sanitization Middleware
 *
 * Protects against:
 * - XSS attacks
 * - Prompt injection (LLM-specific)
 *
 * SQL, NoSQL and command-injection categories used to live here and were
 * removed: there is no raw SQL in this codebase (Supabase parameterises every
 * query), no Mongo, and no eval/child_process, so they guarded nothing while
 * blocking real traffic. `command` matched any string containing & | ; ` or $,
 * and `sql` matched the bare word CREATE — which is also ordinary Italian.
 * Since the middleware blocks on detection, that was a 400 on queries like
 * "opere create dal comune di Milano".
 */

import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../app";

// ============================================================================
// DANGEROUS PATTERNS
// ============================================================================

const INJECTION_PATTERNS = {
  // XSS patterns.
  //
  // Event handlers and javascript: URLs are matched only in the markup
  // position that actually makes them dangerous. Unanchored, `on\w+\s*=`
  // matches any Italian word ending in -one/-zione before an equals sign
  // ("Manutenzione = ordinaria", "Certificazione = ISO 9001"), and
  // `javascript\s*:` matches an IT supplier listing "JavaScript: 5 anni" in
  // their company profile. Both are ordinary content on this platform, and
  // this middleware rejects the whole request on a match.
  xss: [
    /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
    /<[^>]+\son\w+\s*=/gi,
    /(?:href|src|action|formaction)\s*=\s*["'\s]*javascript\s*:/gi,
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
    // These patterns carry the `g` flag (sanitizePrompt needs it to replace
    // every occurrence), which makes `.test()` stateful: it resumes from
    // `lastIndex` and resets to 0 only when it fails. Testing the same payload
    // twice returns true, then false. Without this reset every second attack
    // slips through.
    pattern.lastIndex = 0;
    if (pattern.test(value)) {
      pattern.lastIndex = 0;
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
  categories: ["xss", "promptInjection"],
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
    if (finalConfig.skipPaths.some((p) => path === p || path.startsWith(p + "/"))) {
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
    // Same stateful-`g` hazard as containsDangerousPattern: a bare `.test()`
    // here would skip the replace on every second call.
    pattern.lastIndex = 0;
    if (pattern.test(sanitized)) {
      pattern.lastIndex = 0;
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
