import { describe, it, expect } from 'vitest';

import { normalizeModelList, classifyModels, type ModelInfo } from '@/utils/models';

describe('normalizeModelList', () => {
  it('returns an empty array for null payload', () => {
    const result = normalizeModelList(null);

    expect(result).toEqual([]);
  });

  it('returns an empty array for undefined payload', () => {
    const result = normalizeModelList(undefined);

    expect(result).toEqual([]);
  });

  it('returns an empty array for a primitive payload', () => {
    const result = normalizeModelList('gpt-4');

    expect(result).toEqual([]);
  });

  it('wraps a plain string entry into a name-only model', () => {
    const result = normalizeModelList(['gpt-4']);

    expect(result).toEqual([{ name: 'gpt-4' }]);
  });

  it('maps an object id field to the model name', () => {
    const result = normalizeModelList([{ id: 'gpt-4' }]);

    expect(result).toEqual([{ name: 'gpt-4' }]);
  });

  it('prefers id over name when both are present', () => {
    const result = normalizeModelList([{ id: 'real-id', name: 'other-name' }]);

    expect(result).toEqual([{ name: 'real-id' }]);
  });

  it('falls back to the model field when id and name are absent', () => {
    const result = normalizeModelList([{ model: 'claude-3' }]);

    expect(result).toEqual([{ name: 'claude-3' }]);
  });

  it('falls back to the value field when id, name and model are absent', () => {
    const result = normalizeModelList([{ value: 'gemini-pro' }]);

    expect(result).toEqual([{ name: 'gemini-pro' }]);
  });

  it('captures alias from display_name when it differs from the name', () => {
    const result = normalizeModelList([{ id: 'gpt-4', display_name: 'GPT 4' }]);

    expect(result).toEqual([{ name: 'gpt-4', alias: 'GPT 4' }]);
  });

  it('omits the alias when it equals the name', () => {
    const result = normalizeModelList([{ id: 'gpt-4', alias: 'gpt-4' }]);

    expect(result).toEqual([{ name: 'gpt-4' }]);
  });

  it('captures description from the note field', () => {
    const result = normalizeModelList([{ id: 'gpt-4', note: 'fast model' }]);

    expect(result).toEqual([{ name: 'gpt-4', description: 'fast model' }]);
  });

  it('coerces non-string name values into strings', () => {
    const result = normalizeModelList([{ id: 12345 }]);

    expect(result).toEqual([{ name: '12345' }]);
  });

  it('drops object entries that have no usable name field', () => {
    const result = normalizeModelList([{ foo: 'bar' }]);

    expect(result).toEqual([]);
  });

  it('drops null entries inside an array payload', () => {
    const result = normalizeModelList(['gpt-4', null, 'claude-3']);

    expect(result).toEqual([{ name: 'gpt-4' }, { name: 'claude-3' }]);
  });

  it('drops array entries inside an array payload because arrays are not records', () => {
    const result = normalizeModelList([['nested'], 'gpt-4']);

    expect(result).toEqual([{ name: 'gpt-4' }]);
  });

  it('reads models from a data wrapper object', () => {
    const result = normalizeModelList({ data: [{ id: 'gpt-4' }] });

    expect(result).toEqual([{ name: 'gpt-4' }]);
  });

  it('reads models from a models wrapper object', () => {
    const result = normalizeModelList({ models: ['claude-3'] });

    expect(result).toEqual([{ name: 'claude-3' }]);
  });

  it('prefers the data wrapper over the models wrapper when both exist', () => {
    const result = normalizeModelList({ data: ['from-data'], models: ['from-models'] });

    expect(result).toEqual([{ name: 'from-data' }]);
  });

  it('returns an empty array for a record without data or models arrays', () => {
    const result = normalizeModelList({ data: 'not-an-array' });

    expect(result).toEqual([]);
  });

  it('keeps duplicate names when dedupe is not requested', () => {
    const result = normalizeModelList(['gpt-4', 'gpt-4']);

    expect(result).toEqual([{ name: 'gpt-4' }, { name: 'gpt-4' }]);
  });

  it('removes case-insensitive duplicate names when dedupe is requested', () => {
    const result = normalizeModelList(['gpt-4', 'GPT-4', 'claude-3'], { dedupe: true });

    expect(result).toEqual([{ name: 'gpt-4' }, { name: 'claude-3' }]);
  });

  it('keeps the first occurrence when deduping', () => {
    const result = normalizeModelList(
      [
        { id: 'gpt-4', alias: 'First' },
        { id: 'gpt-4', alias: 'Second' },
      ],
      { dedupe: true }
    );

    expect(result).toEqual([{ name: 'gpt-4', alias: 'First' }]);
  });
});

describe('classifyModels', () => {
  it('returns an empty array for an empty model list', () => {
    const result = classifyModels([]);

    expect(result).toEqual([]);
  });

  it('returns an empty array when called with no arguments', () => {
    const result = classifyModels();

    expect(result).toEqual([]);
  });

  it('groups a GPT model under the gpt category', () => {
    const result = classifyModels([{ name: 'gpt-4' }]);

    expect(result).toEqual([{ id: 'gpt', label: 'GPT', items: [{ name: 'gpt-4' }] }]);
  });

  it('groups an o-series reasoning model under the gpt category', () => {
    const result = classifyModels([{ name: 'o3-mini' }]);

    expect(result).toEqual([{ id: 'gpt', label: 'GPT', items: [{ name: 'o3-mini' }] }]);
  });

  it('groups a Claude model under the claude category', () => {
    const result = classifyModels([{ name: 'claude-3-opus' }]);

    expect(result).toEqual([{ id: 'claude', label: 'Claude', items: [{ name: 'claude-3-opus' }] }]);
  });

  it('groups a Gemini model under the gemini category', () => {
    const result = classifyModels([{ name: 'gemini-1.5-pro' }]);

    expect(result).toEqual([
      { id: 'gemini', label: 'Gemini', items: [{ name: 'gemini-1.5-pro' }] },
    ]);
  });

  it('groups a ChatGLM model under the glm category', () => {
    const result = classifyModels([{ name: 'chatglm-4' }]);

    expect(result).toEqual([{ id: 'glm', label: 'GLM', items: [{ name: 'chatglm-4' }] }]);
  });

  it('classifies a model by its alias when the name does not match', () => {
    const result = classifyModels([{ name: 'mystery-1', alias: 'Claude Sonnet' }]);

    expect(result).toEqual([
      { id: 'claude', label: 'Claude', items: [{ name: 'mystery-1', alias: 'Claude Sonnet' }] },
    ]);
  });

  it('places an unrecognised model into the default Other group', () => {
    const result = classifyModels([{ name: 'totally-unknown' }]);

    expect(result).toEqual([{ id: 'other', label: 'Other', items: [{ name: 'totally-unknown' }] }]);
  });

  it('uses a custom other label when provided', () => {
    const result = classifyModels([{ name: 'totally-unknown' }], { otherLabel: 'Uncategorised' });

    expect(result).toEqual([
      { id: 'other', label: 'Uncategorised', items: [{ name: 'totally-unknown' }] },
    ]);
  });

  it('omits categories that have no matching models', () => {
    const result = classifyModels([{ name: 'gpt-4' }, { name: 'claude-3' }]);

    const ids = result.map((group) => group.id);
    expect(ids).toEqual(['gpt', 'claude']);
  });

  it('orders the Other group after all populated known categories', () => {
    const models: ModelInfo[] = [{ name: 'unknown-x' }, { name: 'gpt-4' }];

    const result = classifyModels(models);

    const ids = result.map((group) => group.id);
    expect(ids).toEqual(['gpt', 'other']);
  });

  it('collects multiple models that fall in the same category', () => {
    const result = classifyModels([{ name: 'gpt-4' }, { name: 'gpt-3.5-turbo' }]);

    expect(result).toEqual([
      { id: 'gpt', label: 'GPT', items: [{ name: 'gpt-4' }, { name: 'gpt-3.5-turbo' }] },
    ]);
  });

  it('emits known categories in their declared priority order', () => {
    const result = classifyModels([{ name: 'grok-2' }, { name: 'gemini-pro' }, { name: 'gpt-4' }]);

    const ids = result.map((group) => group.id);
    expect(ids).toEqual(['gpt', 'gemini', 'grok']);
  });
});
