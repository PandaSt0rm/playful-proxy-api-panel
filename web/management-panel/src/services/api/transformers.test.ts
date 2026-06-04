import { describe, it, expect } from 'vitest';
import {
  normalizeApiKeyEntry,
  normalizeGeminiKeyConfig,
  normalizeModelAliases,
  normalizeOpenAIProvider,
  normalizeProviderKeyConfig,
  normalizeHeaders,
  normalizeExcludedModels,
  normalizeAmpcodeConfig,
  normalizeAmpcodeModelMappings,
  normalizeAmpcodeUpstreamApiKeys,
  normalizeConfigResponse,
} from '@/services/api/transformers';

// ---------------------------------------------------------------------------
// normalizeHeaders
// ---------------------------------------------------------------------------

describe('normalizeHeaders', () => {
  it('returns undefined for null input', () => {
    const result = normalizeHeaders(null);

    expect(result).toBeUndefined();
  });

  it('returns undefined for a primitive string input', () => {
    const result = normalizeHeaders('Authorization: Bearer x');

    expect(result).toBeUndefined();
  });

  it('builds an object from a record of header strings', () => {
    const result = normalizeHeaders({ 'X-Token': 'abc', 'X-Other': 'def' });

    expect(result).toEqual({ 'X-Token': 'abc', 'X-Other': 'def' });
  });

  it('trims header keys and values', () => {
    const result = normalizeHeaders({ '  X-Token  ': '  abc  ' });

    expect(result).toEqual({ 'X-Token': 'abc' });
  });

  it('drops entries with empty string values', () => {
    const result = normalizeHeaders({ 'X-Token': 'abc', 'X-Empty': '' });

    expect(result).toEqual({ 'X-Token': 'abc' });
  });

  it('builds an object from an array of key/value entries', () => {
    const result = normalizeHeaders([
      { key: 'X-Token', value: 'abc' },
      { key: 'X-Other', value: 'def' },
    ]);

    expect(result).toEqual({ 'X-Token': 'abc', 'X-Other': 'def' });
  });

  it('returns undefined when an array produces no usable headers', () => {
    const result = normalizeHeaders([{ key: '', value: 'abc' }]);

    expect(result).toBeUndefined();
  });

  it('returns undefined for an empty object', () => {
    const result = normalizeHeaders({});

    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// normalizeExcludedModels
// ---------------------------------------------------------------------------

describe('normalizeExcludedModels', () => {
  it('returns an empty array for null input', () => {
    const result = normalizeExcludedModels(null);

    expect(result).toEqual([]);
  });

  it('returns an empty array for a numeric input', () => {
    const result = normalizeExcludedModels(42);

    expect(result).toEqual([]);
  });

  it('splits a comma separated string into trimmed entries', () => {
    const result = normalizeExcludedModels('gpt-4, gpt-3.5 , o1');

    expect(result).toEqual(['gpt-4', 'gpt-3.5', 'o1']);
  });

  it('splits a newline separated string into trimmed entries', () => {
    const result = normalizeExcludedModels('gpt-4\ngpt-3.5\no1');

    expect(result).toEqual(['gpt-4', 'gpt-3.5', 'o1']);
  });

  it('deduplicates case-insensitively while keeping the first casing', () => {
    const result = normalizeExcludedModels(['GPT-4', 'gpt-4', 'GPT-4']);

    expect(result).toEqual(['GPT-4']);
  });

  it('drops empty and whitespace-only entries', () => {
    const result = normalizeExcludedModels(['gpt-4', '', '   ', 'o1']);

    expect(result).toEqual(['gpt-4', 'o1']);
  });

  it('coerces non-string array items to trimmed strings', () => {
    const result = normalizeExcludedModels([5, true]);

    expect(result).toEqual(['5', 'true']);
  });

  it('drops null and undefined array items', () => {
    const result = normalizeExcludedModels(['keep', null, undefined]);

    expect(result).toEqual(['keep']);
  });
});

// ---------------------------------------------------------------------------
// normalizeModelAliases
// ---------------------------------------------------------------------------

describe('normalizeModelAliases', () => {
  it('returns an empty array when input is not an array', () => {
    const result = normalizeModelAliases({ name: 'x' });

    expect(result).toEqual([]);
  });

  it('converts a plain string into a name-only model alias', () => {
    const result = normalizeModelAliases(['gpt-4']);

    expect(result).toEqual([{ name: 'gpt-4' }]);
  });

  it('trims a string model name', () => {
    const result = normalizeModelAliases(['  gpt-4  ']);

    expect(result).toEqual([{ name: 'gpt-4' }]);
  });

  it('drops an empty string model entry', () => {
    const result = normalizeModelAliases(['   ']);

    expect(result).toEqual([]);
  });

  it('drops null and undefined entries', () => {
    const result = normalizeModelAliases([null, undefined, 'gpt-4']);

    expect(result).toEqual([{ name: 'gpt-4' }]);
  });

  it('drops non-record entries such as numbers', () => {
    const result = normalizeModelAliases([42]);

    expect(result).toEqual([]);
  });

  it('uses the id field as the name when name is absent', () => {
    const result = normalizeModelAliases([{ id: 'model-id' }]);

    expect(result[0].name).toBe('model-id');
  });

  it('uses the model field as the name when name and id are absent', () => {
    const result = normalizeModelAliases([{ model: 'model-field' }]);

    expect(result[0].name).toBe('model-field');
  });

  it('drops a record entry with no usable name', () => {
    const result = normalizeModelAliases([{ priority: 1 }]);

    expect(result).toEqual([]);
  });

  it('preserves a clone of the original record under raw', () => {
    const original = { name: 'gpt-4', extra: 'kept' };

    const result = normalizeModelAliases([original]);

    expect(result[0].raw).toEqual({ name: 'gpt-4', extra: 'kept' });
    expect(result[0].raw).not.toBe(original);
  });

  it('sets the alias when it differs from the name', () => {
    const result = normalizeModelAliases([{ name: 'gpt-4', alias: 'smart' }]);

    expect(result[0].alias).toBe('smart');
  });

  it('omits the alias when it equals the name', () => {
    const result = normalizeModelAliases([{ name: 'gpt-4', alias: 'gpt-4' }]);

    expect(result[0].alias).toBeUndefined();
  });

  it('reads the alias from display_name', () => {
    const result = normalizeModelAliases([{ name: 'gpt-4', display_name: 'Display' }]);

    expect(result[0].alias).toBe('Display');
  });

  it('parses a numeric-string priority into a number', () => {
    const result = normalizeModelAliases([{ name: 'gpt-4', priority: '7' }]);

    expect(result[0].priority).toBe(7);
  });

  it('drops a NaN priority', () => {
    const result = normalizeModelAliases([{ name: 'gpt-4', priority: 'not-a-number' }]);

    expect(result[0].priority).toBeUndefined();
  });

  it('keeps a zero priority', () => {
    const result = normalizeModelAliases([{ name: 'gpt-4', priority: 0 }]);

    expect(result[0].priority).toBe(0);
  });

  it('reads the test model from the hyphenated test-model key', () => {
    const result = normalizeModelAliases([{ name: 'gpt-4', 'test-model': 'probe' }]);

    expect(result[0].testModel).toBe('probe');
  });

  it('normalizes thinking support with min and max', () => {
    const result = normalizeModelAliases([
      { name: 'gpt-4', thinking: { min: '100', max: 2000 } },
    ]);

    expect(result[0].thinking).toEqual({ min: 100, max: 2000 });
  });

  it('mirrors thinking levels onto thinkingLevels', () => {
    const result = normalizeModelAliases([
      { name: 'gpt-4', thinking: { levels: ['LOW', 'High'] } },
    ]);

    expect(result[0].thinkingLevels).toEqual(['low', 'high']);
  });

  it('omits thinking entirely when the thinking object yields nothing', () => {
    const result = normalizeModelAliases([{ name: 'gpt-4', thinking: {} }]);

    expect(result[0].thinking).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// normalizeApiKeyEntry
// ---------------------------------------------------------------------------

describe('normalizeApiKeyEntry', () => {
  it('returns null for null input', () => {
    const result = normalizeApiKeyEntry(null);

    expect(result).toBeNull();
  });

  it('returns null for undefined input', () => {
    const result = normalizeApiKeyEntry(undefined);

    expect(result).toBeNull();
  });

  it('returns null for an empty string key', () => {
    const result = normalizeApiKeyEntry('   ');

    expect(result).toBeNull();
  });

  it('treats a bare string as the api key', () => {
    const result = normalizeApiKeyEntry('sk-abc');

    expect(result).toEqual({
      apiKey: 'sk-abc',
      proxyUrl: undefined,
      headers: undefined,
      raw: undefined,
    });
  });

  it('trims the api key from a bare string', () => {
    const result = normalizeApiKeyEntry('  sk-abc  ');

    expect(result?.apiKey).toBe('sk-abc');
  });

  it('reads the api key from the hyphenated api-key field', () => {
    const result = normalizeApiKeyEntry({ 'api-key': 'sk-hyphen' });

    expect(result?.apiKey).toBe('sk-hyphen');
  });

  it('reads the api key from the camelCase apiKey field', () => {
    const result = normalizeApiKeyEntry({ apiKey: 'sk-camel' });

    expect(result?.apiKey).toBe('sk-camel');
  });

  it('reads the api key from the short key field', () => {
    const result = normalizeApiKeyEntry({ key: 'sk-short' });

    expect(result?.apiKey).toBe('sk-short');
  });

  it('returns null when a record has no api key', () => {
    const result = normalizeApiKeyEntry({ 'proxy-url': 'http://proxy' });

    expect(result).toBeNull();
  });

  it('coerces a non-string proxy url to a string', () => {
    const result = normalizeApiKeyEntry({ 'api-key': 'sk', 'proxy-url': 1234 });

    expect(result?.proxyUrl).toBe('1234');
  });

  it('leaves the proxy url undefined when an empty string is given', () => {
    const result = normalizeApiKeyEntry({ 'api-key': 'sk', 'proxy-url': '' });

    expect(result?.proxyUrl).toBeUndefined();
  });

  it('normalizes nested headers', () => {
    const result = normalizeApiKeyEntry({ 'api-key': 'sk', headers: { 'X-A': 'b' } });

    expect(result?.headers).toEqual({ 'X-A': 'b' });
  });

  it('reads the auth index from the hyphenated auth-index field', () => {
    const result = normalizeApiKeyEntry({ 'api-key': 'sk', 'auth-index': 'idx-1' });

    expect(result?.authIndex).toBe('idx-1');
  });

  it('coerces a numeric auth index to a trimmed string', () => {
    const result = normalizeApiKeyEntry({ 'api-key': 'sk', authIndex: 7 });

    expect(result?.authIndex).toBe('7');
  });

  it('preserves a clone of the original record under raw', () => {
    const original = { 'api-key': 'sk', extra: 'kept' };

    const result = normalizeApiKeyEntry(original);

    expect(result?.raw).toEqual({ 'api-key': 'sk', extra: 'kept' });
    expect(result?.raw).not.toBe(original);
  });

  it('leaves raw undefined for a bare string entry', () => {
    const result = normalizeApiKeyEntry('sk-abc');

    expect(result?.raw).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// normalizeProviderKeyConfig
// ---------------------------------------------------------------------------

describe('normalizeProviderKeyConfig', () => {
  it('returns null for null input', () => {
    const result = normalizeProviderKeyConfig(null);

    expect(result).toBeNull();
  });

  it('returns null when no api key is present', () => {
    const result = normalizeProviderKeyConfig({ priority: 1 });

    expect(result).toBeNull();
  });

  it('treats a bare string as the api key', () => {
    const result = normalizeProviderKeyConfig('sk-abc');

    expect(result?.apiKey).toBe('sk-abc');
  });

  it('parses a numeric-string priority into a number', () => {
    const result = normalizeProviderKeyConfig({ 'api-key': 'sk', priority: '3' });

    expect(result?.priority).toBe(3);
  });

  it('drops an empty-string priority', () => {
    const result = normalizeProviderKeyConfig({ 'api-key': 'sk', priority: '  ' });

    expect(result?.priority).toBeUndefined();
  });

  it('drops a NaN priority', () => {
    const result = normalizeProviderKeyConfig({ 'api-key': 'sk', priority: 'abc' });

    expect(result?.priority).toBeUndefined();
  });

  it('reads the base url from the hyphenated base-url field', () => {
    const result = normalizeProviderKeyConfig({ 'api-key': 'sk', 'base-url': 'http://b' });

    expect(result?.baseUrl).toBe('http://b');
  });

  it('coerces websockets boolean from a string', () => {
    const result = normalizeProviderKeyConfig({ 'api-key': 'sk', websockets: 'yes' });

    expect(result?.websockets).toBe(true);
  });

  it('leaves websockets unset when given an object', () => {
    const result = normalizeProviderKeyConfig({ 'api-key': 'sk', websockets: {} });

    expect(result?.websockets).toBeUndefined();
  });

  it('normalizes model aliases', () => {
    const result = normalizeProviderKeyConfig({ 'api-key': 'sk', models: ['m1'] });

    expect(result?.models).toEqual([{ name: 'm1' }]);
  });

  it('omits models when none are present', () => {
    const result = normalizeProviderKeyConfig({ 'api-key': 'sk', models: [] });

    expect(result?.models).toBeUndefined();
  });

  it('reads excluded models from the snake_case excluded_models field', () => {
    const result = normalizeProviderKeyConfig({ 'api-key': 'sk', excluded_models: ['x'] });

    expect(result?.excludedModels).toEqual(['x']);
  });

  it('coerces disable cooling from a numeric flag', () => {
    const result = normalizeProviderKeyConfig({ 'api-key': 'sk', 'disable-cooling': 1 });

    expect(result?.disableCooling).toBe(true);
  });

  it('coerces experimental CCH signing flag', () => {
    const result = normalizeProviderKeyConfig({
      'api-key': 'sk',
      'experimental-cch-signing': 'off',
    });

    expect(result?.experimentalCCHSigning).toBe(false);
  });

  it('reads the prefix and trims it', () => {
    const result = normalizeProviderKeyConfig({ 'api-key': 'sk', prefix: '  px  ' });

    expect(result?.prefix).toBe('px');
  });

  it('reads the auth index', () => {
    const result = normalizeProviderKeyConfig({ 'api-key': 'sk', 'auth-index': 'a1' });

    expect(result?.authIndex).toBe('a1');
  });

  it('normalizes a nested cloak config', () => {
    const result = normalizeProviderKeyConfig({
      'api-key': 'sk',
      cloak: {
        mode: '  shadow  ',
        'strict-mode': true,
        'sensitive-words': ['secret', 'secret'],
        'cache-user-id': 'no',
      },
    });

    expect(result?.cloak).toEqual({
      raw: {
        mode: '  shadow  ',
        'strict-mode': true,
        'sensitive-words': ['secret', 'secret'],
        'cache-user-id': 'no',
      },
      mode: 'shadow',
      strictMode: true,
      sensitiveWords: ['secret'],
      cacheUserId: false,
    });
  });

  it('omits cloak when it is not a record', () => {
    const result = normalizeProviderKeyConfig({ 'api-key': 'sk', cloak: 'enabled' });

    expect(result?.cloak).toBeUndefined();
  });

  it('preserves a clone of the original record under raw', () => {
    const original = { 'api-key': 'sk', custom: 'kept' };

    const result = normalizeProviderKeyConfig(original);

    expect(result?.raw).toEqual({ 'api-key': 'sk', custom: 'kept' });
    expect(result?.raw).not.toBe(original);
  });
});

// ---------------------------------------------------------------------------
// normalizeGeminiKeyConfig
// ---------------------------------------------------------------------------

describe('normalizeGeminiKeyConfig', () => {
  it('returns null for null input', () => {
    const result = normalizeGeminiKeyConfig(null);

    expect(result).toBeNull();
  });

  it('returns null when no api key is present', () => {
    const result = normalizeGeminiKeyConfig({ prefix: 'p' });

    expect(result).toBeNull();
  });

  it('treats a bare string as the api key', () => {
    const result = normalizeGeminiKeyConfig('gm-abc');

    expect(result?.apiKey).toBe('gm-abc');
  });

  it('reads the base url from the snake_case base_url field', () => {
    const result = normalizeGeminiKeyConfig({ 'api-key': 'gm', base_url: 'http://g' });

    expect(result?.baseUrl).toBe('http://g');
  });

  it('reads the proxy url from the snake_case proxy_url field', () => {
    const result = normalizeGeminiKeyConfig({ 'api-key': 'gm', proxy_url: 'http://p' });

    expect(result?.proxyUrl).toBe('http://p');
  });

  it('parses a numeric-string priority into a number', () => {
    const result = normalizeGeminiKeyConfig({ 'api-key': 'gm', priority: '2' });

    expect(result?.priority).toBe(2);
  });

  it('drops a NaN priority', () => {
    const result = normalizeGeminiKeyConfig({ 'api-key': 'gm', priority: 'xyz' });

    expect(result?.priority).toBeUndefined();
  });

  it('normalizes model aliases', () => {
    const result = normalizeGeminiKeyConfig({ 'api-key': 'gm', models: ['gemini-pro'] });

    expect(result?.models).toEqual([{ name: 'gemini-pro' }]);
  });

  it('reads excluded models', () => {
    const result = normalizeGeminiKeyConfig({ 'api-key': 'gm', 'excluded-models': 'a,b' });

    expect(result?.excludedModels).toEqual(['a', 'b']);
  });

  it('coerces disable cooling from a string', () => {
    const result = normalizeGeminiKeyConfig({ 'api-key': 'gm', 'disable-cooling': 'true' });

    expect(result?.disableCooling).toBe(true);
  });

  it('reads the auth index', () => {
    const result = normalizeGeminiKeyConfig({ 'api-key': 'gm', authIndex: 'g1' });

    expect(result?.authIndex).toBe('g1');
  });

  it('does not carry a cloak field (gemini has no cloak)', () => {
    const result = normalizeGeminiKeyConfig({ 'api-key': 'gm', cloak: { mode: 'x' } });

    expect((result as Record<string, unknown>).cloak).toBeUndefined();
  });

  it('preserves a clone of the original record under raw', () => {
    const original = { 'api-key': 'gm', extra: 'kept' };

    const result = normalizeGeminiKeyConfig(original);

    expect(result?.raw).toEqual({ 'api-key': 'gm', extra: 'kept' });
    expect(result?.raw).not.toBe(original);
  });
});

// ---------------------------------------------------------------------------
// normalizeOpenAIProvider
// ---------------------------------------------------------------------------

describe('normalizeOpenAIProvider', () => {
  it('returns null when input is not a record', () => {
    const result = normalizeOpenAIProvider('not-a-record');

    expect(result).toBeNull();
  });

  it('returns null when name is missing', () => {
    const result = normalizeOpenAIProvider({ 'base-url': 'http://b' });

    expect(result).toBeNull();
  });

  it('returns null when base url is missing', () => {
    const result = normalizeOpenAIProvider({ name: 'prov' });

    expect(result).toBeNull();
  });

  it('builds a minimal provider with name and base url', () => {
    const result = normalizeOpenAIProvider({ name: 'prov', 'base-url': 'http://b' });

    expect(result).toMatchObject({
      name: 'prov',
      baseUrl: 'http://b',
      apiKeyEntries: [],
    });
  });

  it('falls back to id when name is absent', () => {
    const result = normalizeOpenAIProvider({ id: 'prov-id', 'base-url': 'http://b' });

    expect(result?.name).toBe('prov-id');
  });

  it('falls back to camelCase baseUrl when hyphenated base-url is absent', () => {
    const result = normalizeOpenAIProvider({ name: 'prov', baseUrl: 'http://camel' });

    expect(result?.baseUrl).toBe('http://camel');
  });

  it('trims the name and base url', () => {
    const result = normalizeOpenAIProvider({ name: '  prov  ', 'base-url': '  http://b  ' });

    expect(result).toMatchObject({ name: 'prov', baseUrl: 'http://b' });
  });

  it('returns null when name is not a string', () => {
    const result = normalizeOpenAIProvider({ name: 123, 'base-url': 'http://b' });

    expect(result).toBeNull();
  });

  it('builds api key entries from the api-key-entries array', () => {
    const result = normalizeOpenAIProvider({
      name: 'prov',
      'base-url': 'http://b',
      'api-key-entries': [{ 'api-key': 'sk-1' }, { 'api-key': 'sk-2' }],
    });

    expect(result?.apiKeyEntries.map((e) => e.apiKey)).toEqual(['sk-1', 'sk-2']);
  });

  it('drops invalid api key entries', () => {
    const result = normalizeOpenAIProvider({
      name: 'prov',
      'base-url': 'http://b',
      'api-key-entries': [{ 'api-key': 'sk-1' }, { 'api-key': '   ' }],
    });

    expect(result?.apiKeyEntries.map((e) => e.apiKey)).toEqual(['sk-1']);
  });

  it('builds api key entries from a plain api-keys string array', () => {
    const result = normalizeOpenAIProvider({
      name: 'prov',
      'base-url': 'http://b',
      'api-keys': ['sk-a', 'sk-b'],
    });

    expect(result?.apiKeyEntries.map((e) => e.apiKey)).toEqual(['sk-a', 'sk-b']);
  });

  it('prefers api-key-entries over api-keys when both are present', () => {
    const result = normalizeOpenAIProvider({
      name: 'prov',
      'base-url': 'http://b',
      'api-key-entries': [{ 'api-key': 'sk-entry' }],
      'api-keys': ['sk-plain'],
    });

    expect(result?.apiKeyEntries.map((e) => e.apiKey)).toEqual(['sk-entry']);
  });

  it('coerces the disabled flag from a string', () => {
    const result = normalizeOpenAIProvider({
      name: 'prov',
      'base-url': 'http://b',
      disabled: 'true',
    });

    expect(result?.disabled).toBe(true);
  });

  it('parses a numeric-string priority', () => {
    const result = normalizeOpenAIProvider({
      name: 'prov',
      'base-url': 'http://b',
      priority: '5',
    });

    expect(result?.priority).toBe(5);
  });

  it('drops a NaN priority', () => {
    const result = normalizeOpenAIProvider({
      name: 'prov',
      'base-url': 'http://b',
      priority: 'nan',
    });

    expect(result?.priority).toBeUndefined();
  });

  it('reads the test model from the hyphenated test-model field', () => {
    const result = normalizeOpenAIProvider({
      name: 'prov',
      'base-url': 'http://b',
      'test-model': 'probe',
    });

    expect(result?.testModel).toBe('probe');
  });

  it('reads and coerces the auth index to a string', () => {
    const result = normalizeOpenAIProvider({
      name: 'prov',
      'base-url': 'http://b',
      'auth-index': 9,
    });

    expect(result?.authIndex).toBe('9');
  });

  it('preserves a clone of the original record under raw', () => {
    const original = { name: 'prov', 'base-url': 'http://b', custom: 'kept' };

    const result = normalizeOpenAIProvider(original);

    expect(result?.raw).toEqual({ name: 'prov', 'base-url': 'http://b', custom: 'kept' });
    expect(result?.raw).not.toBe(original);
  });
});

// ---------------------------------------------------------------------------
// normalizeAmpcodeModelMappings
// ---------------------------------------------------------------------------

describe('normalizeAmpcodeModelMappings', () => {
  it('returns an empty array when input is not an array', () => {
    const result = normalizeAmpcodeModelMappings({ from: 'a', to: 'b' });

    expect(result).toEqual([]);
  });

  it('maps a valid from/to pair', () => {
    const result = normalizeAmpcodeModelMappings([{ from: 'a', to: 'b' }]);

    expect(result).toEqual([{ from: 'a', to: 'b' }]);
  });

  it('trims from and to values', () => {
    const result = normalizeAmpcodeModelMappings([{ from: '  a  ', to: '  b  ' }]);

    expect(result).toEqual([{ from: 'a', to: 'b' }]);
  });

  it('drops an entry missing the from field', () => {
    const result = normalizeAmpcodeModelMappings([{ to: 'b' }]);

    expect(result).toEqual([]);
  });

  it('drops an entry missing the to field', () => {
    const result = normalizeAmpcodeModelMappings([{ from: 'a' }]);

    expect(result).toEqual([]);
  });

  it('drops non-record entries', () => {
    const result = normalizeAmpcodeModelMappings(['a->b', { from: 'a', to: 'b' }]);

    expect(result).toEqual([{ from: 'a', to: 'b' }]);
  });

  it('deduplicates by lowercased from key keeping the first occurrence', () => {
    const result = normalizeAmpcodeModelMappings([
      { from: 'GPT', to: 'first' },
      { from: 'gpt', to: 'second' },
    ]);

    expect(result).toEqual([{ from: 'GPT', to: 'first' }]);
  });

  it('carries the regex flag when present', () => {
    const result = normalizeAmpcodeModelMappings([{ from: 'a', to: 'b', regex: true }]);

    expect(result).toEqual([{ from: 'a', to: 'b', regex: true }]);
  });

  it('coerces a string regex flag to a boolean', () => {
    const result = normalizeAmpcodeModelMappings([{ from: 'a', to: 'b', regex: 'no' }]);

    expect(result).toEqual([{ from: 'a', to: 'b', regex: false }]);
  });

  it('omits the regex flag when it is an unrecognized type', () => {
    const result = normalizeAmpcodeModelMappings([{ from: 'a', to: 'b', regex: {} }]);

    expect(result).toEqual([{ from: 'a', to: 'b' }]);
  });
});

// ---------------------------------------------------------------------------
// normalizeAmpcodeUpstreamApiKeys
// ---------------------------------------------------------------------------

describe('normalizeAmpcodeUpstreamApiKeys', () => {
  it('returns an empty array when input is not an array', () => {
    const result = normalizeAmpcodeUpstreamApiKeys('not-an-array');

    expect(result).toEqual([]);
  });

  it('maps an upstream key with its api keys', () => {
    const result = normalizeAmpcodeUpstreamApiKeys([
      { 'upstream-api-key': 'up-1', 'api-keys': ['a', 'b'] },
    ]);

    expect(result).toEqual([{ upstreamApiKey: 'up-1', apiKeys: ['a', 'b'] }]);
  });

  it('trims the upstream key', () => {
    const result = normalizeAmpcodeUpstreamApiKeys([
      { 'upstream-api-key': '  up-1  ', 'api-keys': ['a'] },
    ]);

    expect(result[0].upstreamApiKey).toBe('up-1');
  });

  it('reads the upstream key from the camelCase field', () => {
    const result = normalizeAmpcodeUpstreamApiKeys([
      { upstreamApiKey: 'up-c', apiKeys: ['a'] },
    ]);

    expect(result[0].upstreamApiKey).toBe('up-c');
  });

  it('deduplicates and trims the contained api keys', () => {
    const result = normalizeAmpcodeUpstreamApiKeys([
      { 'upstream-api-key': 'up-1', 'api-keys': ['a', ' a ', 'b', ''] },
    ]);

    expect(result[0].apiKeys).toEqual(['a', 'b']);
  });

  it('drops an entry with no upstream key', () => {
    const result = normalizeAmpcodeUpstreamApiKeys([{ 'api-keys': ['a'] }]);

    expect(result).toEqual([]);
  });

  it('drops an entry with no usable api keys', () => {
    const result = normalizeAmpcodeUpstreamApiKeys([
      { 'upstream-api-key': 'up-1', 'api-keys': ['', '   '] },
    ]);

    expect(result).toEqual([]);
  });

  it('drops an entry where api-keys is not an array', () => {
    const result = normalizeAmpcodeUpstreamApiKeys([
      { 'upstream-api-key': 'up-1', 'api-keys': 'a,b' },
    ]);

    expect(result).toEqual([]);
  });

  it('deduplicates by upstream key keeping the first occurrence', () => {
    const result = normalizeAmpcodeUpstreamApiKeys([
      { 'upstream-api-key': 'up-1', 'api-keys': ['first'] },
      { 'upstream-api-key': 'up-1', 'api-keys': ['second'] },
    ]);

    expect(result).toEqual([{ upstreamApiKey: 'up-1', apiKeys: ['first'] }]);
  });

  it('drops non-record entries', () => {
    const result = normalizeAmpcodeUpstreamApiKeys([42]);

    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// normalizeAmpcodeConfig
// ---------------------------------------------------------------------------

describe('normalizeAmpcodeConfig', () => {
  it('returns undefined for a non-record payload', () => {
    const result = normalizeAmpcodeConfig('nope');

    expect(result).toBeUndefined();
  });

  it('unwraps a nested ampcode key from the payload', () => {
    const result = normalizeAmpcodeConfig({ ampcode: { 'upstream-url': 'http://up' } });

    expect(result?.upstreamUrl).toBe('http://up');
  });

  it('reads the upstream url from the top-level record when not nested', () => {
    const result = normalizeAmpcodeConfig({ 'upstream-url': 'http://flat' });

    expect(result?.upstreamUrl).toBe('http://flat');
  });

  it('reads the upstream api key', () => {
    const result = normalizeAmpcodeConfig({ 'upstream-api-key': 'up-key' });

    expect(result?.upstreamApiKey).toBe('up-key');
  });

  it('coerces a numeric upstream url to a string', () => {
    const result = normalizeAmpcodeConfig({ 'upstream-url': 8080 });

    expect(result?.upstreamUrl).toBe('8080');
  });

  it('normalizes upstream api key mappings', () => {
    const result = normalizeAmpcodeConfig({
      'upstream-api-keys': [{ 'upstream-api-key': 'up-1', 'api-keys': ['a'] }],
    });

    expect(result?.upstreamApiKeys).toEqual([{ upstreamApiKey: 'up-1', apiKeys: ['a'] }]);
  });

  it('omits upstream api keys when none are valid', () => {
    const result = normalizeAmpcodeConfig({ 'upstream-api-keys': [] });

    expect(result?.upstreamApiKeys).toBeUndefined();
  });

  it('coerces restrict-management-to-localhost from a string', () => {
    const result = normalizeAmpcodeConfig({ 'restrict-management-to-localhost': 'true' });

    expect(result?.restrictManagementToLocalhost).toBe(true);
  });

  it('coerces force-model-mappings from a numeric flag', () => {
    const result = normalizeAmpcodeConfig({ 'force-model-mappings': 0 });

    expect(result?.forceModelMappings).toBe(false);
  });

  it('normalizes model mappings', () => {
    const result = normalizeAmpcodeConfig({
      'model-mappings': [{ from: 'a', to: 'b' }],
    });

    expect(result?.modelMappings).toEqual([{ from: 'a', to: 'b' }]);
  });

  it('omits model mappings when none are valid', () => {
    const result = normalizeAmpcodeConfig({ 'model-mappings': [{ from: 'a' }] });

    expect(result?.modelMappings).toBeUndefined();
  });

  it('preserves a clone of the source record under raw', () => {
    const result = normalizeAmpcodeConfig({ 'upstream-url': 'http://up', custom: 'kept' });

    expect(result?.raw).toEqual({ 'upstream-url': 'http://up', custom: 'kept' });
  });
});

// ---------------------------------------------------------------------------
// normalizeConfigResponse
// ---------------------------------------------------------------------------

describe('normalizeConfigResponse', () => {
  it('returns a config with an empty raw object for a non-record input', () => {
    const result = normalizeConfigResponse('nope');

    expect(result).toEqual({ raw: {} });
  });

  it('preserves the raw payload reference for a record input', () => {
    const raw = { debug: true };

    const result = normalizeConfigResponse(raw);

    expect(result.raw).toBe(raw);
  });

  it('coerces the debug flag', () => {
    const result = normalizeConfigResponse({ debug: 'yes' });

    expect(result.debug).toBe(true);
  });

  it('reads passthrough headers from the hyphenated key', () => {
    const result = normalizeConfigResponse({ 'passthrough-headers': true });

    expect(result.passthroughHeaders).toBe(true);
  });

  it('keeps the literal true value for disable image generation', () => {
    const result = normalizeConfigResponse({ 'disable-image-generation': true });

    expect(result.disableImageGeneration).toBe(true);
  });

  it('keeps the chat mode for disable image generation', () => {
    const result = normalizeConfigResponse({ 'disable-image-generation': 'chat' });

    expect(result.disableImageGeneration).toBe('chat');
  });

  it('normalizes a CHAT casing into the chat mode for disable image generation', () => {
    const result = normalizeConfigResponse({ 'disable-image-generation': '  CHAT  ' });

    expect(result.disableImageGeneration).toBe('chat');
  });

  it('leaves disable image generation unset for an unrelated string', () => {
    const result = normalizeConfigResponse({ 'disable-image-generation': 'maybe' });

    expect(result.disableImageGeneration).toBeUndefined();
  });

  it('reads codex identity confuse from the nested codex object', () => {
    const result = normalizeConfigResponse({ codex: { 'identity-confuse': true } });

    expect(result.codexIdentityConfuse).toBe(true);
  });

  it('reads codex identity confuse from the flat key when codex is not a record', () => {
    const result = normalizeConfigResponse({ codexIdentityConfuse: 'on' });

    expect(result.codexIdentityConfuse).toBe(true);
  });

  it('keeps a string proxy url unchanged', () => {
    const result = normalizeConfigResponse({ 'proxy-url': 'http://p' });

    expect(result.proxyUrl).toBe('http://p');
  });

  it('leaves the proxy url undefined when it is null', () => {
    const result = normalizeConfigResponse({ 'proxy-url': null });

    expect(result.proxyUrl).toBeUndefined();
  });

  it('coerces a non-string proxy url to a string', () => {
    const result = normalizeConfigResponse({ 'proxy-url': 1234 });

    expect(result.proxyUrl).toBe('1234');
  });

  it('keeps a numeric request retry', () => {
    const result = normalizeConfigResponse({ 'request-retry': 3 });

    expect(result.requestRetry).toBe(3);
  });

  it('parses a numeric-string request retry', () => {
    const result = normalizeConfigResponse({ 'request-retry': '4' });

    expect(result.requestRetry).toBe(4);
  });

  it('leaves request retry unset for a non-numeric string', () => {
    const result = normalizeConfigResponse({ 'request-retry': 'abc' });

    expect(result.requestRetry).toBeUndefined();
  });

  it('parses max retry credentials via the numeric normalizer', () => {
    const result = normalizeConfigResponse({ 'max-retry-credentials': '5' });

    expect(result.maxRetryCredentials).toBe(5);
  });

  it('normalizes the nested quota exceeded object', () => {
    const result = normalizeConfigResponse({
      'quota-exceeded': {
        'switch-project': true,
        'switch-preview-model': false,
        'antigravity-credits': 'yes',
      },
    });

    expect(result.quotaExceeded).toEqual({
      switchProject: true,
      switchPreviewModel: false,
      antigravityCredits: true,
    });
  });

  it('parses logs max total size from a numeric string', () => {
    const result = normalizeConfigResponse({ 'logs-max-total-size-mb': '100' });

    expect(result.logsMaxTotalSizeMb).toBe(100);
  });

  it('coerces the usage statistics path to a string', () => {
    const result = normalizeConfigResponse({ 'usage-statistics-path': 42 });

    expect(result.usageStatisticsPath).toBe('42');
  });

  it('normalizes the nested pprof object', () => {
    const result = normalizeConfigResponse({ pprof: { enable: 'true', addr: ':6060' } });

    expect(result.pprof).toEqual({ enable: true, addr: ':6060' });
  });

  it('leaves the pprof addr undefined when it is null', () => {
    const result = normalizeConfigResponse({ pprof: { enable: false, addr: null } });

    expect(result.pprof).toEqual({ enable: false, addr: undefined });
  });

  it('reads the routing strategy from the nested routing object', () => {
    const result = normalizeConfigResponse({ routing: { strategy: 'round-robin' } });

    expect(result.routingStrategy).toBe('round-robin');
  });

  it('reads the routing strategy from the flat routing-strategy key', () => {
    const result = normalizeConfigResponse({ 'routing-strategy': 'weighted' });

    expect(result.routingStrategy).toBe('weighted');
  });

  it('normalizes the upstream concurrency block', () => {
    const result = normalizeConfigResponse({
      'upstream-concurrency': {
        default: '10',
        providers: { openai: '4', bad: 'x' },
        'queue-timeout-seconds': 30,
      },
    });

    expect(result.upstreamConcurrency).toEqual({
      default: 10,
      providers: { openai: 4 },
      queueTimeoutSeconds: 30,
    });
  });

  it('sets providers to undefined when none parse', () => {
    const result = normalizeConfigResponse({
      'upstream-concurrency': { providers: { bad: 'x' } },
    });

    expect(result.upstreamConcurrency?.providers).toBeUndefined();
  });

  it('maps the api-keys array to trimmed non-empty strings', () => {
    const result = normalizeConfigResponse({ 'api-keys': ['k1', '', '  ', 'k2'] });

    expect(result.apiKeys).toEqual(['k1', 'k2']);
  });

  it('coerces non-string api keys to strings', () => {
    const result = normalizeConfigResponse({ 'api-keys': [123, 'k2'] });

    expect(result.apiKeys).toEqual(['123', 'k2']);
  });

  it('normalizes the gemini api key list and drops invalid entries', () => {
    const result = normalizeConfigResponse({
      'gemini-api-key': [{ 'api-key': 'gm-1' }, { 'api-key': '' }, 'gm-2'],
    });

    expect(result.geminiApiKeys?.map((k) => k.apiKey)).toEqual(['gm-1', 'gm-2']);
  });

  it('normalizes the codex api key list', () => {
    const result = normalizeConfigResponse({ 'codex-api-key': [{ 'api-key': 'cx-1' }] });

    expect(result.codexApiKeys?.map((k) => k.apiKey)).toEqual(['cx-1']);
  });

  it('normalizes the claude api key list', () => {
    const result = normalizeConfigResponse({ 'claude-api-key': [{ 'api-key': 'cl-1' }] });

    expect(result.claudeApiKeys?.map((k) => k.apiKey)).toEqual(['cl-1']);
  });

  it('normalizes the vertex api key list', () => {
    const result = normalizeConfigResponse({ 'vertex-api-key': [{ 'api-key': 'vx-1' }] });

    expect(result.vertexApiKeys?.map((k) => k.apiKey)).toEqual(['vx-1']);
  });

  it('normalizes the openai compatibility list and drops invalid providers', () => {
    const result = normalizeConfigResponse({
      'openai-compatibility': [
        { name: 'prov', 'base-url': 'http://b' },
        { name: 'no-url' },
      ],
    });

    expect(result.openaiCompatibility?.map((p) => p.name)).toEqual(['prov']);
  });

  it('normalizes the nested ampcode config', () => {
    const result = normalizeConfigResponse({ ampcode: { 'upstream-url': 'http://up' } });

    expect(result.ampcode?.upstreamUrl).toBe('http://up');
  });

  it('normalizes the oauth excluded models map with lowercased provider keys', () => {
    const result = normalizeConfigResponse({
      'oauth-excluded-models': { Claude: ['m-a', 'm-a'], Codex: 'm-b,m-c' },
    });

    expect(result.oauthExcludedModels).toEqual({
      claude: ['m-a'],
      codex: ['m-b', 'm-c'],
    });
  });

  it('normalizes sync profiles and drops nameless entries', () => {
    const result = normalizeConfigResponse({
      'sync-profiles': [
        { name: 'default', targets: [{ tool: 'claude-code', 'api-key-index': 2 }] },
        { targets: [] },
      ],
    });

    expect(result.syncProfiles).toEqual([
      { name: 'default', targets: [{ tool: 'claude-code', 'api-key-index': 2 }] },
    ]);
  });

  it('drops a sync profile target with no tool', () => {
    const result = normalizeConfigResponse({
      'sync-profiles': [{ name: 'p', targets: [{ 'model-filter': 'x' }] }],
    });

    expect(result.syncProfiles).toEqual([{ name: 'p', targets: [] }]);
  });

  it('drops a non-finite api-key-index on a sync target', () => {
    const result = normalizeConfigResponse({
      'sync-profiles': [
        { name: 'p', targets: [{ tool: 't', 'api-key-index': Number.POSITIVE_INFINITY }] },
      ],
    });

    expect(result.syncProfiles).toEqual([{ name: 'p', targets: [{ tool: 't' }] }]);
  });

  it('leaves sync profiles undefined when every profile is invalid', () => {
    const result = normalizeConfigResponse({ 'sync-profiles': [{ targets: [] }] });

    expect(result.syncProfiles).toBeUndefined();
  });

  it('produces a config containing only raw for an empty record', () => {
    const result = normalizeConfigResponse({});

    expect(result).toEqual({
      raw: {},
      debug: undefined,
      passthroughHeaders: undefined,
      enableGeminiCliEndpoint: undefined,
      codexIdentityConfuse: undefined,
      proxyUrl: undefined,
      requestLog: undefined,
      loggingToFile: undefined,
      usageStatisticsEnabled: undefined,
      disableCooling: undefined,
      wsAuth: undefined,
      forceModelPrefix: undefined,
      antigravitySignatureCacheEnabled: undefined,
      antigravitySignatureBypassStrict: undefined,
    });
  });
});
