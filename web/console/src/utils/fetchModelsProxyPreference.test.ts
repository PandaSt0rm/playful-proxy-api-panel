import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { fetchModelsProxyPreference } from './fetchModelsProxyPreference';

describe('fetchModelsProxyPreference.read', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('returns the fallback when nothing is stored', () => {
    const result = fetchModelsProxyPreference.read('openai', true);

    expect(result).toBe(true);
  });

  it('returns the false fallback when nothing is stored', () => {
    const result = fetchModelsProxyPreference.read('zai', false);

    expect(result).toBe(false);
  });

  it('returns true when the stored value is the string "true"', () => {
    localStorage.setItem('aiproxy.fetchModelsUseKeyProxy.claude', 'true');

    const result = fetchModelsProxyPreference.read('claude', false);

    expect(result).toBe(true);
  });

  it('returns false when the stored value is the string "false"', () => {
    localStorage.setItem('aiproxy.fetchModelsUseKeyProxy.gemini', 'false');

    const result = fetchModelsProxyPreference.read('gemini', true);

    expect(result).toBe(false);
  });

  it('returns false for any stored value other than "true"', () => {
    localStorage.setItem('aiproxy.fetchModelsUseKeyProxy.codex', 'yes');

    const result = fetchModelsProxyPreference.read('codex', true);

    expect(result).toBe(false);
  });

  it('namespaces storage keys per provider', () => {
    localStorage.setItem('aiproxy.fetchModelsUseKeyProxy.openai', 'true');
    localStorage.setItem('aiproxy.fetchModelsUseKeyProxy.ollama', 'true');

    const openaiResult = fetchModelsProxyPreference.read('openai', false);
    const zaiResult = fetchModelsProxyPreference.read('zai', false);
    const ollamaResult = fetchModelsProxyPreference.read('ollama', false);

    expect(openaiResult).toBe(true);
    expect(zaiResult).toBe(false);
    expect(ollamaResult).toBe(true);
  });

  it('returns the fallback when localStorage.getItem throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });

    const result = fetchModelsProxyPreference.read('openai', true);

    expect(result).toBe(true);
  });
});

describe('fetchModelsProxyPreference.write', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('persists true as the string "true" under the provider key', () => {
    fetchModelsProxyPreference.write('openai', true);

    expect(localStorage.getItem('aiproxy.fetchModelsUseKeyProxy.openai')).toBe('true');
  });

  it('persists false as the string "false" under the provider key', () => {
    fetchModelsProxyPreference.write('claude', false);

    expect(localStorage.getItem('aiproxy.fetchModelsUseKeyProxy.claude')).toBe('false');
  });

  it('round-trips a written value back through read', () => {
    fetchModelsProxyPreference.write('gemini', true);

    const result = fetchModelsProxyPreference.read('gemini', false);

    expect(result).toBe(true);
  });

  it('silently ignores a setItem failure without throwing', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });

    expect(() => fetchModelsProxyPreference.write('codex', true)).not.toThrow();
  });
});
