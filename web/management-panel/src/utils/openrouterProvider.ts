import type { OpenAIProviderConfig } from '@/types';

export const OPENROUTER_DEFAULT_NAME = 'OpenRouter';
export const OPENROUTER_DEFAULT_PREFIX = 'openrouter';
export const OPENROUTER_DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';

const OPENROUTER_PROVIDER_NAMES = new Set(['openrouter', 'open-router', 'open_router', 'open router']);
const OPENROUTER_HOST = 'openrouter.ai';

export const normalizeOpenRouterProviderName = (value: unknown): string =>
  String(value ?? '').trim().toLowerCase();

export const isOpenRouterProviderName = (value: unknown): boolean =>
  OPENROUTER_PROVIDER_NAMES.has(normalizeOpenRouterProviderName(value));

export const isOpenRouterBaseUrl = (value: unknown): boolean => {
  const raw = String(value ?? '').trim();
  if (!raw) return false;
  try {
    const hostname = new URL(raw).hostname.toLowerCase();
    return hostname === OPENROUTER_HOST || hostname.endsWith(`.${OPENROUTER_HOST}`);
  } catch {
    return raw.toLowerCase().includes(OPENROUTER_HOST);
  }
};

export const isOpenRouterOpenAIProvider = (
  provider: Pick<OpenAIProviderConfig, 'name' | 'prefix' | 'baseUrl'>
): boolean =>
  isOpenRouterProviderName(provider.name) ||
  isOpenRouterProviderName(provider.prefix) ||
  isOpenRouterBaseUrl(provider.baseUrl);

export const buildDefaultOpenRouterProvider = (): OpenAIProviderConfig => ({
  name: OPENROUTER_DEFAULT_NAME,
  prefix: OPENROUTER_DEFAULT_PREFIX,
  baseUrl: OPENROUTER_DEFAULT_BASE_URL,
  apiKeyEntries: [],
  // OpenRouter exposes hundreds of models; start empty and let users pull the
  // catalog via the /models discovery screen.
  models: [],
});
