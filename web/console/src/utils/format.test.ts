import { describe, it, expect, vi } from 'vitest';
import {
  maskApiKey,
  formatDateTime,
  formatFileSize,
  formatNumber,
  truncateText,
  formatUnixTimestamp,
} from '@/utils/format';

describe('maskApiKey', () => {
  it('keeps the first and last two characters and masks the middle for a normal key', () => {
    expect(maskApiKey('sk-1234567890')).toBe('sk******90');
  });

  it('returns an empty string for an empty key', () => {
    expect(maskApiKey('')).toBe('');
  });

  it('keeps a single edge character on each side for very short keys', () => {
    expect(maskApiKey('ab')).toBe('a********b');
  });

  it('trims surrounding whitespace before masking', () => {
    expect(maskApiKey('  sk-1234567890  ')).toBe('sk******90');
  });
});

describe('formatFileSize', () => {
  it('reports exactly zero bytes', () => {
    expect(formatFileSize(0)).toBe('0 B');
  });

  it('formats an exact kilobyte', () => {
    expect(formatFileSize(1024)).toBe('1.00 KB');
  });

  it('formats a fractional kilobyte to two decimals', () => {
    expect(formatFileSize(1536)).toBe('1.50 KB');
  });

  it('scales up to megabytes', () => {
    expect(formatFileSize(1024 * 1024)).toBe('1.00 MB');
  });
});

describe('truncateText', () => {
  it('returns the text unchanged when within the limit', () => {
    expect(truncateText('hello', 10)).toBe('hello');
  });

  it('truncates and appends an ellipsis when over the limit', () => {
    expect(truncateText('hello world', 5)).toBe('hello...');
  });
});

describe('formatUnixTimestamp', () => {
  it('returns an empty string for empty input', () => {
    expect(formatUnixTimestamp('')).toBe('');
  });

  it('returns an empty string for null', () => {
    expect(formatUnixTimestamp(null)).toBe('');
  });

  it('returns an empty string for unparseable input', () => {
    expect(formatUnixTimestamp('not-a-date')).toBe('');
  });
});

describe('locale-aware formatting', () => {
  it('formats Date and string inputs with explicit and document locales', () => {
    document.documentElement.lang = 'en-US';
    const date = new Date('2026-01-02T03:04:05Z');
    expect(formatDateTime(date, 'en-US')).toContain('2026');
    expect(formatDateTime('2026-01-02T03:04:05Z')).toContain('2026');
    expect(formatDateTime('not-a-date', 'en-US')).toBe('Invalid Date');
    expect(formatNumber(1234, 'en-US')).toBe('1,234');
    expect(formatNumber(1234, '   ')).toBe('1,234');
    document.documentElement.lang = '';
    expect(formatNumber(1234)).not.toBe('');
  });

  it.each([
    [1_700_000_000, 'seconds'],
    [1_700_000_000_000, 'milliseconds'],
    [1_700_000_000_000_000, 'microseconds'],
    [1_700_000_000_000_000_000, 'nanoseconds'],
  ])('formats finite %s %s timestamps', (value) => {
    expect(formatUnixTimestamp(value, 'en-US')).toContain('2023');
    expect(formatUnixTimestamp(String(value))).not.toBe('');
  });

  it('parses a nonnumeric date string and rejects nonfinite numbers', () => {
    expect(formatUnixTimestamp('2026-01-02T03:04:05Z', 'en-US')).toContain('2026');
    expect(formatUnixTimestamp(Number.NaN)).toBe('');
    expect(formatUnixTimestamp(undefined)).toBe('');
  });

  it('lets the runtime choose a locale when browser globals are absent', () => {
    vi.stubGlobal('document', undefined);
    vi.stubGlobal('navigator', undefined);
    expect(formatNumber(1234)).not.toBe('');
    expect(formatDateTime(new Date('2026-01-02T03:04:05Z'))).toContain('2026');
    vi.unstubAllGlobals();
  });
});
