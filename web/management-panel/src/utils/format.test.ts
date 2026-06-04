import { describe, it, expect } from 'vitest';
import { maskApiKey, formatFileSize, truncateText, formatUnixTimestamp } from '@/utils/format';

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
