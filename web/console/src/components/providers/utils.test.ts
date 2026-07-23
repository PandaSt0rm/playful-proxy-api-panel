import { describe, it, expect } from 'vitest';
import type { ApiKeyEntry, OpenAIProviderConfig } from '@/types';
import {
  DISABLE_ALL_MODELS_RULE,
  hasDisableAllModelsRule,
  stripDisableAllModelsRule,
  withDisableAllModelsRule,
  withoutDisableAllModelsRule,
  parseTextList,
  parseExcludedModels,
  excludedModelsToText,
  normalizeOpenAIBaseUrl,
  normalizeClaudeBaseUrl,
  buildOpenAIModelsEndpoint,
  buildOpenAIChatCompletionsEndpoint,
  buildClaudeMessagesEndpoint,
  formatApiCallResultDetail,
  getProviderRecentUsageEntry,
  getProviderTotalStats,
  getProviderRecentStats,
  getOpenAIProviderTotalStats,
  getProviderConfigKey,
  getOpenAIProviderKey,
  getOpenAIEntryKey,
  buildApiKeyEntry,
  type ProviderRecentUsageMap,
} from './utils';

describe('disable-all-models rule helpers', () => {
  it('exposes the asterisk sentinel as the disable-all rule', () => {
    expect(DISABLE_ALL_MODELS_RULE).toBe('*');
  });

  it('detects the disable-all rule present among other models', () => {
    expect(hasDisableAllModelsRule(['gpt-4o', '*'])).toBe(true);
  });

  it('detects the disable-all rule when padded with whitespace', () => {
    expect(hasDisableAllModelsRule([' * '])).toBe(true);
  });

  it('returns false when the disable-all rule is absent', () => {
    expect(hasDisableAllModelsRule(['gpt-4o'])).toBe(false);
  });

  it('returns false for an undefined list', () => {
    expect(hasDisableAllModelsRule(undefined)).toBe(false);
  });

  it('returns false for a non-array value', () => {
    expect(hasDisableAllModelsRule('*' as unknown as string[])).toBe(false);
  });

  it('strips every disable-all rule from the list', () => {
    expect(stripDisableAllModelsRule(['a', '*', 'b', ' * '])).toEqual(['a', 'b']);
  });

  it('returns an empty array when stripping an undefined list', () => {
    expect(stripDisableAllModelsRule(undefined)).toEqual([]);
  });

  it('appends a single disable-all rule after stripping existing ones', () => {
    expect(withDisableAllModelsRule(['a', '*', 'b'])).toEqual(['a', 'b', '*']);
  });

  it('produces only the disable-all rule from an undefined list', () => {
    expect(withDisableAllModelsRule(undefined)).toEqual(['*']);
  });

  it('removes the disable-all rule and keeps the rest', () => {
    expect(withoutDisableAllModelsRule(['a', '*', 'b'])).toEqual(['a', 'b']);
  });
});

describe('parseTextList', () => {
  it('splits on newlines and trims each item', () => {
    expect(parseTextList('a\n  b  \nc')).toEqual(['a', 'b', 'c']);
  });

  it('splits on commas', () => {
    expect(parseTextList('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  it('collapses consecutive separators and drops empty items', () => {
    expect(parseTextList('a,,\n\n,b')).toEqual(['a', 'b']);
  });

  it('returns an empty array for an empty string', () => {
    expect(parseTextList('')).toEqual([]);
  });

  it('returns an empty array for whitespace and separators only', () => {
    expect(parseTextList('  ,\n , ')).toEqual([]);
  });

  it('preserves duplicates verbatim', () => {
    expect(parseTextList('a,a')).toEqual(['a', 'a']);
  });

  it('is re-exported unchanged as parseExcludedModels', () => {
    expect(parseExcludedModels).toBe(parseTextList);
  });
});

describe('excludedModelsToText', () => {
  it('joins models with newlines', () => {
    expect(excludedModelsToText(['a', 'b', 'c'])).toBe('a\nb\nc');
  });

  it('returns an empty string for an undefined list', () => {
    expect(excludedModelsToText(undefined)).toBe('');
  });

  it('returns an empty string for an empty list', () => {
    expect(excludedModelsToText([])).toBe('');
  });
});

describe('normalizeOpenAIBaseUrl', () => {
  it('returns an empty string for an empty input', () => {
    expect(normalizeOpenAIBaseUrl('')).toBe('');
  });

  it('returns an empty string for whitespace input', () => {
    expect(normalizeOpenAIBaseUrl('   ')).toBe('');
  });

  it('prepends http when no scheme is present', () => {
    expect(normalizeOpenAIBaseUrl('example.com')).toBe('http://example.com');
  });

  it('preserves an existing https scheme', () => {
    expect(normalizeOpenAIBaseUrl('https://example.com')).toBe('https://example.com');
  });

  it('strips a trailing v0/management segment', () => {
    expect(normalizeOpenAIBaseUrl('https://example.com/v0/management')).toBe('https://example.com');
  });

  it('strips a trailing v0/management segment with a trailing slash', () => {
    expect(normalizeOpenAIBaseUrl('https://example.com/v0/management/')).toBe(
      'https://example.com'
    );
  });

  it('removes trailing slashes', () => {
    expect(normalizeOpenAIBaseUrl('https://example.com///')).toBe('https://example.com');
  });

  it('trims surrounding whitespace before normalizing', () => {
    expect(normalizeOpenAIBaseUrl('  https://example.com/  ')).toBe('https://example.com');
  });
});

describe('normalizeClaudeBaseUrl', () => {
  it('defaults to the anthropic url for an empty input', () => {
    expect(normalizeClaudeBaseUrl('')).toBe('https://api.anthropic.com');
  });

  it('defaults to the anthropic url for whitespace input', () => {
    expect(normalizeClaudeBaseUrl('   ')).toBe('https://api.anthropic.com');
  });

  it('prepends http when no scheme is present', () => {
    expect(normalizeClaudeBaseUrl('proxy.local')).toBe('http://proxy.local');
  });

  it('strips a trailing v0/management segment', () => {
    expect(normalizeClaudeBaseUrl('https://proxy.local/v0/management')).toBe('https://proxy.local');
  });

  it('removes trailing slashes', () => {
    expect(normalizeClaudeBaseUrl('https://proxy.local//')).toBe('https://proxy.local');
  });
});

describe('buildOpenAIModelsEndpoint', () => {
  it('appends /models to a normalized base url', () => {
    expect(buildOpenAIModelsEndpoint('https://example.com')).toBe('https://example.com/models');
  });

  it('returns an empty string for an empty base url', () => {
    expect(buildOpenAIModelsEndpoint('')).toBe('');
  });

  it('normalizes then appends /models for a scheme-less url with trailing slash', () => {
    expect(buildOpenAIModelsEndpoint('example.com/')).toBe('http://example.com/models');
  });
});

describe('buildOpenAIChatCompletionsEndpoint', () => {
  it('appends /chat/completions to a normalized base url', () => {
    expect(buildOpenAIChatCompletionsEndpoint('https://example.com')).toBe(
      'https://example.com/chat/completions'
    );
  });

  it('does not double-append when the url already ends in /chat/completions', () => {
    expect(buildOpenAIChatCompletionsEndpoint('https://example.com/chat/completions')).toBe(
      'https://example.com/chat/completions'
    );
  });

  it('returns an empty string for an empty base url', () => {
    expect(buildOpenAIChatCompletionsEndpoint('')).toBe('');
  });
});

describe('buildClaudeMessagesEndpoint', () => {
  it('appends /v1/messages to a bare base url', () => {
    expect(buildClaudeMessagesEndpoint('https://proxy.local')).toBe(
      'https://proxy.local/v1/messages'
    );
  });

  it('appends only /messages when the url already ends in /v1', () => {
    expect(buildClaudeMessagesEndpoint('https://proxy.local/v1')).toBe(
      'https://proxy.local/v1/messages'
    );
  });

  it('does not double-append when the url already ends in /v1/messages', () => {
    expect(buildClaudeMessagesEndpoint('https://proxy.local/v1/messages')).toBe(
      'https://proxy.local/v1/messages'
    );
  });

  it('builds the messages endpoint from the anthropic default for empty input', () => {
    expect(buildClaudeMessagesEndpoint('')).toBe('https://api.anthropic.com/v1/messages');
  });
});

describe('formatApiCallResultDetail', () => {
  it('pretty-prints an object body as indented JSON', () => {
    const detail = formatApiCallResultDetail({
      statusCode: 200,
      header: {},
      bodyText: '{"ok":true}',
      body: { ok: true },
    });

    expect(detail).toBe('{\n  "ok": true\n}');
  });

  it('falls back to the trimmed raw body text for non-object bodies', () => {
    const detail = formatApiCallResultDetail({
      statusCode: 502,
      header: {},
      bodyText: '  upstream unavailable  ',
      body: 'upstream unavailable',
    });

    expect(detail).toBe('upstream unavailable');
  });

  it('returns an empty string when the response had no body', () => {
    const detail = formatApiCallResultDetail({
      statusCode: 204,
      header: {},
      bodyText: '',
      body: null,
    });

    expect(detail).toBe('');
  });
});

describe('getProviderRecentUsageEntry', () => {
  const buildMap = (
    provider: string,
    baseUrl: string,
    apiKey: string,
    entry: { success: number; failed: number }
  ): ProviderRecentUsageMap => {
    const compositeKey = `${baseUrl}|${apiKey}`;
    return new Map([
      [provider.toLowerCase(), new Map([[compositeKey, { ...entry, recentRequests: [] }]])],
    ]);
  };

  it('returns the empty usage entry when the api key is blank', () => {
    const map = buildMap('openai', 'https://x', 'k', { success: 5, failed: 1 });

    expect(getProviderRecentUsageEntry(map, 'openai', '   ', 'https://x')).toEqual({
      success: 0,
      failed: 0,
      recentRequests: [],
    });
  });

  it('returns the empty usage entry when no matching entry exists', () => {
    const map: ProviderRecentUsageMap = new Map();

    expect(getProviderRecentUsageEntry(map, 'openai', 'k', 'https://x')).toEqual({
      success: 0,
      failed: 0,
      recentRequests: [],
    });
  });

  it('looks up the entry by case-insensitive provider and composite base-url/api-key key', () => {
    const map = buildMap('openai', 'https://x', 'k', { success: 7, failed: 2 });

    const result = getProviderRecentUsageEntry(map, 'OpenAI', 'k', 'https://x');

    expect(result).toEqual({ success: 7, failed: 2, recentRequests: [] });
  });
});

describe('getProviderTotalStats', () => {
  it('maps the entry success and failed counts to success and failure', () => {
    const map: ProviderRecentUsageMap = new Map([
      ['openai', new Map([['https://x|k', { success: 9, failed: 3, recentRequests: [] }]])],
    ]);

    expect(getProviderTotalStats(map, 'openai', 'k', 'https://x')).toEqual({
      success: 9,
      failure: 3,
    });
  });

  it('returns zeroed stats when the entry is missing', () => {
    expect(getProviderTotalStats(new Map(), 'openai', 'k', 'https://x')).toEqual({
      success: 0,
      failure: 0,
    });
  });

  it('aliases getProviderRecentStats to the same total stats', () => {
    const map: ProviderRecentUsageMap = new Map([
      ['openai', new Map([['https://x|k', { success: 4, failed: 1, recentRequests: [] }]])],
    ]);

    expect(getProviderRecentStats(map, 'openai', 'k', 'https://x')).toEqual({
      success: 4,
      failure: 1,
    });
  });
});

describe('getOpenAIProviderTotalStats', () => {
  it('sums success and failure across all api key entries', () => {
    const map: ProviderRecentUsageMap = new Map([
      [
        'prov',
        new Map([
          ['https://x|k1', { success: 2, failed: 1, recentRequests: [] }],
          ['https://x|k2', { success: 5, failed: 3, recentRequests: [] }],
        ]),
      ],
    ]);
    const provider = {
      name: 'prov',
      baseUrl: 'https://x',
      apiKeyEntries: [{ apiKey: 'k1' }, { apiKey: 'k2' }],
    } as OpenAIProviderConfig;

    expect(getOpenAIProviderTotalStats(provider, map)).toEqual({ success: 7, failure: 4 });
  });

  it('returns zeroed stats when the provider has no api key entries', () => {
    const provider = {
      name: 'prov',
      baseUrl: 'https://x',
      apiKeyEntries: [],
    } as unknown as OpenAIProviderConfig;

    expect(getOpenAIProviderTotalStats(provider, new Map())).toEqual({ success: 0, failure: 0 });
  });
});

describe('getProviderConfigKey', () => {
  it('uses the normalized authIndex when present', () => {
    expect(getProviderConfigKey({ authIndex: 'auth-7' }, 3)).toBe('auth-7');
  });

  it('normalizes a numeric authIndex to its string form', () => {
    expect(getProviderConfigKey({ authIndex: 5 }, 3)).toBe('5');
  });

  it('falls back to a composite of api key, base url, proxy url, and index', () => {
    expect(
      getProviderConfigKey({ apiKey: 'k', baseUrl: 'https://x', proxyUrl: 'http://p' }, 2)
    ).toBe('k::https://x::http://p::2');
  });

  it('fills blank segments when fields are missing in the fallback path', () => {
    expect(getProviderConfigKey({}, 0)).toBe('::::::0');
  });
});

describe('getOpenAIProviderKey', () => {
  it('uses the normalized authIndex when present', () => {
    const provider = { authIndex: 'a1' } as OpenAIProviderConfig;

    expect(getOpenAIProviderKey(provider, 4)).toBe('a1');
  });

  it('falls back to a composite of name, base url, prefix, and index', () => {
    const provider = {
      name: 'prov',
      baseUrl: 'https://x',
      prefix: 'pfx',
      apiKeyEntries: [],
    } as unknown as OpenAIProviderConfig;

    expect(getOpenAIProviderKey(provider, 1)).toBe('prov::https://x::pfx::1');
  });
});

describe('getOpenAIEntryKey', () => {
  it('uses the normalized authIndex when present', () => {
    const entry = { apiKey: 'k', authIndex: 'idx' } as ApiKeyEntry;

    expect(getOpenAIEntryKey(entry, 2)).toBe('idx');
  });

  it('falls back to a composite of api key, proxy url, and index', () => {
    const entry = { apiKey: 'k', proxyUrl: 'http://p' } as ApiKeyEntry;

    expect(getOpenAIEntryKey(entry, 6)).toBe('k::http://p::6');
  });
});

describe('buildApiKeyEntry', () => {
  it('returns a fully defaulted entry when given no input', () => {
    expect(buildApiKeyEntry()).toEqual({ apiKey: '', proxyUrl: '', headers: {} });
  });

  it('carries over provided fields', () => {
    expect(
      buildApiKeyEntry({ apiKey: 'k', proxyUrl: 'http://p', headers: { 'X-A': '1' } })
    ).toEqual({ apiKey: 'k', proxyUrl: 'http://p', headers: { 'X-A': '1' } });
  });

  it('defaults proxyUrl and headers when only apiKey is given', () => {
    expect(buildApiKeyEntry({ apiKey: 'k' })).toEqual({ apiKey: 'k', proxyUrl: '', headers: {} });
  });
});
