import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithRouter, screen, userEvent, waitFor } from '@/test/utils';
import type { PanelState } from '@/features/operations/useOperationsFeed';

const useOperationsFeedMock = vi.hoisted(() => vi.fn());
vi.mock('@/features/operations/useOperationsFeed', () => ({
  useOperationsFeed: useOperationsFeedMock,
}));
const { OperationsPage } = await import('./OperationsPage');

const panel = <T,>(
  status: PanelState<T>['status'],
  data: T | null = null,
  error = '',
  updatedAt: number | null = null
): PanelState<T> => ({ status, data, error, updatedAt });
const setFilters = vi.fn();
const setCadence = vi.fn();
const setPaused = vi.fn();
const refresh = vi.fn(async () => {});

function feed(overrides: Record<string, unknown> = {}) {
  return {
    traffic: panel('loading'),
    routes: panel('loading'),
    events: panel('loading'),
    logs: panel('loading'),
    filters: { search: '', provider: '', model: '', endpoint: '', status: 'all' },
    setFilters,
    cadence: 15000,
    setCadence,
    paused: false,
    setPaused,
    refreshing: false,
    refresh,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('OperationsPage presentation states', () => {
  it('renders loading and waiting states', () => {
    useOperationsFeedMock.mockReturnValue(feed());
    renderWithRouter(<OperationsPage />);
    expect(screen.getByText('Live')).toBeInTheDocument();
    expect(screen.getByText('Waiting for data')).toBeInTheDocument();
    expect(screen.getByText('No provider routes')).toBeInTheDocument();
    expect(screen.getByText('No matching requests')).toBeInTheDocument();
    expect(screen.getByText('No application log lines')).toBeInTheDocument();
  });

  it('renders empty and error states and retries each failed visible panel', async () => {
    const user = userEvent.setup();
    useOperationsFeedMock.mockReturnValue(
      feed({
        traffic: panel('error', null, 'traffic'),
        routes: panel('error', null, 'routes'),
        events: panel('error', null, 'events'),
        logs: panel('error', null, 'logs'),
      })
    );
    renderWithRouter(<OperationsPage />);
    expect(screen.getAllByText('Degraded')).toHaveLength(4);
    for (const button of screen.getAllByRole('button', { name: 'Retry' })) await user.click(button);
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it('wires cadence, pause, refresh, and every request filter control', async () => {
    const user = userEvent.setup();
    useOperationsFeedMock.mockReturnValue(
      feed({
        paused: true,
        cadence: 0,
        routes: panel('empty'),
        events: panel('empty'),
        logs: panel('empty'),
      })
    );
    renderWithRouter(<OperationsPage />);
    expect(screen.getByText('Paused')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Refresh cadence' }));
    await user.click(screen.getByRole('option', { name: '8 s' }));
    await user.click(screen.getByRole('button', { name: 'Resume' }));
    await user.click(screen.getByRole('button', { name: 'Refresh now' }));
    await user.click(screen.getByRole('button', { name: 'Provider' }));
    await user.click(screen.getByRole('option', { name: 'All providers' }));
    await user.type(screen.getByRole('textbox', { name: 'Model or alias' }), 'sonnet');
    await user.type(screen.getByRole('textbox', { name: 'Endpoint' }), '/v1');
    await user.click(screen.getByRole('button', { name: 'Result' }));
    await user.click(screen.getByRole('option', { name: 'Failed' }));
    expect(setCadence).toHaveBeenCalledWith(8000);
    expect(setPaused).toHaveBeenCalledWith(false);
    expect(refresh).toHaveBeenCalled();
    expect(setFilters).toHaveBeenCalled();
  });

  it('renders success fallbacks, raw and parsed logs, route share fallback, and closes details', async () => {
    const user = userEvent.setup();
    const event = {
      id: 2,
      event_hash: 'hash',
      request_id: '',
      timestamp: '2026-07-23T12:00:00Z',
      provider: 'openai',
      model: '',
      alias: 'fallback-model',
      endpoint: '/v1/chat',
      method: 'POST',
      path: '/v1/chat',
      auth_type: 'key',
      auth_index: 'key-1',
      source: '',
      source_hash: 'source-hash',
      api_key_alias: '',
      tokens: { input_tokens: 1, output_tokens: 2, total_tokens: 3 },
      latency_ms: 2,
      first_byte_latency_ms: 1,
      failed: false,
      status_code: 200,
    };
    const route = {
      key: 'openai',
      label: '',
      requests: 2,
      failures: 0,
      successes: 2,
      average_latency_ms: 2,
      last_seen_ms: 0,
    };
    useOperationsFeedMock.mockReturnValue(
      feed({
        traffic: panel(
          'ready',
          {
            usage: {
              total_requests: 0,
              success_count: 0,
              failure_count: 0,
              average_latency_ms: 0,
              average_first_byte_latency_ms: 0,
              tps: 0,
              total_tokens: 0,
            },
          },
          '',
          10
        ),
        routes: panel('ready', [route], '', 10),
        events: panel(
          'ready',
          [
            event,
            {
              ...event,
              id: 3,
              timestamp: '2026-07-23T13:00:00Z',
              source_hash: '',
              source: 'plain-source',
            },
            { ...event, id: 4, timestamp: '2026-07-23T14:00:00Z', source_hash: '', source: '' },
          ],
          '',
          10
        ),
        logs: panel(
          'ready',
          { lines: ['unparsed line', '2026-07-23 12:00:00 [INFO] parsed'], latestTimestamp: 10 },
          '',
          10
        ),
      })
    );
    const { container } = renderWithRouter(<OperationsPage />);
    expect(screen.getByRole('button', { name: /openai/ })).toHaveTextContent('0.0%');
    expect(screen.getByText('unparsed line')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show raw' }));
    expect(container.querySelectorAll('code')).not.toHaveLength(0);
    await user.click(screen.getByRole('button', { name: /12:00:00 PM/ }));
    expect(screen.getByText('source-hash')).toBeInTheDocument();
    expect(screen.getAllByText('—')).not.toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByText('source-hash')).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /^01:00:00 PM$/ }));
    expect(screen.getByText('plain-source')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByText('plain-source')).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /^02:00:00 PM$/ }));
    expect(screen.getAllByText('—')).not.toHaveLength(0);
  });

  it('disables follow mode without requiring a mounted log viewport', async () => {
    const user = userEvent.setup();
    useOperationsFeedMock.mockReturnValue(
      feed({ routes: panel('empty'), events: panel('empty'), logs: panel('empty') })
    );
    renderWithRouter(<OperationsPage />);
    await user.click(screen.getByRole('button', { name: 'Follow latest' }));
    expect(screen.getByRole('button', { name: 'Follow latest' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });
});
