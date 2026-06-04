import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderWithRouter, screen, waitFor, userEvent, within } from '@/test/utils';
import { UsagePage } from './UsagePage';
import { usageApi, authFilesApi } from '@/services/api';
import { useAuthStore, useNotificationStore, useModelsStore, useQuotaStore } from '@/stores';
import type {
  UsageEvent,
  UsageModelPrice,
  UsageStatisticsResponse,
  UsageStatisticsSnapshot,
  UsageTokenStats,
} from '@/types';

// Mock the typed usage + auth-file API boundaries. The page, formatters,
// aggregation helpers, and i18n stay real so behaviour is exercised.
vi.mock('@/services/api/usage', () => ({
  usageApi: {
    getStatistics: vi.fn(),
    getEvents: vi.fn(),
    getStatus: vi.fn(),
    getModelPrices: vi.fn(),
    getAPIKeyAliases: vi.fn(),
    exportStatistics: vi.fn(),
    exportEvents: vi.fn(),
    importStatistics: vi.fn(),
    importEvents: vi.fn(),
    syncModelPrices: vi.fn(),
    saveModelPrices: vi.fn(),
    saveAPIKeyAlias: vi.fn(),
    deleteAPIKeyAlias: vi.fn(),
    pruneEvents: vi.fn(),
  },
}));
vi.mock('@/services/api/authFiles', () => ({
  authFilesApi: { list: vi.fn() },
}));

const mockedGetStatistics = vi.mocked(usageApi.getStatistics);
const mockedGetEvents = vi.mocked(usageApi.getEvents);
const mockedGetStatus = vi.mocked(usageApi.getStatus);
const mockedGetModelPrices = vi.mocked(usageApi.getModelPrices);
const mockedGetAliases = vi.mocked(usageApi.getAPIKeyAliases);
const mockedSaveModelPrices = vi.mocked(usageApi.saveModelPrices);
const mockedSaveAlias = vi.mocked(usageApi.saveAPIKeyAlias);
const mockedAuthFilesList = vi.mocked(authFilesApi.list);

const FIXED_NOW = Date.parse('2026-06-03T12:00:00.000Z');

const emptySnapshot: UsageStatisticsSnapshot = {
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

const statsResponse = (
  snapshot: Partial<UsageStatisticsSnapshot> = {},
  failed_requests = 0,
): UsageStatisticsResponse => ({
  usage: { ...emptySnapshot, ...snapshot },
  failed_requests,
});

const tokens = (overrides: Partial<UsageTokenStats> = {}): UsageTokenStats => ({
  input_tokens: 0,
  output_tokens: 0,
  reasoning_tokens: 0,
  cached_tokens: 0,
  total_tokens: 0,
  ...overrides,
});

let eventCounter = 0;
const usageEvent = (overrides: Partial<UsageEvent> = {}): UsageEvent => {
  eventCounter += 1;
  return {
    id: eventCounter,
    event_hash: `hash-${eventCounter}`,
    timestamp: '2026-06-03T11:30:00.000Z',
    timestamp_ms: Date.parse('2026-06-03T11:30:00.000Z'),
    provider: 'openai',
    model: 'gpt-5',
    alias: '',
    endpoint: '/v1/chat/completions',
    method: 'POST',
    path: '/v1/chat/completions',
    auth_type: 'api_key',
    auth_index: '1',
    source: 'src',
    api_key_hash: 'abcdef0123456789',
    api_key_alias: '',
    tokens: tokens(),
    latency_ms: 0,
    first_byte_latency_ms: 0,
    failed: false,
    status_code: 200,
    failure_body: '',
    created_at_ms: Date.parse('2026-06-03T11:30:00.000Z'),
    ...overrides,
  };
};

const connectedStore = () => {
  useAuthStore.setState({
    connectionStatus: 'connected',
    apiBase: 'http://proxy.test:8317',
    managementKey: 'mgmt-key',
  });
};

beforeEach(() => {
  // Fake only Date so timestamp/window math is deterministic while leaving
  // setTimeout/setInterval real — userEvent drives its own timers.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(FIXED_NOW);
  localStorage.clear();
  eventCounter = 0;

  useNotificationStore.setState({ notifications: [] });
  useModelsStore.setState({ models: [], loading: false, error: null, cache: null });
  useQuotaStore.setState({ codexQuota: {} });
  connectedStore();

  mockedGetStatistics.mockResolvedValue(statsResponse());
  mockedGetEvents.mockResolvedValue({ events: [], limit: 0 });
  mockedGetStatus.mockResolvedValue({
    enabled: false,
    path: '',
    retention_days: 0,
    event_count: 0,
    oldest_ms: 0,
    newest_ms: 0,
  });
  mockedGetModelPrices.mockResolvedValue({ prices: [] });
  mockedGetAliases.mockResolvedValue({ aliases: [] });
  mockedAuthFilesList.mockResolvedValue({ files: [] });
});

afterEach(() => {
  vi.useRealTimers();
});

// Wait for the async data load to commit. The summary region renders the
// metric tiles only after loadUsage resolves the mocked promises.
const flush = async () => {
  await waitFor(() => expect(screen.getByLabelText('Usage summary')).toBeInTheDocument());
};

// Read a metric tile's value span, scoped to the summary region so labels that
// also appear as table headers (e.g. "Estimated Cost") stay unambiguous.
const metricValue = (label: string): string => {
  const summary = screen.getByLabelText('Usage summary');
  const labelNode = within(summary).getByText(label);
  const tile = labelNode.closest('div')?.parentElement as HTMLElement;
  const valueSpan = Array.from(tile.querySelectorAll('span')).find((span) =>
    span.className.includes('metricValue'),
  );
  return valueSpan?.textContent ?? '';
};

describe('UsagePage connection gating', () => {
  it('shows the connection-required message when not connected', async () => {
    useAuthStore.setState({ connectionStatus: 'disconnected' });
    renderWithRouter(<UsagePage />);

    await flush();

    expect(
      screen.getByText('Connect to the management API before viewing usage statistics.'),
    ).toBeInTheDocument();
  });

  it('does not call getStatistics when disconnected', async () => {
    useAuthStore.setState({ connectionStatus: 'disconnected' });
    renderWithRouter(<UsagePage />);

    await flush();

    expect(mockedGetStatistics).not.toHaveBeenCalled();
  });
});

describe('UsagePage totals from events', () => {
  it('counts total requests as the number of returned events', async () => {
    mockedGetEvents.mockResolvedValue({
      events: [usageEvent(), usageEvent(), usageEvent()],
      limit: 100,
    });
    renderWithRouter(<UsagePage />);

    await flush();

    expect(metricValue('Total Requests')).toBe('3');
  });

  it('sums total tokens across events', async () => {
    mockedGetEvents.mockResolvedValue({
      events: [
        usageEvent({ tokens: tokens({ total_tokens: 1000 }) }),
        usageEvent({ tokens: tokens({ total_tokens: 500 }) }),
      ],
      limit: 100,
    });
    renderWithRouter(<UsagePage />);

    await flush();

    expect(metricValue('Total Tokens')).toBe('1,500');
  });

  it('counts failed events in the failure rate', async () => {
    mockedGetEvents.mockResolvedValue({
      events: [
        usageEvent({ failed: false }),
        usageEvent({ failed: true, status_code: 500 }),
        usageEvent({ failed: true, status_code: 502 }),
        usageEvent({ failed: false }),
      ],
      limit: 100,
    });
    renderWithRouter(<UsagePage />);

    await flush();

    // 2 failed of 4 = 50.0% (>= 10 -> 1 decimal place).
    expect(metricValue('Failure Rate')).toBe('50.0%');
  });

  it('computes cache hit rate as cached over input tokens', async () => {
    mockedGetEvents.mockResolvedValue({
      events: [usageEvent({ tokens: tokens({ input_tokens: 1000, cached_tokens: 250, total_tokens: 1000 }) })],
      limit: 100,
    });
    renderWithRouter(<UsagePage />);

    await flush();

    // 250 / 1000 = 25%; formatPercent uses 1 decimal for values >= 10.
    expect(metricValue('Cache Hit Rate')).toBe('25.0%');
  });
});

describe('UsagePage snapshot fallback totals', () => {
  it('uses snapshot total_requests when no events are present', async () => {
    mockedGetStatistics.mockResolvedValue(
      statsResponse({ total_requests: 42, failure_count: 0 }),
    );
    mockedGetEvents.mockResolvedValue({ events: [], limit: 0 });
    renderWithRouter(<UsagePage />);

    await flush();

    expect(metricValue('Total Requests')).toBe('42');
  });

  it('uses snapshot total_tokens when no events are present', async () => {
    mockedGetStatistics.mockResolvedValue(
      statsResponse({ total_requests: 5, total_tokens: 9000, total_input_tokens: 4000 }),
    );
    renderWithRouter(<UsagePage />);

    await flush();

    expect(metricValue('Total Tokens')).toBe('9,000');
  });

  it('derives the output-tokens sublabel as total minus input from the snapshot', async () => {
    // out = max(total_tokens - total_input_tokens, 0) = max(9000 - 4000, 0) = 5000.
    mockedGetStatistics.mockResolvedValue(
      statsResponse({ total_requests: 5, total_tokens: 9000, total_input_tokens: 4000 }),
    );
    renderWithRouter(<UsagePage />);

    await flush();

    expect(screen.getByText('4,000 in / 5,000 out')).toBeInTheDocument();
  });

  it('falls back to the snapshot failure_count for failed requests', async () => {
    mockedGetStatistics.mockResolvedValue(
      statsResponse({ total_requests: 10, failure_count: 3 }, 3),
    );
    renderWithRouter(<UsagePage />);

    await flush();

    // 3 failed of 10 = 30.0%.
    expect(metricValue('Failure Rate')).toBe('30.0%');
  });

  it('derives the cached-tokens sublabel from the snapshot when no events exist', async () => {
    mockedGetStatistics.mockResolvedValue(
      statsResponse({ total_requests: 2, total_cached_tokens: 750 }),
    );
    renderWithRouter(<UsagePage />);

    await flush();

    expect(screen.getByText('750 Cached Tokens')).toBeInTheDocument();
  });
});

describe('UsagePage cost computation', () => {
  it('applies a custom model price to compute the estimated cost', async () => {
    // input 1000, cached 200, output 500, total 1500.
    // uncachedInput = 800; inferredOutput = max(500, 1500-1000) = 500.
    // cost = 800/1e6*2 + 200/1e6*1 + 500/1e6*6 = 0.0016 + 0.0002 + 0.003 = 0.0048.
    const price: UsageModelPrice = {
      model: 'gpt-5',
      input_per_million: 2,
      cached_input_per_million: 1,
      output_per_million: 6,
      updated_at: '2026-06-01T00:00:00.000Z',
    };
    mockedGetModelPrices.mockResolvedValue({ prices: [price] });
    mockedGetEvents.mockResolvedValue({
      events: [
        usageEvent({
          model: 'gpt-5',
          tokens: tokens({ input_tokens: 1000, cached_tokens: 200, output_tokens: 500, total_tokens: 1500 }),
        }),
      ],
      limit: 100,
    });
    renderWithRouter(<UsagePage />);

    await flush();

    expect(metricValue('Estimated Cost')).toBe('$0.0048');
  });

  it('sums cost across two priced events of the same model', async () => {
    const price: UsageModelPrice = {
      model: 'gpt-5',
      input_per_million: 2,
      cached_input_per_million: 1,
      output_per_million: 6,
      updated_at: '2026-06-01T00:00:00.000Z',
    };
    mockedGetModelPrices.mockResolvedValue({ prices: [price] });
    const event = () =>
      usageEvent({
        model: 'gpt-5',
        tokens: tokens({ input_tokens: 1000, cached_tokens: 200, output_tokens: 500, total_tokens: 1500 }),
      });
    mockedGetEvents.mockResolvedValue({ events: [event(), event()], limit: 100 });
    renderWithRouter(<UsagePage />);

    await flush();

    expect(metricValue('Estimated Cost')).toBe('$0.0096');
  });

  it('shows a dash for estimated cost when no model is priced', async () => {
    mockedGetModelPrices.mockResolvedValue({ prices: [] });
    mockedGetEvents.mockResolvedValue({
      events: [usageEvent({ model: 'totally-unknown-model-xyz', tokens: tokens({ total_tokens: 100 }) })],
      limit: 100,
    });
    renderWithRouter(<UsagePage />);

    await flush();

    expect(metricValue('Estimated Cost')).toBe('-');
  });

  it('reports the priced request count in the cost sublabel', async () => {
    const price: UsageModelPrice = {
      model: 'gpt-5',
      input_per_million: 2,
      cached_input_per_million: 1,
      output_per_million: 6,
      updated_at: '2026-06-01T00:00:00.000Z',
    };
    mockedGetModelPrices.mockResolvedValue({ prices: [price] });
    mockedGetEvents.mockResolvedValue({
      events: [
        usageEvent({ model: 'gpt-5', tokens: tokens({ total_tokens: 1000 }) }),
        usageEvent({ model: 'unpriced-model', tokens: tokens({ total_tokens: 1000 }) }),
      ],
      limit: 100,
    });
    renderWithRouter(<UsagePage />);

    await flush();

    expect(screen.getByText('1 priced requests')).toBeInTheDocument();
  });
});

// The status filter is a native <select> with the "All Statuses" option.
const statusSelect = (): HTMLSelectElement =>
  screen
    .getAllByRole('combobox')
    .find((node): node is HTMLSelectElement =>
      within(node).queryByRole('option', { name: 'All Statuses' }) !== null,
    )!;

describe('UsagePage status and search filters', () => {
  it('drops failed records when the status filter is set to success', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockedGetEvents.mockResolvedValue({
      events: [
        usageEvent({ failed: false }),
        usageEvent({ failed: true, status_code: 500 }),
      ],
      limit: 100,
    });
    renderWithRouter(<UsagePage />);
    await flush();

    await user.selectOptions(statusSelect(), 'success');

    await waitFor(() => expect(metricValue('Total Requests')).toBe('1'));
  });

  it('keeps only failed records when the status filter is set to failed', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockedGetEvents.mockResolvedValue({
      events: [
        usageEvent({ failed: false }),
        usageEvent({ failed: true, status_code: 500 }),
        usageEvent({ failed: true, status_code: 502 }),
      ],
      limit: 100,
    });
    renderWithRouter(<UsagePage />);
    await flush();

    await user.selectOptions(statusSelect(), 'failed');

    await waitFor(() => expect(metricValue('Total Requests')).toBe('2'));
  });

  it('narrows totals to records whose model matches the search term', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockedGetEvents.mockResolvedValue({
      events: [
        usageEvent({ model: 'gpt-5' }),
        usageEvent({ model: 'gpt-5' }),
        usageEvent({ model: 'claude-opus' }),
      ],
      limit: 100,
    });
    renderWithRouter(<UsagePage />);
    await flush();

    await user.type(
      screen.getByPlaceholderText('Model, endpoint, account, hash, error...'),
      'claude',
    );

    await waitFor(() => expect(metricValue('Total Requests')).toBe('1'));
  });
});

describe('UsagePage aggregation tables', () => {
  it('lists the top model by request count', async () => {
    mockedGetEvents.mockResolvedValue({
      events: [
        usageEvent({ model: 'gpt-5' }),
        usageEvent({ model: 'gpt-5' }),
        usageEvent({ model: 'claude-opus' }),
      ],
      limit: 100,
    });
    renderWithRouter(<UsagePage />);

    await flush();

    expect(metricValue('Top Model')).toBe('gpt-5');
  });

  it('renders a model row with its aggregated request count in the breakdown table', async () => {
    mockedGetEvents.mockResolvedValue({
      events: [usageEvent({ model: 'gpt-5' }), usageEvent({ model: 'gpt-5' })],
      limit: 100,
    });
    renderWithRouter(<UsagePage />);
    await flush();

    // Scope to the breakdown aggregate table (header cell "By Model").
    const headerCell = screen.getByRole('columnheader', { name: 'By Model' });
    const table = headerCell.closest('table') as HTMLElement;
    const modelCell = within(table).getByText('gpt-5');
    const row = modelCell.closest('tr') as HTMLElement;

    expect(within(row).getByText('2')).toBeInTheDocument();
  });
});

describe('UsagePage event store status', () => {
  it('shows the memory-only label when the event store is disabled', async () => {
    mockedGetStatus.mockResolvedValue({
      enabled: false,
      path: '',
      retention_days: 0,
      event_count: 0,
      oldest_ms: 0,
      newest_ms: 0,
    });
    renderWithRouter(<UsagePage />);

    await flush();

    expect(metricValue('Event Store')).toBe('Memory');
  });

  it('shows the event count when the store is enabled', async () => {
    mockedGetStatus.mockResolvedValue({
      enabled: true,
      path: '/var/lib/usage.db',
      retention_days: 30,
      event_count: 1234,
      oldest_ms: 0,
      newest_ms: 0,
    });
    renderWithRouter(<UsagePage />);

    await flush();

    expect(metricValue('Event Store')).toBe('1,234');
  });
});

describe('UsagePage snapshot details flattening', () => {
  it('aggregates request totals from snapshot api/model details when events are absent', async () => {
    mockedGetEvents.mockResolvedValue({ events: [], limit: 0 });
    mockedGetStatistics.mockResolvedValue(
      statsResponse({
        total_requests: 99,
        apis: {
          openai: {
            total_requests: 2,
            total_tokens: 0,
            total_input_tokens: 0,
            total_cached_tokens: 0,
            cache_hit_rate: 0,
            average_latency_ms: 0,
            average_first_byte_latency_ms: 0,
            tps: 0,
            models: {
              'gpt-5': {
                total_requests: 2,
                total_tokens: 0,
                total_input_tokens: 0,
                total_cached_tokens: 0,
                cache_hit_rate: 0,
                average_latency_ms: 0,
                average_first_byte_latency_ms: 0,
                tps: 0,
                details: [
                  {
                    timestamp: '2026-06-03T10:00:00.000Z',
                    latency_ms: 0,
                    first_byte_latency_ms: 0,
                    source: 'src',
                    auth_index: '1',
                    tokens: tokens({ total_tokens: 100 }),
                    failed: false,
                  },
                  {
                    timestamp: '2026-06-03T10:05:00.000Z',
                    latency_ms: 0,
                    first_byte_latency_ms: 0,
                    source: 'src',
                    auth_index: '1',
                    tokens: tokens({ total_tokens: 200 }),
                    failed: false,
                  },
                ],
              },
            },
          },
        },
      }),
    );
    renderWithRouter(<UsagePage />);

    await flush();

    // Two flattened detail records take precedence over the snapshot's
    // total_requests of 99 because details exist.
    expect(metricValue('Total Requests')).toBe('2');
  });
});

describe('UsagePage timestamp formatting', () => {
  it('formats the last-request metric to a dash when there are no records', async () => {
    mockedGetStatistics.mockResolvedValue(statsResponse({ total_requests: 5 }));
    mockedGetEvents.mockResolvedValue({ events: [], limit: 0 });
    renderWithRouter(<UsagePage />);

    await flush();

    expect(metricValue('Last Request')).toBe('-');
  });

  it('formats the last-request metric from the newest event timestamp', async () => {
    const ts = Date.parse('2026-06-03T11:30:00.000Z');
    const expected = new Date(ts).toLocaleString('en');
    mockedGetEvents.mockResolvedValue({
      events: [usageEvent({ timestamp_ms: ts })],
      limit: 100,
    });
    renderWithRouter(<UsagePage />);

    await flush();

    expect(metricValue('Last Request')).toBe(expected);
  });
});

describe('UsagePage empty state', () => {
  it('shows the empty-data message when there is no usage at all', async () => {
    mockedGetStatistics.mockResolvedValue(statsResponse());
    mockedGetEvents.mockResolvedValue({ events: [], limit: 0 });
    renderWithRouter(<UsagePage />);

    await flush();

    expect(
      screen.getByText(/No usage data is available yet/),
    ).toBeInTheDocument();
  });
});

describe('UsagePage cost setup', () => {
  it('warns when saving a price with an empty model name', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockedGetStatus.mockResolvedValue({
      enabled: true,
      path: '/db',
      retention_days: 0,
      event_count: 0,
      oldest_ms: 0,
      newest_ms: 0,
    });
    renderWithRouter(<UsagePage />);
    await flush();
    await user.click(screen.getByRole('button', { name: 'Cost Setup' }));

    await user.click(screen.getByRole('button', { name: 'Save Price' }));

    await waitFor(() =>
      expect(
        useNotificationStore.getState().notifications.some(
          (n) => n.type === 'error' && n.message === 'Enter a model name',
        ),
      ).toBe(true),
    );
    expect(mockedSaveModelPrices).not.toHaveBeenCalled();
  });
});

describe('UsagePage alias management', () => {
  it('warns when saving an alias without hash and name', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockedGetStatus.mockResolvedValue({
      enabled: true,
      path: '/db',
      retention_days: 0,
      event_count: 0,
      oldest_ms: 0,
      newest_ms: 0,
    });
    renderWithRouter(<UsagePage />);
    await flush();
    await user.click(screen.getByRole('button', { name: 'Data Management' }));

    await user.click(screen.getByRole('button', { name: 'Save Alias' }));

    await waitFor(() =>
      expect(
        useNotificationStore.getState().notifications.some(
          (n) => n.type === 'error' && n.message === 'Enter both API Key Hash and alias',
        ),
      ).toBe(true),
    );
    expect(mockedSaveAlias).not.toHaveBeenCalled();
  });
});
