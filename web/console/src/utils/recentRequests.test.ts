import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  normalizeUsageTotal,
  buildRecentRequestCompositeKey,
  normalizeRecentRequestAuthIndex,
  normalizeRecentRequestBuckets,
  normalizeRecentRequestUsageEntry,
  mergeRecentRequestBucketGroups,
  sumRecentRequests,
  statusBarDataFromRecentRequests,
  type RecentRequestBucket,
} from './recentRequests';

// Mirrors the module-internal constants so expected values are computed
// independently of the implementation.
const BLOCK_COUNT = 20;
const BLOCK_DURATION_MS = 10 * 60 * 1000;

describe('normalizeUsageTotal', () => {
  it('returns a finite number unchanged', () => {
    const result = normalizeUsageTotal(42);

    expect(result).toBe(42);
  });

  it('returns 0 for a non-finite number (Infinity)', () => {
    const result = normalizeUsageTotal(Infinity);

    expect(result).toBe(0);
  });

  it('returns 0 for NaN', () => {
    const result = normalizeUsageTotal(NaN);

    expect(result).toBe(0);
  });

  it('parses a numeric string', () => {
    const result = normalizeUsageTotal('17');

    expect(result).toBe(17);
  });

  it('trims surrounding whitespace before parsing a numeric string', () => {
    const result = normalizeUsageTotal('  88  ');

    expect(result).toBe(88);
  });

  it('returns 0 for an empty string', () => {
    const result = normalizeUsageTotal('');

    expect(result).toBe(0);
  });

  it('returns 0 for a whitespace-only string', () => {
    const result = normalizeUsageTotal('   ');

    expect(result).toBe(0);
  });

  it('returns 0 for a non-numeric string', () => {
    const result = normalizeUsageTotal('abc');

    expect(result).toBe(0);
  });

  it('returns 0 for null', () => {
    const result = normalizeUsageTotal(null);

    expect(result).toBe(0);
  });

  it('returns 0 for an object', () => {
    const result = normalizeUsageTotal({ value: 5 });

    expect(result).toBe(0);
  });

  it('parses a negative numeric string', () => {
    const result = normalizeUsageTotal('-3');

    expect(result).toBe(-3);
  });
});

describe('buildRecentRequestCompositeKey', () => {
  it('joins trimmed base url and api key with a pipe', () => {
    const result = buildRecentRequestCompositeKey('  https://api.example  ', '  key-1  ');

    expect(result).toBe('https://api.example|key-1');
  });

  it('uses empty strings for null inputs', () => {
    const result = buildRecentRequestCompositeKey(null, null);

    expect(result).toBe('|');
  });

  it('uses empty strings for undefined inputs', () => {
    const result = buildRecentRequestCompositeKey(undefined, undefined);

    expect(result).toBe('|');
  });

  it('stringifies numeric inputs', () => {
    const result = buildRecentRequestCompositeKey(123, 456);

    expect(result).toBe('123|456');
  });
});

describe('normalizeRecentRequestAuthIndex', () => {
  it('converts a finite number to its string form', () => {
    const result = normalizeRecentRequestAuthIndex(7);

    expect(result).toBe('7');
  });

  it('returns null for a non-finite number', () => {
    const result = normalizeRecentRequestAuthIndex(Infinity);

    expect(result).toBe(null);
  });

  it('returns a trimmed non-empty string', () => {
    const result = normalizeRecentRequestAuthIndex('  idx-9  ');

    expect(result).toBe('idx-9');
  });

  it('returns null for a whitespace-only string', () => {
    const result = normalizeRecentRequestAuthIndex('   ');

    expect(result).toBe(null);
  });

  it('returns null for an empty string', () => {
    const result = normalizeRecentRequestAuthIndex('');

    expect(result).toBe(null);
  });

  it('returns null for null', () => {
    const result = normalizeRecentRequestAuthIndex(null);

    expect(result).toBe(null);
  });

  it('returns null for an object', () => {
    const result = normalizeRecentRequestAuthIndex({});

    expect(result).toBe(null);
  });
});

describe('normalizeRecentRequestBuckets', () => {
  it('returns an empty array when input is not an array', () => {
    const result = normalizeRecentRequestBuckets({ not: 'array' });

    expect(result).toEqual([]);
  });

  it('returns an empty array for null', () => {
    const result = normalizeRecentRequestBuckets(null);

    expect(result).toEqual([]);
  });

  it('coerces missing success/failed fields to 0', () => {
    const result = normalizeRecentRequestBuckets([{}]);

    expect(result).toEqual([{ success: 0, failed: 0 }]);
  });

  it('preserves a string time field', () => {
    const result = normalizeRecentRequestBuckets([{ time: '10:00', success: 2, failed: 1 }]);

    expect(result).toEqual([{ time: '10:00', success: 2, failed: 1 }]);
  });

  it('omits the time field when it is not a string', () => {
    const result = normalizeRecentRequestBuckets([{ time: 123, success: 1, failed: 0 }]);

    expect(result).toEqual([{ success: 1, failed: 0 }]);
  });

  it('coerces numeric-string success/failed values', () => {
    const result = normalizeRecentRequestBuckets([{ success: '5', failed: '2' }]);

    expect(result).toEqual([{ success: 5, failed: 2 }]);
  });

  it('coerces non-finite success/failed values to 0', () => {
    const result = normalizeRecentRequestBuckets([{ success: 'bad', failed: NaN }]);

    expect(result).toEqual([{ success: 0, failed: 0 }]);
  });

  it('keeps only the last 20 buckets when given more', () => {
    const input = Array.from({ length: 25 }, (_, i) => ({ success: i, failed: 0 }));

    const result = normalizeRecentRequestBuckets(input);

    expect(result).toHaveLength(BLOCK_COUNT);
    expect(result[0]).toEqual({ success: 5, failed: 0 });
    expect(result[BLOCK_COUNT - 1]).toEqual({ success: 24, failed: 0 });
  });

  it('treats a non-object array item as an empty bucket', () => {
    const result = normalizeRecentRequestBuckets([42]);

    expect(result).toEqual([{ success: 0, failed: 0 }]);
  });
});

describe('normalizeRecentRequestUsageEntry', () => {
  it('returns the empty entry for a non-object input', () => {
    const result = normalizeRecentRequestUsageEntry('nope');

    expect(result).toEqual({ success: 0, failed: 0, recentRequests: [] });
  });

  it('returns the empty entry for an array input', () => {
    const result = normalizeRecentRequestUsageEntry([1, 2, 3]);

    expect(result).toEqual({ success: 0, failed: 0, recentRequests: [] });
  });

  it('returns the empty entry for null', () => {
    const result = normalizeRecentRequestUsageEntry(null);

    expect(result).toEqual({ success: 0, failed: 0, recentRequests: [] });
  });

  it('reads the snake_case recent_requests field', () => {
    const result = normalizeRecentRequestUsageEntry({
      success: 10,
      failed: 3,
      recent_requests: [{ success: 1, failed: 1 }],
    });

    expect(result).toEqual({
      success: 10,
      failed: 3,
      recentRequests: [{ success: 1, failed: 1 }],
    });
  });

  it('falls back to the camelCase recentRequests field when snake_case is absent', () => {
    const result = normalizeRecentRequestUsageEntry({
      success: 4,
      failed: 0,
      recentRequests: [{ success: 2, failed: 0 }],
    });

    expect(result.recentRequests).toEqual([{ success: 2, failed: 0 }]);
  });

  it('normalizes string success/failed totals', () => {
    const result = normalizeRecentRequestUsageEntry({ success: '9', failed: '1' });

    expect(result.success).toBe(9);
    expect(result.failed).toBe(1);
  });
});

describe('mergeRecentRequestBucketGroups', () => {
  it('returns an empty array when given no groups', () => {
    const result = mergeRecentRequestBucketGroups([]);

    expect(result).toEqual([]);
  });

  it('returns an empty array when all groups are empty', () => {
    const result = mergeRecentRequestBucketGroups([[], []]);

    expect(result).toEqual([]);
  });

  it('returns a single group unchanged in totals', () => {
    const result = mergeRecentRequestBucketGroups([
      [
        { success: 1, failed: 0 },
        { success: 2, failed: 1 },
      ],
    ]);

    expect(result).toEqual([
      { success: 1, failed: 0 },
      { success: 2, failed: 1 },
    ]);
  });

  it('sums same-length groups element-wise from the tail', () => {
    const result = mergeRecentRequestBucketGroups([
      [
        { success: 1, failed: 0 },
        { success: 2, failed: 0 },
      ],
      [
        { success: 10, failed: 1 },
        { success: 20, failed: 2 },
      ],
    ]);

    expect(result).toEqual([
      { success: 11, failed: 1 },
      { success: 22, failed: 2 },
    ]);
  });

  it('right-aligns a shorter group against a longer one', () => {
    const result = mergeRecentRequestBucketGroups([
      [
        { success: 1, failed: 0 },
        { success: 2, failed: 0 },
        { success: 3, failed: 0 },
      ],
      [{ success: 100, failed: 0 }],
    ]);

    expect(result).toEqual([
      { success: 1, failed: 0 },
      { success: 2, failed: 0 },
      { success: 103, failed: 0 },
    ]);
  });

  it('adopts a bucket time from a group when the merged slot has none', () => {
    const result = mergeRecentRequestBucketGroups([
      [{ success: 1, failed: 0 }],
      [{ time: '09:30', success: 5, failed: 0 }],
    ]);

    expect(result).toEqual([{ time: '09:30', success: 6, failed: 0 }]);
  });

  it('keeps the first non-empty time and does not overwrite it', () => {
    const result = mergeRecentRequestBucketGroups([
      [{ time: 'first', success: 1, failed: 0 }],
      [{ time: 'second', success: 2, failed: 0 }],
    ]);

    expect(result).toEqual([{ time: 'first', success: 3, failed: 0 }]);
  });

  it('caps the merged length at 20 buckets', () => {
    const big = Array.from({ length: 30 }, () => ({ success: 1, failed: 0 }));

    const result = mergeRecentRequestBucketGroups([big]);

    expect(result).toHaveLength(BLOCK_COUNT);
    expect(result.every((bucket) => bucket.success === 1 && bucket.failed === 0)).toBe(true);
  });
});

describe('sumRecentRequests', () => {
  it('returns zeros for an empty list', () => {
    const result = sumRecentRequests([]);

    expect(result).toEqual({ success: 0, failure: 0 });
  });

  it('sums success and maps failed onto the failure key', () => {
    const result = sumRecentRequests([
      { success: 3, failed: 1 },
      { success: 4, failed: 2 },
    ]);

    expect(result).toEqual({ success: 7, failure: 3 });
  });

  it('normalizes malformed buckets before summing', () => {
    const result = sumRecentRequests([
      { success: '5', failed: 'bad' } as unknown as RecentRequestBucket,
    ]);

    expect(result).toEqual({ success: 5, failure: 0 });
  });

  it('returns zeros when given a non-array input', () => {
    const result = sumRecentRequests('nope' as unknown as RecentRequestBucket[]);

    expect(result).toEqual({ success: 0, failure: 0 });
  });
});

describe('statusBarDataFromRecentRequests', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('pads to exactly 20 blocks when fewer buckets are supplied', () => {
    const result = statusBarDataFromRecentRequests([{ success: 1, failed: 0 }]);

    expect(result.blocks).toHaveLength(BLOCK_COUNT);
    expect(result.blockDetails).toHaveLength(BLOCK_COUNT);
  });

  it('marks a zero-traffic bucket as idle', () => {
    const result = statusBarDataFromRecentRequests([]);

    expect(result.blocks[0]).toBe('idle');
  });

  it('marks the trailing block success when only successes occurred', () => {
    const result = statusBarDataFromRecentRequests([{ success: 5, failed: 0 }]);

    expect(result.blocks[BLOCK_COUNT - 1]).toBe('success');
  });

  it('marks the trailing block failure when only failures occurred', () => {
    const result = statusBarDataFromRecentRequests([{ success: 0, failed: 4 }]);

    expect(result.blocks[BLOCK_COUNT - 1]).toBe('failure');
  });

  it('marks the trailing block mixed when both successes and failures occurred', () => {
    const result = statusBarDataFromRecentRequests([{ success: 2, failed: 3 }]);

    expect(result.blocks[BLOCK_COUNT - 1]).toBe('mixed');
  });

  it('aggregates total success and failure across buckets', () => {
    const result = statusBarDataFromRecentRequests([
      { success: 2, failed: 1 },
      { success: 3, failed: 0 },
    ]);

    expect(result.totalSuccess).toBe(5);
    expect(result.totalFailure).toBe(1);
  });

  it('computes the overall success rate as a percentage', () => {
    const result = statusBarDataFromRecentRequests([{ success: 3, failed: 1 }]);

    expect(result.successRate).toBe(75);
  });

  it('reports a 100 percent success rate when there is no traffic', () => {
    const result = statusBarDataFromRecentRequests([]);

    expect(result.successRate).toBe(100);
  });

  it('sets the per-block rate to -1 for an idle block', () => {
    const result = statusBarDataFromRecentRequests([]);

    expect(result.blockDetails[0].rate).toBe(-1);
  });

  it('computes the per-block success rate for a mixed block', () => {
    const result = statusBarDataFromRecentRequests([{ success: 1, failed: 3 }]);

    expect(result.blockDetails[BLOCK_COUNT - 1].rate).toBe(0.25);
  });

  it('spaces block start times by the 10-minute block duration', () => {
    const result = statusBarDataFromRecentRequests([]);

    const firstStart = result.blockDetails[0].startTime;
    const secondStart = result.blockDetails[1].startTime;

    expect(secondStart - firstStart).toBe(BLOCK_DURATION_MS);
  });

  it('sets each block end time one block duration after its start', () => {
    const result = statusBarDataFromRecentRequests([]);

    const detail = result.blockDetails[0];

    expect(detail.endTime - detail.startTime).toBe(BLOCK_DURATION_MS);
  });

  it('anchors the window start at now minus 20 block durations', () => {
    const now = Date.now();

    const result = statusBarDataFromRecentRequests([]);

    expect(result.blockDetails[0].startTime).toBe(now - BLOCK_COUNT * BLOCK_DURATION_MS);
  });
});
