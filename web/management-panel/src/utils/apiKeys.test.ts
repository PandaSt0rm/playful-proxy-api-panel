import { describe, it, expect } from 'vitest';

import { normalizeApiKeyList } from './apiKeys';

describe('normalizeApiKeyList', () => {
  it('returns an empty array for a non-array input', () => {
    const result = normalizeApiKeyList({ keys: ['a'] });

    expect(result).toEqual([]);
  });

  it('returns an empty array for null', () => {
    const result = normalizeApiKeyList(null);

    expect(result).toEqual([]);
  });

  it('returns trimmed string keys', () => {
    const result = normalizeApiKeyList(['  key-1  ', 'key-2']);

    expect(result).toEqual(['key-1', 'key-2']);
  });

  it('drops empty and whitespace-only string entries', () => {
    const result = normalizeApiKeyList(['valid', '', '   ']);

    expect(result).toEqual(['valid']);
  });

  it('de-duplicates repeated keys, keeping first occurrence order', () => {
    const result = normalizeApiKeyList(['dup', 'dup', 'other']);

    expect(result).toEqual(['dup', 'other']);
  });

  it('de-duplicates keys that differ only by surrounding whitespace', () => {
    const result = normalizeApiKeyList(['key', '  key  ']);

    expect(result).toEqual(['key']);
  });

  it('extracts the api-key field from object entries', () => {
    const result = normalizeApiKeyList([{ 'api-key': 'k1' }]);

    expect(result).toEqual(['k1']);
  });

  it('extracts the apiKey field from object entries', () => {
    const result = normalizeApiKeyList([{ apiKey: 'k2' }]);

    expect(result).toEqual(['k2']);
  });

  it('extracts the lowercase key field from object entries', () => {
    const result = normalizeApiKeyList([{ key: 'k3' }]);

    expect(result).toEqual(['k3']);
  });

  it('extracts the capitalized Key field from object entries', () => {
    const result = normalizeApiKeyList([{ Key: 'k4' }]);

    expect(result).toEqual(['k4']);
  });

  it('prefers api-key over the other field aliases', () => {
    const result = normalizeApiKeyList([{ 'api-key': 'preferred', apiKey: 'no', key: 'no' }]);

    expect(result).toEqual(['preferred']);
  });

  it('handles a mix of string and object entries', () => {
    const result = normalizeApiKeyList(['plain', { apiKey: 'from-object' }]);

    expect(result).toEqual(['plain', 'from-object']);
  });

  it('skips object entries that have no recognised key field', () => {
    const result = normalizeApiKeyList([{ unrelated: 'x' }, 'valid']);

    expect(result).toEqual(['valid']);
  });

  it('skips null entries inside the array', () => {
    const result = normalizeApiKeyList([null, 'valid']);

    expect(result).toEqual(['valid']);
  });

  it('treats a nested array entry as having no key field', () => {
    const result = normalizeApiKeyList([['nested'], 'valid']);

    expect(result).toEqual(['valid']);
  });

  it('returns an empty array for an empty input array', () => {
    const result = normalizeApiKeyList([]);

    expect(result).toEqual([]);
  });
});
