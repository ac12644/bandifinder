/**
 * Structured Logger
 *
 * Enterprise-grade logging with:
 * - JSON structured output
 * - Log levels (debug, info, warn, error)
 * - Correlation IDs for request tracing
 * - Context enrichment
 * - Redaction of sensitive data
 */

// ============================================================================
// TYPES
// ============================================================================

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  // Request context
  requestId?: string;
  traceId?: string;
  spanId?: string;

  // User context
  userId?: string;

  // Service context
  service?: string;
  version?: string;
  environment?: string;

  // Custom fields
  [key: string]: unknown;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  duration?: number;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

interface LoggerConfig {
  /** Minimum log level */
  level: LogLevel;
  /** Service name */
  service: string;
  /** Service version */
  version: string;
  /** Environment */
  environment: string;
  /** Pretty print JSON (development only) */
  prettyPrint: boolean;
  /** Fields to redact */
  redactFields: string[];
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const DEFAULT_CONFIG: LoggerConfig = {
  level: (process.env.LOG_LEVEL as LogLevel) || "info",
  service: "bandifinder-api",
  version: process.env.npm_package_version || "2.1.0",
  environment: process.env.NODE_ENV || "development",
  prettyPrint: process.env.NODE_ENV === "development",
  redactFields: [
    "password",
    "token",
    "apiKey",
    "api_key",
    "secret",
    "authorization",
    "cookie",
    "creditCard",
    "ssn",
  ],
};

// ============================================================================
// LOGGER CLASS
// ============================================================================

class Logger {
  private config: LoggerConfig;
  private globalContext: LogContext = {};

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.globalContext = {
      service: this.config.service,
      version: this.config.version,
      environment: this.config.environment,
    };
  }

  /**
   * Set global context that will be included in all logs.
   */
  setGlobalContext(context: LogContext): void {
    this.globalContext = { ...this.globalContext, ...context };
  }

  /**
   * Create a child logger with additional context.
   */
  child(context: LogContext): ChildLogger {
    return new ChildLogger(this, context);
  }

  /**
   * Log at debug level.
   */
  debug(message: string, metadata?: Record<string, unknown>): void {
    this.log("debug", message, {}, metadata);
  }

  /**
   * Log at info level.
   */
  info(message: string, metadata?: Record<string, unknown>): void {
    this.log("info", message, {}, metadata);
  }

  /**
   * Log at warn level.
   */
  warn(message: string, metadata?: Record<string, unknown>): void {
    this.log("warn", message, {}, metadata);
  }

  /**
   * Log at error level.
   */
  error(message: string, error?: Error, metadata?: Record<string, unknown>): void {
    this.log("error", message, {}, metadata, error);
  }

  /**
   * Internal log method.
   */
  log(
    level: LogLevel,
    message: string,
    context: LogContext = {},
    metadata?: Record<string, unknown>,
    error?: Error
  ): void {
    // Check log level
    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[this.config.level]) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: { ...this.globalContext, ...context },
      metadata: metadata ? this.redactSensitive(metadata) : undefined,
    };

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    this.output(entry);
  }

  /**
   * Output log entry.
   */
  private output(entry: LogEntry): void {
    const output = this.config.prettyPrint
      ? JSON.stringify(entry, null, 2)
      : JSON.stringify(entry);

    switch (entry.level) {
      case "error":
        console.error(output);
        break;
      case "warn":
        console.warn(output);
        break;
      case "debug":
        console.debug(output);
        break;
      default:
        console.log(output);
    }
  }

  /**
   * Redact sensitive fields from metadata.
   */
  private redactSensitive(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();

      if (this.config.redactFields.some((field) => lowerKey.includes(field.toLowerCase()))) {
        result[key] = "[REDACTED]";
      } else if (value && typeof value === "object" && !Array.isArray(value)) {
        result[key] = this.redactSensitive(value as Record<string, unknown>);
      } else {
        result[key] = value;
      }
    }

    return result;
  }
}

/**
 * Child logger with inherited context.
 */
class ChildLogger {
  constructor(
    private parent: Logger,
    private context: LogContext
  ) {}

  debug(message: string, metadata?: Record<string, unknown>): void {
    this.parent.log("debug", message, this.context, metadata);
  }

  info(message: string, metadata?: Record<string, unknown>): void {
    this.parent.log("info", message, this.context, metadata);
  }

  warn(message: string, metadata?: Record<string, unknown>): void {
    this.parent.log("warn", message, this.context, metadata);
  }

  error(message: string, error?: Error, metadata?: Record<string, unknown>): void {
    this.parent.log("error", message, this.context, metadata, error);
  }

  child(context: LogContext): ChildLogger {
    return new ChildLogger(this.parent, { ...this.context, ...context });
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

export const logger = new Logger();

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate a unique trace ID.
 */
export function generateTraceId(): string {
  return `trace_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 10)}`;
}

/**
 * Generate a unique request ID.
 */
export function generateRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
}
