import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithRouter, screen, userEvent, waitFor } from '@/test/utils';
import { OperationsPage } from './OperationsPage';
import { usageApi } from '@/services/api/usage';
import { logsApi } from '@/services/api/logs';
import type { UsageEvent, UsageStatisticsResponse } from '@/types';

vi.mock('@/services/api/usage', () => ({
  usageApi: { getStatistics: vi.fn(), getSummary: vi.fn(), getEvents: vi.fn() },
}));
vi.mock('@/services/api/logs', () => ({ logsApi: { fetchLogs: vi.fn() } }));

const statistics: UsageStatisticsResponse = {
  failed_requests: 1,
  usage: {
    total_requests: 10,
    success_count: 9,
    failure_count: 1,
    total_tokens: 200,
    total_input_tokens: 150,
    total_cached_tokens: 0,
    cache_hit_rate: 0,
    average_latency_ms: 180,
    average_first_byte_latency_ms: 70,
    tps: 3.5,
  },
};

const request: UsageEvent = {
  id: 1,
  event_hash: 'event-hash',
  request_id: 'request-id',
  timestamp: '2026-07-23T12:00:00Z',
  timestamp_ms: Date.parse('2026-07-23T12:00:00Z'),
  provider: 'claude',
  model: 'sonnet',
  alias: 'fast',
  endpoint: '/v1/messages',
  method: 'POST',
  path: '/v1/messages',
  auth_type: 'api-key',
  auth_index: 'claude-1',
  source: 'local',
  api_key_alias: 'production',
  tokens: {
    input_tokens: 10,
    output_tokens: 5,
    reasoning_tokens: 0,
    cached_tokens: 0,
    total_tokens: 15,
  },
  latency_ms: 220,
  first_byte_latency_ms: 80,
  failed: true,
  status_code: 500,
  failure_body: '<script>unsafe()</script>',
  created_at_ms: Date.parse('2026-07-23T12:00:00Z'),
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(usageApi.getStatistics).mockResolvedValue(statistics);
  vi.mocked(usageApi.getSummary).mockResolvedValue({
    group_by: 'provider',
    limit: 20,
    rows: [
      {
        group: 'provider',
        key: 'claude',
        label: 'Claude',
        requests: 10,
        failures: 1,
        successes: 9,
        tokens: 200,
        input_tokens: 150,
        output_tokens: 50,
        reasoning_tokens: 0,
        cached_tokens: 0,
        average_latency_ms: 180,
        average_first_byte_latency_ms: 70,
        last_seen_ms: Date.parse('2026-07-23T12:00:00Z'),
      },
    ],
  });
  vi.mocked(usageApi.getEvents).mockResolvedValue({ events: [request], limit: 200 });
  vi.mocked(logsApi.fetchLogs).mockResolvedValue({
    lines: ['2026-07-23 12:00:00 [INFO] ready'],
    'line-count': 1,
    'latest-timestamp': 10,
  });
});

describe('OperationsPage', () => {
  it('renders live signals, provider routes, request activity, and parsed logs', async () => {
    renderWithRouter(<OperationsPage />);

    expect(await screen.findByText('10')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Claude/ })).toBeInTheDocument();
    expect(screen.getByText('POST /v1/messages')).toBeInTheDocument();
    expect(screen.getByText('ready')).toBeInTheDocument();
  });

  it('maps search input to the supported events query', async () => {
    const user = userEvent.setup();
    renderWithRouter(<OperationsPage />);
    await screen.findByText('POST /v1/messages');

    await user.type(screen.getByRole('textbox', { name: 'Search requests' }), 'sonnet');

    await waitFor(() =>
      expect(usageApi.getEvents).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: 'sonnet', range: '1h' })
      )
    );
  });

  it('filters request activity when a provider route is activated', async () => {
    const user = userEvent.setup();
    renderWithRouter(<OperationsPage />);

    await user.click(await screen.findByRole('button', { name: /Claude/ }));

    await waitFor(() =>
      expect(usageApi.getEvents).toHaveBeenLastCalledWith(
        expect.objectContaining({ provider: 'claude' })
      )
    );
  });

  it('opens request details and renders the failure body as text', async () => {
    const user = userEvent.setup();
    renderWithRouter(<OperationsPage />);

    await screen.findByText('POST /v1/messages');
    const requestButton = (await screen.findAllByRole('button')).find((button) =>
      button.closest('tbody')
    );
    expect(requestButton).toBeDefined();
    await user.click(requestButton!);

    expect(screen.getByText('<script>unsafe()</script>')).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
  });

  it('keeps healthy panels visible when logs fail', async () => {
    vi.mocked(logsApi.fetchLogs).mockRejectedValue(new Error('offline'));
    renderWithRouter(<OperationsPage />);

    expect(await screen.findByText('POST /v1/messages')).toBeInTheDocument();
    expect(screen.getByText('Application logs are unavailable.')).toBeInTheDocument();
    expect(screen.getAllByText('Degraded')).not.toHaveLength(0);
  });
});
