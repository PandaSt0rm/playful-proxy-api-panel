import { describe, it, expect } from 'vitest';

import type { OpenAIProviderConfig } from '@/types';
import {
  ZAI_DEFAULT_NAME,
  ZAI_DEFAULT_PREFIX,
  ZAI_DEFAULT_BASE_URL,
  normalizeZaiProviderName,
  isZaiProviderName,
  isZaiBaseUrl,
  isZaiOpenAIProvider,
  buildDefaultZaiProvider,
  buildZaiQuotaAuthFilesFromOpenAIProviders,
} from './zaiProvider';

describe('normalizeZaiProviderName', () => {
  it('trims and lowercases the value', () => {
    const result = normalizeZaiProviderName('  Z.AI  ');

    expect(result).toBe('z.ai');
  });

  it('returns an empty string for null', () => {
    const result = normalizeZaiProviderName(null);

    expect(result).toBe('');
  });

  it('returns an empty string for undefined', () => {
    const result = normalizeZaiProviderName(undefined);

    expect(result).toBe('');
  });
});

describe('isZaiProviderName', () => {
  it.each(['zai', 'z.ai', 'z-ai', 'z_ai', 'ZAI', '  Z.AI  '])(
    'returns true for the recognised provider name %j',
    (value) => {
      const result = isZaiProviderName(value);

      expect(result).toBe(true);
    }
  );

  it('returns false for an unrelated provider name', () => {
    const result = isZaiProviderName('openai');

    expect(result).toBe(false);
  });

  it('returns false for an empty string', () => {
    const result = isZaiProviderName('');

    expect(result).toBe(false);
  });

  it('returns false for null', () => {
    const result = isZaiProviderName(null);

    expect(result).toBe(false);
  });
});

describe('isZaiBaseUrl', () => {
  it('returns true for the canonical Z.AI base url', () => {
    const result = isZaiBaseUrl('https://api.z.ai/api/coding/paas/v4');

    expect(result).toBe(true);
  });

  it('matches the host case-insensitively', () => {
    const result = isZaiBaseUrl('https://API.Z.AI/path');

    expect(result).toBe(true);
  });

  it('returns false for an empty string', () => {
    const result = isZaiBaseUrl('');

    expect(result).toBe(false);
  });

  it('returns false for null', () => {
    const result = isZaiBaseUrl(null);

    expect(result).toBe(false);
  });

  it('returns false for a different host', () => {
    const result = isZaiBaseUrl('https://api.openai.com/v1');

    expect(result).toBe(false);
  });

  it('falls back to substring matching for a bare host that is not a valid URL', () => {
    const result = isZaiBaseUrl('api.z.ai');

    expect(result).toBe(true);
  });

  it('returns false for a bare host that does not contain the Z.AI host', () => {
    const result = isZaiBaseUrl('example.com');

    expect(result).toBe(false);
  });

  it('returns true for a malformed url whose text contains the host', () => {
    const result = isZaiBaseUrl('not a url api.z.ai trailing');

    expect(result).toBe(true);
  });

  it('returns false when the host only appears as a path segment, not the hostname', () => {
    const result = isZaiBaseUrl('https://proxy.example.com/api.z.ai');

    expect(result).toBe(false);
  });
});

describe('isZaiOpenAIProvider', () => {
  it('returns true when the name matches', () => {
    const result = isZaiOpenAIProvider({ name: 'zai', prefix: 'other', baseUrl: 'https://x' });

    expect(result).toBe(true);
  });

  it('returns true when only the prefix matches', () => {
    const result = isZaiOpenAIProvider({ name: 'custom', prefix: 'z-ai', baseUrl: 'https://x' });

    expect(result).toBe(true);
  });

  it('returns true when only the base url matches', () => {
    const result = isZaiOpenAIProvider({
      name: 'custom',
      prefix: 'custom',
      baseUrl: 'https://api.z.ai/v4',
    });

    expect(result).toBe(true);
  });

  it('returns false when nothing matches', () => {
    const result = isZaiOpenAIProvider({
      name: 'openai',
      prefix: 'oai',
      baseUrl: 'https://api.openai.com',
    });

    expect(result).toBe(false);
  });
});

describe('buildDefaultZaiProvider', () => {
  it('uses the default name, prefix and base url constants', () => {
    const result = buildDefaultZaiProvider();

    expect(result.name).toBe(ZAI_DEFAULT_NAME);
    expect(result.prefix).toBe(ZAI_DEFAULT_PREFIX);
    expect(result.baseUrl).toBe(ZAI_DEFAULT_BASE_URL);
  });

  it('starts with an empty apiKeyEntries list', () => {
    const result = buildDefaultZaiProvider();

    expect(result.apiKeyEntries).toEqual([]);
  });

  it('seeds the documented default model list', () => {
    const result = buildDefaultZaiProvider();

    expect(result.models).toEqual([
      { name: 'glm-4.5' },
      { name: 'glm-4.5-air' },
      { name: 'glm-4.6' },
      { name: 'glm-4.7' },
      { name: 'glm-5' },
      { name: 'glm-5-turbo' },
      { name: 'glm-5.1' },
      { name: 'glm-5v-turbo' },
    ]);
  });

  it('returns a fresh object on each call (no shared mutation)', () => {
    const first = buildDefaultZaiProvider();
    const second = buildDefaultZaiProvider();

    expect(first).not.toBe(second);
    expect(first.models).not.toBe(second.models);
  });
});

const zaiProvider = (overrides: Partial<OpenAIProviderConfig> = {}): OpenAIProviderConfig => ({
  name: 'Z.AI',
  prefix: 'zai',
  baseUrl: 'https://api.z.ai/api/coding/paas/v4',
  apiKeyEntries: [],
  ...overrides,
});

describe('buildZaiQuotaAuthFilesFromOpenAIProviders', () => {
  it('returns an empty array when no providers are Z.AI', () => {
    const result = buildZaiQuotaAuthFilesFromOpenAIProviders([
      zaiProvider({ name: 'openai', prefix: 'oai', baseUrl: 'https://api.openai.com' }),
    ]);

    expect(result).toEqual([]);
  });

  it('skips disabled Z.AI providers', () => {
    const result = buildZaiQuotaAuthFilesFromOpenAIProviders([
      zaiProvider({ disabled: true, apiKeyEntries: [{ apiKey: 'k', authIndex: 'a1' }] }),
    ]);

    expect(result).toEqual([]);
  });

  it('skips entries that have no authIndex', () => {
    const result = buildZaiQuotaAuthFilesFromOpenAIProviders([
      zaiProvider({ apiKeyEntries: [{ apiKey: 'k', authIndex: '' }] }),
    ]);

    expect(result).toEqual([]);
  });

  it('builds one auth file per entry with the expected identity fields', () => {
    const result = buildZaiQuotaAuthFilesFromOpenAIProviders([
      zaiProvider({ apiKeyEntries: [{ apiKey: 'k', authIndex: 'auth-7' }] }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'zai-openai-compat-0-0',
      name: 'Z.AI #1',
      type: 'zai',
      provider: 'zai',
      label: 'Z.AI',
      authIndex: 'auth-7',
      auth_index: 'auth-7',
      runtimeOnly: false,
      disabled: false,
      source: 'openai-compatibility',
      prefix: 'zai',
      baseUrl: 'https://api.z.ai/api/coding/paas/v4',
    });
  });

  it('uses single-segment card numbers when a provider has exactly one entry', () => {
    const result = buildZaiQuotaAuthFilesFromOpenAIProviders([
      zaiProvider({ apiKeyEntries: [{ apiKey: 'k', authIndex: 'a1' }] }),
    ]);

    expect(result[0].name).toBe('Z.AI #1');
  });

  it('uses provider.entry card numbers when a provider has multiple entries', () => {
    const result = buildZaiQuotaAuthFilesFromOpenAIProviders([
      zaiProvider({
        apiKeyEntries: [
          { apiKey: 'k1', authIndex: 'a1' },
          { apiKey: 'k2', authIndex: 'a2' },
        ],
      }),
    ]);

    expect(result.map((item) => item.name)).toEqual(['Z.AI #1.1', 'Z.AI #1.2']);
  });

  it('numbers cards by the provider index across multiple providers', () => {
    const result = buildZaiQuotaAuthFilesFromOpenAIProviders([
      zaiProvider({ name: 'openai', prefix: 'oai', baseUrl: 'https://api.openai.com' }),
      zaiProvider({ apiKeyEntries: [{ apiKey: 'k', authIndex: 'a1' }] }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Z.AI #2');
    expect(result[0].id).toBe('zai-openai-compat-1-0');
  });

  it('falls back to a synthetic entry from provider.authIndex when entries are absent', () => {
    const result = buildZaiQuotaAuthFilesFromOpenAIProviders([
      zaiProvider({ apiKeyEntries: [], authIndex: 'top-level-idx' }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].authIndex).toBe('top-level-idx');
  });

  it('falls back to the default display name when the provider name is blank', () => {
    const result = buildZaiQuotaAuthFilesFromOpenAIProviders([
      zaiProvider({ name: '   ', apiKeyEntries: [{ apiKey: 'k', authIndex: 'a1' }] }),
    ]);

    expect(result[0].label).toBe(ZAI_DEFAULT_NAME);
    expect(result[0].name).toBe('Z.AI #1');
  });

  it('returns an empty array for an empty provider list', () => {
    const result = buildZaiQuotaAuthFilesFromOpenAIProviders([]);

    expect(result).toEqual([]);
  });
});
