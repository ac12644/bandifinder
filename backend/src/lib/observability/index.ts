/**
 * Observability Module
 *
 * Enterprise-grade observability stack:
 * - Structured JSON logging with log levels and redaction
 * - Prometheus-compatible metrics collection
 * - Distributed tracing with W3C Trace Context
 *
 * Usage:
 * ```typescript
 * import { logger, metrics, tracer, observabilityMiddleware } from "./lib/observability";
 *
 * // Logging
 * logger.info("Processing request", { tenderId: "TED-123" });
 *
 * // Metrics
 * recordHttpRequest("GET", "/tenders", 200, 150);
 *
 * // Tracing
 * const span = tracer.startTrace("search-tenders");
 * span.setAttribute("query", searchQuery);
 * // ... do work ...
 * span.end();
 * ```
 */

// Logger exports
export {
  logger,
  generateTraceId,
  generateSpanId,
  generateRequestId,
  type LogLevel,
  type LogContext,
  type LogEntry,
} from "./logger";

// Metrics exports
export {
  metrics,
  recordHttpRequest,
  recordAgentExecution,
  recordLLMCall,
  recordExternalApiCall,
  updateHealthGauge,
  updateActiveConnections,
  type Counter,
  type Histogram,
  type Gauge,
  type MetricSnapshot,
} from "./metrics";

// Tracing exports
export {
  tracer,
  traceAsync,
  createAgentSpan,
  createLLMSpan,
  createExternalApiSpan,
  type TraceContext,
  type SpanAttributes,
  type SpanEvent,
  type Span,
} from "./tracing";

// ============================================================================
// OBSERVABILITY MIDDLEWARE
// ============================================================================

import * as Sentry from "@sentry/node";
import { createMiddleware } from "hono/factory";
import type { Env } from "../../app";
import { logger, generateRequestId, generateTraceId } from "./logger";
import { recordHttpRequest } from "./metrics";
import { tracer } from "./tracing";

/**
 * Configuration for observability middleware.
 */
export interface ObservabilityConfig {
  /** Enable request logging */
  logging?: boolean;
  /** Enable metrics collection */
  metrics?: boolean;
  /** Enable distributed tracing */
  tracing?: boolean;
  /** Paths to skip (e.g., health checks) */
  skipPaths?: string[];
}

const DEFAULT_CONFIG: ObservabilityConfig = {
  logging: true,
  metrics: true,
  tracing: true,
  skipPaths: ["/health", "/"],
};

/**
 * Create observability middleware for Hono.
 * Adds request ID, trace ID, logging, metrics, and tracing to each request.
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

    // Start trace span
    let span;
    if (finalConfig.tracing) {
      span = tracer.startTrace(`${method} ${path}`, "server");
      span.setAttributes({
        "http.method": method,
        "http.url": path,
        "http.request_id": requestId,
      });

      if (userId) {
        span.setAttribute("user.id", userId);
      }
    }

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

      // Complete span
      if (span) {
        span.setAttribute("http.status_code", status);
        span.setAttribute("http.response_time_ms", duration);
        if (status >= 400) {
          span.setError();
        } else {
          span.setOk();
        }
        span.end();
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

      // Complete span with error
      if (span) {
        span.setError(error as Error);
        span.end();
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
// AGENT OBSERVABILITY HELPERS
// ============================================================================

import { createAgentSpan, createLLMSpan, createExternalApiSpan } from "./tracing";
import { recordAgentExecution, recordLLMCall, recordExternalApiCall } from "./metrics";

/**
 * Wrap agent execution with observability.
 */
export async function observeAgentExecution<T>(
  agentName: string,
  traceId: string,
  parentSpanId: string | undefined,
  fn: () => Promise<T>,
  metadata?: { qualityScore?: number; reflectionCount?: number }
): Promise<T> {
  const span = createAgentSpan(agentName, traceId, parentSpanId);
  const startTime = Date.now();

  try {
    const result = await fn();
    const duration = Date.now() - startTime;

    span.setOk();
    if (metadata?.qualityScore !== undefined) {
      span.setAttribute("agent.quality_score", metadata.qualityScore);
    }
    if (metadata?.reflectionCount !== undefined) {
      span.setAttribute("agent.reflection_count", metadata.reflectionCount);
    }

    recordAgentExecution(agentName, duration, true, metadata);

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    span.setError(error as Error);
    recordAgentExecution(agentName, duration, false, metadata);
    Sentry.captureException(error);
    throw error;
  } finally {
    span.end();
  }
}

/**
 * Wrap LLM call with observability.
 */
export async function observeLLMCall<T>(
  provider: string,
  model: string,
  traceId: string,
  parentSpanId: string,
  fn: () => Promise<{ result: T; inputTokens: number; outputTokens: number }>
): Promise<T> {
  const span = createLLMSpan(provider, model, traceId, parentSpanId);
  const startTime = Date.now();

  try {
    const { result, inputTokens, outputTokens } = await fn();
    const duration = Date.now() - startTime;

    span.setAttributes({
      "llm.input_tokens": inputTokens,
      "llm.output_tokens": outputTokens,
      "llm.total_tokens": inputTokens + outputTokens,
    });
    span.setOk();

    recordLLMCall(provider, model, duration, inputTokens, outputTokens, true);

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    span.setError(error as Error);
    recordLLMCall(provider, model, duration, 0, 0, false);
    Sentry.captureException(error);
    throw error;
  } finally {
    span.end();
  }
}

/**
 * Wrap external API call with observability.
 */
export async function observeExternalApi<T>(
  api: string,
  endpoint: string,
  traceId: string,
  parentSpanId: string,
  fn: () => Promise<T>
): Promise<T> {
  const span = createExternalApiSpan(api, endpoint, traceId, parentSpanId);
  const startTime = Date.now();

  try {
    const result = await fn();
    const duration = Date.now() - startTime;

    span.setOk();
    recordExternalApiCall(api, endpoint, duration, true);

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    span.setError(error as Error);
    recordExternalApiCall(api, endpoint, duration, false);
    Sentry.captureException(error);
    throw error;
  } finally {
    span.end();
  }
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
