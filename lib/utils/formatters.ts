import { formatDistanceToNow, differenceInDays, format, parseISO } from "date-fns";
import { it } from "date-fns/locale";

/**
 * Format a number as EUR currency.
 */
export function formatEUR(value: number | null | undefined): string {
  if (value == null || value === 0) return "-";
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Format a number compactly (e.g. 1.2M, 450K).
 */
export function formatCompact(value: number | null | undefined): string {
  if (value == null || value === 0) return "-";
  return new Intl.NumberFormat("it-IT", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

/**
 * Format a date string as a localized date.
 */
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  try {
    return format(parseISO(dateStr), "d MMM yyyy", { locale: it });
  } catch {
    return dateStr;
  }
}

/**
 * Get the number of days until a deadline.
 * Returns negative if past deadline.
 */
export function daysUntilDeadline(
  dateStr: string | null | undefined
): number | null {
  if (!dateStr) return null;
  try {
    return differenceInDays(parseISO(dateStr), new Date());
  } catch {
    return null;
  }
}

/**
 * Format deadline as a human-readable countdown.
 */
export function formatDeadline(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  try {
    const date = parseISO(dateStr);
    const days = differenceInDays(date, new Date());

    if (days < 0) return "Scaduto";
    if (days === 0) return "Oggi";
    if (days === 1) return "Domani";
    if (days <= 7) return `${days} giorni`;

    return formatDistanceToNow(date, { locale: it, addSuffix: true });
  } catch {
    return dateStr;
  }
}

/**
 * Urgency level based on days remaining.
 */
export type UrgencyLevel = "critical" | "warning" | "normal" | "expired";

export function getUrgencyLevel(
  dateStr: string | null | undefined
): UrgencyLevel {
  const days = daysUntilDeadline(dateStr);
  if (days === null) return "normal";
  if (days < 0) return "expired";
  if (days <= 3) return "critical";
  if (days <= 7) return "warning";
  return "normal";
}

/**
 * Format a percentage (0-100).
 */
export function formatPercent(value: number | null | undefined): string {
  if (value == null) return "-";
  return `${Math.round(value)}%`;
}
