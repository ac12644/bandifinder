/**
 * PII Detection Middleware
 *
 * Detects and optionally redacts Personally Identifiable Information:
 * - Email addresses
 * - Phone numbers
 * - Credit card numbers
 * - Italian fiscal codes (Codice Fiscale)
 * - VAT numbers (Partita IVA)
 * - IBAN numbers
 * - Social security numbers
 * - IP addresses
 */

import { createMiddleware } from "hono/factory";
import type { Env } from "../app";

// ============================================================================
// PII PATTERNS
// ============================================================================

export const PII_PATTERNS = {
  // Email addresses
  email: {
    pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    description: "Email address",
    sensitivity: "medium" as const,
  },

  // Phone numbers (international format)
  phone: {
    pattern: /(\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g,
    description: "Phone number",
    sensitivity: "medium" as const,
  },

  // Credit card numbers (major providers)
  creditCard: {
    pattern: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/g,
    description: "Credit card number",
    sensitivity: "high" as const,
  },

  // Italian Codice Fiscale
  codiceFiscale: {
    pattern: /\b[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]\b/gi,
    description: "Italian Fiscal Code (Codice Fiscale)",
    sensitivity: "high" as const,
  },

  // Italian Partita IVA
  partitaIva: {
    pattern: /\b(IT)?\d{11}\b/g,
    description: "Italian VAT Number (Partita IVA)",
    sensitivity: "medium" as const,
  },

  // IBAN (European)
  iban: {
    pattern: /\b[A-Z]{2}\d{2}[A-Z0-9]{4,30}\b/g,
    description: "IBAN",
    sensitivity: "high" as const,
  },

  // US Social Security Number
  ssn: {
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
    description: "Social Security Number",
    sensitivity: "high" as const,
  },

  // IP Address (IPv4)
  ipAddress: {
    pattern: /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,
    description: "IP Address",
    sensitivity: "low" as const,
  },

  // Passport numbers (generic)
  passport: {
    pattern: /\b[A-Z]{1,2}\d{6,9}\b/g,
    description: "Passport number",
    sensitivity: "high" as const,
  },
};

export type PIICategory = keyof typeof PII_PATTERNS;
export type PIISensitivity = "low" | "medium" | "high";

// ============================================================================
// DETECTION FUNCTIONS
// ============================================================================

export interface PIIDetection {
  category: PIICategory;
  description: string;
  sensitivity: PIISensitivity;
  value: string;
  redacted: string;
  path: string;
}

/**
 * Detect PII in a string value.
 */
function detectPIIInString(
  value: string,
  path: string,
  categories: PIICategory[]
): PIIDetection[] {
  const detections: PIIDetection[] = [];

  for (const category of categories) {
    const config = PII_PATTERNS[category];
    const matches = value.match(config.pattern);

    if (matches) {
      for (const match of matches) {
        detections.push({
          category,
          description: config.description,
          sensitivity: config.sensitivity,
          value: match,
          redacted: redactValue(match, category),
          path,
        });
      }
    }
  }

  return detections;
}

/**
 * Redact a PII value based on its category.
 */
function redactValue(value: string, category: PIICategory): string {
  const length = value.length;

  switch (category) {
    case "email": {
      const [local, domain] = value.split("@");
      return `${local.substring(0, 2)}***@${domain}`;
    }
    case "phone":
      return `***-***-${value.slice(-4)}`;
    case "creditCard":
      return `****-****-****-${value.slice(-4)}`;
    case "codiceFiscale":
      return `${value.substring(0, 3)}***${value.slice(-3)}`;
    case "partitaIva":
      return `***${value.slice(-4)}`;
    case "iban":
      return `${value.substring(0, 4)}****${value.slice(-4)}`;
    case "ssn":
      return `***-**-${value.slice(-4)}`;
    case "ipAddress":
      return `***.***.***.${value.split(".").pop()}`;
    case "passport":
      return `${value.substring(0, 2)}****${value.slice(-2)}`;
    default:
      return "*".repeat(length);
  }
}

/**
 * Recursively scan an object for PII.
 */
function scanObjectForPII(
  obj: unknown,
  categories: PIICategory[],
  path: string[] = []
): PIIDetection[] {
  const detections: PIIDetection[] = [];

  if (typeof obj === "string") {
    detections.push(...detectPIIInString(obj, path.join(".") || "root", categories));
  } else if (Array.isArray(obj)) {
    obj.forEach((item, index) => {
      detections.push(...scanObjectForPII(item, categories, [...path, `[${index}]`]));
    });
  } else if (obj && typeof obj === "object") {
    for (const [key, value] of Object.entries(obj)) {
      detections.push(...scanObjectForPII(value, categories, [...path, key]));
    }
  }

  return detections;
}

/**
 * Redact PII from a string.
 */
export function redactPII(
  value: string,
  categories: PIICategory[] = Object.keys(PII_PATTERNS) as PIICategory[]
): string {
  let result = value;

  for (const category of categories) {
    const config = PII_PATTERNS[category];
    result = result.replace(config.pattern, (match) => redactValue(match, category));
  }

  return result;
}

// ============================================================================
// MIDDLEWARE
// ============================================================================

export interface PIIDetectionConfig {
  /** Categories to detect (default: all) */
  categories: PIICategory[];
  /** Minimum sensitivity level to flag (default: "medium") */
  minSensitivity: PIISensitivity;
  /** Log detections */
  logDetections: boolean;
  /** Block requests with high-sensitivity PII */
  blockHighSensitivity: boolean;
  /** Paths to skip */
  skipPaths: string[];
}

const DEFAULT_CONFIG: PIIDetectionConfig = {
  categories: Object.keys(PII_PATTERNS) as PIICategory[],
  minSensitivity: "medium",
  logDetections: true,
  blockHighSensitivity: false,
  skipPaths: ["/health", "/"],
};

const SENSITIVITY_ORDER: Record<PIISensitivity, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

/**
 * PII detection middleware.
 */
export function piiDetectionMiddleware(config: Partial<PIIDetectionConfig> = {}) {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const minSensitivityLevel = SENSITIVITY_ORDER[finalConfig.minSensitivity];

  return createMiddleware<Env>(async (c, next) => {
    const path = c.req.path;

    // Skip excluded paths
    if (finalConfig.skipPaths.some((p) => path === p || path.startsWith(p + "/"))) {
      return next();
    }

    const allDetections: PIIDetection[] = [];

    // Scan query parameters
    const queryParams = c.req.query();
    allDetections.push(...scanObjectForPII(queryParams, finalConfig.categories));

    // Scan request body
    if (["POST", "PUT", "PATCH"].includes(c.req.method)) {
      try {
        const body = await c.req.json();
        allDetections.push(...scanObjectForPII(body, finalConfig.categories));
      } catch {
        // Body parsing failed, skip
      }
    }

    // Filter by sensitivity
    const flaggedDetections = allDetections.filter(
      (d) => SENSITIVITY_ORDER[d.sensitivity] >= minSensitivityLevel
    );

    if (flaggedDetections.length > 0) {
      if (finalConfig.logDetections) {
        console.warn("[PII Detection] Sensitive data detected:", {
          path,
          method: c.req.method,
          userId: c.get("userId"),
          detections: flaggedDetections.map((d) => ({
            category: d.category,
            description: d.description,
            sensitivity: d.sensitivity,
            path: d.path,
            redacted: d.redacted,
          })),
        });
      }

      // Add header with PII warning
      c.header("X-PII-Detected", "true");
      c.header(
        "X-PII-Categories",
        [...new Set(flaggedDetections.map((d) => d.category))].join(",")
      );

      // Optionally block high-sensitivity PII
      if (finalConfig.blockHighSensitivity) {
        const highSensitivity = flaggedDetections.filter((d) => d.sensitivity === "high");
        if (highSensitivity.length > 0) {
          return c.json(
            {
              error: "Request contains sensitive personal information",
              message: "Please remove or redact sensitive data before submitting",
              categories: [...new Set(highSensitivity.map((d) => d.category))],
            },
            400
          );
        }
      }
    }

    return next();
  });
}
