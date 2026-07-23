import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithRouter, screen, userEvent, waitFor } from '@/test/utils';
import { DashboardPage } from './DashboardPage';
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
});
