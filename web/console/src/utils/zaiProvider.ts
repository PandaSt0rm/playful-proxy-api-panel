import type { AuthFileItem, OpenAIProviderConfig } from '@/types';

export const ZAI_DEFAULT_NAME = 'Z.AI';
export const ZAI_DEFAULT_PREFIX = 'zai';
export const ZAI_DEFAULT_BASE_URL = 'https://api.z.ai/api/coding/paas/v4';

const ZAI_PROVIDER_NAMES = new Set(['zai', 'z.ai', 'z-ai', 'z_ai']);
const ZAI_HOST = 'api.z.ai';

export const normalizeZaiProviderName = (value: unknown): string =>
  String(value ?? '')
    .trim()
    .toLowerCase();

export const isZaiProviderName = (value: unknown): boolean =>
  ZAI_PROVIDER_NAMES.has(normalizeZaiProviderName(value));

export const isZaiBaseUrl = (value: unknown): boolean => {
  const raw = String(value ?? '').trim();
  if (!raw) return false;
  try {
    return new URL(raw).hostname.toLowerCase() === ZAI_HOST;
  } catch {
    return raw.toLowerCase().includes(ZAI_HOST);
  }
};

export const isZaiOpenAIProvider = (
  provider: Pick<OpenAIProviderConfig, 'name' | 'prefix' | 'baseUrl'>
): boolean =>
  isZaiProviderName(provider.name) ||
  isZaiProviderName(provider.prefix) ||
  isZaiBaseUrl(provider.baseUrl);

export const buildDefaultZaiProvider = (): OpenAIProviderConfig => ({
  name: ZAI_DEFAULT_NAME,
  prefix: ZAI_DEFAULT_PREFIX,
  baseUrl: ZAI_DEFAULT_BASE_URL,
  apiKeyEntries: [],
  models: [
    { name: 'glm-4.5' },
    { name: 'glm-4.5-air' },
    { name: 'glm-4.6' },
    { name: 'glm-4.7' },
    { name: 'glm-5' },
    { name: 'glm-5-turbo' },
    { name: 'glm-5.1' },
    { name: 'glm-5v-turbo' },
  ],
});

export const buildZaiQuotaAuthFilesFromOpenAIProviders = (
  providers: OpenAIProviderConfig[]
): AuthFileItem[] => {
  return providers.flatMap((provider, providerIndex) => {
    if (!isZaiOpenAIProvider(provider) || provider.disabled === true) return [];

    const entries = provider.apiKeyEntries?.length
      ? provider.apiKeyEntries
      : provider.authIndex
        ? [{ apiKey: '', authIndex: provider.authIndex }]
        : [];
    const displayName = provider.name?.trim() || ZAI_DEFAULT_NAME;

    return entries
      .map((entry, entryIndex): AuthFileItem | null => {
        const authIndex = String(entry.authIndex ?? '').trim();
        if (!authIndex) return null;
        const cardNumber =
          entries.length > 1 ? `${providerIndex + 1}.${entryIndex + 1}` : `${providerIndex + 1}`;
        return {
          id: `zai-openai-compat-${providerIndex}-${entryIndex}`,
          name: `${displayName} #${cardNumber}`,
          type: 'zai',
          provider: 'zai',
          label: displayName,
          authIndex,
          auth_index: authIndex,
          runtimeOnly: false,
          disabled: false,
          source: 'openai-compatibility',
          prefix: provider.prefix,
          baseUrl: provider.baseUrl,
        };
      })
      .filter((item): item is AuthFileItem => item !== null);
  });
};
