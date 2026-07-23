import { describe, it, expect } from 'vitest';
import {
  OPENROUTER_DEFAULT_BASE_URL,
  buildDefaultOpenRouterProvider,
  isOpenRouterBaseUrl,
  isOpenRouterOpenAIProvider,
  isOpenRouterProviderName,
} from './openrouterProvider';

describe('openrouterProvider', () => {
  it.each(['openrouter', 'OpenRouter', ' open-router ', 'OPEN ROUTER'])(
    'recognizes %s as an OpenRouter provider name',
    (name) => {
      expect(isOpenRouterProviderName(name)).toBe(true);
    }
  );

  it('does not recognize unrelated provider names', () => {
    expect(isOpenRouterProviderName('router')).toBe(false);
    expect(isOpenRouterProviderName('openai')).toBe(false);
    expect(isOpenRouterProviderName('')).toBe(false);
  });

  it('recognizes openrouter.ai base URLs including subdomains', () => {
    expect(isOpenRouterBaseUrl('https://openrouter.ai/api/v1')).toBe(true);
    expect(isOpenRouterBaseUrl('https://gateway.openrouter.ai/api/v1')).toBe(true);
  });

  it('does not match lookalike hosts', () => {
    expect(isOpenRouterBaseUrl('https://notopenrouter.ai/api/v1')).toBe(false);
    expect(isOpenRouterBaseUrl('https://api.example.com/openrouter')).toBe(false);
    expect(isOpenRouterBaseUrl('')).toBe(false);
  });

  it('detects a provider via name, prefix, or base URL', () => {
    expect(
      isOpenRouterOpenAIProvider({ name: 'OpenRouter', prefix: '', baseUrl: 'https://x.test' })
    ).toBe(true);
    expect(
      isOpenRouterOpenAIProvider({
        name: 'My Router',
        prefix: 'openrouter',
        baseUrl: 'https://x.test',
      })
    ).toBe(true);
    expect(
      isOpenRouterOpenAIProvider({
        name: 'Custom',
        prefix: '',
        baseUrl: 'https://openrouter.ai/api/v1',
      })
    ).toBe(true);
    expect(
      isOpenRouterOpenAIProvider({ name: 'Acme', prefix: 'acme', baseUrl: 'https://acme.test' })
    ).toBe(false);
  });

  it('builds a default provider pointing at the OpenRouter API', () => {
    const provider = buildDefaultOpenRouterProvider();
    expect(provider.name).toBe('OpenRouter');
    expect(provider.prefix).toBe('openrouter');
    expect(provider.baseUrl).toBe(OPENROUTER_DEFAULT_BASE_URL);
    expect(provider.models).toEqual([]);
  });
  it('normalizes null names and recognizes a malformed URL containing the canonical host', () => {
    expect(isOpenRouterProviderName(null)).toBe(false);
    expect(isOpenRouterBaseUrl(null)).toBe(false);
    expect(isOpenRouterBaseUrl('not a url openrouter.ai/path')).toBe(true);
  });
});
