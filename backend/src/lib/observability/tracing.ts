/**
 * Distributed Tracing
 *
 * Trace context propagation and span management for:
 * - Request tracing across services
 * - Agent execution spans
 * - LLM call spans
 * - External API call spans
 *
 * Compatible with:
 * - OpenTelemetry
 * - W3C Trace Context
 * - LangSmith
 */

import { logger, generateTraceId, generateSpanId } from "./logger";

// ============================================================================
// TYPES
// ============================================================================

export interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  sampled: boolean;
}

export interface SpanAttributes {
  [key: string]: string | number | boolean | undefined;
}

export interface SpanEvent {
  name: string;
  timestamp: string;
  attributes?: SpanAttributes;
}

export interface Span {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: "internal" | "server" | "client" | "producer" | "consumer";
  startTime: string;
  endTime?: string;
  duration?: number;
  status: "ok" | "error" | "unset";
  attributes: SpanAttributes;
  events: SpanEvent[];
}

// ============================================================================
// SPAN BUILDER
// ============================================================================

class SpanBuilder {
  private span: Span;
  private startTimestamp: number;

  constructor(
    name: string,
    traceId: string,
    parentSpanId?: string,
    kind: Span["kind"] = "internal"
  ) {
    this.startTimestamp = Date.now();
    this.span = {
      traceId,
      spanId: generateSpanId(),
      parentSpanId,
      name,
      kind,
      startTime: new Date(this.startTimestamp).toISOString(),
      status: "unset",
      attributes: {},
      events: [],
    };
  }

  /**
   * Set span attribute.
   */
  setAttribute(key: string, value: string | number | boolean): this {
    this.span.attributes[key] = value;
    return this;
  }

  /**
   * Set multiple attributes.
   */
  setAttributes(attributes: SpanAttributes): this {
    Object.assign(this.span.attributes, attributes);
    return this;
  }

  /**
   * Add an event to the span.
   */
  addEvent(name: string, attributes?: SpanAttributes): this {
    this.span.events.push({
      name,
      timestamp: new Date().toISOString(),
      attributes,
    });
    return this;
  }

  /**
   * Set span status to OK.
   */
  setOk(): this {
    this.span.status = "ok";
    return this;
  }

  /**
   * Set span status to error.
   */
  setError(error?: Error): this {
    this.span.status = "error";
    if (error) {
      this.setAttribute("error.type", error.name);
      this.setAttribute("error.message", error.message);
      if (error.stack) {
        this.setAttribute("error.stack", error.stack.substring(0, 1000));
      }
    }
    return this;
  }

  /**
   * End the span.
   */
  end(): Span {
    const endTimestamp = Date.now();
    this.span.endTime = new Date(endTimestamp).toISOString();
    this.span.duration = endTimestamp - this.startTimestamp;

    if (this.span.status === "unset") {
      this.span.status = "ok";
    }

    // Log span completion
    tracer.recordSpan(this.span);

    return this.span;
  }

  /**
   * Get the span ID for creating child spans.
   */
  getSpanId(): string {
    return this.span.spanId;
  }

  /**
   * Get the trace ID.
   */
  getTraceId(): string {
    return this.span.traceId;
  }
}

// ============================================================================
// TRACER
// ============================================================================

class Tracer {
  private enabled: boolean = true;
  private spans: Span[] = [];
  private maxSpans: number = 10000;
  private exportCallback?: (spans: Span[]) => Promise<void>;

  /**
   * Enable/disable tracing.
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Set export callback for sending spans to external service.
   */
  setExportCallback(callback: (spans: Span[]) => Promise<void>): void {
    this.exportCallback = callback;
  }

  /**
   * Start a new trace.
   */
  startTrace(name: string, kind: Span["kind"] = "server"): SpanBuilder {
    const traceId = generateTraceId();
    return new SpanBuilder(name, traceId, undefined, kind);
  }

  /**
   * Start a child span.
   */
  startSpan(
    name: string,
    traceId: string,
    parentSpanId: string,
    kind: Span["kind"] = "internal"
  ): SpanBuilder {
    return new SpanBuilder(name, traceId, parentSpanId, kind);
  }

  /**
   * Parse trace context from headers (W3C Trace Context format).
   */
  parseTraceContext(traceparent?: string): TraceContext | null {
    if (!traceparent) return null;

    // Format: version-traceId-spanId-flags
    const parts = traceparent.split("-");
    if (parts.length !== 4) return null;

    return {
      traceId: parts[1],
      spanId: parts[2],
      sampled: parts[3] === "01",
    };
  }

  /**
   * Create traceparent header value.
   */
  createTraceparent(context: TraceContext): string {
    const flags = context.sampled ? "01" : "00";
    return `00-${context.traceId}-${context.spanId}-${flags}`;
  }

  /**
   * Record a completed span.
   */
  recordSpan(span: Span): void {
    if (!this.enabled) return;

    this.spans.push(span);

    // Rotate if too many spans
    if (this.spans.length > this.maxSpans) {
      const toExport = this.spans.splice(0, this.maxSpans / 2);
      this.exportSpans(toExport);
    }

    // Log span info
    logger.debug(`Span completed: ${span.name}`, {
      traceId: span.traceId,
      spanId: span.spanId,
      duration: span.duration,
      status: span.status,
    });
  }

  /**
   * Export spans to external service.
   */
  private async exportSpans(spans: Span[]): Promise<void> {
    if (this.exportCallback) {
      try {
        await this.exportCallback(spans);
      } catch (error) {
        logger.error("Failed to export spans", error as Error);
      }
    }
  }

  /**
   * Get all recorded spans.
   */
  getSpans(): Span[] {
    return [...this.spans];
  }

  /**
   * Get spans for a specific trace.
   */
  getTraceSpans(traceId: string): Span[] {
    return this.spans.filter((s) => s.traceId === traceId);
  }

  /**
   * Flush and export all pending spans.
   */
  async flush(): Promise<void> {
    const toExport = this.spans.splice(0);
    await this.exportSpans(toExport);
  }

  /**
   * Clear all spans.
   */
  clear(): void {
    this.spans = [];
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

export const tracer = new Tracer();

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Trace an async function execution.
 */
export async function traceAsync<T>(
  name: string,
  traceId: string,
  parentSpanId: string | undefined,
  fn: (span: SpanBuilder) => Promise<T>,
  attributes?: SpanAttributes
): Promise<T> {
  const span = parentSpanId
    ? tracer.startSpan(name, traceId, parentSpanId)
    : tracer.startTrace(name);

  if (attributes) {
    span.setAttributes(attributes);
  }

  try {
    const result = await fn(span);
    span.setOk();
    return result;
  } catch (error) {
    span.setError(error as Error);
    throw error;
  } finally {
    span.end();
  }
}

/**
 * Create agent execution span.
 */
export function createAgentSpan(
  agentName: string,
  traceId: string,
  parentSpanId?: string
): SpanBuilder {
  const span = parentSpanId
    ? tracer.startSpan(`agent.${agentName}`, traceId, parentSpanId)
    : tracer.startTrace(`agent.${agentName}`);

  return span
    .setAttribute("agent.name", agentName)
    .setAttribute("agent.type", "langgraph");
}

/**
 * Create LLM call span.
 */
export function createLLMSpan(
  provider: string,
  model: string,
  traceId: string,
  parentSpanId: string
): SpanBuilder {
  return tracer
    .startSpan(`llm.${provider}`, traceId, parentSpanId, "client")
    .setAttribute("llm.provider", provider)
    .setAttribute("llm.model", model);
}

/**
 * Create external API call span.
 */
export function createExternalApiSpan(
  api: string,
  endpoint: string,
  traceId: string,
  parentSpanId: string
): SpanBuilder {
  return tracer
    .startSpan(`external.${api}`, traceId, parentSpanId, "client")
    .setAttribute("http.url", endpoint)
    .setAttribute("external.api", api);
}
