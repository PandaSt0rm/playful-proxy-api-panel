import { describe, it, expect } from 'vitest';
import {
  deriveHealth,
  worstRemaining,
  QUOTA_CRITICAL_REMAINING,
  QUOTA_WARN_REMAINING,
  type NormalizedMeter,
} from './quotaSummary';

const meter = (remainingPercent: number | null): NormalizedMeter => ({
  id: `m-${remainingPercent}`,
  label: 'm',
  remainingPercent,
});

describe('worstRemaining', () => {
  it('returns the lowest remaining percent across meters', () => {
    expect(worstRemaining([meter(80), meter(40), meter(90)])).toBe(40);
  });

  it('ignores meters with unknown remaining', () => {
    expect(worstRemaining([meter(null), meter(55), meter(null)])).toBe(55);
  });

  it('returns null when no meter has a value', () => {
    expect(worstRemaining([meter(null), meter(null)])).toBeNull();
    expect(worstRemaining([])).toBeNull();
  });
});

describe('deriveHealth', () => {
  it('reports error status regardless of meters', () => {
    expect(deriveHealth('error', [meter(95)])).toBe('error');
  });

  it('reports unknown for non-success statuses', () => {
    expect(deriveHealth('idle', [])).toBe('unknown');
    expect(deriveHealth('loading', [meter(10)])).toBe('unknown');
    expect(deriveHealth(undefined, [])).toBe('unknown');
  });

  it('reports unknown for success without measurable meters', () => {
    expect(deriveHealth('success', [])).toBe('unknown');
    expect(deriveHealth('success', [meter(null)])).toBe('unknown');
  });

  it('reports critical when remaining drops below the critical threshold', () => {
    expect(deriveHealth('success', [meter(QUOTA_CRITICAL_REMAINING - 1), meter(90)])).toBe('critical');
  });

  it('reports warn between the critical and warn thresholds', () => {
    expect(deriveHealth('success', [meter(QUOTA_CRITICAL_REMAINING), meter(90)])).toBe('warn');
    expect(deriveHealth('success', [meter(QUOTA_WARN_REMAINING - 1)])).toBe('warn');
  });

  it('reports ok at or above the warn threshold', () => {
    expect(deriveHealth('success', [meter(QUOTA_WARN_REMAINING), meter(100)])).toBe('ok');
  });
});
