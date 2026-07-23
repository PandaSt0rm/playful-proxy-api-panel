import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithRouter, screen, userEvent } from '@/test/utils';
import { useAuthStore, useConfigStore } from '@/stores';
import type {
  DashboardPanelState,
  DashboardTrafficSnapshot,
  DashboardProviderRow,
  DashboardAttentionItem,
} from '@/features/dashboard/useDashboardSnapshot';

const useDashboardSnapshotMock = vi.hoisted(() => vi.fn());
vi.mock('@/features/dashboard/useDashboardSnapshot', () => ({
  useDashboardSnapshot: useDashboardSnapshotMock,
}));

const { DashboardPage } = await import('./DashboardPage');

const panel = <T,>(
  status: DashboardPanelState<T>['status'],
  data: T | null = null,
  error = '',
  updatedAt: number | null = null
): DashboardPanelState<T> => ({ status, data, error, updatedAt });
const refresh = vi.fn(async () => {});

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ connectionStatus: 'connected', serverVersion: '', serverBuildDate: '' });
  useConfigStore.setState({ config: undefined });
});

describe('DashboardPage presentation states', () => {
  it('renders each loading state and disconnected metadata fallbacks', () => {
    useAuthStore.setState({ connectionStatus: 'disconnected' });
    useDashboardSnapshotMock.mockReturnValue({
      traffic: panel<DashboardTrafficSnapshot>('loading'),
      providers: panel<DashboardProviderRow[]>('loading'),
      attention: panel<DashboardAttentionItem[]>('loading'),
      refreshing: false,
      refresh,
    });

    renderWithRouter(<DashboardPage />);

    expect(screen.getByText('Loading traffic')).toBeInTheDocument();
    expect(screen.getByText('Loading providers')).toBeInTheDocument();
    expect(screen.getByText('Loading attention queue')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThan(2);
    expect(screen.getByText('Disconnected')).toBeInTheDocument();
    expect(screen.getAllByText('Off')).toHaveLength(2);
    expect(screen.getByText('Unlimited')).toBeInTheDocument();
  });

  it('renders all error panels and retries each panel through the shared refresh action', async () => {
    const user = userEvent.setup();
    useDashboardSnapshotMock.mockReturnValue({
      traffic: panel<DashboardTrafficSnapshot>('error', null, 'failed'),
      providers: panel<DashboardProviderRow[]>('error', null, 'failed'),
      attention: panel<DashboardAttentionItem[]>('error', null, 'failed'),
      refreshing: false,
      refresh,
    });

    renderWithRouter(<DashboardPage />);
    const retryButtons = screen.getAllByRole('button', { name: 'Retry' });
    expect(retryButtons).toHaveLength(3);
    for (const button of retryButtons) await user.click(button);
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it('renders empty panels without exposing their child lists', () => {
    useDashboardSnapshotMock.mockReturnValue({
      traffic: panel<DashboardTrafficSnapshot>('empty'),
      providers: panel<DashboardProviderRow[]>('empty'),
      attention: panel<DashboardAttentionItem[]>('empty'),
      refreshing: false,
      refresh,
    });

    renderWithRouter(<DashboardPage />);
    expect(screen.getByText('No traffic in this window')).toBeInTheDocument();
    expect(screen.getByText('No providers configured')).toBeInTheDocument();
    expect(screen.getByText('No operator action required')).toBeInTheDocument();
  });

  it('renders fallback event fields, a one-point trend, every age unit, and enabled config values', () => {
    const now = Date.parse('2026-07-23T12:00:00Z');
    const usage = {
      total_requests: 2,
      success_count: 1,
      failure_count: 1,
      total_tokens: 0,
      total_input_tokens: 0,
      total_cached_tokens: 0,
      cache_hit_rate: 0,
      average_latency_ms: 0,
      average_first_byte_latency_ms: 0,
      tps: 0,
      requests_by_hour: { '12': 2 },
    };
    const event = {
      id: 7,
      timestamp: '2026-07-23T11:59:30Z',
      timestamp_ms: now - 30_000,
      provider: '',
      model: '',
      alias: '',
      status_code: 503,
      latency_ms: 1.6,
      failed: true,
      tokens: {},
    };
    useAuthStore.setState({ serverVersion: '3', serverBuildDate: 'today' });
    useConfigStore.setState({
      config: {
        loggingToFile: true,
        usageStatisticsEnabled: true,
        upstreamConcurrency: { default: 4, providers: {} },
        routingStrategy: 'fill',
        requestRetry: 3,
      },
    });
    useDashboardSnapshotMock.mockReturnValue({
      traffic: panel(
        'ready',
        {
          statistics: { failed_requests: 1, storage: 'sqlite', usage },
          events: [event],
          usageStatus: { newest_ms: now - 120_000 },
        },
        'partial',
        now
      ),
      providers: panel(
        'ready',
        [
          {
            id: 'p',
            labelKey: 'dashboardOverview.providers.gemini',
            count: null,
            error: 'offline',
          },
        ],
        'partial',
        now - 120_000
      ),
      attention: panel(
        'ready',
        [
          {
            id: 'a',
            kind: 'readiness',
            severity: 'danger',
            summary: 'required',
            path: '/onboarding',
            occurredAt: now - 30_000,
          },
          {
            id: 'b',
            kind: 'budget',
            severity: 'caution',
            summary: 'minutes',
            path: '/budgets',
            occurredAt: now - 120_000,
          },
          {
            id: 'c',
            kind: 'sync',
            severity: 'caution',
            summary: 'hours',
            path: '/tooling-templates',
            occurredAt: now - 7_200_000,
          },
        ],
        '',
        now
      ),
      refreshing: true,
      refresh,
    });
    const { container } = renderWithRouter(<DashboardPage />);
    expect(screen.getByText('— / —')).toBeInTheDocument();
    expect(screen.getByText('2 ms')).toBeInTheDocument();
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getAllByText('On')).toHaveLength(2);
    expect(container.querySelector('polyline')).toHaveAttribute('points', '0,4');
  });
  it('formats a usage-store age below one minute in seconds', () => {
    const now = 60_000;
    useDashboardSnapshotMock.mockReturnValue({
      traffic: panel(
        'ready',
        {
          statistics: {
            failed_requests: 0,
            storage: 'memory',
            usage: {
              total_requests: 1,
              success_count: 1,
              failure_count: 0,
              tps: 1,
              requests_by_hour: {},
            },
          },
          events: [],
          usageStatus: { newest_ms: now - 30_000 },
        },
        '',
        now
      ),
      providers: panel('empty'),
      attention: panel('empty'),
      refreshing: false,
      refresh,
    });

    renderWithRouter(<DashboardPage />);
    expect(screen.getByText('memory · 30s')).toBeInTheDocument();
  });
});
