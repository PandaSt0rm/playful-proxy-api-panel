import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  providersApi,
  serializeApiKeyEntry,
  serializeGeminiKey,
  serializeModelAliases,
  serializeOpenAIProvider,
  serializeProviderKey,
} from './providers';
import { apiClient } from './client';
import type {
  ApiKeyEntry,
  GeminiKeyConfig,
  ModelAlias,
  OpenAIProviderConfig,
  ProviderKeyConfig,
} from '@/types';

vi.mock('./client', () => ({
  apiClient: {
    get: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockedGet = vi.mocked(apiClient.get);
const mockedPut = vi.mocked(apiClient.put);
const mockedPatch = vi.mocked(apiClient.patch);
const mockedDelete = vi.mocked(apiClient.delete);

beforeEach(() => {
  mockedGet.mockReset();
  mockedPut.mockReset();
  mockedPatch.mockReset();
  mockedDelete.mockReset();
});

describe('serializeModelAliases', () => {
  it('returns undefined when given no models', () => {
    expect(serializeModelAliases(undefined)).toBeUndefined();
  });

  it('drops models that have no name', () => {
    const result = serializeModelAliases([{ name: '' } as ModelAlias, { name: 'gpt-4' }]);

    expect(result).toEqual([{ name: 'gpt-4' }]);
  });

  it('keeps an alias only when it differs from the name', () => {
    const result = serializeModelAliases([{ name: 'gpt-4', alias: 'smart' }]);

    expect(result).toEqual([{ name: 'gpt-4', alias: 'smart' }]);
  });

  it('omits the alias when it equals the name', () => {
    const result = serializeModelAliases([{ name: 'gpt-4', alias: 'gpt-4' }]);

    expect(result).toEqual([{ name: 'gpt-4' }]);
  });

  it('emits priority and test-model in kebab-case', () => {
    const result = serializeModelAliases([{ name: 'm', priority: 3, testModel: 'm-test' }]);

    expect(result).toEqual([{ name: 'm', priority: 3, 'test-model': 'm-test' }]);
  });

  it('serializes thinking support to a snake_case payload', () => {
    const result = serializeModelAliases([
      { name: 'm', thinking: { min: 1, max: 9, zeroAllowed: true, dynamicAllowed: false } },
    ]);

    expect(result).toEqual([
      { name: 'm', thinking: { min: 1, max: 9, zero_allowed: true, dynamic_allowed: false } },
    ]);
  });

  it('prefers top-level thinkingLevels over thinking.levels', () => {
    const result = serializeModelAliases([
      { name: 'm', thinkingLevels: ['high'], thinking: { levels: ['low'] } },
    ]);

    expect(result).toEqual([{ name: 'm', thinking: { levels: ['high'] } }]);
  });

  it('falls back to thinking.levels when thinkingLevels is empty', () => {
    const result = serializeModelAliases([
      { name: 'm', thinkingLevels: [], thinking: { levels: ['low', 'high'] } },
    ]);

    expect(result).toEqual([{ name: 'm', thinking: { levels: ['low', 'high'] } }]);
  });

  it('omits thinking entirely when no thinking fields are set', () => {
    const result = serializeModelAliases([{ name: 'm', thinking: {} }]);

    expect(result).toEqual([{ name: 'm' }]);
  });

  it('serializes thinking payloads under thinking-payloads', () => {
    const result = serializeModelAliases([
      {
        name: 'glm-4.6',
        thinkingPayloads: {
          none: { thinking: { type: 'disabled' } },
          high: { thinking: { type: 'enabled' } },
        },
      },
    ]);

    expect(result).toEqual([
      {
        name: 'glm-4.6',
        'thinking-payloads': {
          none: { thinking: { type: 'disabled' } },
          high: { thinking: { type: 'enabled' } },
        },
      },
    ]);
  });

  it('removes a stale thinking-payloads key when payloads are cleared', () => {
    const result = serializeModelAliases([
      {
        name: 'glm-4.6',
        raw: { name: 'glm-4.6', 'thinking-payloads': { high: { x: 1 } } },
      },
    ]);

    expect(result).toEqual([{ name: 'glm-4.6' }]);
  });

  it('strips a stale thinking entry carried in raw when no thinking config is provided', () => {
    const result = serializeModelAliases([{ name: 'm', raw: { thinking: { min: 1 } } }]);

    expect(result).toEqual([{ name: 'm' }]);
  });

  it('strips a stale alias carried in raw when alias equals name', () => {
    const result = serializeModelAliases([{ name: 'm', alias: 'm', raw: { alias: 'old' } }]);

    expect(result).toEqual([{ name: 'm' }]);
  });
});

describe('serializeApiKeyEntry', () => {
  it('writes the api-key and trims an optional proxy url', () => {
    const entry: ApiKeyEntry = { apiKey: 'k', proxyUrl: '  http://p  ' };

    const result = serializeApiKeyEntry(entry);

    expect(result).toEqual({ 'api-key': 'k', 'proxy-url': 'http://p' });
  });

  it('omits the proxy url when it is blank', () => {
    const entry: ApiKeyEntry = { apiKey: 'k', proxyUrl: '   ' };

    const result = serializeApiKeyEntry(entry);

    expect(result).toEqual({ 'api-key': 'k' });
  });

  it('keeps non-empty headers and drops auth index fields', () => {
    const entry: ApiKeyEntry = {
      apiKey: 'k',
      headers: { 'X-A': '1' },
      raw: { 'auth-index': '5', authIndex: '5', auth_index: '5', extra: true },
    };

    const result = serializeApiKeyEntry(entry);

    expect(result).toEqual({ 'api-key': 'k', headers: { 'X-A': '1' }, extra: true });
  });

  it('drops empty headers', () => {
    const entry: ApiKeyEntry = { apiKey: 'k', headers: {} };

    const result = serializeApiKeyEntry(entry);

    expect(result).toEqual({ 'api-key': 'k' });
  });
});

describe('serializeProviderKey', () => {
  it('serializes the full set of scalar fields with kebab-case keys', () => {
    const config: ProviderKeyConfig = {
      apiKey: 'k',
      priority: 2,
      prefix: 'p',
      baseUrl: 'https://b',
      websockets: true,
      proxyUrl: 'http://proxy',
      headers: { H: 'v' },
    };

    const result = serializeProviderKey(config);

    expect(result).toEqual({
      'api-key': 'k',
      priority: 2,
      prefix: 'p',
      'base-url': 'https://b',
      websockets: true,
      'proxy-url': 'http://proxy',
      headers: { H: 'v' },
    });
  });

  it('emits models and excluded-models when provided', () => {
    const config: ProviderKeyConfig = {
      apiKey: 'k',
      models: [{ name: 'm' }],
      excludedModels: ['x'],
    };

    const result = serializeProviderKey(config);

    expect(result).toEqual({
      'api-key': 'k',
      models: [{ name: 'm' }],
      'excluded-models': ['x'],
    });
  });

  it('omits empty models and excluded-models', () => {
    const config: ProviderKeyConfig = { apiKey: 'k', models: [], excludedModels: [] };

    const result = serializeProviderKey(config);

    expect(result).toEqual({ 'api-key': 'k' });
  });

  it('serializes a cloak block with kebab-case keys', () => {
    const config: ProviderKeyConfig = {
      apiKey: 'k',
      cloak: { mode: ' on ', strictMode: true, sensitiveWords: ['secret'], cacheUserId: true },
    };

    const result = serializeProviderKey(config);

    expect(result).toEqual({
      'api-key': 'k',
      cloak: {
        mode: 'on',
        'strict-mode': true,
        'sensitive-words': ['secret'],
        'cache-user-id': true,
      },
    });
  });

  it('drops the cloak block when it serializes to nothing', () => {
    const config: ProviderKeyConfig = { apiKey: 'k', cloak: {} };

    const result = serializeProviderKey(config);

    expect(result).toEqual({ 'api-key': 'k' });
  });

  it('removes auth index keys carried over in raw', () => {
    const config: ProviderKeyConfig = {
      apiKey: 'k',
      raw: { 'auth-index': '1', authIndex: '1', auth_index: '1' },
    };

    const result = serializeProviderKey(config);

    expect(result).toEqual({ 'api-key': 'k' });
  });

  it('clears a stale false disable-cooling flag from raw', () => {
    const config: ProviderKeyConfig = { apiKey: 'k', raw: { 'disable-cooling': true } };

    const result = serializeProviderKey(config);

    expect(result).toEqual({ 'api-key': 'k' });
  });
});

describe('serializeGeminiKey', () => {
  it('serializes scalar fields and drops auth index', () => {
    const config: GeminiKeyConfig = {
      apiKey: 'g',
      priority: 1,
      prefix: 'pre',
      baseUrl: 'https://gem',
      proxyUrl: 'http://p',
      headers: { A: 'b' },
      disableCooling: true,
      raw: { authIndex: '7' },
    };

    const result = serializeGeminiKey(config);

    expect(result).toEqual({
      'api-key': 'g',
      priority: 1,
      prefix: 'pre',
      'base-url': 'https://gem',
      'proxy-url': 'http://p',
      headers: { A: 'b' },
      'disable-cooling': true,
    });
  });

  it('omits models when empty', () => {
    const config: GeminiKeyConfig = { apiKey: 'g', models: [] };

    const result = serializeGeminiKey(config);

    expect(result).toEqual({ 'api-key': 'g' });
  });
});

describe('serializeOpenAIProvider', () => {
  it('always emits name, base-url and an api-key-entries array', () => {
    const provider: OpenAIProviderConfig = {
      name: 'openrouter',
      baseUrl: 'https://or',
      apiKeyEntries: [{ apiKey: 'k1' }],
    };

    const result = serializeOpenAIProvider(provider);

    expect(result).toEqual({
      name: 'openrouter',
      'base-url': 'https://or',
      'api-key-entries': [{ 'api-key': 'k1' }],
    });
  });

  it('emits an empty api-key-entries array when entries are not an array', () => {
    const provider = {
      name: 'p',
      baseUrl: 'https://p',
      apiKeyEntries: undefined,
    } as unknown as OpenAIProviderConfig;

    const result = serializeOpenAIProvider(provider);

    expect(result['api-key-entries']).toEqual([]);
  });

  it('emits the disabled flag and optional scalar fields', () => {
    const provider: OpenAIProviderConfig = {
      name: 'p',
      baseUrl: 'https://p',
      apiKeyEntries: [],
      disabled: true,
      prefix: 'pre',
      priority: 5,
      testModel: 't',
      disableCooling: true,
    };

    const result = serializeOpenAIProvider(provider);

    expect(result).toEqual({
      name: 'p',
      'base-url': 'https://p',
      'api-key-entries': [],
      disabled: true,
      prefix: 'pre',
      priority: 5,
      'test-model': 't',
      'disable-cooling': true,
    });
  });
});

describe('providersApi.getGeminiKeys', () => {
  it('extracts the gemini-api-key array and normalizes entries', async () => {
    mockedGet.mockResolvedValue({ 'gemini-api-key': [{ 'api-key': 'g1' }, { 'api-key': 'g2' }] });

    const result = await providersApi.getGeminiKeys();

    expect(result.map((c) => c.apiKey)).toEqual(['g1', 'g2']);
  });

  it('reads the gemini-api-key endpoint', async () => {
    mockedGet.mockResolvedValue([]);

    await providersApi.getGeminiKeys();

    expect(mockedGet).toHaveBeenCalledWith('/gemini-api-key');
  });

  it('drops entries that normalize to null (blank api keys)', async () => {
    mockedGet.mockResolvedValue([{ 'api-key': '   ' }, { 'api-key': 'real' }]);

    const result = await providersApi.getGeminiKeys();

    expect(result.map((c) => c.apiKey)).toEqual(['real']);
  });

  it('returns an empty list for a non-array, keyless payload', async () => {
    mockedGet.mockResolvedValue({ unrelated: true });

    const result = await providersApi.getGeminiKeys();

    expect(result).toEqual([]);
  });

  it('reads a top-level array payload directly', async () => {
    mockedGet.mockResolvedValue([{ 'api-key': 'g1' }]);

    const result = await providersApi.getGeminiKeys();

    expect(result.map((c) => c.apiKey)).toEqual(['g1']);
  });
});

describe('providersApi.getCodexConfigs', () => {
  it('extracts from the items fallback key', async () => {
    mockedGet.mockResolvedValue({ items: [{ 'api-key': 'c1' }] });

    const result = await providersApi.getCodexConfigs();

    expect(result.map((c) => c.apiKey)).toEqual(['c1']);
  });

  it('extracts from the data fallback key', async () => {
    mockedGet.mockResolvedValue({ data: [{ 'api-key': 'c2' }] });

    const result = await providersApi.getCodexConfigs();

    expect(result.map((c) => c.apiKey)).toEqual(['c2']);
  });
});

describe('providersApi.getOpenAIProviders', () => {
  it('drops providers missing a base url', async () => {
    mockedGet.mockResolvedValue({
      'openai-compatibility': [
        { name: 'ok', 'base-url': 'https://ok' },
        { name: 'broken' },
      ],
    });

    const result = await providersApi.getOpenAIProviders();

    expect(result.map((p) => p.name)).toEqual(['ok']);
  });
});

describe('providersApi save/update/delete request shapes', () => {
  it('saveGeminiKeys puts an array of serialized gemini keys', async () => {
    mockedPut.mockResolvedValue(undefined);

    await providersApi.saveGeminiKeys([{ apiKey: 'g1' }, { apiKey: 'g2' }]);

    expect(mockedPut).toHaveBeenCalledWith('/gemini-api-key', [
      { 'api-key': 'g1' },
      { 'api-key': 'g2' },
    ]);
  });

  it('updateGeminiKey patches an index/value envelope', async () => {
    mockedPatch.mockResolvedValue(undefined);

    await providersApi.updateGeminiKey(3, { apiKey: 'g' });

    expect(mockedPatch).toHaveBeenCalledWith('/gemini-api-key', {
      index: 3,
      value: { 'api-key': 'g' },
    });
  });

  it('deleteGeminiKey builds a query string with trimmed api-key and base-url', async () => {
    mockedDelete.mockResolvedValue(undefined);

    await providersApi.deleteGeminiKey('  k1  ', '  https://b  ');

    expect(mockedDelete).toHaveBeenCalledWith(
      '/gemini-api-key?api-key=k1&base-url=https%3A%2F%2Fb'
    );
  });

  it('deleteGeminiKey emits an empty base-url param when omitted', async () => {
    mockedDelete.mockResolvedValue(undefined);

    await providersApi.deleteGeminiKey('k1');

    expect(mockedDelete).toHaveBeenCalledWith('/gemini-api-key?api-key=k1&base-url=');
  });

  it('saveVertexConfigs serializes models to name/alias pairs only', async () => {
    mockedPut.mockResolvedValue(undefined);

    await providersApi.saveVertexConfigs([
      { apiKey: 'v', models: [{ name: 'm', alias: 'a', priority: 9 }] },
    ]);

    expect(mockedPut).toHaveBeenCalledWith('/vertex-api-key', [
      { 'api-key': 'v', models: [{ name: 'm', alias: 'a' }] },
    ]);
  });

  it('saveVertexConfigs drops models missing an alias', async () => {
    mockedPut.mockResolvedValue(undefined);

    await providersApi.saveVertexConfigs([
      { apiKey: 'v', models: [{ name: 'm' }] },
    ]);

    expect(mockedPut).toHaveBeenCalledWith('/vertex-api-key', [{ 'api-key': 'v' }]);
  });

  it('updateOpenAIProviderDisabled patches a minimal disabled envelope', async () => {
    mockedPatch.mockResolvedValue(undefined);

    await providersApi.updateOpenAIProviderDisabled(2, true);

    expect(mockedPatch).toHaveBeenCalledWith('/openai-compatibility', {
      index: 2,
      value: { disabled: true },
    });
  });

  it('deleteOpenAIProvider deletes a URL-encoded name query', async () => {
    mockedDelete.mockResolvedValue(undefined);

    await providersApi.deleteOpenAIProvider('My Provider');

    expect(mockedDelete).toHaveBeenCalledWith('/openai-compatibility?name=My%20Provider');
  });
});
