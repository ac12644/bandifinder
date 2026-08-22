/**
 * Observability Module
 *
 * Enterprise-grade observability stack:
 * - Structured JSON logging with log levels and redaction
 * - Prometheus-compatible metrics collection
 *
 * Distributed tracing is Sentry's job (see `instrument.ts`); this module only
 * propagates the trace id so log lines can be correlated with a Sentry trace.
 *
 * Usage:
 * ```typescript
 * import { logger, metrics, observabilityMiddleware } from "./lib/observability";
 *
 * logger.info("Processing request", { tenderId: "TED-123" });
 * recordHttpRequest("GET", "/tenders", 200, 150);
 * ```
 */

// Logger exports
export {
  logger,
  generateTraceId,
  generateRequestId,
  type LogLevel,
  type LogContext,
  type LogEntry,
} from "./logger";

// Metrics exports
export {
  metrics,
  recordHttpRequest,
  updateHealthGauge,
  type Counter,
  type Histogram,
  type Gauge,
  type MetricSnapshot,
} from "./metrics";


// ============================================================================
// OBSERVABILITY MIDDLEWARE
// ============================================================================

import * as Sentry from "@sentry/node";
import { createMiddleware } from "hono/factory";
import type { Env } from "../../app";
import { logger, generateRequestId, generateTraceId } from "./logger";
import { recordHttpRequest } from "./metrics";

/**
 * Configuration for observability middleware.
 */
export interface ObservabilityConfig {
  /** Enable request logging */
  logging?: boolean;
  /** Enable metrics collection */
  metrics?: boolean;
  /** Paths to skip (e.g., health checks) */
  skipPaths?: string[];
}

const DEFAULT_CONFIG: ObservabilityConfig = {
  logging: true,
  metrics: true,
  skipPaths: ["/health", "/"],
};

/**
 * Create observability middleware for Hono.
 * Adds request ID, trace ID, logging and metrics to each request.
 */
export function observabilityMiddleware(config: ObservabilityConfig = {}) {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  return createMiddleware<Env>(async (c, next) => {
    const path = c.req.path;
    const method = c.req.method;

    // Skip configured paths
    if (finalConfig.skipPaths?.some((p) => path === p || path.startsWith(p + "/"))) {
      return next();
    }

    // Generate IDs
    const requestId = generateRequestId();
    const existingTraceId = c.req.header("traceparent")?.split("-")[1];
    const traceId = existingTraceId || generateTraceId();

    // Set response headers
    c.header("X-Request-ID", requestId);
    c.header("X-Trace-ID", traceId);

    // Start timing
    const startTime = Date.now();

    // Set Sentry user context
    const userId = c.get("userId");
    if (userId) {
      Sentry.setUser({ id: userId });
    }

    // Create request-scoped logger
    const requestLogger = logger.child({
      requestId,
      traceId,
      method,
      path,
      userId,
    });

    // Log request start
    if (finalConfig.logging) {
      requestLogger.info(`→ ${method} ${path}`);
    }

    try {
      // Execute request
      await next();

      // Calculate duration
      const duration = Date.now() - startTime;
      const status = c.res.status;

      // Record metrics
      if (finalConfig.metrics) {
        recordHttpRequest(method, path, status, duration);
      }

      // Log request completion
      if (finalConfig.logging) {
        if (status >= 500) {
          requestLogger.error(`← ${method} ${path} ${status}`, undefined, { duration, status });
        } else if (status >= 400) {
          requestLogger.warn(`← ${method} ${path} ${status}`, { duration, status });
        } else {
          requestLogger.info(`← ${method} ${path} ${status}`, { duration, status });
        }
      }
    } catch (error) {
      // Calculate duration
      const duration = Date.now() - startTime;

      // Record error metrics
      if (finalConfig.metrics) {
        recordHttpRequest(method, path, 500, duration);
      }

      // Log error
      if (finalConfig.logging) {
        requestLogger.error(`✗ ${method} ${path} Error`, error as Error, { duration });
      }

      // Send to Sentry
      Sentry.captureException(error);

      throw error;
    }
  });
}


// ============================================================================
// METRICS ENDPOINT HELPERS
// ============================================================================

import { metrics } from "./metrics";

/**
 * Get metrics in JSON format.
 */
export function getMetricsJson() {
  return metrics.getSnapshot();
}

/**
 * Get metrics in Prometheus format.
 */
export function getMetricsPrometheus(): string {
  return metrics.toPrometheus();
}
