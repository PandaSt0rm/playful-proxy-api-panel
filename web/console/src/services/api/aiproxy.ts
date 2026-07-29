import { apiClient } from './client';

const base = '/aiproxy';
export interface ReadinessCheck {
  id: string;
  required: boolean;
  status: 'pass' | 'warn' | 'fail';
  summary: string;
  action_path: string;
}
export interface Readiness {
  status: 'ready' | 'attention' | 'blocked';
  checks: ReadinessCheck[];
}
export interface Revision {
  id: string;
  created_at: string;
  actor_ip: string;
  management_path: string;
  action: string;
  before_sha256: string;
  after_sha256: string;
}
export interface RevisionDetail extends Revision {
  diff: string;
}
export interface DiagnosticResult {
  id: string;
  checked_at: string;
  target: { kind: string; auth_index: string; label: string };
  check: string;
  status: 'pass' | 'warn' | 'fail';
  latency_ms: number;
  category: string;
  message: string;
  http_status?: number;
  model_count?: number;
  detail?: Record<string, unknown>;
}
export interface SyncDriftRow {
  hostname: string;
  profile: string;
  tool: string;
  reported_at: string;
  host_reported_at: string;
  status: 'synced' | 'stale' | 'conflict' | 'error';
  config_hash?: string;
  error?: string;
}
export interface Budget {
  id: string;
  name: string;
  scope: 'global' | 'provider' | 'model' | 'api_key';
  match: string;
  period: 'day' | 'week' | 'month';
  limit_usd: number;
  warning_percent: number;
  enabled: boolean;
}
export interface BudgetStatus {
  budget_id: string;
  spent_usd: number;
  limit_usd: number;
  percentage: number;
  period_start: string;
  period_end: string;
  status: 'ok' | 'warning' | 'exceeded' | 'disabled';
  unpriced_events: number;
}
export type BudgetInput = Omit<Budget, 'id'>;

export const aiproxyApi = {
  readiness: () => apiClient.get<Readiness>(`${base}/readiness`),
  revisions: () =>
    apiClient.get<{ revisions: Revision[]; current_sha256: string }>(`${base}/config-revisions`),
  revision: (id: string) =>
    apiClient.get<RevisionDetail>(`${base}/config-revisions/${encodeURIComponent(id)}`),
  restore: (id: string, expected: string) =>
    apiClient.post(`${base}/config-revisions/${encodeURIComponent(id)}/restore`, {
      expected_current_sha256: expected,
    }),
  diagnostics: (payload: unknown) =>
    apiClient.post<DiagnosticResult>(`${base}/diagnostics`, payload),
  syncDrift: (seconds = 86400) =>
    apiClient.get<{ reported_sync_state: SyncDriftRow[]; stale_after_seconds: number }>(
      `${base}/sync-drift?stale_after_seconds=${seconds}`
    ),
  pricing: () =>
    apiClient.get<{
      currency: string;
      unit: string;
      updated_at: string;
      prices: Array<{
        model: string;
        aliases: string[];
        input_per_million: number;
        cached_input_per_million: number;
        output_per_million: number;
        source: string;
      }>;
    }>(`${base}/pricing`),
  budgets: () => apiClient.get<{ budgets: Budget[] }>(`${base}/budgets`),
  createBudget: (input: BudgetInput) => apiClient.post<Budget>(`${base}/budgets`, input),
  updateBudget: (id: string, input: BudgetInput) =>
    apiClient.put<Budget>(`${base}/budgets/${encodeURIComponent(id)}`, input),
  deleteBudget: (id: string) => apiClient.delete(`${base}/budgets/${encodeURIComponent(id)}`),
  budgetStatus: () => apiClient.get<{ statuses: BudgetStatus[] }>(`${base}/budget-status`),
};
