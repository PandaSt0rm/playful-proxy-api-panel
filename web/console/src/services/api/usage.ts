import { apiClient } from './client';
import type {
  UsageAPIKeyAlias,
  UsageAPIKeyAliasesResponse,
  UsageEventStatus,
  UsageEventsResponse,
  UsageExportPayload,
  UsageImportResult,
  UsageModelPrice,
  UsageModelPricesResponse,
  UsagePruneResponse,
  UsageSummaryResponse,
  UsageStatisticsResponse,
} from '@/types';

const USAGE_TIMEOUT_MS = 20 * 1000;

export const usageApi = {
  getStatistics: (params?: Record<string, string | number | boolean | undefined>) =>
    apiClient.get<UsageStatisticsResponse>('/usage', {
      timeout: USAGE_TIMEOUT_MS,
      params,
    }),

  getEvents: (params?: Record<string, string | number | boolean | undefined>) =>
    apiClient.get<UsageEventsResponse>('/usage/events', {
      timeout: USAGE_TIMEOUT_MS,
      params,
    }),

  getSummary: (params?: Record<string, string | number | boolean | undefined>) =>
    apiClient.get<UsageSummaryResponse>('/usage/summary', {
      timeout: USAGE_TIMEOUT_MS,
      params,
    }),

  getStatus: () =>
    apiClient.get<UsageEventStatus>('/usage/status', {
      timeout: USAGE_TIMEOUT_MS,
    }),

  pruneEvents: () =>
    apiClient.post<UsagePruneResponse>('/usage/prune', undefined, {
      timeout: USAGE_TIMEOUT_MS,
    }),

  exportStatistics: () =>
    apiClient.get<UsageExportPayload>('/usage/export', {
      timeout: USAGE_TIMEOUT_MS,
    }),

  importStatistics: (payload: UsageExportPayload) =>
    apiClient.post<UsageImportResult>('/usage/import', payload, {
      timeout: USAGE_TIMEOUT_MS,
    }),

  importEvents: (content: string) =>
    apiClient.post<UsageImportResult>('/usage/import', content, {
      timeout: USAGE_TIMEOUT_MS,
      headers: { 'Content-Type': 'application/x-ndjson' },
    }),

  exportEvents: (params?: Record<string, string | number | boolean | undefined>) =>
    apiClient.getRaw('/usage/export', {
      timeout: USAGE_TIMEOUT_MS,
      responseType: 'blob',
      params: { ...params, format: 'jsonl' },
    }),

  getModelPrices: () =>
    apiClient.get<UsageModelPricesResponse>('/usage/model-prices', {
      timeout: USAGE_TIMEOUT_MS,
    }),

  saveModelPrices: (prices: UsageModelPrice[]) =>
    apiClient.put<{ saved: number }>(
      '/usage/model-prices',
      { prices },
      {
        timeout: USAGE_TIMEOUT_MS,
      }
    ),

  syncModelPrices: () =>
    apiClient.post<{ saved: number; source: string; url: string }>(
      '/usage/model-prices/sync',
      undefined,
      {
        timeout: USAGE_TIMEOUT_MS,
      }
    ),

  getAPIKeyAliases: () =>
    apiClient.get<UsageAPIKeyAliasesResponse>('/usage/api-key-aliases', {
      timeout: USAGE_TIMEOUT_MS,
    }),

  saveAPIKeyAlias: (alias: UsageAPIKeyAlias) =>
    apiClient.put<{ saved: number }>('/usage/api-key-aliases', alias, {
      timeout: USAGE_TIMEOUT_MS,
    }),

  deleteAPIKeyAlias: (hash: string) =>
    apiClient.delete<{ deleted: boolean }>(`/usage/api-key-aliases/${encodeURIComponent(hash)}`, {
      timeout: USAGE_TIMEOUT_MS,
    }),
};
