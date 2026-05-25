/**
 * AI 提供商相关类型
 * 基于原项目 src/modules/ai-providers.js
 */

export interface ThinkingSupport {
  min?: number;
  max?: number;
  zeroAllowed?: boolean;
  dynamicAllowed?: boolean;
  levels?: string[];
}

export interface ModelAlias {
  name: string;
  alias?: string;
  image?: boolean;
  priority?: number;
  testModel?: string;
  thinking?: ThinkingSupport;
  thinkingLevels?: string[];
  raw?: Record<string, unknown>;
}

export interface ApiKeyEntry {
  apiKey: string;
  proxyUrl?: string;
  headers?: Record<string, string>;
  authIndex?: string;
  raw?: Record<string, unknown>;
}

export interface CloakConfig {
  mode?: string;
  strictMode?: boolean;
  sensitiveWords?: string[];
  cacheUserId?: boolean;
  raw?: Record<string, unknown>;
}

export interface GeminiKeyConfig {
  apiKey: string;
  priority?: number;
  prefix?: string;
  baseUrl?: string;
  proxyUrl?: string;
  models?: ModelAlias[];
  headers?: Record<string, string>;
  excludedModels?: string[];
  disableCooling?: boolean;
  authIndex?: string;
  raw?: Record<string, unknown>;
}

export interface ProviderKeyConfig {
  apiKey: string;
  priority?: number;
  prefix?: string;
  baseUrl?: string;
  websockets?: boolean;
  proxyUrl?: string;
  headers?: Record<string, string>;
  models?: ModelAlias[];
  excludedModels?: string[];
  disableCooling?: boolean;
  experimentalCCHSigning?: boolean;
  cloak?: CloakConfig;
  authIndex?: string;
  raw?: Record<string, unknown>;
}

export interface OpenAIProviderConfig {
  name: string;
  prefix?: string;
  baseUrl: string;
  apiKeyEntries: ApiKeyEntry[];
  disabled?: boolean;
  headers?: Record<string, string>;
  models?: ModelAlias[];
  priority?: number;
  testModel?: string;
  disableCooling?: boolean;
  authIndex?: string;
  raw?: Record<string, unknown>;
  [key: string]: unknown;
}
