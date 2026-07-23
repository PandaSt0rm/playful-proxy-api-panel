/**
 * Relative time formatting for quota freshness ("Updated 2m ago").
 * Pure and testable: callers pass the reference `now` rather than reading the clock.
 */

import type { TFunction } from 'i18next';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function formatRelativeTime(t: TFunction, fromMs: number, nowMs: number): string {
  const diff = Math.max(0, nowMs - fromMs);
  if (diff < 5 * SECOND) return t('quota_management.updated_just_now');
  if (diff < MINUTE)
    return t('quota_management.updated_seconds', { count: Math.floor(diff / SECOND) });
  if (diff < HOUR)
    return t('quota_management.updated_minutes', { count: Math.floor(diff / MINUTE) });
  if (diff < DAY) return t('quota_management.updated_hours', { count: Math.floor(diff / HOUR) });
  return t('quota_management.updated_days', { count: Math.floor(diff / DAY) });
}
