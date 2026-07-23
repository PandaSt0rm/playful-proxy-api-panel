import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, renderWithRouter, screen, userEvent, waitFor } from '@/test/utils';
import { DashboardPage } from './DashboardPage';
import { useDashboardSnapshot } from '@/features/dashboard/useDashboardSnapshot';
import { useAuthStore, useConfigStore } from '@/stores';
import { usageApi } from '@/services/api/usage';
import { providersApi } from '@/services/api/providers';
import { aiproxyApi } from '@/services/api/aiproxy';
import type { UsageStatisticsResponse } from '@/types';

vi.mock('@/services/api/usage', () => ({
  usageApi: {
    getStatistics: vi.fn(),
    getEvents: vi.fn(),
    getStatus: vi.fn(),
  },
}));

vi.mock('@/services/api/providers', () => ({
  providersApi: {
    getGeminiKeys: vi.fn(),
    getInteractionsConfigs: vi.fn(),
    getClaudeConfigs: vi.fn(),
    getXAIConfigs: vi.fn(),
    getCodexConfigs: vi.fn(),
    getVertexConfigs: vi.fn(),
    getOpenAIProviders: vi.fn(),
  },
}));

vi.mock('@/services/api/aiproxy', () => ({
  aiproxyApi: {
    readiness: vi.fn(),
    budgetStatus: vi.fn(),
    syncDrift: vi.fn(),
  },
}));

const statistics = (totalRequests = 12): UsageStatisticsResponse => ({
  failed_requests: 2,
  storage: 'sqlite',
  usage: {
    total_requests: totalRequests,
    success_count: Math.max(0, totalRequests - 2),
    failure_count: totalRequests ? 2 : 0,
    total_tokens: 1000,
    total_input_tokens: 800,
    total_cached_tokens: 100,
    cache_hit_rate: 12.5,
    average_latency_ms: 210,
    average_first_byte_latency_ms: 80,
    tps: 4.2,
    requests_by_hour: totalRequests ? { '10': 5, '11': 7 } : {},
  },
});

const event = {
  id: 1,
  event_hash: 'hash',
  timestamp: '2026-07-23T12:00:00Z',
  timestamp_ms: Date.parse('2026-07-23T12:00:00Z'),
  provider: 'claude',
  model: 'sonnet',
  alias: '',
  endpoint: '/v1/messages',
  method: 'POST',
  path: '/v1/messages',
  auth_type: 'api-key',
  auth_index: 'claude-1',
  source: 'test',
  tokens: {
    input_tokens: 10,
    output_tokens: 5,
    reasoning_tokens: 0,
    cached_tokens: 0,
    total_tokens: 15,
  },
  latency_ms: 250,
  first_byte_latency_ms: 90,
  failed: true,
  status_code: 500,
  created_at_ms: Date.parse('2026-07-23T12:00:00Z'),
};
const fixedNow = () => 123;

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({
    connectionStatus: 'connected',
    serverVersion: '2.0.0',
    serverBuildDate: '2026-07-23',
  });
  useConfigStore.setState({
    config: {
      routingStrategy: 'round-robin',
      requestRetry: 2,
      loggingToFile: true,
      usageStatisticsEnabled: true,
      upstreamConcurrency: { default: 8, providers: {} },
    },
  });
  vi.mocked(usageApi.getStatistics).mockResolvedValue(statistics());
  vi.mocked(usageApi.getEvents).mockResolvedValue({ events: [event], limit: 100 });
  vi.mocked(usageApi.getStatus).mockResolvedValue({
    enabled: true,
    path: '/data/usage.db',
    retention_days: 30,
    event_count: 12,
    oldest_ms: event.timestamp_ms,
    newest_ms: event.timestamp_ms,
  });
  Object.values(providersApi).forEach((loader) =>
    vi.mocked(loader).mockResolvedValue([{}] as never)
  );
  vi.mocked(aiproxyApi.readiness).mockResolvedValue({ status: 'ready', checks: [] });
  vi.mocked(aiproxyApi.budgetStatus).mockResolvedValue({ statuses: [] });
  vi.mocked(aiproxyApi.syncDrift).mockResolvedValue({
    reported_sync_state: [],
    stale_after_seconds: 86400,
  });
});

describe('DashboardPage operational overview', () => {
  it('shows connection-required states without issuing data requests when disconnected', async () => {
    useAuthStore.setState({ connectionStatus: 'disconnected' });

    renderWithRouter(<DashboardPage />);

    expect(
      await screen.findAllByText('Connect to the management API to load operational data.')
    ).toHaveLength(3);
    expect(usageApi.getStatistics).not.toHaveBeenCalled();
  });

  it('renders traffic, server metadata, and every provider family after a successful load', async () => {
    renderWithRouter(<DashboardPage />);

    expect(await screen.findByText('12 · 4.2 TPS')).toBeInTheDocument();
    expect(screen.getByText('2.0.0')).toBeInTheDocument();
    expect(screen.getByText('OpenAI-compatible')).toBeInTheDocument();
    expect(screen.getByText('Interactions')).toBeInTheDocument();
  });

  it('renders the latest failed request with status and latency', async () => {
    renderWithRouter(<DashboardPage />);

    expect(await screen.findByText('claude / sonnet')).toBeInTheDocument();
    expect(screen.getByText('500')).toBeInTheDocument();
    expect(screen.getByText('250 ms')).toBeInTheDocument();
  });

  it('preserves fulfilled provider rows when one provider family fails', async () => {
    vi.mocked(providersApi.getClaudeConfigs).mockRejectedValue(new Error('offline'));

    renderWithRouter(<DashboardPage />);

    expect(await screen.findByText('Partial data')).toBeInTheDocument();
    expect(screen.getByText('Gemini')).toBeInTheDocument();
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
  });

  it('sorts attention items by severity before recency', async () => {
    vi.mocked(aiproxyApi.readiness).mockResolvedValue({
      status: 'blocked',
      checks: [
        {
          id: 'keys',
          required: true,
          status: 'fail',
          summary: 'Required key missing',
          action_path: '/config',
        },
      ],
    });
    vi.mocked(aiproxyApi.syncDrift).mockResolvedValue({
      stale_after_seconds: 86400,
      reported_sync_state: [
        {
          hostname: 'host',
          profile: 'default',
          tool: 'codex',
          reported_at: '2026-07-23T13:00:00Z',
          host_reported_at: '2026-07-23T13:00:00Z',
          status: 'stale',
        },
      ],
    });

    renderWithRouter(<DashboardPage />);

    const queue = await screen.findByRole('heading', { name: 'Attention queue' });
    const items = queue.closest('section')?.querySelectorAll('li');
    expect(items?.[0]).toHaveTextContent('Required key missing');
    expect(items?.[1]).toHaveTextContent('host · codex: stale');
  });

  it('shows an intentional empty state for zero traffic', async () => {
    vi.mocked(usageApi.getStatistics).mockResolvedValue(statistics(0));
    vi.mocked(usageApi.getEvents).mockResolvedValue({ events: [], limit: 100 });

    renderWithRouter(<DashboardPage />);

    expect(await screen.findByText('No traffic in this window')).toBeInTheDocument();
  });

  it('keeps stale traffic visible while a manual refresh is pending', async () => {
    const user = userEvent.setup();
    renderWithRouter(<DashboardPage />);
    expect(await screen.findByText('12 · 4.2 TPS')).toBeInTheDocument();
    vi.mocked(usageApi.getStatistics).mockReturnValue(
      Promise.withResolvers<UsageStatisticsResponse>().promise
    );

    await user.click(screen.getByRole('button', { name: 'Refresh overview' }));

    expect(screen.getByText('12 · 4.2 TPS')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh overview' })).toBeDisabled();
  });

  it('refreshes every panel from the single overview action', async () => {
    const user = userEvent.setup();
    renderWithRouter(<DashboardPage />);
    await screen.findByText('12 · 4.2 TPS');

    await user.click(screen.getByRole('button', { name: 'Refresh overview' }));

    await waitFor(() => expect(usageApi.getStatistics).toHaveBeenCalledTimes(2));
    expect(aiproxyApi.readiness).toHaveBeenCalledTimes(2);
  });
  it('reports complete panel failures and normalizes non-Error provider reasons', async () => {
    vi.mocked(usageApi.getStatistics).mockRejectedValue('offline');
    Object.values(providersApi).forEach((loader) => vi.mocked(loader).mockRejectedValue('offline'));
    vi.mocked(aiproxyApi.readiness).mockRejectedValue(new Error('offline'));
    vi.mocked(aiproxyApi.budgetStatus).mockRejectedValue(new Error('offline'));
    vi.mocked(aiproxyApi.syncDrift).mockRejectedValue(new Error('offline'));

    renderWithRouter(<DashboardPage />);

    expect(await screen.findByText('Traffic data is unavailable.')).toBeInTheDocument();
    expect(screen.getAllByText('Partial data')).toHaveLength(3);
    expect(screen.getAllByText('Unavailable')).toHaveLength(7);
  });

  it('renders provider and attention empty states when every fulfilled source is clear', async () => {
    Object.values(providersApi).forEach((loader) =>
      vi.mocked(loader).mockResolvedValue([] as never)
    );

    renderWithRouter(<DashboardPage />);

    expect(await screen.findByText('No providers configured')).toBeInTheDocument();
    expect(screen.getByText('No operator action required')).toBeInTheDocument();
  });

  it('filters clear signals and preserves every actionable severity and timestamp fallback', async () => {
    vi.mocked(aiproxyApi.readiness).mockResolvedValue({
      status: 'blocked',
      checks: [
        { id: 'pass', required: true, status: 'pass', summary: 'clear' },
        { id: 'warn', required: false, status: 'warn', summary: 'warning', action_path: '' },
      ],
    });
    vi.mocked(aiproxyApi.budgetStatus).mockResolvedValue({
      statuses: [
        { budget_id: 'clear', status: 'ok', percentage: 1, period_end: '' },
        { budget_id: 'warn', status: 'warning', percentage: 80, period_end: '' },
        {
          budget_id: 'over',
          status: 'exceeded',
          percentage: 120,
          period_end: '2026-07-24T00:00:00Z',
        },
      ],
    } as never);
    vi.mocked(aiproxyApi.syncDrift).mockResolvedValue({
      stale_after_seconds: 30,
      reported_sync_state: [
        { hostname: 'clear', profile: 'p', tool: 'codex', status: 'synced', reported_at: '' },
        { hostname: 'bad', profile: 'p', tool: 'codex', status: 'error', reported_at: '' },
        { hostname: 'conflict', profile: 'p', tool: 'claude', status: 'conflict', reported_at: '' },
        {
          hostname: 'old',
          profile: 'p',
          tool: 'droid',
          status: 'stale',
          reported_at: '2026-07-22T00:00:00Z',
        },
      ],
    } as never);

    renderWithRouter(<DashboardPage />);

    expect(await screen.findByText('warning')).toBeInTheDocument();
    expect(screen.getByText('warn: 80.0%')).toBeInTheDocument();
    expect(screen.getByText('over: 120.0%')).toBeInTheDocument();
    expect(screen.getByText('bad · codex: error')).toBeInTheDocument();
    expect(screen.queryByText('clear')).not.toBeInTheDocument();
  });
  it('normalizes a statistics response whose optional events list is absent', async () => {
    vi.mocked(usageApi.getEvents).mockResolvedValue({ limit: 100 } as never);

    renderWithRouter(<DashboardPage />);

    expect(await screen.findByText('No failed requests in this window.')).toBeInTheDocument();
  });

  it('ignores an older refresh that settles after a newer request', async () => {
    const older = Promise.withResolvers<UsageStatisticsResponse>();
    vi.mocked(usageApi.getStatistics)
      .mockReturnValueOnce(older.promise)
      .mockResolvedValueOnce(statistics(4));
    const { result } = renderHook(() => useDashboardSnapshot(true, fixedNow));
    await waitFor(() => expect(usageApi.getStatistics).toHaveBeenCalledTimes(1));

    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.traffic.data?.statistics.usage.total_requests).toBe(4);

    older.resolve(statistics(99));
    await act(async () => {
      await older.promise;
      await Promise.resolve();
    });
    expect(result.current.traffic.data?.statistics.usage.total_requests).toBe(4);
  });
});
