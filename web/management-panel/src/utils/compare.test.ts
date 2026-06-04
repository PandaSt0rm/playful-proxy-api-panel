import { describe, it, expect } from 'vitest';

import {
  areStringArraysEqual,
  areKeyValueEntriesEqual,
  areModelEntriesEqual,
} from '@/utils/compare';

describe('areStringArraysEqual', () => {
  it('returns true for the same array reference', () => {
    const arr = ['a', 'b'];

    expect(areStringArraysEqual(arr, arr)).toBe(true);
  });

  it('returns true for two empty arrays', () => {
    expect(areStringArraysEqual([], [])).toBe(true);
  });

  it('returns true for distinct arrays with identical ordered contents', () => {
    expect(areStringArraysEqual(['a', 'b'], ['a', 'b'])).toBe(true);
  });

  it('returns false when lengths differ', () => {
    expect(areStringArraysEqual(['a'], ['a', 'b'])).toBe(false);
  });

  it('returns false when contents differ at one index', () => {
    expect(areStringArraysEqual(['a', 'b'], ['a', 'c'])).toBe(false);
  });

  it('returns false when only the order differs', () => {
    expect(areStringArraysEqual(['a', 'b'], ['b', 'a'])).toBe(false);
  });

  it('treats empty-string elements as significant', () => {
    expect(areStringArraysEqual([''], [''])).toBe(true);
  });
});

describe('areKeyValueEntriesEqual', () => {
  it('returns true for the same array reference', () => {
    const arr = [{ key: 'a', value: '1' }];

    expect(areKeyValueEntriesEqual(arr, arr)).toBe(true);
  });

  it('returns true for two empty arrays', () => {
    expect(areKeyValueEntriesEqual([], [])).toBe(true);
  });

  it('returns true for distinct arrays with identical entries in the same order', () => {
    expect(
      areKeyValueEntriesEqual(
        [{ key: 'a', value: '1' }],
        [{ key: 'a', value: '1' }]
      )
    ).toBe(true);
  });

  it('returns false when lengths differ', () => {
    expect(
      areKeyValueEntriesEqual(
        [{ key: 'a', value: '1' }],
        [{ key: 'a', value: '1' }, { key: 'b', value: '2' }]
      )
    ).toBe(false);
  });

  it('returns false when a key differs', () => {
    expect(
      areKeyValueEntriesEqual(
        [{ key: 'a', value: '1' }],
        [{ key: 'b', value: '1' }]
      )
    ).toBe(false);
  });

  it('returns false when a value differs', () => {
    expect(
      areKeyValueEntriesEqual(
        [{ key: 'a', value: '1' }],
        [{ key: 'a', value: '2' }]
      )
    ).toBe(false);
  });

  it('returns false when the order differs', () => {
    expect(
      areKeyValueEntriesEqual(
        [{ key: 'a', value: '1' }, { key: 'b', value: '2' }],
        [{ key: 'b', value: '2' }, { key: 'a', value: '1' }]
      )
    ).toBe(false);
  });

  it('returns false when one side has a missing entry at an index', () => {
    const left = [{ key: 'a', value: '1' }];
    const right = [undefined as unknown as { key: string; value: string }];

    expect(areKeyValueEntriesEqual(left, right)).toBe(false);
  });
});

describe('areModelEntriesEqual', () => {
  it('returns true for the same array reference', () => {
    const arr = [{ name: 'gpt-4', alias: 'GPT 4' }];

    expect(areModelEntriesEqual(arr, arr)).toBe(true);
  });

  it('returns true for two empty arrays', () => {
    expect(areModelEntriesEqual([], [])).toBe(true);
  });

  it('returns true for distinct entries with matching name and alias', () => {
    expect(
      areModelEntriesEqual(
        [{ name: 'gpt-4', alias: 'GPT 4' }],
        [{ name: 'gpt-4', alias: 'GPT 4' }]
      )
    ).toBe(true);
  });

  it('returns false when lengths differ', () => {
    expect(
      areModelEntriesEqual(
        [{ name: 'gpt-4', alias: 'a' }],
        [{ name: 'gpt-4', alias: 'a' }, { name: 'claude', alias: 'c' }]
      )
    ).toBe(false);
  });

  it('returns false when a name differs', () => {
    expect(
      areModelEntriesEqual(
        [{ name: 'gpt-4', alias: 'a' }],
        [{ name: 'gpt-3', alias: 'a' }]
      )
    ).toBe(false);
  });

  it('returns false when an alias differs', () => {
    expect(
      areModelEntriesEqual(
        [{ name: 'gpt-4', alias: 'a' }],
        [{ name: 'gpt-4', alias: 'b' }]
      )
    ).toBe(false);
  });

  it('treats missing regex and explicit false as equal', () => {
    expect(
      areModelEntriesEqual(
        [{ name: 'm', alias: 'a' }],
        [{ name: 'm', alias: 'a', regex: false }]
      )
    ).toBe(true);
  });

  it('returns false when regex truthiness differs', () => {
    expect(
      areModelEntriesEqual(
        [{ name: 'm', alias: 'a', regex: true }],
        [{ name: 'm', alias: 'a', regex: false }]
      )
    ).toBe(false);
  });

  it('treats missing thinkingLevels and an empty array as equal', () => {
    expect(
      areModelEntriesEqual(
        [{ name: 'm', alias: 'a' }],
        [{ name: 'm', alias: 'a', thinkingLevels: [] }]
      )
    ).toBe(true);
  });

  it('returns false when thinkingLevels contents differ', () => {
    expect(
      areModelEntriesEqual(
        [{ name: 'm', alias: 'a', thinkingLevels: ['low'] }],
        [{ name: 'm', alias: 'a', thinkingLevels: ['high'] }]
      )
    ).toBe(false);
  });

  it('treats missing thinking and explicit null as equal', () => {
    expect(
      areModelEntriesEqual(
        [{ name: 'm', alias: 'a' }],
        [{ name: 'm', alias: 'a', thinking: null }]
      )
    ).toBe(true);
  });

  it('returns true for deeply equal thinking objects with the same key order', () => {
    expect(
      areModelEntriesEqual(
        [{ name: 'm', alias: 'a', thinking: { budget: 1000 } }],
        [{ name: 'm', alias: 'a', thinking: { budget: 1000 } }]
      )
    ).toBe(true);
  });

  it('returns false when thinking objects differ in value', () => {
    expect(
      areModelEntriesEqual(
        [{ name: 'm', alias: 'a', thinking: { budget: 1000 } }],
        [{ name: 'm', alias: 'a', thinking: { budget: 2000 } }]
      )
    ).toBe(false);
  });
});
