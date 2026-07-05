import { describe, it, expect } from 'vitest';
import {
  OLLAMA_CLOUD_DEFAULT_BASE_URL,
  buildDefaultOllamaCloudProvider,
  isOllamaCloudBaseUrl,
  isOllamaCloudOpenAIProvider,
  isOllamaCloudProviderName,
} from './ollamaCloudProvider';

describe('ollamaCloudProvider', () => {
  it.each(['Ollama Cloud', ' ollama-cloud ', 'OLLAMA_CLOUD'])(
    'recognizes %s as an Ollama Cloud provider name',
    (name) => {
      expect(isOllamaCloudProviderName(name)).toBe(true);
    }
  );

  it('does not recognize unrelated provider names', () => {
    expect(isOllamaCloudProviderName('ollama')).toBe(false);
    expect(isOllamaCloudProviderName('openai')).toBe(false);
    expect(isOllamaCloudProviderName('local llama')).toBe(false);
    expect(isOllamaCloudProviderName('')).toBe(false);
  });

  it('recognizes ollama.com cloud base URLs', () => {
    expect(isOllamaCloudBaseUrl('https://ollama.com/v1')).toBe(true);
    expect(isOllamaCloudBaseUrl('https://ollama.com/v1/')).toBe(true);
    expect(isOllamaCloudBaseUrl('ollama.com/v1')).toBe(true);
  });

  it('does not match lookalike hosts', () => {
    expect(isOllamaCloudBaseUrl('https://api.ollama.com/v1')).toBe(false);
    expect(isOllamaCloudBaseUrl('https://api.example.com/ollama.com/v1')).toBe(false);
    expect(isOllamaCloudBaseUrl('https://ollama.com/api')).toBe(false);
    expect(isOllamaCloudBaseUrl('https://ollama.com')).toBe(false);
    expect(isOllamaCloudBaseUrl('')).toBe(false);
  });

  it('detects a provider via explicit cloud name or base URL', () => {
    expect(
      isOllamaCloudOpenAIProvider({
        name: 'Ollama Cloud',
        prefix: '',
        baseUrl: 'https://x.test',
      })
    ).toBe(true);
    expect(
      isOllamaCloudOpenAIProvider({
        name: 'Hosted Models',
        prefix: 'ollama-cloud',
        baseUrl: 'https://x.test',
      })
    ).toBe(true);
    expect(
      isOllamaCloudOpenAIProvider({
        name: 'Custom',
        prefix: '',
        baseUrl: 'https://ollama.com/v1',
      })
    ).toBe(true);
    expect(
      isOllamaCloudOpenAIProvider({ name: 'Acme', prefix: 'acme', baseUrl: 'https://acme.test' })
    ).toBe(false);
  });

  it('does not classify local Ollama OpenAI-compatible endpoints as Ollama Cloud', () => {
    expect(
      isOllamaCloudOpenAIProvider({
        name: 'ollama',
        prefix: 'ollama',
        baseUrl: 'http://localhost:11434/v1',
      })
    ).toBe(false);
  });

  it('builds a default provider pointing at the Ollama Cloud OpenAI-compatible API', () => {
    const provider = buildDefaultOllamaCloudProvider();

    expect(provider.name).toBe('Ollama Cloud');
    expect(provider.prefix).toBe('ollama');
    expect(provider.baseUrl).toBe(OLLAMA_CLOUD_DEFAULT_BASE_URL);
    expect(provider.apiKeyEntries).toEqual([]);
    expect(provider.models).toEqual([
      { name: 'gpt-oss:120b' },
      { name: 'gpt-oss:20b' },
      { name: 'qwen3.5:397b' },
    ]);
  });
});
