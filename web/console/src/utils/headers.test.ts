import { describe, it, expect } from 'vitest';

import {
  buildHeaderObject,
  hasHeader,
  headersToEntries,
  normalizeHeaderEntries,
  type HeaderEntry,
} from '@/utils/headers';

describe('buildHeaderObject', () => {
  it('returns an empty object when input is undefined', () => {
    const result = buildHeaderObject(undefined);

    expect(result).toEqual({});
  });

  it('returns an empty object for an empty array', () => {
    const result = buildHeaderObject([]);

    expect(result).toEqual({});
  });

  it('builds an object from a single entry array', () => {
    const result = buildHeaderObject([{ key: 'Authorization', value: 'Bearer x' }]);

    expect(result).toEqual({ Authorization: 'Bearer x' });
  });

  it('trims surrounding whitespace from keys and values', () => {
    const result = buildHeaderObject([{ key: '  X-Token  ', value: '  abc  ' }]);

    expect(result).toEqual({ 'X-Token': 'abc' });
  });

  it('skips array entries whose key trims to empty', () => {
    const result = buildHeaderObject([{ key: '   ', value: 'abc' }]);

    expect(result).toEqual({});
  });

  it('skips array entries whose value trims to empty', () => {
    const result = buildHeaderObject([{ key: 'X-Token', value: '   ' }]);

    expect(result).toEqual({});
  });

  it('lets a later array entry overwrite an earlier one with the same key', () => {
    const result = buildHeaderObject([
      { key: 'X-Token', value: 'first' },
      { key: 'X-Token', value: 'second' },
    ]);

    expect(result).toEqual({ 'X-Token': 'second' });
  });

  it('builds an object from a record input', () => {
    const result = buildHeaderObject({ Authorization: 'Bearer x', 'X-Id': '42' });

    expect(result).toEqual({ Authorization: 'Bearer x', 'X-Id': '42' });
  });

  it('drops record entries whose value is null', () => {
    const result = buildHeaderObject({ A: 'keep', B: null });

    expect(result).toEqual({ A: 'keep' });
  });

  it('drops record entries whose value is undefined', () => {
    const result = buildHeaderObject({ A: 'keep', B: undefined });

    expect(result).toEqual({ A: 'keep' });
  });

  it('drops record entries whose value is an empty string after trimming', () => {
    const result = buildHeaderObject({ A: 'keep', B: '   ' });

    expect(result).toEqual({ A: 'keep' });
  });

  it('drops record entries whose key trims to empty', () => {
    const result = buildHeaderObject({ '   ': 'value' });

    expect(result).toEqual({});
  });
});

describe('hasHeader', () => {
  it('returns false when headers is null', () => {
    const result = hasHeader(null, 'Authorization');

    expect(result).toBe(false);
  });

  it('returns false when headers is undefined', () => {
    const result = hasHeader(undefined, 'Authorization');

    expect(result).toBe(false);
  });

  it('returns false for an empty headers object', () => {
    const result = hasHeader({}, 'Authorization');

    expect(result).toBe(false);
  });

  it('returns true for an exact case match', () => {
    const result = hasHeader({ Authorization: 'x' }, 'Authorization');

    expect(result).toBe(true);
  });

  it('returns true regardless of header name casing', () => {
    const result = hasHeader({ 'content-type': 'json' }, 'Content-Type');

    expect(result).toBe(true);
  });

  it('returns false when the header is absent', () => {
    const result = hasHeader({ 'X-Other': '1' }, 'Authorization');

    expect(result).toBe(false);
  });
});

describe('headersToEntries', () => {
  it('returns an empty array when headers is undefined', () => {
    const result = headersToEntries(undefined);

    expect(result).toEqual([]);
  });

  it('returns an empty array for an empty record', () => {
    const result = headersToEntries({});

    expect(result).toEqual([]);
  });

  it('maps a record into key/value entries', () => {
    const result = headersToEntries({ Authorization: 'Bearer x' });

    expect(result).toEqual([{ key: 'Authorization', value: 'Bearer x' }]);
  });

  it('drops entries whose value is null', () => {
    const result = headersToEntries({ A: 'keep', B: null });

    expect(result).toEqual([{ key: 'A', value: 'keep' }]);
  });

  it('drops entries whose value is undefined', () => {
    const result = headersToEntries({ A: 'keep', B: undefined });

    expect(result).toEqual([{ key: 'A', value: 'keep' }]);
  });

  it('drops entries whose value is an empty string', () => {
    const result = headersToEntries({ A: 'keep', B: '' });

    expect(result).toEqual([{ key: 'A', value: 'keep' }]);
  });

  it('preserves untrimmed whitespace-only-after values as-is when non-empty', () => {
    const result = headersToEntries({ A: ' kept ' });

    expect(result).toEqual([{ key: 'A', value: ' kept ' }]);
  });
});

describe('normalizeHeaderEntries', () => {
  it('returns an empty array when entries is null', () => {
    const result = normalizeHeaderEntries(null as unknown as HeaderEntry[]);

    expect(result).toEqual([]);
  });

  it('returns an empty array when entries is undefined', () => {
    const result = normalizeHeaderEntries(undefined as unknown as HeaderEntry[]);

    expect(result).toEqual([]);
  });

  it('trims keys and values', () => {
    const result = normalizeHeaderEntries([{ key: '  A  ', value: '  v  ' }]);

    expect(result).toEqual([{ key: 'A', value: 'v' }]);
  });

  it('drops entries where both key and value are empty after trimming', () => {
    const result = normalizeHeaderEntries([{ key: '   ', value: '   ' }]);

    expect(result).toEqual([]);
  });

  it('keeps an entry with an empty value but a non-empty key', () => {
    const result = normalizeHeaderEntries([{ key: 'A', value: '' }]);

    expect(result).toEqual([{ key: 'A', value: '' }]);
  });

  it('keeps an entry with an empty key but a non-empty value', () => {
    const result = normalizeHeaderEntries([{ key: '', value: 'v' }]);

    expect(result).toEqual([{ key: '', value: 'v' }]);
  });

  it('sorts entries case-insensitively by key', () => {
    const result = normalizeHeaderEntries([
      { key: 'beta', value: '1' },
      { key: 'Alpha', value: '2' },
    ]);

    expect(result).toEqual([
      { key: 'Alpha', value: '2' },
      { key: 'beta', value: '1' },
    ]);
  });

  it('breaks key ties by sorting on value', () => {
    const result = normalizeHeaderEntries([
      { key: 'X', value: 'zeta' },
      { key: 'X', value: 'alpha' },
    ]);

    expect(result).toEqual([
      { key: 'X', value: 'alpha' },
      { key: 'X', value: 'zeta' },
    ]);
  });

  it('coerces non-string key and value fields to strings', () => {
    const result = normalizeHeaderEntries([
      { key: 123 as unknown as string, value: 456 as unknown as string },
    ]);

    expect(result).toEqual([{ key: '123', value: '456' }]);
  });

  it('treats null key and value fields as empty strings and drops them', () => {
    const result = normalizeHeaderEntries([
      { key: null as unknown as string, value: null as unknown as string },
    ]);

    expect(result).toEqual([]);
  });
});
