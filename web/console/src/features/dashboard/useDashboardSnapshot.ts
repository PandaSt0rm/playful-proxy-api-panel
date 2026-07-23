import { useCallback, useEffect, useRef, useState } from 'react';
import {
  aiproxyApi,
  type BudgetStatus,
  type ReadinessCheck,
  type SyncDriftRow,
} from '@/services/api/aiproxy';
import { providersApi } from '@/services/api/providers';
import { usageApi } from '@/services/api/usage';
import type { UsageEvent, UsageEventStatus, UsageStatisticsResponse } from '@/types';

export type DashboardPanelStatus = 'loading' | 'ready' | 'empty' | 'error';

export interface DashboardPanelState<T> {
  status: DashboardPanelStatus;
  data: T | null;
  error: string;
  updatedAt: number | null;
}

export interface DashboardProviderRow {
  id: string;
  labelKey: string;
  count: number | null;
  error: string;
}

export interface DashboardTrafficSnapshot {
  statistics: UsageStatisticsResponse;
  events: UsageEvent[];
  usageStatus: UsageEventStatus;
}

export interface DashboardAttentionItem {
  id: string;
  kind: 'readiness' | 'budget' | 'sync';
  severity: 'danger' | 'caution';
  summary: string;
  path: string;
  occurredAt: number;
}

interface DashboardSnapshot {
  traffic: DashboardPanelState<DashboardTrafficSnapshot>;
  providers: DashboardPanelState<DashboardProviderRow[]>;
  attention: DashboardPanelState<DashboardAttentionItem[]>;
  refreshing: boolean;
  refresh(): Promise<void>;
}

const emptyPanel = <T>(): DashboardPanelState<T> => ({
  status: 'loading',
  data: null,
  error: '',
  updatedAt: null,
});

const providerLoaders = [
  ['gemini', 'dashboardOverview.providers.gemini', providersApi.getGeminiKeys],
  ['interactions', 'dashboardOverview.providers.interactions', providersApi.getInteractionsConfigs],
  ['claude', 'dashboardOverview.providers.claude', providersApi.getClaudeConfigs],
  ['xai', 'dashboardOverview.providers.xai', providersApi.getXAIConfigs],
  ['codex', 'dashboardOverview.providers.codex', providersApi.getCodexConfigs],
  ['vertex', 'dashboardOverview.providers.vertex', providersApi.getVertexConfigs],
  ['openai', 'dashboardOverview.providers.openai', providersApi.getOpenAIProviders],
] as const;

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'unavailable';
}

function readinessItems(checks: ReadinessCheck[], now: number): DashboardAttentionItem[] {
  return checks
    .filter((check) => check.status !== 'pass')
    .map((check) => ({
      id: `readiness-${check.id}`,
      kind: 'readiness' as const,
      severity: check.status === 'fail' ? ('danger' as const) : ('caution' as const),
      summary: check.summary,
      path: check.action_path || '/onboarding',
      occurredAt: now,
    }));
}

function budgetItems(statuses: BudgetStatus[], now: number): DashboardAttentionItem[] {
  return statuses
    .filter((status) => status.status === 'warning' || status.status === 'exceeded')
    .map((status) => ({
      id: `budget-${status.budget_id}`,
      kind: 'budget' as const,
      severity: status.status === 'exceeded' ? ('danger' as const) : ('caution' as const),
      summary: `${status.budget_id}: ${status.percentage.toFixed(1)}%`,
      path: '/budgets',
      occurredAt: Date.parse(status.period_end) || now,
    }));
}

function syncItems(rows: SyncDriftRow[]): DashboardAttentionItem[] {
  return rows
    .filter((row) => row.status !== 'synced')
    .map((row) => ({
      id: `sync-${row.hostname}-${row.profile}-${row.tool}`,
      kind: 'sync' as const,
      severity:
        row.status === 'error' || row.status === 'conflict'
          ? ('danger' as const)
          : ('caution' as const),
      summary: `${row.hostname} · ${row.tool}: ${row.status}`,
      path: '/tooling-templates',
      occurredAt: Date.parse(row.reported_at) || 0,
    }));
}
async function settle<T>(promise: Promise<T>): Promise<PromiseSettledResult<T>> {
  try {
    return { status: 'fulfilled', value: await promise };
  } catch (reason) {
    return { status: 'rejected', reason };
  }
}

function sortAttention(items: DashboardAttentionItem[]) {
  return items.sort((left, right) => {
    if (left.severity !== right.severity) return left.severity === 'danger' ? -1 : 1;
    return right.occurredAt - left.occurredAt;
  });
}

export function useDashboardSnapshot(
  isConnected: boolean,
  now: () => number = Date.now
): DashboardSnapshot {
  const [traffic, setTraffic] = useState<DashboardPanelState<DashboardTrafficSnapshot>>(emptyPanel);
  const [providers, setProviders] =
    useState<DashboardPanelState<DashboardProviderRow[]>>(emptyPanel);
  const [attention, setAttention] =
    useState<DashboardPanelState<DashboardAttentionItem[]>>(emptyPanel);
  const [refreshing, setRefreshing] = useState(false);
  const requestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    if (!isConnected) {
      const disconnected = {
        status: 'error' as const,
        error: 'connection_required',
        updatedAt: now(),
      };
      setTraffic((current) => ({ ...current, ...disconnected }));
      setProviders((current) => ({ ...current, ...disconnected }));
      setAttention((current) => ({ ...current, ...disconnected }));
      return;
    }

    setRefreshing(true);
    setTraffic((current) => (current.data ? current : { ...current, status: 'loading' }));
    setProviders((current) => (current.data ? current : { ...current, status: 'loading' }));
    setAttention((current) => (current.data ? current : { ...current, status: 'loading' }));

    const trafficPromise = Promise.all([
      usageApi.getStatistics({ range: '1h' }),
      usageApi.getEvents({ range: '1h', limit: 100 }),
      usageApi.getStatus(),
    ]);
    const providerPromise = Promise.allSettled(providerLoaders.map(([, , load]) => load()));
    const attentionPromise = Promise.allSettled([
      aiproxyApi.readiness(),
      aiproxyApi.budgetStatus(),
      aiproxyApi.syncDrift(),
    ]);
    const [trafficResult, providerResults, attentionResults] = await Promise.all([
      settle(trafficPromise),
      providerPromise,
      attentionPromise,
    ]);
    if (requestId !== requestIdRef.current) return;

    const updatedAt = now();
    if (trafficResult.status === 'fulfilled') {
      const [statistics, eventResponse, usageStatus] = trafficResult.value;
      const data = { statistics, events: eventResponse.events ?? [], usageStatus };
      setTraffic({
        status:
          statistics.usage.total_requests === 0 && data.events.length === 0 ? 'empty' : 'ready',
        data,
        error: '',
        updatedAt,
      });
    } else {
      setTraffic((current) => ({
        ...current,
        status: 'error',
        error: errorMessage(trafficResult.reason),
        updatedAt,
      }));
    }

    const rows = providerResults.map((result, index): DashboardProviderRow => {
      const [id, labelKey] = providerLoaders[index];
      return result.status === 'fulfilled'
        ? { id, labelKey, count: result.value.length, error: '' }
        : { id, labelKey, count: null, error: errorMessage(result.reason) };
    });
    const failedProviderCount = rows.filter((row) => row.count === null).length;
    const configuredCount = rows.reduce((sum, row) => sum + (row.count ?? 0), 0);
    setProviders({
      status:
        failedProviderCount === rows.length ? 'error' : configuredCount === 0 ? 'empty' : 'ready',
      data: rows,
      error: failedProviderCount > 0 ? 'partial_failure' : '',
      updatedAt,
    });

    const [readinessResult, budgetResult, syncResult] = attentionResults;
    const items = sortAttention([
      ...(readinessResult.status === 'fulfilled'
        ? readinessItems(readinessResult.value.checks, updatedAt)
        : []),
      ...(budgetResult.status === 'fulfilled'
        ? budgetItems(budgetResult.value.statuses, updatedAt)
        : []),
      ...(syncResult.status === 'fulfilled' ? syncItems(syncResult.value.reported_sync_state) : []),
    ]);
    const failedAttentionCount = attentionResults.filter(
      (result) => result.status === 'rejected'
    ).length;
    setAttention({
      status:
        failedAttentionCount === attentionResults.length
          ? 'error'
          : items.length === 0
            ? 'empty'
            : 'ready',
      data: items,
      error: failedAttentionCount > 0 ? 'partial_failure' : '',
      updatedAt,
    });
    setRefreshing(false);
  }, [isConnected, now]);

  useEffect(() => {
    void refresh();
    return () => {
      requestIdRef.current += 1;
    };
  }, [refresh]);

  return { traffic, providers, attention, refreshing, refresh };
}
