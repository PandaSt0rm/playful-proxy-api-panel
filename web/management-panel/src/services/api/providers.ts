/**
 * AI 提供商相关 API
 */

import { apiClient } from './client';
import {
  normalizeGeminiKeyConfig,
  normalizeOpenAIProvider,
  normalizeProviderKeyConfig,
} from './transformers';
import type {
  GeminiKeyConfig,
  OpenAIProviderConfig,
  ProviderKeyConfig,
  ApiKeyEntry,
  ModelAlias,
} from '@/types';

const serializeHeaders = (headers?: Record<string, string>) =>
  headers && Object.keys(headers).length ? headers : undefined;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const cloneRaw = (raw?: Record<string, unknown>): Record<string, unknown> =>
  raw && isRecord(raw) ? { ...raw } : {};

const setOptionalString = (payload: Record<string, unknown>, key: string, value?: string) => {
  const trimmed = value?.trim() ?? '';
  if (trimmed) {
    payload[key] = trimmed;
  } else {
    delete payload[key];
  }
};

const setOptionalNumber = (payload: Record<string, unknown>, key: string, value?: number) => {
  if (value !== undefined && Number.isFinite(value)) {
    payload[key] = value;
  } else {
    delete payload[key];
  }
};

const setOptionalBoolean = (payload: Record<string, unknown>, key: string, value?: boolean) => {
  if (value !== undefined && (value || Object.prototype.hasOwnProperty.call(payload, key))) {
    payload[key] = value;
  } else {
    delete payload[key];
  }
};

const setOptionalHeaders = (
  payload: Record<string, unknown>,
  key: string,
  headers?: Record<string, string>
) => {
  const normalized = serializeHeaders(headers);
  if (normalized) {
    payload[key] = normalized;
  } else {
    delete payload[key];
  }
};

const serializeThinkingSupport = (model: ModelAlias) => {
  const thinking: NonNullable<ModelAlias['thinking']> = model.thinking ? { ...model.thinking } : {};
  const payload: Record<string, unknown> = {};
  if (thinking.min !== undefined) payload.min = thinking.min;
  if (thinking.max !== undefined) payload.max = thinking.max;
  if (thinking.zeroAllowed !== undefined) payload.zero_allowed = thinking.zeroAllowed;
  if (thinking.dynamicAllowed !== undefined) payload.dynamic_allowed = thinking.dynamicAllowed;
  const levels =
    Array.isArray(model.thinkingLevels) && model.thinkingLevels.length
      ? model.thinkingLevels
      : thinking.levels;
  if (Array.isArray(levels) && levels.length) {
    payload.levels = [...levels];
  }
  return Object.keys(payload).length ? payload : undefined;
};

const extractArrayPayload = (data: unknown, key: string): unknown[] => {
  if (Array.isArray(data)) return data;
  if (!isRecord(data)) return [];
  const candidate = data[key] ?? data.items ?? data.data ?? data;
  return Array.isArray(candidate) ? candidate : [];
};

const buildProviderDeleteQuery = (apiKey: string, baseUrl?: string) => {
  const params = new URLSearchParams();
  params.set('api-key', apiKey.trim());
  params.set('base-url', (baseUrl ?? '').trim());
  return `?${params.toString()}`;
};

export const serializeModelAliases = (models?: ModelAlias[]) =>
  Array.isArray(models)
    ? models
        .map((model) => {
          if (!model?.name) return null;
          const payload: Record<string, unknown> = cloneRaw(model.raw);
          payload.name = model.name;
          if (model.alias && model.alias !== model.name) {
            payload.alias = model.alias;
          } else {
            delete payload.alias;
          }
          setOptionalNumber(payload, 'priority', model.priority);
          setOptionalString(payload, 'test-model', model.testModel);
          setOptionalString(payload, 'display-name', model.displayName);
          setOptionalBoolean(payload, 'force-mapping', model.forceMapping);
          setOptionalBoolean(payload, 'image', model.image);
          if (model.inputModalities?.length) {
            payload['input-modalities'] = [...model.inputModalities];
          } else {
            delete payload['input-modalities'];
          }
          if (model.outputModalities?.length) {
            payload['output-modalities'] = [...model.outputModalities];
          } else {
            delete payload['output-modalities'];
          }
          const thinking = serializeThinkingSupport(model);
          if (thinking) {
            payload.thinking = thinking;
          } else {
            delete payload.thinking;
          }
          if (model.thinkingPayloads && Object.keys(model.thinkingPayloads).length) {
            payload['thinking-payloads'] = { ...model.thinkingPayloads };
          } else {
            delete payload['thinking-payloads'];
          }
          return payload;
        })
        .filter(Boolean)
    : undefined;

export const serializeApiKeyEntry = (entry: ApiKeyEntry) => {
  const payload: Record<string, unknown> = cloneRaw(entry.raw);
  payload['api-key'] = entry.apiKey;
  setOptionalString(payload, 'proxy-url', entry.proxyUrl);
  setOptionalHeaders(payload, 'headers', entry.headers);
  delete payload['auth-index'];
  delete payload.authIndex;
  delete payload.auth_index;
  return payload;
};

export const serializeProviderKey = (config: ProviderKeyConfig) => {
  const payload: Record<string, unknown> = cloneRaw(config.raw);
  payload['api-key'] = config.apiKey;
  setOptionalNumber(payload, 'priority', config.priority);
  setOptionalString(payload, 'prefix', config.prefix);
  setOptionalString(payload, 'base-url', config.baseUrl);
  setOptionalBoolean(payload, 'websockets', config.websockets);
  setOptionalString(payload, 'proxy-url', config.proxyUrl);
  setOptionalHeaders(payload, 'headers', config.headers);
  const models = serializeModelAliases(config.models);
  if (models && models.length) {
    payload.models = models;
  } else {
    delete payload.models;
  }
  if (config.excludedModels && config.excludedModels.length) {
    payload['excluded-models'] = config.excludedModels;
  } else {
    delete payload['excluded-models'];
  }
  setOptionalBoolean(payload, 'disable-cooling', config.disableCooling);
  setOptionalBoolean(payload, 'experimental-cch-signing', config.experimentalCCHSigning);
  if (config.cloak) {
    const cloakPayload: Record<string, unknown> = cloneRaw(config.cloak.raw);
    const mode = config.cloak.mode?.trim();
    if (mode) cloakPayload.mode = mode;
    else delete cloakPayload.mode;
    if (config.cloak.strictMode !== undefined)
      cloakPayload['strict-mode'] = config.cloak.strictMode;
    else delete cloakPayload['strict-mode'];
    if (config.cloak.sensitiveWords && config.cloak.sensitiveWords.length) {
      cloakPayload['sensitive-words'] = config.cloak.sensitiveWords;
    } else {
      delete cloakPayload['sensitive-words'];
    }
    setOptionalBoolean(cloakPayload, 'cache-user-id', config.cloak.cacheUserId);
    if (Object.keys(cloakPayload).length) {
      payload.cloak = cloakPayload;
    } else {
      delete payload.cloak;
    }
  } else {
    delete payload.cloak;
  }
  delete payload['auth-index'];
  delete payload.authIndex;
  delete payload.auth_index;
  return payload;
};

const serializeVertexModelAliases = (models?: ModelAlias[]) =>
  Array.isArray(models)
    ? models
        .map((model) => {
          const name = typeof model?.name === 'string' ? model.name.trim() : '';
          const alias = typeof model?.alias === 'string' ? model.alias.trim() : '';
          if (!name || !alias) return null;
          return { name, alias };
        })
        .filter(Boolean)
    : undefined;

const serializeVertexKey = (config: ProviderKeyConfig) => {
  const payload: Record<string, unknown> = cloneRaw(config.raw);
  payload['api-key'] = config.apiKey;
  setOptionalNumber(payload, 'priority', config.priority);
  setOptionalString(payload, 'prefix', config.prefix);
  setOptionalString(payload, 'base-url', config.baseUrl);
  setOptionalString(payload, 'proxy-url', config.proxyUrl);
  setOptionalHeaders(payload, 'headers', config.headers);
  const models = serializeVertexModelAliases(config.models);
  if (models && models.length) payload.models = models;
  else delete payload.models;
  if (config.excludedModels && config.excludedModels.length) {
    payload['excluded-models'] = config.excludedModels;
  } else {
    delete payload['excluded-models'];
  }
  delete payload['auth-index'];
  delete payload.authIndex;
  delete payload.auth_index;
  return payload;
};

export const serializeGeminiKey = (config: GeminiKeyConfig) => {
  const payload: Record<string, unknown> = cloneRaw(config.raw);
  payload['api-key'] = config.apiKey;
  setOptionalNumber(payload, 'priority', config.priority);
  setOptionalString(payload, 'prefix', config.prefix);
  setOptionalString(payload, 'base-url', config.baseUrl);
  setOptionalString(payload, 'proxy-url', config.proxyUrl);
  setOptionalHeaders(payload, 'headers', config.headers);
  const models = serializeModelAliases(config.models);
  if (models && models.length) payload.models = models;
  else delete payload.models;
  if (config.excludedModels && config.excludedModels.length) {
    payload['excluded-models'] = config.excludedModels;
  } else {
    delete payload['excluded-models'];
  }
  setOptionalBoolean(payload, 'disable-cooling', config.disableCooling);
  delete payload['auth-index'];
  delete payload.authIndex;
  delete payload.auth_index;
  return payload;
};

export const serializeOpenAIProvider = (provider: OpenAIProviderConfig) => {
  const payload: Record<string, unknown> = cloneRaw(provider.raw);
  payload.name = provider.name;
  payload['base-url'] = provider.baseUrl;
  payload['api-key-entries'] = Array.isArray(provider.apiKeyEntries)
    ? provider.apiKeyEntries.map((entry) => serializeApiKeyEntry(entry))
    : [];
  setOptionalString(payload, 'prefix', provider.prefix);
  setOptionalBoolean(payload, 'disabled', provider.disabled);
  setOptionalHeaders(payload, 'headers', provider.headers);
  const models = serializeModelAliases(provider.models);
  if (models && models.length) payload.models = models;
  else delete payload.models;
  setOptionalNumber(payload, 'priority', provider.priority);
  setOptionalString(payload, 'test-model', provider.testModel);
  setOptionalBoolean(payload, 'disable-cooling', provider.disableCooling);
  delete payload['auth-index'];
  delete payload.authIndex;
  delete payload.auth_index;
  return payload;
};

export const providersApi = {
  async getGeminiKeys(): Promise<GeminiKeyConfig[]> {
    const data = await apiClient.get('/gemini-api-key');
    const list = extractArrayPayload(data, 'gemini-api-key');
    return list.map((item) => normalizeGeminiKeyConfig(item)).filter(Boolean) as GeminiKeyConfig[];
  },

  saveGeminiKeys: (configs: GeminiKeyConfig[]) =>
    apiClient.put(
      '/gemini-api-key',
      configs.map((item) => serializeGeminiKey(item))
    ),

  updateGeminiKey: (index: number, value: GeminiKeyConfig) =>
    apiClient.patch('/gemini-api-key', { index, value: serializeGeminiKey(value) }),

  deleteGeminiKey: (apiKey: string, baseUrl?: string) =>
    apiClient.delete(`/gemini-api-key${buildProviderDeleteQuery(apiKey, baseUrl)}`),

  async getCodexConfigs(): Promise<ProviderKeyConfig[]> {
    const data = await apiClient.get('/codex-api-key');
    const list = extractArrayPayload(data, 'codex-api-key');
    return list
      .map((item) => normalizeProviderKeyConfig(item))
      .filter(Boolean) as ProviderKeyConfig[];
  },

  saveCodexConfigs: (configs: ProviderKeyConfig[]) =>
    apiClient.put(
      '/codex-api-key',
      configs.map((item) => serializeProviderKey(item))
    ),

  updateCodexConfig: (index: number, value: ProviderKeyConfig) =>
    apiClient.patch('/codex-api-key', { index, value: serializeProviderKey(value) }),

  deleteCodexConfig: (apiKey: string, baseUrl?: string) =>
    apiClient.delete(`/codex-api-key${buildProviderDeleteQuery(apiKey, baseUrl)}`),

  async getInteractionsConfigs(): Promise<GeminiKeyConfig[]> {
    const data = await apiClient.get('/interactions-api-key');
    const list = extractArrayPayload(data, 'interactions-api-key');
    return list.map((item) => normalizeGeminiKeyConfig(item)).filter(Boolean) as GeminiKeyConfig[];
  },

  saveInteractionsConfigs: (configs: GeminiKeyConfig[]) =>
    apiClient.put(
      '/interactions-api-key',
      configs.map((item) => serializeGeminiKey(item))
    ),

  deleteInteractionsConfig: (apiKey: string, baseUrl?: string) =>
    apiClient.delete(`/interactions-api-key${buildProviderDeleteQuery(apiKey, baseUrl)}`),

  async getXAIConfigs(): Promise<ProviderKeyConfig[]> {
    const data = await apiClient.get('/xai-api-key');
    const list = extractArrayPayload(data, 'xai-api-key');
    return list
      .map((item) => normalizeProviderKeyConfig(item))
      .filter(Boolean) as ProviderKeyConfig[];
  },

  saveXAIConfigs: (configs: ProviderKeyConfig[]) =>
    apiClient.put(
      '/xai-api-key',
      configs.map((item) => serializeProviderKey(item))
    ),

  deleteXAIConfig: (apiKey: string, baseUrl?: string) =>
    apiClient.delete(`/xai-api-key${buildProviderDeleteQuery(apiKey, baseUrl)}`),

  async getClaudeConfigs(): Promise<ProviderKeyConfig[]> {
    const data = await apiClient.get('/claude-api-key');
    const list = extractArrayPayload(data, 'claude-api-key');
    return list
      .map((item) => normalizeProviderKeyConfig(item))
      .filter(Boolean) as ProviderKeyConfig[];
  },

  saveClaudeConfigs: (configs: ProviderKeyConfig[]) =>
    apiClient.put(
      '/claude-api-key',
      configs.map((item) => serializeProviderKey(item))
    ),

  updateClaudeConfig: (index: number, value: ProviderKeyConfig) =>
    apiClient.patch('/claude-api-key', { index, value: serializeProviderKey(value) }),

  deleteClaudeConfig: (apiKey: string, baseUrl?: string) =>
    apiClient.delete(`/claude-api-key${buildProviderDeleteQuery(apiKey, baseUrl)}`),

  async getVertexConfigs(): Promise<ProviderKeyConfig[]> {
    const data = await apiClient.get('/vertex-api-key');
    const list = extractArrayPayload(data, 'vertex-api-key');
    return list
      .map((item) => normalizeProviderKeyConfig(item))
      .filter(Boolean) as ProviderKeyConfig[];
  },

  saveVertexConfigs: (configs: ProviderKeyConfig[]) =>
    apiClient.put(
      '/vertex-api-key',
      configs.map((item) => serializeVertexKey(item))
    ),

  updateVertexConfig: (index: number, value: ProviderKeyConfig) =>
    apiClient.patch('/vertex-api-key', { index, value: serializeVertexKey(value) }),

  deleteVertexConfig: (apiKey: string, baseUrl?: string) =>
    apiClient.delete(`/vertex-api-key${buildProviderDeleteQuery(apiKey, baseUrl)}`),

  async getOpenAIProviders(): Promise<OpenAIProviderConfig[]> {
    const data = await apiClient.get('/openai-compatibility');
    const list = extractArrayPayload(data, 'openai-compatibility');
    return list
      .map((item) => normalizeOpenAIProvider(item))
      .filter(Boolean) as OpenAIProviderConfig[];
  },

  saveOpenAIProviders: (providers: OpenAIProviderConfig[]) =>
    apiClient.put(
      '/openai-compatibility',
      providers.map((item) => serializeOpenAIProvider(item))
    ),

  updateOpenAIProvider: (index: number, value: OpenAIProviderConfig) =>
    apiClient.patch('/openai-compatibility', { index, value: serializeOpenAIProvider(value) }),

  updateOpenAIProviderDisabled: (index: number, disabled: boolean) =>
    apiClient.patch('/openai-compatibility', { index, value: { disabled } }),

  deleteOpenAIProvider: (name: string) =>
    apiClient.delete(`/openai-compatibility?name=${encodeURIComponent(name)}`),
};
