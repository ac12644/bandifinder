/**
 * Metrics Collection
 *
 * In-memory metrics collection for:
 * - Request counts and latencies
 * - Agent execution metrics
 * - Error rates
 * - System health
 *
 * In production, integrate with:
 * - Prometheus
 * - DataDog
 * - CloudWatch
 */

// ============================================================================
// TYPES
// ============================================================================

export interface Counter {
  name: string;
  description: string;
  labels: Record<string, string>;
  value: number;
}

export interface Histogram {
  name: string;
  description: string;
  labels: Record<string, string>;
  values: number[];
  sum: number;
  count: number;
}

export interface Gauge {
  name: string;
  description: string;
  labels: Record<string, string>;
  value: number;
  timestamp: number;
}

export interface MetricSnapshot {
  timestamp: string;
  counters: Counter[];
  histograms: Array<Histogram & { percentiles: Record<string, number> }>;
  gauges: Gauge[];
}

// ============================================================================
// METRICS REGISTRY
// ============================================================================

class MetricsRegistry {
  private counters: Map<string, Counter> = new Map();
  private histograms: Map<string, Histogram> = new Map();
  private gauges: Map<string, Gauge> = new Map();

  /**
   * Generate a unique key from name and labels.
   */
  private key(name: string, labels: Record<string, string>): string {
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(",");
    return `${name}{${labelStr}}`;
  }

  // ========== COUNTERS ==========

  /**
   * Increment a counter.
   */
  incrementCounter(
    name: string,
    labels: Record<string, string> = {},
    value: number = 1,
    description: string = ""
  ): void {
    const key = this.key(name, labels);
    const existing = this.counters.get(key);

    if (existing) {
      existing.value += value;
    } else {
      this.counters.set(key, {
        name,
        description,
        labels,
        value,
      });
    }
  }

  /**
   * Get counter value.
   */
  getCounter(name: string, labels: Record<string, string> = {}): number {
    const key = this.key(name, labels);
    return this.counters.get(key)?.value || 0;
  }

  // ========== HISTOGRAMS ==========

  /**
   * Record a histogram observation.
   */
  recordHistogram(
    name: string,
    value: number,
    labels: Record<string, string> = {},
    description: string = ""
  ): void {
    const key = this.key(name, labels);
    const existing = this.histograms.get(key);

    if (existing) {
      existing.values.push(value);
      existing.sum += value;
      existing.count += 1;

      // Keep only last 1000 observations for memory efficiency
      if (existing.values.length > 1000) {
        existing.values = existing.values.slice(-1000);
      }
    } else {
      this.histograms.set(key, {
        name,
        description,
        labels,
        values: [value],
        sum: value,
        count: 1,
      });
    }
  }

  /**
   * Get histogram percentile.
   */
  getHistogramPercentile(
    name: string,
    percentile: number,
    labels: Record<string, string> = {}
  ): number | null {
    const key = this.key(name, labels);
    const histogram = this.histograms.get(key);

    if (!histogram || histogram.values.length === 0) {
      return null;
    }

    const sorted = [...histogram.values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  // ========== GAUGES ==========

  /**
   * Set a gauge value.
   */
  setGauge(
    name: string,
    value: number,
    labels: Record<string, string> = {},
    description: string = ""
  ): void {
    const key = this.key(name, labels);
    this.gauges.set(key, {
      name,
      description,
      labels,
      value,
      timestamp: Date.now(),
    });
  }

  /**
   * Get gauge value.
   */
  getGauge(name: string, labels: Record<string, string> = {}): number | null {
    const key = this.key(name, labels);
    return this.gauges.get(key)?.value ?? null;
  }

  // ========== EXPORT ==========

  /**
   * Get all metrics as a snapshot.
   */
  getSnapshot(): MetricSnapshot {
    const histogramsWithPercentiles = Array.from(this.histograms.values()).map((h) => {
      const sorted = [...h.values].sort((a, b) => a - b);
      const getPercentile = (p: number) => {
        const index = Math.ceil((p / 100) * sorted.length) - 1;
        return sorted[Math.max(0, index)] || 0;
      };

      return {
        ...h,
        percentiles: {
          p50: getPercentile(50),
          p90: getPercentile(90),
          p95: getPercentile(95),
          p99: getPercentile(99),
        },
      };
    });

    return {
      timestamp: new Date().toISOString(),
      counters: Array.from(this.counters.values()),
      histograms: histogramsWithPercentiles,
      gauges: Array.from(this.gauges.values()),
    };
  }

  /**
   * Export metrics in Prometheus format.
   */
  toPrometheus(): string {
    const lines: string[] = [];

    // Counters
    for (const counter of this.counters.values()) {
      const labels = Object.entries(counter.labels)
        .map(([k, v]) => `${k}="${v}"`)
        .join(",");
      lines.push(`# HELP ${counter.name} ${counter.description}`);
      lines.push(`# TYPE ${counter.name} counter`);
      lines.push(`${counter.name}{${labels}} ${counter.value}`);
    }

    // Histograms
    for (const histogram of this.histograms.values()) {
      const labels = Object.entries(histogram.labels)
        .map(([k, v]) => `${k}="${v}"`)
        .join(",");
      lines.push(`# HELP ${histogram.name} ${histogram.description}`);
      lines.push(`# TYPE ${histogram.name} histogram`);
      lines.push(`${histogram.name}_sum{${labels}} ${histogram.sum}`);
      lines.push(`${histogram.name}_count{${labels}} ${histogram.count}`);
    }

    // Gauges
    for (const gauge of this.gauges.values()) {
      const labels = Object.entries(gauge.labels)
        .map(([k, v]) => `${k}="${v}"`)
        .join(",");
      lines.push(`# HELP ${gauge.name} ${gauge.description}`);
      lines.push(`# TYPE ${gauge.name} gauge`);
      lines.push(`${gauge.name}{${labels}} ${gauge.value}`);
    }

    return lines.join("\n");
  }

  /**
   * Reset all metrics.
   */
  reset(): void {
    this.counters.clear();
    this.histograms.clear();
    this.gauges.clear();
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

export const metrics = new MetricsRegistry();

// ============================================================================
// PRE-DEFINED METRICS
// ============================================================================

/**
 * Record HTTP request metrics.
 */
export function recordHttpRequest(
  method: string,
  path: string,
  statusCode: number,
  durationMs: number
): void {
  const labels = { method, path: normalizePath(path), status: String(statusCode) };

  metrics.incrementCounter("http_requests_total", labels, 1, "Total HTTP requests");
  metrics.recordHistogram("http_request_duration_ms", durationMs, labels, "HTTP request duration");

  if (statusCode >= 400) {
    metrics.incrementCounter("http_errors_total", labels, 1, "Total HTTP errors");
  }
}




/**
 * Update system health gauge.
 */
export function updateHealthGauge(healthy: boolean): void {
  metrics.setGauge("system_health", healthy ? 1 : 0, {}, "System health status (1=healthy, 0=unhealthy)");
}


// ============================================================================
// HELPERS
// ============================================================================

/**
 * Normalize path for metrics (remove IDs, etc.).
 */
function normalizePath(path: string): string {
  return path
    .replace(/\/[a-f0-9-]{36}/gi, "/:id") // UUIDs
    .replace(/\/\d+/g, "/:id") // Numeric IDs
    .replace(/\/TED-\d+-\d+/g, "/:tenderId"); // TED IDs
}
