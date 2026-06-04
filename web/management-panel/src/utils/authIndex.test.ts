import { describe, it, expect } from 'vitest';

import { normalizeAuthIndex } from './authIndex';

describe('normalizeAuthIndex', () => {
  it('converts a finite integer to its string form', () => {
    const result = normalizeAuthIndex(42);

    expect(result).toBe('42');
  });

  it('converts zero to the string "0"', () => {
    const result = normalizeAuthIndex(0);

    expect(result).toBe('0');
  });

  it('converts a negative integer to its string form', () => {
    const result = normalizeAuthIndex(-7);

    expect(result).toBe('-7');
  });

  it('converts a finite float to its string form', () => {
    const result = normalizeAuthIndex(3.5);

    expect(result).toBe('3.5');
  });

  it('returns null for NaN', () => {
    const result = normalizeAuthIndex(Number.NaN);

    expect(result).toBeNull();
  });

  it('returns null for positive Infinity', () => {
    const result = normalizeAuthIndex(Number.POSITIVE_INFINITY);

    expect(result).toBeNull();
  });

  it('returns null for negative Infinity', () => {
    const result = normalizeAuthIndex(Number.NEGATIVE_INFINITY);

    expect(result).toBeNull();
  });

  it('returns a non-empty string unchanged', () => {
    const result = normalizeAuthIndex('abc');

    expect(result).toBe('abc');
  });

  it('trims leading and trailing whitespace from a string', () => {
    const result = normalizeAuthIndex('  primary  ');

    expect(result).toBe('primary');
  });

  it('returns null for an empty string', () => {
    const result = normalizeAuthIndex('');

    expect(result).toBeNull();
  });

  it('returns null for a whitespace-only string', () => {
    const result = normalizeAuthIndex('   ');

    expect(result).toBeNull();
  });

  it('returns null for null input', () => {
    const result = normalizeAuthIndex(null);

    expect(result).toBeNull();
  });

  it('returns null for undefined input', () => {
    const result = normalizeAuthIndex(undefined);

    expect(result).toBeNull();
  });

  it('returns null for a boolean input', () => {
    const result = normalizeAuthIndex(true);

    expect(result).toBeNull();
  });

  it('returns null for an object input', () => {
    const result = normalizeAuthIndex({ index: 1 });

    expect(result).toBeNull();
  });

  it('returns null for an array input', () => {
    const result = normalizeAuthIndex([1, 2, 3]);

    expect(result).toBeNull();
  });
});
