import { describe, it, expect } from 'vitest';
import type { ModelAlias } from '@/types';
import { modelsToEntries, entriesToModels, type ModelEntry } from './modelInputListUtils';

describe('modelsToEntries', () => {
  it('returns a single blank entry for an undefined model list', () => {
    expect(modelsToEntries(undefined)).toEqual([{ name: '', alias: '' }]);
  });

  it('returns a single blank entry for an empty model list', () => {
    expect(modelsToEntries([])).toEqual([{ name: '', alias: '' }]);
  });

  it('returns a single blank entry when given a non-array value', () => {
    expect(modelsToEntries('oops' as unknown as ModelAlias[])).toEqual([{ name: '', alias: '' }]);
  });

  it('maps name and alias for a basic model', () => {
    expect(modelsToEntries([{ name: 'gpt-4o', alias: 'fast' }])).toEqual([
      { name: 'gpt-4o', alias: 'fast' },
    ]);
  });

  it('substitutes empty strings for a model missing name and alias', () => {
    expect(modelsToEntries([{ name: '' } as ModelAlias])).toEqual([{ name: '', alias: '' }]);
  });

  it('copies the thinking config into a fresh object', () => {
    const thinking = { min: 1, max: 10 };
    const models: ModelAlias[] = [{ name: 'm', thinking }];

    const entries = modelsToEntries(models);

    expect(entries[0].thinking).toEqual({ min: 1, max: 10 });
    expect(entries[0].thinking).not.toBe(thinking);
  });

  it('prefers top-level thinkingLevels over thinking.levels', () => {
    const models: ModelAlias[] = [
      { name: 'm', thinkingLevels: ['low', 'high'], thinking: { levels: ['ignored'] } },
    ];

    const entries = modelsToEntries(models);

    expect(entries[0].thinkingLevels).toEqual(['low', 'high']);
  });

  it('falls back to thinking.levels when top-level thinkingLevels is absent', () => {
    const models: ModelAlias[] = [{ name: 'm', thinking: { levels: ['medium'] } }];

    const entries = modelsToEntries(models);

    expect(entries[0].thinkingLevels).toEqual(['medium']);
  });

  it('omits thinkingLevels when both sources are empty', () => {
    const models: ModelAlias[] = [{ name: 'm', thinkingLevels: [], thinking: { levels: [] } }];

    const entries = modelsToEntries(models);

    expect(entries[0].thinkingLevels).toBeUndefined();
  });

  it('omits the thinking field when the model has none', () => {
    const entries = modelsToEntries([{ name: 'm' }]);

    expect(entries[0].thinking).toBeUndefined();
  });

  it('copies thinkingLevels into a fresh array', () => {
    const levels = ['low', 'high'];
    const entries = modelsToEntries([{ name: 'm', thinkingLevels: levels }]);

    expect(entries[0].thinkingLevels).not.toBe(levels);
  });

  it('maps each model in a multi-entry list independently', () => {
    const entries = modelsToEntries([
      { name: 'a', alias: 'aa' },
      { name: 'b' },
    ]);

    expect(entries).toEqual([
      { name: 'a', alias: 'aa' },
      { name: 'b', alias: '' },
    ]);
  });
});

describe('entriesToModels', () => {
  it('returns an empty array for an empty entries list', () => {
    expect(entriesToModels([])).toEqual([]);
  });

  it('drops entries whose name is blank after trimming', () => {
    expect(entriesToModels([{ name: '   ', alias: 'x' }])).toEqual([]);
  });

  it('trims the name when building the model', () => {
    expect(entriesToModels([{ name: '  gpt-4o  ', alias: '' }])).toEqual([{ name: 'gpt-4o' }]);
  });

  it('keeps a distinct trimmed alias', () => {
    expect(entriesToModels([{ name: 'gpt-4o', alias: '  fast  ' }])).toEqual([
      { name: 'gpt-4o', alias: 'fast' },
    ]);
  });

  it('omits the alias when it equals the name after trimming', () => {
    expect(entriesToModels([{ name: 'gpt-4o', alias: 'gpt-4o' }])).toEqual([{ name: 'gpt-4o' }]);
  });

  it('omits a blank alias', () => {
    expect(entriesToModels([{ name: 'gpt-4o', alias: '   ' }])).toEqual([{ name: 'gpt-4o' }]);
  });

  it('attaches both thinking and thinkingLevels when thinkingLevels is present', () => {
    const entries: ModelEntry[] = [
      { name: 'm', alias: '', thinking: { min: 2 }, thinkingLevels: ['low', 'high'] },
    ];

    expect(entriesToModels(entries)).toEqual([
      {
        name: 'm',
        thinking: { min: 2, levels: ['low', 'high'] },
        thinkingLevels: ['low', 'high'],
      },
    ]);
  });

  it('builds thinking solely from levels when entry has no other thinking config', () => {
    const entries: ModelEntry[] = [{ name: 'm', alias: '', thinkingLevels: ['fast'] }];

    expect(entriesToModels(entries)).toEqual([
      { name: 'm', thinking: { levels: ['fast'] }, thinkingLevels: ['fast'] },
    ]);
  });

  it('keeps a meaningful thinking config even when thinkingLevels is empty', () => {
    const entries: ModelEntry[] = [{ name: 'm', alias: '', thinking: { max: 5 }, thinkingLevels: [] }];

    expect(entriesToModels(entries)).toEqual([{ name: 'm', thinking: { max: 5 } }]);
  });

  it('drops an empty thinking config that has no meaningful fields', () => {
    const entries: ModelEntry[] = [{ name: 'm', alias: '', thinking: {} }];

    expect(entriesToModels(entries)).toEqual([{ name: 'm' }]);
  });

  it('treats zeroAllowed false as a meaningful thinking config', () => {
    const entries: ModelEntry[] = [{ name: 'm', alias: '', thinking: { zeroAllowed: false } }];

    expect(entriesToModels(entries)).toEqual([{ name: 'm', thinking: { zeroAllowed: false } }]);
  });

  it('treats dynamicAllowed true as a meaningful thinking config', () => {
    const entries: ModelEntry[] = [{ name: 'm', alias: '', thinking: { dynamicAllowed: true } }];

    expect(entriesToModels(entries)).toEqual([{ name: 'm', thinking: { dynamicAllowed: true } }]);
  });

  it('does not mutate the source thinking object', () => {
    const thinking = { min: 1 };
    const entries: ModelEntry[] = [{ name: 'm', alias: '', thinking, thinkingLevels: ['a'] }];

    entriesToModels(entries);

    expect(thinking).toEqual({ min: 1 });
  });

  it('filters and maps a mixed list keeping only named entries', () => {
    const entries: ModelEntry[] = [
      { name: 'a', alias: 'aa' },
      { name: '', alias: 'skip' },
      { name: 'b', alias: 'b' },
    ];

    expect(entriesToModels(entries)).toEqual([{ name: 'a', alias: 'aa' }, { name: 'b' }]);
  });

  it('round-trips a model with name, alias, and levels through entries and back', () => {
    const models: ModelAlias[] = [
      { name: 'gpt-4o', alias: 'fast', thinking: { levels: ['low'] }, thinkingLevels: ['low'] },
    ];

    const result = entriesToModels(modelsToEntries(models));

    expect(result).toEqual(models);
  });
});
