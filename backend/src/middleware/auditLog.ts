/**
 * Audit Logging Middleware
 *
 * Enterprise-grade audit trail for:
 * - All API requests
 * - Authentication events
 * - Data access patterns
 * - Security incidents
 * - Compliance tracking (GDPR, etc.)
 */

import { createMiddleware } from "hono/factory";
import type { Env } from "../app";

// ============================================================================
// AUDIT LOG TYPES
// ============================================================================

export type AuditAction =
  | "request"
  | "auth_success"
  | "auth_failure"
  | "data_access"
  | "data_modify"
  | "data_delete"
  | "export"
  | "search"
  | "agent_invoke"
  | "error"
  | "security_violation"
  | "rate_limit_exceeded";

export type AuditSeverity = "info" | "warning" | "error" | "critical";

export interface AuditLogEntry {
  // Identifiers
  id: string;
  timestamp: string;

  // Request context
  requestId: string;
  method: string;
  path: string;
  query?: Record<string, string>;

  // User context
  userId?: string;
  userEmail?: string;
  ipAddress: string;
  userAgent?: string;

  // Action details
  action: AuditAction;
  severity: AuditSeverity;
  resource?: string;
  resourceId?: string;

  // Response
  statusCode?: number;
  responseTimeMs?: number;

  // Additional context
  metadata?: Record<string, unknown>;

  // Error details
  errorMessage?: string;
  errorStack?: string;
}

// ============================================================================
// AUDIT LOG STORAGE
// ============================================================================

/**
 * Audit log storage interface.
 * Implement this for different backends (console, file, database, etc.)
 */
export interface AuditLogStorage {
  write(entry: AuditLogEntry): Promise<void>;
  query?(filters: Partial<AuditLogEntry>): Promise<AuditLogEntry[]>;
}

/**
 * Console audit log storage (default).
 */
class ConsoleAuditStorage implements AuditLogStorage {
  async write(entry: AuditLogEntry): Promise<void> {
    const { severity, action, method, path, userId, statusCode, responseTimeMs } = entry;

    const logLevel = severity === "critical" || severity === "error" ? "error" :
                     severity === "warning" ? "warn" : "log";

    const emoji = {
      info: "📝",
      warning: "⚠️",
      error: "❌",
      critical: "🚨",
    }[severity];

    console[logLevel](
      `${emoji} [Audit] ${action.toUpperCase()} ${method} ${path}`,
      {
        userId: userId || "anon",
        status: statusCode,
        duration: responseTimeMs ? `${responseTimeMs}ms` : undefined,
        ...entry.metadata,
      }
    );
  }
}

/**
 * In-memory audit log storage (for development/testing).
 */
class InMemoryAuditStorage implements AuditLogStorage {
  private logs: AuditLogEntry[] = [];
  private maxSize = 10000;

  async write(entry: AuditLogEntry): Promise<void> {
    this.logs.push(entry);

    // Rotate logs if exceeding max size
    if (this.logs.length > this.maxSize) {
      this.logs = this.logs.slice(-this.maxSize / 2);
    }
  }

  async query(filters: Partial<AuditLogEntry>): Promise<AuditLogEntry[]> {
    return this.logs.filter((entry) => {
      for (const [key, value] of Object.entries(filters)) {
        if (entry[key as keyof AuditLogEntry] !== value) {
          return false;
        }
      }
      return true;
    });
  }

  getAll(): AuditLogEntry[] {
    return [...this.logs];
  }

  clear(): void {
    this.logs = [];
  }
}

// ============================================================================
// AUDIT LOG MANAGER
// ============================================================================

class AuditLogManager {
  private storage: AuditLogStorage;
  private enabled: boolean = true;

  constructor(storage?: AuditLogStorage) {
    this.storage = storage || new ConsoleAuditStorage();
  }

  setStorage(storage: AuditLogStorage): void {
    this.storage = storage;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  async log(entry: Omit<AuditLogEntry, "id" | "timestamp">): Promise<void> {
    if (!this.enabled) return;

    const fullEntry: AuditLogEntry = {
      id: generateAuditId(),
      timestamp: new Date().toISOString(),
      ...entry,
    };

    await this.storage.write(fullEntry);
  }

  async query(filters: Partial<AuditLogEntry>): Promise<AuditLogEntry[]> {
    if (this.storage.query) {
      return this.storage.query(filters);
    }
    return [];
  }
}

// Generate unique audit ID
function generateAuditId(): string {
  return `audit_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// Generate request ID
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// Global audit manager instance
export const auditManager = new AuditLogManager();

// In-memory storage for development
export const inMemoryAuditStorage = new InMemoryAuditStorage();

// ============================================================================
// MIDDLEWARE
// ============================================================================

export interface AuditConfig {
  /** Enable audit logging */
  enabled: boolean;
  /** Log all requests (not just errors) */
  logAllRequests: boolean;
  /** Paths to skip */
  skipPaths: string[];
  /** Include request body in logs (careful with PII) */
  includeBody: boolean;
  /** Include query params in logs */
  includeQuery: boolean;
  /** Custom action classifier */
  classifyAction?: (method: string, path: string) => AuditAction;
}

const DEFAULT_CONFIG: AuditConfig = {
  enabled: true,
  logAllRequests: true,
  skipPaths: ["/health"],
  includeBody: false,
  includeQuery: true,
};

/**
 * Classify request action based on method and path.
 */
function defaultClassifyAction(method: string, path: string): AuditAction {
  // Agent invocations
  if (path.includes("/agent/")) {
    return "agent_invoke";
  }

  // Search operations
  if (path.includes("/search") || path.includes("/tenders") && method === "GET") {
    return "search";
  }

  // Export operations
  if (path.includes("/export")) {
    return "export";
  }

  // Data modifications
  if (method === "POST" || method === "PUT" || method === "PATCH") {
    return "data_modify";
  }

  // Data deletions
  if (method === "DELETE") {
    return "data_delete";
  }

  // Data access
  if (method === "GET") {
    return "data_access";
  }

  return "request";
}

/**
 * Determine severity based on status code and action.
 */
function determineSeverity(statusCode: number, action: AuditAction): AuditSeverity {
  if (action === "security_violation") return "critical";
  if (action === "auth_failure") return "warning";
  if (action === "rate_limit_exceeded") return "warning";
  if (statusCode >= 500) return "error";
  if (statusCode >= 400) return "warning";
  return "info";
}

/**
 * Audit logging middleware.
 */
export function auditLogMiddleware(config: Partial<AuditConfig> = {}) {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  return createMiddleware<Env>(async (c, next) => {
    if (!finalConfig.enabled) {
      return next();
    }

    const path = c.req.path;

    // Skip excluded paths
    if (finalConfig.skipPaths.some((p) => path.startsWith(p))) {
      return next();
    }

    const startTime = Date.now();
    const requestId = generateRequestId();

    // Add request ID to response headers
    c.header("X-Request-ID", requestId);

    // Extract context
    const method = c.req.method;
    const userId = c.get("userId");
    const ipAddress = c.req.header("x-forwarded-for")?.split(",")[0] ||
                      c.req.header("x-real-ip") ||
                      "unknown";
    const userAgent = c.req.header("user-agent");

    // Classify action
    const action = finalConfig.classifyAction
      ? finalConfig.classifyAction(method, path)
      : defaultClassifyAction(method, path);

    let statusCode = 200;
    let errorMessage: string | undefined;

    try {
      await next();
      statusCode = c.res.status;
    } catch (error) {
      statusCode = 500;
      errorMessage = error instanceof Error ? error.message : "Unknown error";
      throw error;
    } finally {
      const responseTimeMs = Date.now() - startTime;
      const severity = determineSeverity(statusCode, action);

      // Log if enabled and (logging all or there's an issue)
      if (finalConfig.logAllRequests || severity !== "info") {
        await auditManager.log({
          requestId,
          method,
          path,
          query: finalConfig.includeQuery ? c.req.query() : undefined,
          userId,
          ipAddress,
          userAgent,
          action,
          severity,
          statusCode,
          responseTimeMs,
          errorMessage,
          metadata: {
            contentType: c.req.header("content-type"),
          },
        });
      }
    }
  });
}

// ============================================================================
// HELPER FUNCTIONS FOR MANUAL LOGGING
// ============================================================================

/**
 * Log a security violation.
 */
export async function logSecurityViolation(
  requestId: string,
  userId: string | undefined,
  ipAddress: string,
  reason: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  await auditManager.log({
    requestId,
    method: "N/A",
    path: "N/A",
    userId,
    ipAddress,
    action: "security_violation",
    severity: "critical",
    errorMessage: reason,
    metadata,
  });
}

/**
 * Log an authentication event.
 */
export async function logAuthEvent(
  success: boolean,
  userId: string | undefined,
  ipAddress: string,
  method: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  await auditManager.log({
    requestId: generateRequestId(),
    method,
    path: "/auth",
    userId,
    ipAddress,
    action: success ? "auth_success" : "auth_failure",
    severity: success ? "info" : "warning",
    metadata,
  });
}
