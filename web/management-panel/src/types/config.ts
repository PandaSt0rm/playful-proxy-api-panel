/**
 * 配置相关类型定义
 * 与基线 /config 返回结构保持一致（内部使用驼峰形式）
 */

import type { GeminiKeyConfig, ProviderKeyConfig, OpenAIProviderConfig } from './provider';
import type { AmpcodeConfig } from './ampcode';
import type { SyncProfile } from './sync';

export interface QuotaExceededConfig {
  switchProject?: boolean;
  switchPreviewModel?: boolean;
  antigravityCredits?: boolean;
}

export interface UpstreamConcurrencyConfig {
  default?: number;
  providers?: Record<string, number>;
  queueTimeoutSeconds?: number;
}

export interface PprofConfig {
  enable?: boolean;
  addr?: string;
}

export type DisableImageGenerationConfig = false | true | 'chat';

export interface Config {
  debug?: boolean;
  proxyUrl?: string;
  passthroughHeaders?: boolean;
  disableImageGeneration?: DisableImageGenerationConfig;
  enableGeminiCliEndpoint?: boolean;
  codexIdentityConfuse?: boolean;
  requestRetry?: number;
  maxRetryCredentials?: number;
  maxRetryInterval?: number;
  quotaExceeded?: QuotaExceededConfig;
  requestLog?: boolean;
  loggingToFile?: boolean;
  logsMaxTotalSizeMb?: number;
  errorLogsMaxFiles?: number;
  usageStatisticsEnabled?: boolean;
  usageStatisticsPath?: string;
  usageStatisticsFlushIntervalSeconds?: number;
  redisUsageQueueRetentionSeconds?: number;
  disableCooling?: boolean;
  authAutoRefreshWorkers?: number;
  pprof?: PprofConfig;
  wsAuth?: boolean;
  forceModelPrefix?: boolean;
  routingStrategy?: string;
  upstreamConcurrency?: UpstreamConcurrencyConfig;
  antigravitySignatureCacheEnabled?: boolean;
  antigravitySignatureBypassStrict?: boolean;
  apiKeys?: string[];
  ampcode?: AmpcodeConfig;
  geminiApiKeys?: GeminiKeyConfig[];
  codexApiKeys?: ProviderKeyConfig[];
  claudeApiKeys?: ProviderKeyConfig[];
  vertexApiKeys?: ProviderKeyConfig[];
  openaiCompatibility?: OpenAIProviderConfig[];
  oauthExcludedModels?: Record<string, string[]>;
  syncProfiles?: SyncProfile[];
  raw?: Record<string, unknown>;
}

export type RawConfigSection =
  | 'debug'
  | 'proxy-url'
  | 'request-retry'
  | 'quota-exceeded'
  | 'request-log'
  | 'logging-to-file'
  | 'logs-max-total-size-mb'
  | 'error-logs-max-files'
  | 'usage-statistics-enabled'
  | 'ws-auth'
  | 'force-model-prefix'
  | 'routing/strategy'
  | 'max-retry-interval'
  | 'upstream-concurrency'
  | 'api-keys'
  | 'ampcode'
  | 'gemini-api-key'
  | 'codex-api-key'
  | 'claude-api-key'
  | 'vertex-api-key'
  | 'openai-compatibility'
  | 'oauth-excluded-models'
  | 'sync-profiles';

export interface ConfigCache {
  data: Config;
  timestamp: number;
}
