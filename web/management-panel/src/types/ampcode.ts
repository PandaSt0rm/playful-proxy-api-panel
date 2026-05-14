/**
 * Amp CLI Integration (ampcode) 配置
 */

export interface AmpcodeModelMapping {
  from: string;
  to: string;
  regex?: boolean;
}

export interface AmpcodeUpstreamApiKeyMapping {
  upstreamApiKey: string;
  apiKeys: string[];
}

export interface AmpcodeConfig {
  upstreamUrl?: string;
  upstreamApiKey?: string;
  upstreamApiKeys?: AmpcodeUpstreamApiKeyMapping[];
  restrictManagementToLocalhost?: boolean;
  modelMappings?: AmpcodeModelMapping[];
  forceModelMappings?: boolean;
  raw?: Record<string, unknown>;
}
