import { describe, it, expect, vi } from 'vitest';

import {
  normalizeTimestampForDateParse,
  parseTimestampMs,
  parseTimestamp,
} from '@/utils/timestamp';

describe('normalizeTimestampForDateParse', () => {
  it('returns an empty string for an empty input', () => {
    const result = normalizeTimestampForDateParse('');

    expect(result).toBe('');
  });

  it('returns an empty string for a whitespace-only input', () => {
    const result = normalizeTimestampForDateParse('   ');

    expect(result).toBe('');
  });

  it('trims surrounding whitespace from a non-matching value', () => {
    const result = normalizeTimestampForDateParse('  hello world  ');

    expect(result).toBe('hello world');
  });

  it('returns the trimmed value unchanged when it is not RFC3339', () => {
    const result = normalizeTimestampForDateParse('2024/01/02 03:04:05');

    expect(result).toBe('2024/01/02 03:04:05');
  });

  it('keeps a timestamp with no fractional seconds unchanged', () => {
    const result = normalizeTimestampForDateParse('2024-01-02T03:04:05Z');

    expect(result).toBe('2024-01-02T03:04:05Z');
  });

  it('keeps a timestamp with exactly three fractional digits unchanged', () => {
    const result = normalizeTimestampForDateParse('2024-01-02T03:04:05.123Z');

    expect(result).toBe('2024-01-02T03:04:05.123Z');
  });

  it('keeps a timestamp with fewer than three fractional digits unchanged', () => {
    const result = normalizeTimestampForDateParse('2024-01-02T03:04:05.1Z');

    expect(result).toBe('2024-01-02T03:04:05.1Z');
  });

  it('truncates sub-millisecond precision to three fractional digits while keeping the zulu zone', () => {
    const result = normalizeTimestampForDateParse('2024-01-02T03:04:05.123456789Z');

    expect(result).toBe('2024-01-02T03:04:05.123Z');
  });

  it('truncates sub-millisecond precision while preserving a numeric timezone offset', () => {
    const result = normalizeTimestampForDateParse('2024-01-02T03:04:05.123456+02:00');

    expect(result).toBe('2024-01-02T03:04:05.123+02:00');
  });

  it('truncates sub-millisecond precision when there is no timezone suffix', () => {
    const result = normalizeTimestampForDateParse('2024-01-02T03:04:05.999999');

    expect(result).toBe('2024-01-02T03:04:05.999');
  });

  it('truncates exactly four fractional digits down to three', () => {
    const result = normalizeTimestampForDateParse('2024-01-02T03:04:05.1234Z');

    expect(result).toBe('2024-01-02T03:04:05.123Z');
  });

  it('trims whitespace before matching and normalizing', () => {
    const result = normalizeTimestampForDateParse('  2024-01-02T03:04:05.123456Z  ');

    expect(result).toBe('2024-01-02T03:04:05.123Z');
  });

  it('is idempotent: re-normalizing an already-normalized value is a no-op', () => {
    const once = normalizeTimestampForDateParse('2024-01-02T03:04:05.123456789Z');
    const twice = normalizeTimestampForDateParse(once);

    expect(twice).toBe('2024-01-02T03:04:05.123Z');
  });
});

describe('parseTimestampMs', () => {
  it('returns a finite numeric input unchanged', () => {
    const result = parseTimestampMs(1700000000000);

    expect(result).toBe(1700000000000);
  });

  it('returns zero unchanged as a valid epoch millisecond value', () => {
    const result = parseTimestampMs(0);

    expect(result).toBe(0);
  });

  it('returns a negative epoch number unchanged', () => {
    const result = parseTimestampMs(-1000);

    expect(result).toBe(-1000);
  });

  it('returns NaN for a non-finite number such as Infinity', () => {
    const result = parseTimestampMs(Infinity);

    expect(Number.isNaN(result)).toBe(true);
  });

  it('returns NaN for NaN input', () => {
    const result = parseTimestampMs(Number.NaN);

    expect(Number.isNaN(result)).toBe(true);
  });

  it('returns the epoch milliseconds of a Date instance', () => {
    const date = new Date(Date.UTC(2024, 0, 2, 3, 4, 5));

    const result = parseTimestampMs(date);

    expect(result).toBe(Date.UTC(2024, 0, 2, 3, 4, 5));
  });

  it('returns NaN for an Invalid Date instance', () => {
    const result = parseTimestampMs(new Date('not-a-date'));

    expect(Number.isNaN(result)).toBe(true);
  });

  it('returns NaN for null', () => {
    const result = parseTimestampMs(null);

    expect(Number.isNaN(result)).toBe(true);
  });

  it('returns NaN for undefined', () => {
    const result = parseTimestampMs(undefined);

    expect(Number.isNaN(result)).toBe(true);
  });

  it('returns NaN for a boolean', () => {
    const result = parseTimestampMs(true);

    expect(Number.isNaN(result)).toBe(true);
  });

  it('returns NaN for a plain object', () => {
    const result = parseTimestampMs({ time: 1 });

    expect(Number.isNaN(result)).toBe(true);
  });

  it('returns NaN for an empty string', () => {
    const result = parseTimestampMs('');

    expect(Number.isNaN(result)).toBe(true);
  });

  it('returns NaN for a whitespace-only string', () => {
    const result = parseTimestampMs('   ');

    expect(Number.isNaN(result)).toBe(true);
  });

  it('returns NaN for an unparseable string', () => {
    const result = parseTimestampMs('not-a-date');

    expect(Number.isNaN(result)).toBe(true);
  });

  it('parses a zulu RFC3339 timestamp to its UTC epoch milliseconds', () => {
    const result = parseTimestampMs('2024-01-02T03:04:05Z');

    expect(result).toBe(Date.UTC(2024, 0, 2, 3, 4, 5));
  });

  it('parses a date-only string as UTC midnight', () => {
    const result = parseTimestampMs('2024-01-02');

    expect(result).toBe(Date.UTC(2024, 0, 2, 0, 0, 0));
  });

  it('parses a zulu timestamp with high precision truncated to milliseconds', () => {
    const result = parseTimestampMs('2024-01-02T03:04:05.123999Z');

    expect(result).toBe(Date.UTC(2024, 0, 2, 3, 4, 5, 123));
  });

  it('parses a timestamp with an explicit offset to the equivalent UTC epoch', () => {
    const result = parseTimestampMs('2024-01-02T05:04:05+02:00');

    expect(result).toBe(Date.UTC(2024, 0, 2, 3, 4, 5));
  });

  it('trims surrounding whitespace before parsing', () => {
    const result = parseTimestampMs('  2024-01-02T03:04:05Z  ');

    expect(result).toBe(Date.UTC(2024, 0, 2, 3, 4, 5));
  });
  it('falls back to the original high-precision string when only the original parser accepts it', () => {
    const parse = vi.spyOn(Date, 'parse');
    parse.mockReturnValueOnce(Number.NaN).mockReturnValueOnce(1234);
    expect(parseTimestampMs('2024-01-02T03:04:05.123456Z')).toBe(1234);
    parse.mockReturnValueOnce(Number.NaN).mockReturnValueOnce(Number.NaN);
    expect(Number.isNaN(parseTimestampMs('2024-01-02T03:04:05.654321Z'))).toBe(true);
    parse.mockRestore();
  });
});

describe('parseTimestamp', () => {
  it('returns a Date for a valid zulu RFC3339 string', () => {
    const result = parseTimestamp('2024-01-02T03:04:05Z');

    expect(result).toEqual(new Date(Date.UTC(2024, 0, 2, 3, 4, 5)));
  });

  it('returns a Date for a finite numeric epoch input', () => {
    const result = parseTimestamp(1700000000000);

    expect(result).toEqual(new Date(1700000000000));
  });

  it('returns a Date equal to a Date instance input', () => {
    const date = new Date(Date.UTC(2024, 5, 15, 10, 0, 0));

    const result = parseTimestamp(date);

    expect(result).toEqual(date);
  });

  it('returns null for an unparseable string', () => {
    const result = parseTimestamp('not-a-date');

    expect(result).toBeNull();
  });

  it('returns null for null', () => {
    const result = parseTimestamp(null);

    expect(result).toBeNull();
  });

  it('returns null for undefined', () => {
    const result = parseTimestamp(undefined);

    expect(result).toBeNull();
  });

  it('returns null for a non-finite number such as Infinity', () => {
    const result = parseTimestamp(Infinity);

    expect(result).toBeNull();
  });

  it('returns null for an empty string', () => {
    const result = parseTimestamp('');

    expect(result).toBeNull();
  });
});
