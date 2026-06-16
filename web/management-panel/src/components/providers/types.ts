import type {
  ApiKeyEntry,
  GeminiKeyConfig,
  ProviderKeyConfig,
  ThinkingPayloadMap,
  ThinkingSupport,
} from '@/types';
import type { HeaderEntry } from '@/utils/headers';

export interface ModelEntry {
  name: string;
  alias: string;
  regex?: boolean;
  thinking?: ThinkingSupport;
  thinkingLevels?: string[];
  thinkingPayloads?: ThinkingPayloadMap;
}

export interface OpenAIFormState {
  name: string;
  priority?: number;
  prefix: string;
  baseUrl: string;
  headers: HeaderEntry[];
  testModel?: string;
  disableCooling?: boolean;
  modelEntries: ModelEntry[];
  apiKeyEntries: ApiKeyEntry[];
}

export type GeminiFormState = Omit<GeminiKeyConfig, 'headers' | 'models'> & {
  headers: HeaderEntry[];
  modelEntries: ModelEntry[];
  excludedText: string;
};

export type ProviderFormState = Omit<ProviderKeyConfig, 'headers'> & {
  headers: HeaderEntry[];
  modelEntries: ModelEntry[];
  excludedText: string;
};

export type VertexFormState = Omit<ProviderKeyConfig, 'headers'> & {
  headers: HeaderEntry[];
  modelEntries: ModelEntry[];
  excludedText: string;
};
