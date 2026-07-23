import type { OpenAIProviderConfig } from '@/types';

export const OLLAMA_CLOUD_DEFAULT_NAME = 'Ollama Cloud';
export const OLLAMA_CLOUD_DEFAULT_PREFIX = 'ollama';
export const OLLAMA_CLOUD_DEFAULT_BASE_URL = 'https://ollama.com/v1';

const OLLAMA_CLOUD_PROVIDER_NAMES = new Set(['ollama cloud', 'ollama-cloud', 'ollama_cloud']);
const OLLAMA_CLOUD_HOST = 'ollama.com';

const isOpenAICompatibleOllamaPath = (pathname: string): boolean => {
  const normalized = pathname.replace(/\/+$/, '').toLowerCase();
  return normalized === '/v1' || normalized.startsWith('/v1/');
};

export const normalizeOllamaCloudProviderName = (value: unknown): string =>
  String(value ?? '')
    .trim()
    .toLowerCase();

export const isOllamaCloudProviderName = (value: unknown): boolean =>
  OLLAMA_CLOUD_PROVIDER_NAMES.has(normalizeOllamaCloudProviderName(value));

export const isOllamaCloudBaseUrl = (value: unknown): boolean => {
  const raw = String(value ?? '').trim();
  if (!raw) return false;

  try {
    const url = new URL(raw);
    return (
      url.hostname.toLowerCase() === OLLAMA_CLOUD_HOST && isOpenAICompatibleOllamaPath(url.pathname)
    );
  } catch {
    const normalized = raw
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^\/+/, '');
    return (
      normalized === `${OLLAMA_CLOUD_HOST}/v1` || normalized.startsWith(`${OLLAMA_CLOUD_HOST}/v1/`)
    );
  }
};

export const isOllamaCloudOpenAIProvider = (
  provider: Pick<OpenAIProviderConfig, 'name' | 'prefix' | 'baseUrl'>
): boolean =>
  isOllamaCloudProviderName(provider.name) ||
  isOllamaCloudProviderName(provider.prefix) ||
  isOllamaCloudBaseUrl(provider.baseUrl);

export const buildDefaultOllamaCloudProvider = (): OpenAIProviderConfig => ({
  name: OLLAMA_CLOUD_DEFAULT_NAME,
  prefix: OLLAMA_CLOUD_DEFAULT_PREFIX,
  baseUrl: OLLAMA_CLOUD_DEFAULT_BASE_URL,
  apiKeyEntries: [],
  models: [{ name: 'gpt-oss:120b' }, { name: 'gpt-oss:20b' }, { name: 'qwen3.5:397b' }],
});
