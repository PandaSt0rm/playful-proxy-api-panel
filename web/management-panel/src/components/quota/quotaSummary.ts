/**
 * Provider-agnostic quota summary model.
 *
 * Each provider stores its quota in a different shape (Claude usage windows,
 * Codex rate-limit windows, Antigravity model groups, Gemini buckets+tier+credits,
 * Kimi/Z.AI rows). The dashboard needs one uniform shape it can render densely,
 * sort by, and aggregate. `QuotaConfig.getSummary` produces this shape; the helpers
 * here derive a single health signal from it.
 *
 * Every meter is expressed as percent REMAINING (0-100): higher is healthier,
 * matching the progress-bar colour bands used across the quota UI.
 */

export type QuotaHealth = 'ok' | 'warn' | 'critical' | 'unknown' | 'error';

/** Remaining-percent thresholds. Mirror the QuotaProgressBar colour bands. */
export const QUOTA_WARN_REMAINING = 70; // below this → amber (watch)
export const QUOTA_CRITICAL_REMAINING = 30; // below this → red (near limit)

export interface NormalizedMeter {
  id: string;
  label: string;
  /** Percent of quota remaining (0-100), or null when the provider omits it. */
  remainingPercent: number | null;
  /** Human-readable reset time/hint, when available. */
  resetLabel?: string;
  /** Secondary amount detail (e.g. "12 / 50", "$1.20 / $5.00"), when available. */
  amountLabel?: string;
}

export interface NormalizedExtra {
  id: string;
  /** Translated descriptor, e.g. "Plan", "Tier", "Credits". */
  label: string;
  /** Translated value, e.g. "Max", "Pro", "1,234". */
  value: string;
  /** Render with the premium accent (Codex pro/pro-lite, Gemini ultra tier). */
  premium?: boolean;
}

export interface QuotaSummary {
  meters: NormalizedMeter[];
  extras: NormalizedExtra[];
  /** i18n key for the "success but nothing to show" message, when meters is empty. */
  emptyMessageKey?: string;
}

export const EMPTY_QUOTA_SUMMARY: QuotaSummary = { meters: [], extras: [] };

/** Lowest remaining percent across meters, ignoring meters with unknown values. */
export function worstRemaining(meters: NormalizedMeter[]): number | null {
  let worst: number | null = null;
  for (const meter of meters) {
    if (meter.remainingPercent === null) continue;
    worst = worst === null ? meter.remainingPercent : Math.min(worst, meter.remainingPercent);
  }
  return worst;
}

/** Health band derived from a credential's load status and its meters. */
export function deriveHealth(
  status: 'idle' | 'loading' | 'success' | 'error' | undefined,
  meters: NormalizedMeter[]
): QuotaHealth {
  if (status === 'error') return 'error';
  if (status !== 'success') return 'unknown';
  const worst = worstRemaining(meters);
  if (worst === null) return 'unknown';
  if (worst < QUOTA_CRITICAL_REMAINING) return 'critical';
  if (worst < QUOTA_WARN_REMAINING) return 'warn';
  return 'ok';
}
