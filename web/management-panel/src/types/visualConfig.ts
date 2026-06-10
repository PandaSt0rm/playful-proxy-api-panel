export type PayloadParamValueType = 'string' | 'number' | 'boolean' | 'json';
export type PayloadParamValidationErrorCode =
  | 'payload_invalid_number'
  | 'payload_invalid_boolean'
  | 'payload_invalid_json';

export type VisualConfigFieldPath =
  | 'port'
  | 'home.port'
  | 'logsMaxTotalSizeMb'
  | 'errorLogsMaxFiles'
  | 'usageStatisticsFlushIntervalSeconds'
  | 'redisUsageQueueRetentionSeconds'
  | 'authAutoRefreshWorkers'
  | 'requestRetry'
  | 'maxRetryCredentials'
  | 'maxRetryInterval'
  | 'upstreamConcurrency.default'
  | 'upstreamConcurrency.providers'
  | 'upstreamConcurrency.queueTimeoutSeconds'
  | 'streaming.keepaliveSeconds'
  | 'streaming.bootstrapRetries'
  | 'streaming.nonstreamKeepaliveInterval';

export type VisualConfigValidationErrorCode =
  | 'port_range'
  | 'non_negative_integer'
  | 'provider_limit_provider_required'
  | 'provider_limit_duplicate'
  | 'provider_limit_invalid';

export type VisualConfigValidationErrors = Partial<
  Record<VisualConfigFieldPath, VisualConfigValidationErrorCode>
>;

export type PayloadParamEntry = {
  id: string;
  path: string;
  valueType: PayloadParamValueType;
  value: string;
};

export type PayloadModelEntry = {
  id: string;
  name: string;
  protocol?: string;
};

export type PayloadRule = {
  id: string;
  models: PayloadModelEntry[];
  params: PayloadParamEntry[];
};

export type PayloadFilterRule = {
  id: string;
  models: PayloadModelEntry[];
  params: string[];
};

export interface StreamingConfig {
  keepaliveSeconds: string;
  bootstrapRetries: string;
  nonstreamKeepaliveInterval: string;
}

export type DisableImageGenerationMode = 'false' | 'true' | 'chat';

export interface UpstreamConcurrencyVisualConfig {
  defaultLimit: string;
  providerLimits: UpstreamConcurrencyProviderLimitEntry[];
  queueTimeoutSeconds: string;
}

export type UpstreamConcurrencyProviderLimitEntry = {
  id: string;
  provider: string;
  limit: string;
};

export interface HeaderDefaultsVisualConfig {
  userAgent: string;
  packageVersion: string;
  runtimeVersion: string;
  os: string;
  arch: string;
  timeout: string;
  stabilizeDeviceProfile: boolean;
  betaFeaturesText: string;
}

export type VisualConfigValues = {
  host: string;
  port: string;
  tlsEnable: boolean;
  tlsCert: string;
  tlsKey: string;
  homeEnabled: boolean;
  homeHost: string;
  homePort: string;
  homePassword: string;
  rmAllowRemote: boolean;
  rmSecretKey: string;
  rmDisableControlPanel: boolean;
  rmDisableAutoUpdatePanel: boolean;
  rmPanelRepo: string;
  authDir: string;
  apiKeysText: string;
  debug: boolean;
  commercialMode: boolean;
  loggingToFile: boolean;
  requestLog: boolean;
  logsMaxTotalSizeMb: string;
  errorLogsMaxFiles: string;
  usageStatisticsEnabled: boolean;
  usageStatisticsPath: string;
  usageStatisticsFlushIntervalSeconds: string;
  redisUsageQueueRetentionSeconds: string;
  disableCooling: boolean;
  authAutoRefreshWorkers: string;
  pprofEnable: boolean;
  pprofAddr: string;
  proxyUrl: string;
  forceModelPrefix: boolean;
  passthroughHeaders: boolean;
  disableImageGeneration: DisableImageGenerationMode;
  enableGeminiCliEndpoint: boolean;
  codexIdentityConfuse: boolean;
  pluginsEnabled: boolean;
  pluginsDir: string;
  requestRetry: string;
  maxRetryCredentials: string;
  maxRetryInterval: string;
  upstreamConcurrency: UpstreamConcurrencyVisualConfig;
  quotaSwitchProject: boolean;
  quotaSwitchPreviewModel: boolean;
  quotaAntigravityCredits: boolean;
  antigravitySignatureCacheEnabled: boolean;
  antigravitySignatureBypassStrict: boolean;
  routingStrategy: 'round-robin' | 'fill-first';
  routingSessionAffinity: boolean;
  routingSessionAffinityTTL: string;
  wsAuth: boolean;
  payloadDefaultRules: PayloadRule[];
  payloadDefaultRawRules: PayloadRule[];
  payloadOverrideRules: PayloadRule[];
  payloadOverrideRawRules: PayloadRule[];
  payloadFilterRules: PayloadFilterRule[];
  streaming: StreamingConfig;
  claudeHeaderDefaults: HeaderDefaultsVisualConfig;
  codexHeaderDefaults: HeaderDefaultsVisualConfig;
};

export const makeClientId = () => {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
};

export const DEFAULT_VISUAL_VALUES: VisualConfigValues = {
  host: '',
  port: '',
  tlsEnable: false,
  tlsCert: '',
  tlsKey: '',
  homeEnabled: false,
  homeHost: '',
  homePort: '',
  homePassword: '',
  rmAllowRemote: false,
  rmSecretKey: '',
  rmDisableControlPanel: false,
  rmDisableAutoUpdatePanel: false,
  rmPanelRepo: '',
  authDir: '',
  apiKeysText: '',
  debug: false,
  commercialMode: false,
  loggingToFile: false,
  requestLog: false,
  logsMaxTotalSizeMb: '',
  errorLogsMaxFiles: '',
  usageStatisticsEnabled: false,
  usageStatisticsPath: '',
  usageStatisticsFlushIntervalSeconds: '',
  redisUsageQueueRetentionSeconds: '',
  disableCooling: false,
  authAutoRefreshWorkers: '',
  pprofEnable: false,
  pprofAddr: '',
  proxyUrl: '',
  forceModelPrefix: false,
  passthroughHeaders: false,
  disableImageGeneration: 'false',
  enableGeminiCliEndpoint: false,
  codexIdentityConfuse: false,
  pluginsEnabled: false,
  pluginsDir: '',
  requestRetry: '',
  maxRetryCredentials: '',
  maxRetryInterval: '',
  upstreamConcurrency: {
    defaultLimit: '',
    providerLimits: [],
    queueTimeoutSeconds: '',
  },
  quotaSwitchProject: true,
  quotaSwitchPreviewModel: true,
  quotaAntigravityCredits: false,
  antigravitySignatureCacheEnabled: false,
  antigravitySignatureBypassStrict: false,
  routingStrategy: 'round-robin',
  routingSessionAffinity: false,
  routingSessionAffinityTTL: '',
  wsAuth: false,
  payloadDefaultRules: [],
  payloadDefaultRawRules: [],
  payloadOverrideRules: [],
  payloadOverrideRawRules: [],
  payloadFilterRules: [],
  streaming: {
    keepaliveSeconds: '',
    bootstrapRetries: '',
    nonstreamKeepaliveInterval: '',
  },
  claudeHeaderDefaults: {
    userAgent: '',
    packageVersion: '',
    runtimeVersion: '',
    os: '',
    arch: '',
    timeout: '',
    stabilizeDeviceProfile: false,
    betaFeaturesText: '',
  },
  codexHeaderDefaults: {
    userAgent: '',
    packageVersion: '',
    runtimeVersion: '',
    os: '',
    arch: '',
    timeout: '',
    stabilizeDeviceProfile: false,
    betaFeaturesText: '',
  },
};
