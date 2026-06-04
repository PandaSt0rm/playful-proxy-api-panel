import { type ChangeEvent, type CSSProperties, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { AutocompleteInput } from '@/components/ui/AutocompleteInput';
import { CODEX_CONFIG } from '@/components/quota';
import {
  IconChartLine,
  IconDiamond,
  IconDollarSign,
  IconDownload,
  IconFilterAll,
  IconKey,
  IconModelCluster,
  IconRefreshCw,
  IconSatellite,
  IconSearch,
  IconShield,
  IconTimer,
  IconTrash2,
  IconTrendingUp,
  IconUpload,
  IconX,
} from '@/components/ui/icons';
import pricingConfigRaw from '@/data/openaiModelPricing.json?raw';
import { useModelsStore } from '@/stores';
import type { ModelInfo } from '@/utils/models';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { authFilesApi, usageApi } from '@/services/api';
import { useAuthStore, useConfigStore, useNotificationStore, useQuotaStore } from '@/stores';
import type {
  AuthFileItem,
  CodexQuotaState,
  UsageAPIKeyAlias,
  UsageEvent,
  UsageEventStatus,
  UsageExportPayload,
  UsageImportResult,
  UsageModelPrice,
  UsageRequestDetail,
  UsageStatisticsResponse,
  UsageStatisticsSnapshot,
  UsageTokenStats,
} from '@/types';
import { normalizeAuthIndex } from '@/utils/authIndex';
import { getStatusFromError } from '@/utils/quota';
import styles from './UsagePage.module.scss';

type BreakdownTab = 'models' | 'accounts' | 'endpoints' | 'failures' | 'realtime' | 'costs' | 'data';
type TrendSpan = '24h' | '7d' | '14d' | '30d' | 'all';
type TrendMetric = 'requests' | 'tokens' | 'cost';
type StatusFilter = 'all' | 'success' | 'failed';
type AutoRefresh = 'off' | '5' | '10' | '30' | '60';

interface PricingRate {
  input: number;
  cached_input: number;
  output: number;
  aliases?: string[];
}

interface PricingConfig {
  currency: string;
  unit: string;
  source: string;
  updated_at: string;
  models: Record<string, PricingRate>;
}

interface DetailRecord {
  id: string;
  apiName: string;
  modelName: string;
  keyName: string;
  provider: string;
  endpoint: string;
  authType: string;
  apiKeyHash: string;
  timestampMs: number;
  detail: UsageRequestDetail;
  cost: number | null;
  pricingModel: string | null;
  statusCode: number;
  failureBody: string;
}

interface AggregateRow {
  id: string;
  label: string;
  apiName?: string;
  keyName?: string;
  requests: number;
  failed: number;
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cachedTokens: number;
  totalLatencyMs: number;
  latencySamples: number;
  totalFirstByteMs: number;
  firstByteSamples: number;
  estimatedCost: number | null;
  pricedRequests: number;
  lastSeenMs: number;
  models: Set<string>;
  keys: Set<string>;
  endpoints: Set<string>;
}

interface TrendPoint {
  key: string;
  label: string;
  requests: number;
  failures: number;
  tokens: number;
  cost: number;
}

interface ActivityWindowSummary {
  key: '1h' | '4h' | '8h' | '24h';
  hours: number;
  requests: number;
  failures: number;
  tokens: number;
  cost: number;
  rpm: number;
  tpm: number;
  averageLatencyMs: number;
}

interface HourActivityBucket {
  key: string;
  label: string;
  requests: number;
  failures: number;
  tokens: number;
  cost: number;
}

interface TokenBreakdownItem {
  key: 'input' | 'cached' | 'output' | 'reasoning';
  label: string;
  value: number;
  className: string;
}

const pricingConfig = JSON.parse(pricingConfigRaw) as PricingConfig;

const emptyUsage: UsageStatisticsSnapshot = {
  total_requests: 0,
  success_count: 0,
  failure_count: 0,
  total_tokens: 0,
  total_input_tokens: 0,
  total_cached_tokens: 0,
  cache_hit_rate: 0,
  average_latency_ms: 0,
  average_first_byte_latency_ms: 0,
  tps: 0,
  apis: {},
  requests_by_day: {},
  requests_by_hour: {},
  tokens_by_day: {},
  tokens_by_hour: {},
};

const emptyStatus: UsageEventStatus = {
  enabled: false,
  path: '',
  retention_days: 0,
  event_count: 0,
  oldest_ms: 0,
  newest_ms: 0,
};

const pricingAliases = (() => {
  const entries: Array<[string, string, PricingRate]> = [];
  Object.entries(pricingConfig.models).forEach(([model, rate]) => {
    entries.push([model.toLowerCase(), model, rate]);
    (rate.aliases ?? []).forEach((alias) => entries.push([alias.toLowerCase(), model, rate]));
  });
  return entries.sort((a, b) => b[0].length - a[0].length);
})();

const safeNumber = (value: number | null | undefined): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

const thinkingLevelSuffixes = ['low', 'medium', 'high', 'xhigh'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const createDateKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const createHourKey = (date: Date): string => `${createDateKey(date)} ${String(date.getHours()).padStart(2, '0')}:00`;

const createHourLabel = (date: Date): string => `${String(date.getHours()).padStart(2, '0')}:00`;

const detailTimestamp = (detail: UsageRequestDetail): number => {
  const timestamp = Date.parse(detail.timestamp);
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const normalizeModelName = (modelName: string): string[] => {
  const raw = modelName.trim().toLowerCase();
  const variants = new Set<string>();
  const addVariant = (value: string | undefined) => {
    const normalized = (value ?? '').trim().toLowerCase();
    if (!normalized) return;
    variants.add(normalized);
    const parenthesized = normalized.match(/^(.*)\((low|medium|high|xhigh)\)$/);
    if (parenthesized?.[1]) variants.add(parenthesized[1]);
    thinkingLevelSuffixes.forEach((suffix) => {
      const marker = `-${suffix}`;
      if (normalized.endsWith(marker)) variants.add(normalized.slice(0, -marker.length));
    });
  };
  addVariant(raw);
  addVariant(raw.split('/').pop());
  addVariant(raw.split(':').pop());
  return Array.from(variants);
};

const findStaticPricing = (modelName: string): { model: string; rate: PricingRate } | null => {
  const variants = normalizeModelName(modelName);
  for (const candidate of variants) {
    const exact = pricingAliases.find(([alias]) => alias === candidate);
    if (exact) return { model: exact[1], rate: exact[2] };
  }
  for (const candidate of variants) {
    const prefix = pricingAliases.find(([alias]) => candidate.startsWith(`${alias}-`));
    if (prefix) return { model: prefix[1], rate: prefix[2] };
  }
  return null;
};

const findCustomPricing = (modelName: string, prices: UsageModelPrice[]): { model: string; rate: PricingRate } | null => {
  const variants = normalizeModelName(modelName);
  const match = prices.find((price) => variants.includes(price.model.toLowerCase()));
  if (!match) return null;
  return {
    model: match.model,
    rate: {
      input: safeNumber(match.input_per_million),
      cached_input: safeNumber(match.cached_input_per_million),
      output: safeNumber(match.output_per_million),
    },
  };
};

const calculateCost = (modelName: string, tokens: UsageTokenStats | undefined, prices: UsageModelPrice[]) => {
  const pricing = findCustomPricing(modelName, prices) ?? findStaticPricing(modelName);
  if (!pricing || !tokens) return { cost: null, pricingModel: null };

  const inputTokens = safeNumber(tokens.input_tokens);
  const cachedTokens = safeNumber(tokens.cached_tokens);
  const outputTokens = safeNumber(tokens.output_tokens);
  const totalTokens = safeNumber(tokens.total_tokens);
  const inferredOutputTokens = Math.max(outputTokens, totalTokens - inputTokens);
  const uncachedInputTokens = Math.max(inputTokens - cachedTokens, 0);
  const cost =
    (uncachedInputTokens / 1_000_000) * pricing.rate.input +
    (cachedTokens / 1_000_000) * pricing.rate.cached_input +
    (Math.max(inferredOutputTokens, 0) / 1_000_000) * pricing.rate.output;
  return { cost, pricingModel: pricing.model };
};

const normalizeTokens = (tokens?: UsageTokenStats): UsageTokenStats => {
  const input = safeNumber(tokens?.input_tokens);
  const output = safeNumber(tokens?.output_tokens);
  const reasoning = safeNumber(tokens?.reasoning_tokens);
  const cacheRead = safeNumber(tokens?.cache_read_tokens);
  const cacheCreation = safeNumber(tokens?.cache_creation_tokens);
  const cached = safeNumber(tokens?.cached_tokens) || cacheRead + cacheCreation;
  const total = safeNumber(tokens?.total_tokens) || input + output + reasoning || input + output + reasoning + cached;
  return {
    input_tokens: input,
    output_tokens: output,
    reasoning_tokens: reasoning,
    cached_tokens: cached,
    cache_read_tokens: cacheRead,
    cache_creation_tokens: cacheCreation,
    total_tokens: total,
  };
};

const newAggregateRow = (id: string, label: string, extra?: Partial<AggregateRow>): AggregateRow => ({
  id,
  label,
  requests: 0,
  failed: 0,
  tokens: 0,
  inputTokens: 0,
  outputTokens: 0,
  reasoningTokens: 0,
  cachedTokens: 0,
  totalLatencyMs: 0,
  latencySamples: 0,
  totalFirstByteMs: 0,
  firstByteSamples: 0,
  estimatedCost: null,
  pricedRequests: 0,
  lastSeenMs: 0,
  models: new Set<string>(),
  keys: new Set<string>(),
  endpoints: new Set<string>(),
  ...extra,
});

const addDetailToAggregate = (row: AggregateRow, record: DetailRecord) => {
  const tokens = normalizeTokens(record.detail.tokens);
  row.requests += 1;
  if (record.detail.failed) row.failed += 1;
  row.tokens += tokens.total_tokens;
  row.inputTokens += tokens.input_tokens;
  row.outputTokens += tokens.output_tokens;
  row.reasoningTokens += tokens.reasoning_tokens;
  row.cachedTokens += tokens.cached_tokens;
  if (safeNumber(record.detail.latency_ms) > 0) {
    row.totalLatencyMs += safeNumber(record.detail.latency_ms);
    row.latencySamples += 1;
  }
  if (safeNumber(record.detail.first_byte_latency_ms) > 0) {
    row.totalFirstByteMs += safeNumber(record.detail.first_byte_latency_ms);
    row.firstByteSamples += 1;
  }
  if (record.cost !== null) {
    row.estimatedCost = (row.estimatedCost ?? 0) + record.cost;
    row.pricedRequests += 1;
  }
  row.lastSeenMs = Math.max(row.lastSeenMs, record.timestampMs);
  row.models.add(record.modelName);
  row.keys.add(record.keyName);
  row.endpoints.add(record.endpoint);
};

const average = (total: number, samples: number): number => (samples > 0 ? total / samples : 0);

const successRate = (row: Pick<AggregateRow, 'requests' | 'failed'>): number =>
  row.requests > 0 ? ((row.requests - row.failed) / row.requests) * 100 : 0;

const aggregateBy = (
  records: DetailRecord[],
  resolve: (record: DetailRecord) => { id: string; label: string; extra?: Partial<AggregateRow> }
) => {
  const rows = new Map<string, AggregateRow>();
  records.forEach((record) => {
    const target = resolve(record);
    const row = rows.get(target.id) ?? newAggregateRow(target.id, target.label, target.extra);
    addDetailToAggregate(row, record);
    rows.set(target.id, row);
  });
  return Array.from(rows.values()).sort((a, b) => b.requests - a.requests || b.tokens - a.tokens);
};

const eventKeyName = (event: UsageEvent): string =>
  event.api_key_alias || event.auth_index || (event.api_key_hash ? event.api_key_hash.slice(0, 12) : '') || event.source || event.endpoint || '-';

const eventToDetailRecord = (event: UsageEvent, prices: UsageModelPrice[]): DetailRecord => {
  const tokens = normalizeTokens(event.tokens);
  const detail: UsageRequestDetail = {
    timestamp: event.timestamp,
    latency_ms: safeNumber(event.latency_ms),
    first_byte_latency_ms: safeNumber(event.first_byte_latency_ms),
    source: event.source,
    auth_index: event.auth_index || eventKeyName(event),
    tokens,
    failed: event.failed,
    fail: {
      status_code: event.status_code,
      body: event.failure_body ?? '',
    },
  };
  const { cost, pricingModel } = calculateCost(event.model, tokens, prices);
  return {
    id: `${event.id}:${event.event_hash}`,
    apiName: event.provider || event.endpoint || 'unknown',
    modelName: event.model || event.alias || 'unknown',
    keyName: eventKeyName(event),
    provider: event.provider || 'unknown',
    endpoint: event.endpoint || event.path || 'unknown',
    authType: event.auth_type || 'unknown',
    apiKeyHash: event.api_key_hash ?? '',
    timestampMs: safeNumber(event.timestamp_ms) || detailTimestamp(detail),
    detail,
    cost,
    pricingModel,
    statusCode: event.status_code,
    failureBody: event.failure_body ?? '',
  };
};

const flattenSnapshotDetails = (usage: UsageStatisticsSnapshot, prices: UsageModelPrice[]): DetailRecord[] =>
  Object.entries(usage.apis ?? {}).flatMap(([apiName, api]) =>
    Object.entries(api.models ?? {}).flatMap(([modelName, model]) =>
      (model.details ?? []).map((detail, index) => {
        const tokens = normalizeTokens(detail.tokens);
        const keyName = detail.auth_index || detail.source || apiName || '-';
        const { cost, pricingModel } = calculateCost(modelName, tokens, prices);
        return {
          id: `${apiName}:${modelName}:${detail.timestamp}:${index}`,
          apiName,
          modelName,
          keyName,
          provider: apiName,
          endpoint: apiName,
          authType: 'legacy',
          apiKeyHash: '',
          timestampMs: detailTimestamp(detail),
          detail: { ...detail, tokens },
          cost,
          pricingModel,
          statusCode: detail.fail?.status_code ?? (detail.failed ? 500 : 200),
          failureBody: detail.fail?.body ?? '',
        };
      })
    )
  );

const activityWindowDefinitions: ReadonlyArray<Pick<ActivityWindowSummary, 'key' | 'hours'>> = [
  { key: '1h', hours: 1 },
  { key: '4h', hours: 4 },
  { key: '8h', hours: 8 },
  { key: '24h', hours: 24 },
];

const summarizeActivityWindow = (
  records: DetailRecord[],
  windowDefinition: Pick<ActivityWindowSummary, 'key' | 'hours'>,
  nowMs: number
): ActivityWindowSummary => {
  const startMs = nowMs - windowDefinition.hours * 60 * 60 * 1000;
  const scoped = records.filter((record) => record.timestampMs > 0 && record.timestampMs >= startMs);
  const requests = scoped.length;
  const failures = scoped.filter((record) => record.detail.failed).length;
  const tokens = scoped.reduce((total, record) => total + safeNumber(record.detail.tokens?.total_tokens), 0);
  const cost = scoped.reduce((total, record) => total + (record.cost ?? 0), 0);
  const latencySamples = scoped.filter((record) => safeNumber(record.detail.latency_ms) > 0);
  const minutes = Math.max(windowDefinition.hours * 60, 1);

  return {
    ...windowDefinition,
    requests,
    failures,
    tokens,
    cost,
    rpm: requests / minutes,
    tpm: tokens / minutes,
    averageLatencyMs: average(
      latencySamples.reduce((total, record) => total + safeNumber(record.detail.latency_ms), 0),
      latencySamples.length
    ),
  };
};

const makeRecentHourBuckets = (records: DetailRecord[], hours: number, nowMs: number): HourActivityBucket[] => {
  const buckets = new Map<string, HourActivityBucket>();
  for (let i = hours - 1; i >= 0; i -= 1) {
    const date = new Date(nowMs - i * 60 * 60 * 1000);
    const key = createHourKey(date);
    buckets.set(key, { key, label: createHourLabel(date), requests: 0, failures: 0, tokens: 0, cost: 0 });
  }

  const startMs = nowMs - hours * 60 * 60 * 1000;
  records
    .filter((record) => record.timestampMs > 0 && record.timestampMs >= startMs)
    .forEach((record) => {
      const date = new Date(record.timestampMs);
      const key = createHourKey(date);
      const bucket =
        buckets.get(key) ?? { key, label: createHourLabel(date), requests: 0, failures: 0, tokens: 0, cost: 0 };
      bucket.requests += 1;
      bucket.failures += record.detail.failed ? 1 : 0;
      bucket.tokens += safeNumber(record.detail.tokens?.total_tokens);
      bucket.cost += record.cost ?? 0;
      buckets.set(key, bucket);
    });

  return Array.from(buckets.values()).sort((a, b) => a.key.localeCompare(b.key));
};

const summarizeTokenBreakdown = (records: DetailRecord[], usage: UsageStatisticsSnapshot) => {
  if (records.length) {
    return records.reduce(
      (totals, record) => {
        const tokens = normalizeTokens(record.detail.tokens);
        totals.inputTokens += Math.max(tokens.input_tokens - tokens.cached_tokens, 0);
        totals.cachedTokens += tokens.cached_tokens;
        totals.outputTokens += tokens.output_tokens;
        totals.reasoningTokens += tokens.reasoning_tokens;
        return totals;
      },
      { inputTokens: 0, cachedTokens: 0, outputTokens: 0, reasoningTokens: 0 }
    );
  }

  const inputTokens = safeNumber(usage.total_input_tokens);
  const cachedTokens = safeNumber(usage.total_cached_tokens);
  return {
    inputTokens: Math.max(inputTokens - cachedTokens, 0),
    cachedTokens,
    outputTokens: Math.max(safeNumber(usage.total_tokens) - inputTokens, 0),
    reasoningTokens: 0,
  };
};

const trendLabel = (key: string, span: TrendSpan): string => {
  if (span === '24h') return key.slice(11);
  if (span === 'all' && key.length === 7) return key;
  return key.slice(5);
};

const makeTrendBuckets = (records: DetailRecord[], span: TrendSpan): TrendPoint[] => {
  const now = new Date();
  const buckets = new Map<string, TrendPoint>();
  const addBucket = (key: string) => {
    if (!buckets.has(key)) buckets.set(key, { key, label: trendLabel(key, span), requests: 0, failures: 0, tokens: 0, cost: 0 });
    return buckets.get(key)!;
  };

  if (span === '24h') {
    for (let i = 23; i >= 0; i -= 1) addBucket(createHourKey(new Date(now.getTime() - i * 60 * 60 * 1000)));
  } else if (span === '7d' || span === '14d' || span === '30d') {
    const days = span === '7d' ? 6 : span === '14d' ? 13 : 29;
    for (let i = days; i >= 0; i -= 1) addBucket(createDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)));
  }

  records.forEach((record) => {
    if (record.timestampMs <= 0) return;
    const date = new Date(record.timestampMs);
    const key =
      span === '24h'
        ? createHourKey(date)
        : span === 'all' && records.length > 1200
          ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
          : createDateKey(date);
    const bucket = addBucket(key);
    bucket.requests += 1;
    bucket.failures += record.detail.failed ? 1 : 0;
    bucket.tokens += safeNumber(record.detail.tokens?.total_tokens);
    bucket.cost += record.cost ?? 0;
  });

  return Array.from(buckets.values()).sort((a, b) => a.key.localeCompare(b.key));
};

const timeRangeParams = (span: TrendSpan): Record<string, string> => {
  if (span === 'all') return {};
  const now = Date.now();
  const hours = span === '24h' ? 24 : span === '7d' ? 7 * 24 : span === '14d' ? 14 * 24 : 30 * 24;
  return { from: new Date(now - hours * 60 * 60 * 1000).toISOString(), to: new Date(now).toISOString() };
};

const authIndexFromFile = (file: AuthFileItem): string | null => normalizeAuthIndex(file['auth_index'] ?? file.authIndex);

function TrendChart({
  rows,
  metric,
  formatValue,
  emptyLabel,
}: {
  rows: TrendPoint[];
  metric: TrendMetric;
  formatValue: (value: number) => string;
  emptyLabel: string;
}) {
  const values = rows.map((row) => (metric === 'requests' ? row.requests : metric === 'tokens' ? row.tokens : row.cost));
  const max = Math.max(...values, 0);
  const chartWidth = 720;
  const chartHeight = 220;
  const paddingX = 28;
  const paddingY = 24;
  const plotWidth = chartWidth - paddingX * 2;
  const plotHeight = chartHeight - paddingY * 2;
  const points = values.map((value, index) => {
    const x = paddingX + (rows.length <= 1 ? plotWidth / 2 : (index / (rows.length - 1)) * plotWidth);
    const y = paddingY + plotHeight - (max > 0 ? (value / max) * plotHeight : 0);
    return { x, y, value, row: rows[index]! };
  });
  const path = points.map((point) => `${point.x},${point.y}`).join(' ');
  const areaPath = points.length
    ? `${paddingX},${chartHeight - paddingY} ${path} ${chartWidth - paddingX},${chartHeight - paddingY}`
    : '';
  const visibleLabels = points.filter((_, index) => rows.length <= 8 || index === 0 || index === rows.length - 1 || index % Math.ceil(rows.length / 6) === 0);

  if (!rows.length) return <div className={styles.emptyInline}>{emptyLabel}</div>;

  return (
    <div className={styles.chartFrame}>
      <svg className={styles.lineChart} viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img">
        <polygon className={styles.chartArea} points={areaPath} />
        <polyline className={styles.chartLine} points={path} />
        {points.map((point) => (
          <circle key={point.row.key} className={styles.chartPoint} cx={point.x} cy={point.y} r="3.5">
            <title>
              {point.row.key} - {formatValue(point.value)}
            </title>
          </circle>
        ))}
        {visibleLabels.map((point) => (
          <text key={point.row.key} className={styles.chartLabel} x={point.x} y={chartHeight - 5} textAnchor="middle">
            {point.row.label}
          </text>
        ))}
      </svg>
    </div>
  );
}

export function UsagePage() {
  const { t, i18n } = useTranslation();
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const apiBase = useAuthStore((state) => state.apiBase);
  const managementKey = useAuthStore((state) => state.managementKey);
  const codexQuota = useQuotaStore((state) => state.codexQuota);
  const setCodexQuota = useQuotaStore((state) => state.setCodexQuota);
  const { showNotification } = useNotificationStore();
  const config = useConfigStore((state) => state.config);
  const systemModels = useModelsStore((state) => state.models);
  const modelsLoading = useModelsStore((state) => state.loading);
  const fetchModelsFromStore = useModelsStore((state) => state.fetchModels);

  const [response, setResponse] = useState<UsageStatisticsResponse | null>(null);
  const [events, setEvents] = useState<UsageEvent[]>([]);
  const [status, setStatus] = useState<UsageEventStatus>(emptyStatus);
  const [modelPrices, setModelPrices] = useState<UsageModelPrice[]>([]);
  const [aliases, setAliases] = useState<UsageAPIKeyAlias[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [syncingPrices, setSyncingPrices] = useState(false);
  const [savingAlias, setSavingAlias] = useState(false);
  const [pruning, setPruning] = useState(false);
  const [loadingCodexQuota, setLoadingCodexQuota] = useState(false);
  const [codexQuotaLoaded, setCodexQuotaLoaded] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<BreakdownTab>('models');
  const [timeRange, setTimeRange] = useState<TrendSpan>('7d');
  const [trendMetric, setTrendMetric] = useState<TrendMetric>('requests');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [autoRefresh, setAutoRefresh] = useState<AutoRefresh>('off');
  const [snapshotNowMs, setSnapshotNowMs] = useState(() => Date.now());
  const [aliasHash, setAliasHash] = useState('');
  const [aliasName, setAliasName] = useState('');
  const [priceModel, setPriceModel] = useState('');
  const [priceInput, setPriceInput] = useState('');
  const [priceCached, setPriceCached] = useState('');
  const [priceOutput, setPriceOutput] = useState('');
  const [priceFilter, setPriceFilter] = useState('');
  const [codexFiles, setCodexFiles] = useState<AuthFileItem[]>([]);

  const importInputRef = useRef<HTMLInputElement | null>(null);

  const usage = response?.usage ?? emptyUsage;

  const allRecords = useMemo(
    () => (events.length ? events.map((event) => eventToDetailRecord(event, modelPrices)) : flattenSnapshotDetails(usage, modelPrices)),
    [events, modelPrices, usage]
  );

  const filteredRecords = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return allRecords.filter((record) => {
      if (statusFilter === 'success' && record.detail.failed) return false;
      if (statusFilter === 'failed' && !record.detail.failed) return false;
      if (!normalizedSearch) return true;
      return [
        record.modelName,
        record.provider,
        record.endpoint,
        record.keyName,
        record.authType,
        record.apiKeyHash,
        record.failureBody,
        record.statusCode ? String(record.statusCode) : '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(normalizedSearch);
    });
  }, [allRecords, search, statusFilter]);

  const failedRequests = filteredRecords.length
    ? filteredRecords.filter((record) => record.detail.failed).length
    : safeNumber(response?.failed_requests ?? usage.failure_count);
  const totalRequests = filteredRecords.length || safeNumber(usage.total_requests);
  const totalTokens = filteredRecords.length
    ? filteredRecords.reduce((total, record) => total + safeNumber(record.detail.tokens?.total_tokens), 0)
    : safeNumber(usage.total_tokens);
  const totalInputTokens = filteredRecords.length
    ? filteredRecords.reduce((total, record) => total + safeNumber(record.detail.tokens?.input_tokens), 0)
    : safeNumber(usage.total_input_tokens);
  const totalCachedTokens = filteredRecords.length
    ? filteredRecords.reduce((total, record) => total + safeNumber(record.detail.tokens?.cached_tokens), 0)
    : safeNumber(usage.total_cached_tokens);
  const totalOutputTokens = filteredRecords.length
    ? filteredRecords.reduce((total, record) => total + safeNumber(record.detail.tokens?.output_tokens), 0)
    : Math.max(safeNumber(usage.total_tokens) - safeNumber(usage.total_input_tokens), 0);
  const estimatedTotalCost = useMemo(() => {
    const priced = filteredRecords.filter((record) => record.cost !== null);
    if (!priced.length) return null;
    return priced.reduce((total, record) => total + (record.cost ?? 0), 0);
  }, [filteredRecords]);
  const pricedRequestCount = filteredRecords.filter((record) => record.cost !== null).length;
  const unpricedModels = useMemo(
    () => Array.from(new Set(filteredRecords.filter((record) => record.cost === null).map((record) => record.modelName))).sort(),
    [filteredRecords]
  );

  // Live system models (from proxy registry via useModelsStore) + usage + static + existing prices for frictionless Cost Setup dropdown
  const priceSuggestions = useMemo(() => {
    const set = new Set<string>();
    // Primary: actual models the connected system supports (name + alias variants)
    systemModels.forEach((m: ModelInfo) => {
      if (m.name) set.add(m.name);
      if (m.alias && m.alias !== m.name) set.add(m.alias);
    });
    // Supplements for historical / unpriced / catalog coverage
    unpricedModels.forEach((m) => set.add(m));
    filteredRecords.forEach((r) => r.modelName && set.add(r.modelName));
    Object.keys(pricingConfig.models || {}).forEach((m) => set.add(m));
    modelPrices.forEach((p) => p.model && set.add(p.model));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [systemModels, unpricedModels, filteredRecords, modelPrices]); // pricingConfig is module-level constant from JSON, stable across renders

  const filteredPrices = useMemo(
    () => (priceFilter.trim() ? modelPrices.filter((p) => p.model.toLowerCase().includes(priceFilter.trim().toLowerCase())) : modelPrices),
    [modelPrices, priceFilter]
  );

  // Auto-fetch live system models when user opens the Cost Setup tab (option A)
  // This makes the model selector useful without requiring a prior visit to Dashboard.
  useEffect(() => {
    if (
      activeTab === 'costs' &&
      connectionStatus === 'connected' &&
      apiBase &&
      systemModels.length === 0 &&
      !modelsLoading
    ) {
      // Prefer a real API key from config if available (best for /v1/models)
      const configKeys = Array.isArray(config?.apiKeys) ? config.apiKeys : [];
      const preferredKey = configKeys.length ? String(configKeys[0]).trim() : managementKey?.trim() || undefined;

      fetchModelsFromStore(apiBase, preferredKey).catch(() => {
        // Non-fatal: we still have the static OpenAI pricing JSON + usage-derived models as fallback
      });
    }
  }, [activeTab, connectionStatus, apiBase, systemModels.length, modelsLoading, config?.apiKeys, managementKey, fetchModelsFromStore]);

  const hasUsage = totalRequests > 0 || Object.keys(usage.apis ?? {}).length > 0 || events.length > 0;

  const numberFormatter = useMemo(() => new Intl.NumberFormat(i18n.language || undefined), [i18n.language]);
  const compactNumberFormatter = useMemo(
    () => new Intl.NumberFormat(i18n.language || undefined, { notation: 'compact', maximumFractionDigits: 1 }),
    [i18n.language]
  );
  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language || undefined, {
        style: 'currency',
        currency: pricingConfig.currency || 'USD',
        maximumFractionDigits: 4,
      }),
    [i18n.language]
  );

  const formatNumber = useCallback((value: number | null | undefined) => numberFormatter.format(safeNumber(value)), [numberFormatter]);
  const formatCompact = useCallback(
    (value: number | null | undefined) => compactNumberFormatter.format(safeNumber(value)),
    [compactNumberFormatter]
  );
  const formatPercent = useCallback((value: number | null | undefined) => {
    const numeric = safeNumber(value);
    return `${numeric.toFixed(numeric >= 10 ? 1 : 2)}%`;
  }, []);
  const formatLatency = useCallback(
    (value: number | null | undefined) => `${formatNumber(Math.round(safeNumber(value)))} ms`,
    [formatNumber]
  );
  const formatCost = useCallback(
    (value: number | null | undefined) => (value === null || value === undefined ? '-' : currencyFormatter.format(value)),
    [currencyFormatter]
  );
  const formatRate = useCallback(
    (value: number | null | undefined) => {
      const numeric = safeNumber(value);
      if (numeric >= 100) return numberFormatter.format(Math.round(numeric));
      if (numeric >= 10) return numeric.toFixed(1);
      return numeric.toFixed(2);
    },
    [numberFormatter]
  );
  const formatTimestamp = useCallback(
    (timestampMs: number) => {
      if (!timestampMs) return '-';
      return new Date(timestampMs).toLocaleString(i18n.language || undefined);
    },
    [i18n.language]
  );

  const modelRows = useMemo(
    () => aggregateBy(filteredRecords, (record) => ({ id: record.modelName, label: record.modelName, extra: { apiName: record.provider } })),
    [filteredRecords]
  );
  const accountRows = useMemo(
    () =>
      aggregateBy(filteredRecords, (record) => ({
        id: record.keyName,
        label: record.keyName,
        extra: { keyName: record.keyName, apiName: record.provider },
      })),
    [filteredRecords]
  );
  const codexLocalUsageByAuthIndex = useMemo(() => {
    const rows = new Map<string, AggregateRow>();
    filteredRecords.forEach((record) => {
      const authIndex = normalizeAuthIndex(record.detail.auth_index);
      if (!authIndex) return;
      const row = rows.get(authIndex) ?? newAggregateRow(authIndex, record.keyName, { keyName: record.keyName, apiName: record.provider });
      addDetailToAggregate(row, record);
      rows.set(authIndex, row);
    });
    return rows;
  }, [filteredRecords]);
  const apiRows = useMemo(
    () => aggregateBy(filteredRecords, (record) => ({ id: record.provider, label: record.provider, extra: { apiName: record.provider } })),
    [filteredRecords]
  );
  const endpointRows = useMemo(
    () => aggregateBy(filteredRecords, (record) => ({ id: record.endpoint, label: record.endpoint, extra: { apiName: record.provider } })),
    [filteredRecords]
  );
  const failureRows = useMemo(
    () =>
      aggregateBy(
        filteredRecords.filter((record) => record.detail.failed),
        (record) => ({
          id: `${record.statusCode || 'failed'}:${record.endpoint}`,
          label: `${record.statusCode || '-'} ${record.endpoint}`,
          extra: { apiName: record.provider },
        })
      ),
    [filteredRecords]
  );
  const recentRows = useMemo(() => [...filteredRecords].sort((a, b) => b.timestampMs - a.timestampMs).slice(0, 120), [filteredRecords]);
  const codexQuotaRows = useMemo(
    () =>
      codexFiles.map((file) => {
        const authIndex = authIndexFromFile(file);
        return {
          file,
          authIndex,
          quota: codexQuota[file.name],
          localUsage: authIndex ? codexLocalUsageByAuthIndex.get(authIndex) : undefined,
        };
      }),
    [codexFiles, codexLocalUsageByAuthIndex, codexQuota]
  );

  const nowMs = snapshotNowMs;
  const activityWindowSummaries = useMemo(
    () => activityWindowDefinitions.map((definition) => summarizeActivityWindow(filteredRecords, definition, nowMs)),
    [filteredRecords, nowMs]
  );
  const recentHourBuckets = useMemo(() => makeRecentHourBuckets(filteredRecords, 24, nowMs), [filteredRecords, nowMs]);
  const tokenBreakdown = useMemo(() => summarizeTokenBreakdown(filteredRecords, usage), [filteredRecords, usage]);
  const trendRows = useMemo(() => makeTrendBuckets(filteredRecords, timeRange), [filteredRecords, timeRange]);

  const topModel = modelRows[0]?.label ?? '-';
  const topKey = accountRows[0]?.label ?? '-';
  const topEndpoint = endpointRows[0]?.label ?? '-';
  const last24hSummary = activityWindowSummaries.find((summary) => summary.key === '24h');
  const failedRate = totalRequests > 0 ? (failedRequests / totalRequests) * 100 : 0;
  const cacheHitRate = totalInputTokens > 0 ? (totalCachedTokens / totalInputTokens) * 100 : safeNumber(usage.cache_hit_rate);
  const lastSeenMs = filteredRecords.reduce((latest, record) => Math.max(latest, record.timestampMs), 0);
  const activeDays = new Set(filteredRecords.map((record) => (record.timestampMs > 0 ? createDateKey(new Date(record.timestampMs)) : '')).filter(Boolean)).size || Object.keys(usage.requests_by_day ?? {}).length;
  const activeHours = new Set(filteredRecords.map((record) => (record.timestampMs > 0 ? createHourKey(new Date(record.timestampMs)) : '')).filter(Boolean)).size || Object.keys(usage.requests_by_hour ?? {}).length;
  const averageLatencyMs = filteredRecords.length
    ? average(
        filteredRecords.reduce((total, record) => total + safeNumber(record.detail.latency_ms), 0),
        filteredRecords.filter((record) => safeNumber(record.detail.latency_ms) > 0).length
      )
    : safeNumber(usage.average_latency_ms);
  const averageFirstByteMs = filteredRecords.length
    ? average(
        filteredRecords.reduce((total, record) => total + safeNumber(record.detail.first_byte_latency_ms), 0),
        filteredRecords.filter((record) => safeNumber(record.detail.first_byte_latency_ms) > 0).length
      )
    : safeNumber(usage.average_first_byte_latency_ms);
  const tokenBreakdownTotal =
    tokenBreakdown.inputTokens + tokenBreakdown.cachedTokens + tokenBreakdown.outputTokens + tokenBreakdown.reasoningTokens;
  const recentActivityMax = Math.max(...recentHourBuckets.map((bucket) => bucket.requests), 1);
  const tokenBreakdownItems = useMemo<TokenBreakdownItem[]>(
    () => [
      { key: 'input', label: t('usage_statistics.uncached_input_tokens'), value: tokenBreakdown.inputTokens, className: styles.tokenInput },
      { key: 'cached', label: t('usage_statistics.cached_tokens'), value: tokenBreakdown.cachedTokens, className: styles.tokenCached },
      { key: 'output', label: t('usage_statistics.output_tokens'), value: tokenBreakdown.outputTokens, className: styles.tokenOutput },
      { key: 'reasoning', label: t('usage_statistics.reasoning_tokens'), value: tokenBreakdown.reasoningTokens, className: styles.tokenReasoning },
    ],
    [t, tokenBreakdown]
  );

  const loadUsage = useCallback(async () => {
    if (connectionStatus !== 'connected') {
      setLoading(false);
      setResponse(null);
      setEvents([]);
      setStatus(emptyStatus);
      setSnapshotNowMs(Date.now());
      setError(t('usage_statistics.connection_required'));
      return;
    }

    setLoading(true);
    setError('');
    try {
      const params = { ...timeRangeParams(timeRange), limit: 50000 };
      const [statisticsData, eventsData, statusData, pricesData, aliasesData] = await Promise.all([
        usageApi.getStatistics(params),
        usageApi.getEvents(params).catch(() => ({ events: [], limit: 0 })),
        usageApi.getStatus().catch(() => emptyStatus),
        usageApi.getModelPrices().catch(() => ({ prices: [] })),
        usageApi.getAPIKeyAliases().catch(() => ({ aliases: [] })),
      ]);
      setResponse(statisticsData);
      setEvents(eventsData.events ?? []);
      setStatus(statusData);
      setModelPrices(pricesData.prices ?? []);
      setAliases(aliasesData.aliases ?? []);
      setSnapshotNowMs(Date.now());
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('notification.refresh_failed');
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [connectionStatus, t, timeRange]);

  useHeaderRefresh(loadUsage);

  useEffect(() => {
    loadUsage();
  }, [loadUsage]);

  useEffect(() => {
    if (autoRefresh === 'off' || connectionStatus !== 'connected') return undefined;
    const interval = window.setInterval(() => {
      loadUsage();
    }, Number(autoRefresh) * 1000);
    return () => window.clearInterval(interval);
  }, [autoRefresh, connectionStatus, loadUsage]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const payload = await usageApi.exportStatistics();
      const exportedAt = payload.exported_at || new Date().toISOString();
      const fileSafeDate = exportedAt.replace(/[:.]/g, '-');
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `ppap-usage-${fileSafeDate}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      showNotification(t('usage_statistics.export_success'), 'success');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('usage_statistics.export_failed');
      showNotification(message, 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleExportEvents = async () => {
    setExporting(true);
    try {
      const responseData = await usageApi.exportEvents({ ...timeRangeParams(timeRange), limit: 200000 });
      const blob = responseData.data instanceof Blob ? responseData.data : new Blob([responseData.data], { type: 'application/x-ndjson;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `ppap-usage-events-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      showNotification(t('usage_statistics.export_success'), 'success');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('usage_statistics.export_failed');
      showNotification(message, 'error');
    } finally {
      setExporting(false);
    }
  };

  const normalizeImportPayload = (parsed: unknown): UsageExportPayload => {
    if (!isRecord(parsed)) throw new Error(t('usage_statistics.import_invalid'));
    const usageValue = isRecord(parsed.usage) ? parsed.usage : parsed;
    if (!isRecord(usageValue)) throw new Error(t('usage_statistics.import_invalid'));
    return {
      version: typeof parsed.version === 'number' ? parsed.version : 1,
      exported_at: typeof parsed.exported_at === 'string' ? parsed.exported_at : new Date().toISOString(),
      usage: usageValue as unknown as UsageStatisticsSnapshot,
    };
  };

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;

    setImporting(true);
    try {
      const content = await file.text();
      let result: UsageImportResult;
      if (file.name.toLowerCase().endsWith('.jsonl')) {
        result = await usageApi.importEvents(content);
      } else {
        try {
          const payload = normalizeImportPayload(JSON.parse(content));
          result = await usageApi.importStatistics(payload);
        } catch (err) {
          if (err instanceof SyntaxError) result = await usageApi.importEvents(content);
          else throw err;
        }
      }
      showNotification(t('usage_statistics.import_success', { added: result.added, skipped: result.skipped }), 'success');
      await loadUsage();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('usage_statistics.import_failed');
      showNotification(message, 'error');
    } finally {
      setImporting(false);
    }
  };

  const handleSyncPrices = async () => {
    setSyncingPrices(true);
    try {
      const result = await usageApi.syncModelPrices();
      showNotification(t('usage_statistics.price_sync_success', { count: result.saved }), 'success');
      await loadUsage();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('usage_statistics.price_sync_failed');
      showNotification(message, 'error');
    } finally {
      setSyncingPrices(false);
    }
  };

  const handleSaveAlias = async () => {
    const normalizedHash = aliasHash.trim();
    const normalizedAlias = aliasName.trim();
    if (!normalizedHash || !normalizedAlias) {
      showNotification(t('usage_statistics.alias_required'), 'error');
      return;
    }
    setSavingAlias(true);
    try {
      await usageApi.saveAPIKeyAlias({ api_key_hash: normalizedHash, alias: normalizedAlias, updated_at: new Date().toISOString() });
      setAliasHash('');
      setAliasName('');
      showNotification(t('usage_statistics.alias_saved'), 'success');
      await loadUsage();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('usage_statistics.alias_save_failed');
      showNotification(message, 'error');
    } finally {
      setSavingAlias(false);
    }
  };

  const handleDeleteAlias = async (hash: string) => {
    try {
      await usageApi.deleteAPIKeyAlias(hash);
      showNotification(t('usage_statistics.alias_deleted'), 'success');
      await loadUsage();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('usage_statistics.alias_delete_failed');
      showNotification(message, 'error');
    }
  };

  const handlePruneEvents = async () => {
    setPruning(true);
    try {
      const result = await usageApi.pruneEvents();
      if (result.status) setStatus(result.status);
      showNotification(t('usage_statistics.prune_success', { count: result.deleted }), 'success');
      await loadUsage();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('usage_statistics.prune_failed');
      showNotification(message, 'error');
    } finally {
      setPruning(false);
    }
  };

  const handleSavePrice = async () => {
    const model = priceModel.trim();
    if (!model) {
      showNotification(t('usage_statistics.price_model_required'), 'error');
      return;
    }
    const nextPrice: UsageModelPrice = {
      model,
      input_per_million: Number(priceInput) || 0,
      cached_input_per_million: Number(priceCached) || 0,
      output_per_million: Number(priceOutput) || 0,
      updated_at: new Date().toISOString(),
    };
    try {
      await usageApi.saveModelPrices([nextPrice]);
      clearPriceForm();
      showNotification(t('usage_statistics.price_saved'), 'success');
      await loadUsage();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('usage_statistics.price_save_failed');
      showNotification(message, 'error');
    }
  };

  const clearPriceForm = useCallback(() => {
    setPriceModel('');
    setPriceInput('');
    setPriceCached('');
    setPriceOutput('');
  }, []);

  const loadCodexQuotaContext = useCallback(async () => {
    if (connectionStatus !== 'connected') {
      showNotification(t('usage_statistics.connection_required'), 'error');
      return;
    }

    setLoadingCodexQuota(true);
    try {
      const filesResponse = await authFilesApi.list();
      const files = (filesResponse.files ?? []).filter((file) => CODEX_CONFIG.filterFn(file));
      setCodexFiles(files);
      setCodexQuota((prev) => {
        const nextState = { ...prev };
        files.forEach((file) => {
          nextState[file.name] = CODEX_CONFIG.buildLoadingState();
        });
        return nextState;
      });

      const results = await Promise.all(
        files.map(async (file) => {
          try {
            const data = await CODEX_CONFIG.fetchQuota(file, t);
            return { name: file.name, status: 'success' as const, data };
          } catch (err: unknown) {
            return {
              name: file.name,
              status: 'error' as const,
              error: err instanceof Error ? err.message : t('common.unknown_error'),
              errorStatus: getStatusFromError(err),
            };
          }
        })
      );

      setCodexQuota((prev) => {
        const nextState = { ...prev };
        results.forEach((result) => {
          nextState[result.name] =
            result.status === 'success'
              ? CODEX_CONFIG.buildSuccessState(result.data)
              : CODEX_CONFIG.buildErrorState(result.error, result.errorStatus);
        });
        return nextState;
      });

      setCodexQuotaLoaded(true);
      showNotification(t('usage_statistics.codex_quota_loaded', { count: files.length }), 'success');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('usage_statistics.codex_quota_load_failed');
      showNotification(message, 'error');
    } finally {
      setLoadingCodexQuota(false);
    }
  }, [connectionStatus, setCodexQuota, showNotification, t]);

  const renderMetric = (label: string, value: string, sublabel?: string, icon?: ReactNode) => (
    <div className={styles.metricTile}>
      <div className={styles.metricHeader}>
        <span className={styles.metricLabel}>{label}</span>
        {icon ? <span className={styles.metricIcon}>{icon}</span> : null}
      </div>
      <span className={styles.metricValue}>{value}</span>
      {sublabel && <span className={styles.metricSub}>{sublabel}</span>}
    </div>
  );

  const renderAggregateTable = (rows: AggregateRow[], mode: 'models' | 'accounts' | 'endpoints' | 'failures') => (
    <div className={styles.tableScroll}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>{t(`usage_statistics.tab_${mode}`)}</th>
            <th>{t('usage_statistics.requests')}</th>
            <th>{t('usage_statistics.success_rate')}</th>
            <th>{t('usage_statistics.tokens')}</th>
            <th>{t('usage_statistics.input_tokens')}</th>
            <th>{t('usage_statistics.output_tokens')}</th>
            <th>{t('usage_statistics.cached_tokens')}</th>
            <th>{t('usage_statistics.estimated_cost')}</th>
            <th>{t('usage_statistics.first_byte')}</th>
            <th>{t('usage_statistics.latency')}</th>
            <th>{mode === 'models' ? t('usage_statistics.accounts') : t('usage_statistics.models')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row) => (
              <tr key={row.id}>
                <td className={styles.primaryCell}>
                  <span className={styles.monoCell}>{row.label}</span>
                  {row.apiName && mode !== 'endpoints' ? <span className={styles.cellHint}>{row.apiName}</span> : null}
                </td>
                <td>{formatNumber(row.requests)}</td>
                <td>{formatPercent(successRate(row))}</td>
                <td>{formatNumber(row.tokens)}</td>
                <td>{formatNumber(row.inputTokens)}</td>
                <td>{formatNumber(row.outputTokens)}</td>
                <td>{formatNumber(row.cachedTokens)}</td>
                <td>{formatCost(row.estimatedCost)}</td>
                <td>{formatLatency(average(row.totalFirstByteMs, row.firstByteSamples))}</td>
                <td>{formatLatency(average(row.totalLatencyMs, row.latencySamples))}</td>
                <td>{formatNumber(mode === 'models' ? row.keys.size : row.models.size)}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={11} className={styles.emptyCell}>
                {t('usage_statistics.no_rows')}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );

  const renderRealtimeTable = () => (
    <div className={styles.tableScroll}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>{t('usage_statistics.time')}</th>
            <th>{t('usage_statistics.status')}</th>
            <th>{t('usage_statistics.model')}</th>
            <th>{t('usage_statistics.endpoint')}</th>
            <th>{t('usage_statistics.account')}</th>
            <th>{t('usage_statistics.tokens')}</th>
            <th>{t('usage_statistics.estimated_cost')}</th>
            <th>{t('usage_statistics.first_byte')}</th>
            <th>{t('usage_statistics.latency')}</th>
            <th>{t('usage_statistics.failure_detail')}</th>
          </tr>
        </thead>
        <tbody>
          {recentRows.length ? (
            recentRows.map((row) => (
              <tr key={row.id}>
                <td>{formatTimestamp(row.timestampMs)}</td>
                <td>
                  <span className={row.detail.failed ? styles.statusFailed : styles.statusOk}>
                    {row.detail.failed ? `${row.statusCode || '-'} ${t('usage_statistics.failed')}` : t('usage_statistics.success')}
                  </span>
                </td>
                <td className={styles.monoCell}>{row.modelName}</td>
                <td className={styles.mutedCell}>{row.endpoint}</td>
                <td className={styles.monoCell}>{row.keyName}</td>
                <td>{formatNumber(row.detail.tokens?.total_tokens)}</td>
                <td>{formatCost(row.cost)}</td>
                <td>{formatLatency(row.detail.first_byte_latency_ms)}</td>
                <td>{formatLatency(row.detail.latency_ms)}</td>
                <td className={styles.mutedCell}>{row.failureBody || '-'}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={10} className={styles.emptyCell}>
                {t('usage_statistics.no_recent_rows')}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );

  const formatCodexPlan = (quota?: CodexQuotaState): string => {
    const plan = quota?.planType;
    if (!plan) return '-';
    return plan.startsWith('plan_') ? t(`codex_quota.${plan}`) : plan;
  };

  const renderQuotaStatus = (quota?: CodexQuotaState) => {
    if (quota?.status === 'loading') return <span className={styles.statusPill}>{t('usage_statistics.quota_loading')}</span>;
    if (quota?.status === 'success') return <span className={styles.statusOk}>{t('usage_statistics.success')}</span>;
    if (quota?.status === 'error') {
      return (
        <span className={styles.statusFailed} title={quota.error}>
          {quota.errorStatus ? `${quota.errorStatus} ` : ''}
          {t('usage_statistics.quota_error')}
        </span>
      );
    }
    return <span className={styles.statusPill}>{t('usage_statistics.quota_idle')}</span>;
  };

  const renderQuotaWindows = (quota?: CodexQuotaState) => {
    if (!quota || quota.status === 'idle') return <div className={styles.quotaMessage}>{t('usage_statistics.quota_idle')}</div>;
    if (quota.status === 'loading') return <div className={styles.quotaMessage}>{t('usage_statistics.quota_loading')}</div>;
    if (quota.status === 'error') return <div className={styles.quotaMessage}>{quota.error || t('usage_statistics.quota_error')}</div>;
    if (!quota.windows.length) return <div className={styles.quotaMessage}>{t('codex_quota.empty_windows')}</div>;

    return (
      <div className={styles.quotaWindowList}>
        {quota.windows.map((window) => {
          const used = window.usedPercent === null ? null : Math.max(0, Math.min(100, window.usedPercent));
          const remaining = used === null ? null : Math.max(0, Math.min(100, 100 - used));
          const windowLabel = window.labelKey ? t(window.labelKey, window.labelParams) : window.label;
          return (
            <div key={window.id} className={styles.quotaWindow}>
              <div className={styles.quotaWindowHeader}>
                <span>{windowLabel}</span>
                <strong>{remaining === null ? '--' : `${Math.round(remaining)}%`}</strong>
              </div>
              <div className={styles.quotaTrack}>
                <span style={{ width: `${remaining ?? 0}%` }} />
              </div>
              <small>{window.resetLabel}</small>
            </div>
          );
        })}
      </div>
    );
  };

  const renderCodexQuotaContext = () => (
    <div className={styles.managementPanel}>
      <div className={styles.panelHeaderRow}>
        <div>
          <h3>{t('usage_statistics.codex_quota_context')}</h3>
          <p>{t('usage_statistics.codex_quota_context_desc')}</p>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={loadCodexQuotaContext} loading={loadingCodexQuota} disabled={connectionStatus !== 'connected'}>
          <IconRefreshCw size={15} />
          {t('usage_statistics.load_codex_quota')}
        </Button>
      </div>
      {codexQuotaLoaded && codexQuotaRows.length ? (
        <div className={styles.quotaContextList}>
          {codexQuotaRows.map(({ file, authIndex, quota, localUsage }) => (
            <div key={file.name} className={styles.quotaContextRow}>
              <div className={styles.quotaIdentity}>
                <strong>{file.name}</strong>
                <span>{authIndex ? `${t('usage_statistics.account')}: ${authIndex}` : t('codex_quota.missing_auth_index')}</span>
              </div>
              <div className={styles.quotaFacts}>
                <div>
                  <span>{t('usage_statistics.quota_status')}</span>
                  <strong>{renderQuotaStatus(quota)}</strong>
                </div>
                <div>
                  <span>{t('usage_statistics.quota_plan')}</span>
                  <strong>{formatCodexPlan(quota)}</strong>
                </div>
                <div>
                  <span>{t('usage_statistics.local_usage')}</span>
                  <strong>
                    {localUsage
                      ? t('usage_statistics.local_usage_value', {
                          requests: formatNumber(localUsage.requests),
                          tokens: formatCompact(localUsage.tokens),
                          cost: formatCost(localUsage.estimatedCost),
                        })
                      : '-'}
                  </strong>
                </div>
              </div>
              {renderQuotaWindows(quota)}
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.emptyInline}>{codexQuotaLoaded ? t('usage_statistics.no_codex_accounts') : t('usage_statistics.quota_idle')}</div>
      )}
    </div>
  );

  const trendFormatter = (value: number) =>
    trendMetric === 'cost' ? formatCost(value) : trendMetric === 'tokens' ? formatCompact(value) : formatNumber(value);

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>{t('usage_statistics.title')}</h1>
          <p className={styles.description}>{t('usage_statistics.description')}</p>
          <div className={styles.priceSource}>
            <IconDollarSign size={14} />
            <span>
              {t('usage_statistics.pricing_source', {
                date: pricingConfig.updated_at,
                unit: pricingConfig.unit,
              })}
            </span>
          </div>
        </div>
        <div className={styles.headerActions}>
          <Button type="button" variant="secondary" size="sm" onClick={loadUsage} loading={loading} disabled={connectionStatus !== 'connected'}>
            <IconRefreshCw size={16} />
            {t('common.refresh')}
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => importInputRef.current?.click()} loading={importing} disabled={connectionStatus !== 'connected'}>
            <IconUpload size={16} />
            {t('usage_statistics.import')}
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={handleExportEvents} loading={exporting} disabled={connectionStatus !== 'connected' || !status.enabled}>
            <IconDownload size={16} />
            {t('usage_statistics.export_jsonl')}
          </Button>
          <Button type="button" variant="primary" size="sm" onClick={handleExport} loading={exporting} disabled={connectionStatus !== 'connected'}>
            <IconDownload size={16} />
            {t('usage_statistics.export_snapshot')}
          </Button>
          <input ref={importInputRef} className={styles.hiddenInput} type="file" accept="application/json,.json,.jsonl" onChange={handleImportFile} />
        </div>
      </div>

      {error && <div className={styles.errorBox}>{error}</div>}

      <Card>
        <div className={styles.controlPanel}>
          <label className={styles.controlField}>
            <span>{t('usage_statistics.range')}</span>
            <div className={styles.segmentedControl}>
              {(['24h', '7d', '14d', '30d', 'all'] as TrendSpan[]).map((span) => (
                <button type="button" key={span} className={timeRange === span ? styles.segmentActive : ''} onClick={() => setTimeRange(span)}>
                  {t(`usage_statistics.span_${span}`)}
                </button>
              ))}
            </div>
          </label>
          <label className={styles.controlField}>
            <span>{t('usage_statistics.status')}</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.currentTarget.value as StatusFilter)}>
              <option value="all">{t('usage_statistics.status_all')}</option>
              <option value="success">{t('usage_statistics.success')}</option>
              <option value="failed">{t('usage_statistics.failed')}</option>
            </select>
          </label>
          <label className={styles.controlField}>
            <span>{t('usage_statistics.auto_refresh')}</span>
            <select value={autoRefresh} onChange={(event) => setAutoRefresh(event.currentTarget.value as AutoRefresh)}>
              <option value="off">{t('usage_statistics.auto_refresh_off')}</option>
              <option value="5">5s</option>
              <option value="10">10s</option>
              <option value="30">30s</option>
              <option value="60">60s</option>
            </select>
          </label>
          <label className={styles.searchField}>
            <span>
              <IconSearch size={14} />
              {t('usage_statistics.search')}
            </span>
            <input value={search} onChange={(event) => setSearch(event.currentTarget.value)} placeholder={t('usage_statistics.search_placeholder')} />
          </label>
        </div>
      </Card>

      <section className={styles.metricGrid} aria-label={t('usage_statistics.summary')}>
        {renderMetric(t('usage_statistics.total_requests'), formatNumber(totalRequests), `${formatNumber(totalRequests - failedRequests)} ${t('usage_statistics.success')} / ${formatNumber(failedRequests)} ${t('usage_statistics.failed')}`, <IconSatellite size={16} />)}
        {renderMetric(t('usage_statistics.estimated_cost'), formatCost(estimatedTotalCost), t('usage_statistics.priced_requests', { count: pricedRequestCount }), <IconDollarSign size={16} />)}
        {renderMetric(t('usage_statistics.cache_hit_rate'), formatPercent(cacheHitRate), `${formatNumber(totalCachedTokens)} ${t('usage_statistics.cached_tokens')}`, <IconShield size={16} />)}
        {renderMetric(t('usage_statistics.first_byte_latency'), formatLatency(averageFirstByteMs), t('usage_statistics.average_value'), <IconTimer size={16} />)}
        {renderMetric(t('usage_statistics.average_latency'), formatLatency(averageLatencyMs), t('usage_statistics.average_value'), <IconTimer size={16} />)}
        {renderMetric(t('usage_statistics.total_tokens'), formatNumber(totalTokens), `${formatNumber(totalInputTokens)} in / ${formatNumber(totalOutputTokens)} out`, <IconDiamond size={16} />)}
        {renderMetric(t('usage_statistics.recent_24h'), formatNumber(last24hSummary?.requests), t('usage_statistics.recent_window_sub', { tokens: formatCompact(last24hSummary?.tokens), failed: formatNumber(last24hSummary?.failures) }), <IconChartLine size={16} />)}
        {renderMetric(t('usage_statistics.failure_rate'), formatPercent(failedRate), `${formatNumber(failedRequests)} / ${formatNumber(totalRequests)}`, <IconShield size={16} />)}
        {renderMetric(t('usage_statistics.active_dimensions'), `${formatNumber(apiRows.length)} / ${formatNumber(modelRows.length)} / ${formatNumber(accountRows.length)}`, t('usage_statistics.active_dimensions_sub'), <IconModelCluster size={16} />)}
        {renderMetric(t('usage_statistics.event_store'), status.enabled ? formatNumber(status.event_count) : t('usage_statistics.memory_only'), status.path || t('usage_statistics.no_sqlite_store'), <IconFilterAll size={16} />)}
        {renderMetric(t('usage_statistics.last_request'), formatTimestamp(lastSeenMs), t('usage_statistics.active_period_sub', { days: formatNumber(activeDays), hours: formatNumber(activeHours) }), <IconTimer size={16} />)}
        {renderMetric(t('usage_statistics.top_model'), topModel, t('usage_statistics.by_requests'), <IconTrendingUp size={16} />)}
        {renderMetric(t('usage_statistics.top_key'), topKey, t('usage_statistics.by_requests'), <IconKey size={16} />)}
        {renderMetric(t('usage_statistics.top_endpoint'), topEndpoint, t('usage_statistics.by_requests'), <IconChartLine size={16} />)}
      </section>

      {!loading && !hasUsage && <div className={styles.emptyState}>{t('usage_statistics.empty')}</div>}

      <div className={styles.insightGrid}>
        <Card title={t('usage_statistics.recent_activity_title')}>
          <div className={styles.activityWindowGrid}>
            {activityWindowSummaries.map((summary) => (
              <div key={summary.key} className={styles.activityWindow}>
                <span className={styles.activityWindowLabel}>{t(`usage_statistics.activity_window_${summary.key}`)}</span>
                <strong>{formatNumber(summary.requests)}</strong>
                <span>{t('usage_statistics.recent_window_sub', { tokens: formatCompact(summary.tokens), failed: formatNumber(summary.failures) })}</span>
                <span>{t('usage_statistics.rate_window_sub', { rpm: formatRate(summary.rpm), tpm: formatRate(summary.tpm) })}</span>
              </div>
            ))}
          </div>
          <div className={styles.activityBars} aria-label={t('usage_statistics.recent_activity_title')}>
            {recentHourBuckets.map((bucket) => {
              const height = bucket.requests > 0 ? 16 + (bucket.requests / recentActivityMax) * 84 : 6;
              return (
                <div key={bucket.key} className={styles.activityBarSlot}>
                  <div className={`${styles.activityBar} ${bucket.failures > 0 ? styles.activityBarWarning : ''}`} title={t('usage_statistics.activity_hour_label', { hour: bucket.key, requests: formatNumber(bucket.requests), tokens: formatCompact(bucket.tokens), failed: formatNumber(bucket.failures) })}>
                    <span className={styles.activityBarFill} style={{ height: `${height}%` } as CSSProperties} />
                  </div>
                  <span>{bucket.label}</span>
                </div>
              );
            })}
          </div>
        </Card>

        <Card title={t('usage_statistics.health_title')}>
          <div className={styles.healthSummary}>
            <div className={styles.healthRateBlock}>
              <span>{t('usage_statistics.success_rate')}</span>
              <strong>{formatPercent(100 - failedRate)}</strong>
              <small>{formatNumber(totalRequests - failedRequests)} {t('usage_statistics.success')} / {formatNumber(failedRequests)} {t('usage_statistics.failed')}</small>
            </div>
            <div className={styles.healthTrack}>
              <span className={styles.healthSuccess} style={{ width: `${totalRequests > 0 ? ((totalRequests - failedRequests) / totalRequests) * 100 : 0}%` }} />
              <span className={styles.healthFailure} style={{ width: `${totalRequests > 0 ? (failedRequests / totalRequests) * 100 : 0}%` }} />
            </div>
          </div>
          <div className={styles.compactFacts}>
            <div>
              <span>{t('usage_statistics.details_captured')}</span>
              <strong>{formatNumber(filteredRecords.length)}</strong>
            </div>
            <div>
              <span>{t('usage_statistics.active_days')}</span>
              <strong>{formatNumber(activeDays)}</strong>
            </div>
            <div>
              <span>{t('usage_statistics.active_hours')}</span>
              <strong>{formatNumber(activeHours)}</strong>
            </div>
            <div>
              <span>{t('usage_statistics.unpriced_models')}</span>
              <strong>{formatNumber(unpricedModels.length)}</strong>
            </div>
          </div>
        </Card>
      </div>

      <div className={styles.insightGrid}>
        <Card title={t('usage_statistics.token_breakdown_title')}>
          <div className={styles.breakdownList}>
            {tokenBreakdownItems.map((item) => {
              const percentage = tokenBreakdownTotal > 0 ? (item.value / tokenBreakdownTotal) * 100 : 0;
              return (
                <div key={item.key} className={styles.breakdownRow}>
                  <div className={styles.breakdownLabelRow}>
                    <span className={styles.breakdownLabel}>
                      <span className={`${styles.breakdownDot} ${item.className}`} />
                      {item.label}
                    </span>
                    <strong>{formatNumber(item.value)}</strong>
                  </div>
                  <div className={styles.breakdownTrack}>
                    <span className={`${styles.breakdownFill} ${item.className}`} style={{ width: `${percentage}%` }} />
                  </div>
                  <span className={styles.breakdownPercent}>{percentage.toFixed(1)}%</span>
                </div>
              );
            })}
          </div>
        </Card>

        <Card title={t('usage_statistics.top_dimensions_title')}>
          <div className={styles.topLists}>
            {[
              { key: 'models', title: t('usage_statistics.top_models'), rows: modelRows.slice(0, 5) },
              { key: 'endpoints', title: t('usage_statistics.top_endpoints'), rows: endpointRows.slice(0, 5) },
              { key: 'accounts', title: t('usage_statistics.top_accounts'), rows: accountRows.slice(0, 5) },
            ].map((group) => {
              const maxRequests = Math.max(...group.rows.map((row) => row.requests), 1);
              return (
                <div key={group.key} className={styles.topList}>
                  <h3>{group.title}</h3>
                  {group.rows.length ? (
                    group.rows.map((row) => (
                      <div key={`${group.key}-${row.id}`} className={styles.topListRow}>
                        <div className={styles.topListMeta}>
                          <span className={styles.monoCell}>{row.label}</span>
                          <small>{formatNumber(row.requests)} {t('usage_statistics.requests')} - {formatCompact(row.tokens)} {t('usage_statistics.tokens')}</small>
                        </div>
                        <div className={styles.topListBar}>
                          <span style={{ width: `${(row.requests / maxRequests) * 100}%` }} />
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className={styles.emptyInline}>{t('usage_statistics.no_rows')}</div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <Card
        title={t('usage_statistics.trend_title')}
        extra={
          <div className={styles.chartControls}>
            <div className={styles.segmentedControl}>
              {(['requests', 'tokens', 'cost'] as TrendMetric[]).map((metric) => (
                <button type="button" key={metric} className={trendMetric === metric ? styles.segmentActive : ''} onClick={() => setTrendMetric(metric)}>
                  {t(`usage_statistics.metric_${metric}`)}
                </button>
              ))}
            </div>
          </div>
        }
      >
        <TrendChart rows={trendRows} metric={trendMetric} formatValue={trendFormatter} emptyLabel={t('usage_statistics.no_timeline')} />
      </Card>

      <Card
        title={t('usage_statistics.breakdown_title')}
        extra={
          <div className={styles.segmentedControl}>
            {(['models', 'accounts', 'endpoints', 'failures', 'realtime', 'costs', 'data'] as BreakdownTab[]).map((tab) => (
              <button type="button" key={tab} className={activeTab === tab ? styles.segmentActive : ''} onClick={() => setActiveTab(tab)}>
                {t(`usage_statistics.tab_${tab}`)}
              </button>
            ))}
          </div>
        }
      >
        {activeTab === 'models' && renderAggregateTable(modelRows, 'models')}
        {activeTab === 'accounts' && (
          <div className={styles.accountPanelStack}>
            {renderCodexQuotaContext()}
            {renderAggregateTable(accountRows, 'accounts')}
          </div>
        )}
        {activeTab === 'endpoints' && renderAggregateTable(endpointRows, 'endpoints')}
        {activeTab === 'failures' && renderAggregateTable(failureRows, 'failures')}
        {activeTab === 'realtime' && renderRealtimeTable()}
        {activeTab === 'costs' && (
          <div className={styles.managementGrid}>
            <div className={styles.managementPanel}>
              <div className={styles.panelHeaderRow}>
                <div>
                  <h3>{t('usage_statistics.model_prices')}</h3>
                  <p>{t('usage_statistics.model_prices_desc')}</p>
                </div>
                <Button type="button" variant="secondary" size="sm" onClick={handleSyncPrices} loading={syncingPrices} disabled={!status.enabled}>
                  <IconRefreshCw size={15} />
                  {t('usage_statistics.sync_prices')}
                </Button>
              </div>
              <div className={styles.formGrid}>
                <AutocompleteInput
                  value={priceModel}
                  onChange={setPriceModel}
                  options={priceSuggestions}
                  placeholder={t('usage_statistics.price_model')}
                  disabled={!status.enabled}
                  wrapperStyle={{ marginBottom: 0 }}
                />
                <input value={priceInput} onChange={(event) => setPriceInput(event.currentTarget.value)} placeholder={t('usage_statistics.price_input')} inputMode="decimal" />
                <input value={priceCached} onChange={(event) => setPriceCached(event.currentTarget.value)} placeholder={t('usage_statistics.price_cached')} inputMode="decimal" />
                <input value={priceOutput} onChange={(event) => setPriceOutput(event.currentTarget.value)} placeholder={t('usage_statistics.price_output')} inputMode="decimal" />
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <Button type="button" variant="primary" size="sm" onClick={handleSavePrice} disabled={!status.enabled} style={{ flex: 1 }}>
                    {t('usage_statistics.save_price')}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={clearPriceForm} disabled={!status.enabled} title={t('usage_statistics.clear_form')}>
                    <IconX size={14} />
                  </Button>
                </div>
              </div>
              <div className={styles.pillList}>
                {unpricedModels.map((model) => (
                  <button type="button" key={model} onClick={() => setPriceModel(model)}>{model}</button>
                ))}
                {!unpricedModels.length && <span>{t('usage_statistics.no_unpriced_models')}</span>}
              </div>
            </div>
            <div className={styles.tableScroll}>
              <input
                value={priceFilter}
                onChange={(e) => setPriceFilter(e.currentTarget.value)}
                placeholder={t('usage_statistics.price_filter_placeholder')}
                style={{ width: '100%', marginBottom: 8, padding: '6px 10px', fontSize: 12 }}
              />
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>{t('usage_statistics.model')}</th>
                    <th>{t('usage_statistics.price_input')}</th>
                    <th>{t('usage_statistics.price_cached')}</th>
                    <th>{t('usage_statistics.price_output')}</th>
                    <th>{t('usage_statistics.updated_at')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPrices.map((price) => (
                    <tr
                      key={price.model}
                      onClick={() => {
                        setPriceModel(price.model);
                        setPriceInput(String(price.input_per_million ?? 0));
                        setPriceCached(String(price.cached_input_per_million ?? 0));
                        setPriceOutput(String(price.output_per_million ?? 0));
                      }}
                      style={{ cursor: 'pointer' }}
                      title={t('usage_statistics.click_to_edit_price')}
                    >
                      <td className={styles.monoCell}>{price.model}</td>
                      <td>{formatCost(price.input_per_million)}</td>
                      <td>{formatCost(price.cached_input_per_million)}</td>
                      <td>{formatCost(price.output_per_million)}</td>
                      <td>{formatTimestamp(Date.parse(price.updated_at))}</td>
                    </tr>
                  ))}
                  {!filteredPrices.length && (
                    <tr>
                      <td colSpan={5} className={styles.emptyCell}>{t('usage_statistics.no_model_prices')}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {activeTab === 'data' && (
          <div className={styles.managementGrid}>
            <div className={styles.managementPanel}>
              <h3>{t('usage_statistics.store_status')}</h3>
              <div className={styles.compactFacts}>
                <div>
                  <span>{t('usage_statistics.storage_mode')}</span>
                  <strong>{status.enabled ? 'SQLite' : 'Memory'}</strong>
                </div>
                <div>
                  <span>{t('usage_statistics.event_count')}</span>
                  <strong>{formatNumber(status.event_count)}</strong>
                </div>
                <div>
                  <span>{t('usage_statistics.retention_days')}</span>
                  <strong>{status.retention_days ? formatNumber(status.retention_days) : t('usage_statistics.retention_unlimited')}</strong>
                </div>
                <div>
                  <span>{t('usage_statistics.db_path')}</span>
                  <strong>{status.path || '-'}</strong>
                </div>
              </div>
              {status.last_error && <div className={styles.errorBox}>{status.last_error}</div>}
              <div className={styles.dataActions}>
                <Button type="button" variant="secondary" size="sm" onClick={handleExportEvents} disabled={!status.enabled}>
                  <IconDownload size={15} />
                  {t('usage_statistics.export_jsonl')}
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={handleExport}>
                  <IconDownload size={15} />
                  {t('usage_statistics.export_snapshot')}
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => importInputRef.current?.click()}>
                  <IconUpload size={15} />
                  {t('usage_statistics.import')}
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={handlePruneEvents} loading={pruning} disabled={!status.enabled || !status.retention_days}>
                  <IconTrash2 size={15} />
                  {t('usage_statistics.prune_events')}
                </Button>
              </div>
              <p className={styles.panelHint}>
                {status.retention_days
                  ? t('usage_statistics.retention_cleanup_hint', { days: formatNumber(status.retention_days) })
                  : t('usage_statistics.retention_cleanup_disabled')}
              </p>
            </div>
            <div className={styles.managementPanel}>
              <h3>{t('usage_statistics.api_key_aliases')}</h3>
              <p>{t('usage_statistics.api_key_aliases_desc')}</p>
              <div className={styles.formGrid}>
                <input value={aliasHash} onChange={(event) => setAliasHash(event.currentTarget.value)} placeholder={t('usage_statistics.api_key_hash')} />
                <input value={aliasName} onChange={(event) => setAliasName(event.currentTarget.value)} placeholder={t('usage_statistics.alias')} />
                <Button type="button" variant="primary" size="sm" onClick={handleSaveAlias} loading={savingAlias} disabled={!status.enabled}>
                  {t('usage_statistics.save_alias')}
                </Button>
              </div>
              <div className={styles.aliasList}>
                {aliases.map((alias) => (
                  <div key={alias.api_key_hash} className={styles.aliasRow}>
                    <span className={styles.monoCell}>{alias.api_key_hash}</span>
                    <strong>{alias.alias}</strong>
                    <button type="button" onClick={() => handleDeleteAlias(alias.api_key_hash)} aria-label={t('usage_statistics.delete_alias')}>
                      <IconTrash2 size={15} />
                    </button>
                  </div>
                ))}
                {!aliases.length && <div className={styles.emptyInline}>{t('usage_statistics.no_aliases')}</div>}
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
