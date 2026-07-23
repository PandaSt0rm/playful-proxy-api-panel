import { describe, it, expect } from 'vitest';
import type { TFunction } from 'i18next';
import { formatRelativeTime } from './quotaTime';

// Fake translator that echoes the key plus the count param, so assertions can
// check which bucket (and value) was chosen without depending on translations.
const t = ((key: string, opts?: { count?: number }) =>
  opts?.count === undefined ? key : `${key}:${opts.count}`) as unknown as TFunction;

const NOW = 1_000_000_000_000;

describe('formatRelativeTime', () => {
  it('uses "just now" within 5 seconds', () => {
    expect(formatRelativeTime(t, NOW - 3_000, NOW)).toBe('quota_management.updated_just_now');
  });

  it('clamps future timestamps to "just now"', () => {
    expect(formatRelativeTime(t, NOW + 10_000, NOW)).toBe('quota_management.updated_just_now');
  });

  it('reports seconds under a minute', () => {
    expect(formatRelativeTime(t, NOW - 42_000, NOW)).toBe('quota_management.updated_seconds:42');
  });

  it('reports minutes under an hour', () => {
    expect(formatRelativeTime(t, NOW - 5 * 60_000, NOW)).toBe('quota_management.updated_minutes:5');
  });

  it('reports hours under a day', () => {
    expect(formatRelativeTime(t, NOW - 3 * 3_600_000, NOW)).toBe(
      'quota_management.updated_hours:3'
    );
  });

  it('reports days beyond 24 hours', () => {
    expect(formatRelativeTime(t, NOW - 2 * 86_400_000, NOW)).toBe(
      'quota_management.updated_days:2'
    );
  });
});
