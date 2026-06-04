import { describe, it, expect } from 'vitest';
import type { SyncAvailableConfigs } from '@/types';
import { groupModels, findModelSource, type ModelGroup } from './modelGrouping';

const baseConfigs = (overrides: Partial<SyncAvailableConfigs>): SyncAvailableConfigs => ({
  base_url: 'http://localhost:8317',
  api_keys: [],
  providers: [],
  oauth_channels: [],
  all_models: [],
  ...overrides,
});

describe('groupModels', () => {
  it('returns an empty array when configs is null', () => {
    expect(groupModels(null)).toEqual([]);
  });

  it('returns an empty array when there are no providers or channels', () => {
    expect(groupModels(baseConfigs({}))).toEqual([]);
  });

  it('builds an OAuth group with display_name as the label', () => {
    const configs = baseConfigs({
      oauth_channels: [{ channel: 'codex', models: ['gpt-5'], display_name: 'Codex (OAuth)' }],
    });

    const groups = groupModels(configs);

    expect(groups).toEqual([
      {
        key: 'oauth:codex',
        label: 'Codex (OAuth)',
        sublabel: 'codex',
        models: ['gpt-5'],
      },
    ]);
  });

  it('falls back to title-cased channel plus suffix when display_name is missing', () => {
    const configs = baseConfigs({
      oauth_channels: [{ channel: 'claude', models: ['claude-3'] }],
    });

    const groups = groupModels(configs);

    expect(groups[0].label).toBe('Claude (OAuth)');
  });

  it('falls back to title-cased channel when display_name is only whitespace', () => {
    const configs = baseConfigs({
      oauth_channels: [{ channel: 'gemini', models: ['gemini-pro'], display_name: '   ' }],
    });

    const groups = groupModels(configs);

    expect(groups[0].label).toBe('Gemini (OAuth)');
  });

  it('renders a pluralized account sublabel when account_count is greater than one', () => {
    const configs = baseConfigs({
      oauth_channels: [{ channel: 'codex', models: ['gpt-5'], account_count: 3 }],
    });

    const groups = groupModels(configs);

    expect(groups[0].sublabel).toBe('3 accounts · codex');
  });

  it('renders a singular account sublabel when account_count is exactly one', () => {
    const configs = baseConfigs({
      oauth_channels: [{ channel: 'codex', models: ['gpt-5'], account_count: 1 }],
    });

    const groups = groupModels(configs);

    expect(groups[0].sublabel).toBe('1 account · codex');
  });

  it('uses the bare channel as sublabel when account_count is zero', () => {
    const configs = baseConfigs({
      oauth_channels: [{ channel: 'codex', models: ['gpt-5'], account_count: 0 }],
    });

    const groups = groupModels(configs);

    expect(groups[0].sublabel).toBe('codex');
  });

  it('skips OAuth channels that have no models', () => {
    const configs = baseConfigs({
      oauth_channels: [
        { channel: 'empty', models: [] },
        { channel: 'codex', models: ['gpt-5'] },
      ],
    });

    const groups = groupModels(configs);

    expect(groups.map((g) => g.key)).toEqual(['oauth:codex']);
  });

  it('sorts OAuth channels alphabetically by channel id', () => {
    const configs = baseConfigs({
      oauth_channels: [
        { channel: 'zeta', models: ['z'] },
        { channel: 'alpha', models: ['a'] },
        { channel: 'mid', models: ['m'] },
      ],
    });

    const groups = groupModels(configs);

    expect(groups.map((g) => g.key)).toEqual(['oauth:alpha', 'oauth:mid', 'oauth:zeta']);
  });

  it('deduplicates OAuth models case-insensitively while preserving first-seen order', () => {
    const configs = baseConfigs({
      oauth_channels: [{ channel: 'codex', models: ['GPT-5', 'gpt-5', 'gpt-4o', 'GPT-4O'] }],
    });

    const groups = groupModels(configs);

    expect(groups[0].models).toEqual(['GPT-5', 'gpt-4o']);
  });

  it('labels a known provider type from the label map', () => {
    const configs = baseConfigs({
      providers: [{ type: 'claude-api-key', models: ['claude-3'] }],
    });

    const groups = groupModels(configs);

    expect(groups[0]).toEqual({
      key: 'provider:claude-api-key:',
      label: 'Claude (API key)',
      sublabel: 'claude-api-key',
      models: ['claude-3'],
    });
  });

  it('uses the raw type as the label for an unknown provider type', () => {
    const configs = baseConfigs({
      providers: [{ type: 'mystery-type', models: ['m1'] }],
    });

    const groups = groupModels(configs);

    expect(groups[0].label).toBe('mystery-type');
  });

  it('labels an openai-compatibility provider with its trimmed name', () => {
    const configs = baseConfigs({
      providers: [{ type: 'openai-compatibility', name: '  MyProxy  ', models: ['m1'] }],
    });

    const groups = groupModels(configs);

    expect(groups[0]).toEqual({
      key: 'provider:openai-compatibility:  MyProxy  ',
      label: 'MyProxy',
      sublabel: 'OpenAI-compatible',
      models: ['m1'],
    });
  });

  it('falls back to a generic label for an openai-compatibility provider with no name', () => {
    const configs = baseConfigs({
      providers: [{ type: 'openai-compatibility', models: ['m1'] }],
    });

    const groups = groupModels(configs);

    expect(groups[0].label).toBe('OpenAI-compatible');
  });

  it('skips providers that have no models', () => {
    const configs = baseConfigs({
      providers: [
        { type: 'claude-api-key', models: [] },
        { type: 'gemini-api-key', models: ['gemini-pro'] },
      ],
    });

    const groups = groupModels(configs);

    expect(groups.map((g) => g.key)).toEqual(['provider:gemini-api-key:']);
  });

  it('orders providers by the configured type ranking', () => {
    const configs = baseConfigs({
      providers: [
        { type: 'vertex-api-key', models: ['v'] },
        { type: 'openai-compatibility', name: 'X', models: ['o'] },
        { type: 'claude-api-key', models: ['c'] },
        { type: 'codex-api-key', models: ['cx'] },
        { type: 'gemini-api-key', models: ['g'] },
      ],
    });

    const groups = groupModels(configs);

    expect(groups.map((g) => g.label)).toEqual([
      'Claude (API key)',
      'Codex (API key)',
      'Gemini (API key)',
      'Vertex (API key)',
      'X',
    ]);
  });

  it('breaks ties between same-type providers by name', () => {
    const configs = baseConfigs({
      providers: [
        { type: 'openai-compatibility', name: 'Zebra', models: ['z'] },
        { type: 'openai-compatibility', name: 'Apple', models: ['a'] },
      ],
    });

    const groups = groupModels(configs);

    expect(groups.map((g) => g.label)).toEqual(['Apple', 'Zebra']);
  });

  it('places unknown provider types after all ranked types', () => {
    const configs = baseConfigs({
      providers: [
        { type: 'weird', models: ['w'] },
        { type: 'claude-api-key', models: ['c'] },
      ],
    });

    const groups = groupModels(configs);

    expect(groups.map((g) => g.label)).toEqual(['Claude (API key)', 'weird']);
  });

  it('lists all OAuth groups before any provider groups', () => {
    const configs = baseConfigs({
      oauth_channels: [{ channel: 'codex', models: ['gpt-5'] }],
      providers: [{ type: 'claude-api-key', models: ['claude-3'] }],
    });

    const groups = groupModels(configs);

    expect(groups.map((g) => g.key)).toEqual(['oauth:codex', 'provider:claude-api-key:']);
  });
});

describe('findModelSource', () => {
  const groups: ModelGroup[] = [
    { key: 'oauth:codex', label: 'Codex', models: ['gpt-5', 'gpt-4o'] },
    { key: 'provider:claude-api-key:', label: 'Claude', models: ['claude-3', 'gpt-5'] },
  ];

  it('returns the first group that contains the model id', () => {
    expect(findModelSource(groups, 'gpt-5')).toBe(groups[0]);
  });

  it('returns the group for a model only present later in the list', () => {
    expect(findModelSource(groups, 'claude-3')).toBe(groups[1]);
  });

  it('returns undefined when no group contains the model id', () => {
    expect(findModelSource(groups, 'nonexistent')).toBeUndefined();
  });

  it('returns undefined when matching is required to be case-sensitive', () => {
    expect(findModelSource(groups, 'GPT-5')).toBeUndefined();
  });

  it('returns undefined for an empty group list', () => {
    expect(findModelSource([], 'gpt-5')).toBeUndefined();
  });
});
