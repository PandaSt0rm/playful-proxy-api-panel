export interface UsageTokenStats {
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  cached_tokens: number;
  cache_read_tokens?: number;
  cache_creation_tokens?: number;
  total_tokens: number;
}

export interface UsageFailDetail {
  status_code: number;
  body: string;
}

export interface UsageRequestDetail {
  timestamp: string;
  latency_ms: number;
  first_byte_latency_ms: number;
  source: string;
  auth_index: string;
  tokens: UsageTokenStats;
  failed: boolean;
  fail?: UsageFailDetail;
}

export interface UsageModelSnapshot {
  total_requests: number;
  total_tokens: number;
  total_input_tokens: number;
  total_cached_tokens: number;
  cache_hit_rate: number;
  average_latency_ms: number;
  average_first_byte_latency_ms: number;
  tps: number;
  details?: UsageRequestDetail[];
}

export interface UsageApiSnapshot {
  total_requests: number;
  total_tokens: number;
  total_input_tokens: number;
  total_cached_tokens: number;
  cache_hit_rate: number;
  average_latency_ms: number;
  average_first_byte_latency_ms: number;
  tps: number;
  models?: Record<string, UsageModelSnapshot>;
}

export interface UsageStatisticsSnapshot {
  total_requests: number;
  success_count: number;
  failure_count: number;
  total_tokens: number;
  total_input_tokens: number;
  total_cached_tokens: number;
  cache_hit_rate: number;
  average_latency_ms: number;
  average_first_byte_latency_ms: number;
  tps: number;
  apis?: Record<string, UsageApiSnapshot>;
  requests_by_day?: Record<string, number>;
  requests_by_hour?: Record<string, number>;
  tokens_by_day?: Record<string, number>;
  tokens_by_hour?: Record<string, number>;
}

export interface UsageStatisticsResponse {
  usage: UsageStatisticsSnapshot;
  failed_requests: number;
  storage?: 'memory' | 'sqlite';
}

export interface UsageExportPayload {
  version: number;
  exported_at: string;
  usage: UsageStatisticsSnapshot;
}

export interface UsageImportResult {
  added: number;
  skipped: number;
  total_requests: number;
  failed_requests: number;
}

export interface UsageEvent {
  id: number;
  event_hash: string;
  request_id?: string;
  timestamp: string;
  timestamp_ms: number;
  provider: string;
  model: string;
  alias: string;
  endpoint: string;
  method: string;
  path: string;
  auth_type: string;
  auth_id?: string;
  auth_index: string;
  source: string;
  source_hash?: string;
  api_key_hash?: string;
  api_key_alias?: string;
  tokens: UsageTokenStats;
  latency_ms: number;
  first_byte_latency_ms: number;
  failed: boolean;
  status_code: number;
  failure_body?: string;
  created_at_ms: number;
}

export interface UsageEventsResponse {
  events: UsageEvent[];
  limit: number;
}

export interface UsageSummaryRow {
  group: string;
  key: string;
  label: string;
  requests: number;
  failures: number;
  successes: number;
  tokens: number;
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  cached_tokens: number;
  average_latency_ms: number;
  average_first_byte_latency_ms: number;
  last_seen_ms: number;
}

export interface UsageSummaryResponse {
  group_by: string;
  rows: UsageSummaryRow[];
  limit: number;
}

export interface UsageEventStatus {
  enabled: boolean;
  path: string;
  retention_days: number;
  event_count: number;
  oldest_ms: number;
  newest_ms: number;
  last_error?: string;
}

export interface UsageModelPrice {
  model: string;
  input_per_million: number;
  cached_input_per_million: number;
  output_per_million: number;
  updated_at: string;
}

export interface UsageModelPricesResponse {
  prices: UsageModelPrice[];
}

export interface UsageAPIKeyAlias {
  api_key_hash: string;
  alias: string;
  updated_at: string;
}

export interface UsageAPIKeyAliasesResponse {
  aliases: UsageAPIKeyAlias[];
}

export interface UsagePruneResponse {
  deleted: number;
  status?: UsageEventStatus;
}
