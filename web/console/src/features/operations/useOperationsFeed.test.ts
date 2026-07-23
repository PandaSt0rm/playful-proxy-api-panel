import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@/test/utils';
import { logsApi } from '@/services/api/logs';
import { usageApi } from '@/services/api/usage';
import { useOperationsFeed } from './useOperationsFeed';
import type { UsageStatisticsResponse } from '@/types';

vi.mock('@/services/api/usage', () => ({
  usageApi: { getStatistics: vi.fn(), getSummary: vi.fn(), getEvents: vi.fn() },
}));
vi.mock('@/services/api/logs', () => ({ logsApi: { fetchLogs: vi.fn() } }));

const statistics = (total = 1) => ({
  failed_requests: 0,
  usage: {
    total_requests: total,
    success_count: total,
    failure_count: 0,
    total_tokens: 0,
    total_input_tokens: 0,
    total_cached_tokens: 0,
    cache_hit_rate: 0,
    average_latency_ms: 0,
    average_first_byte_latency_ms: 0,
    tps: 0,
  },
});
const fixedNow = () => 42;

function resolveAll() {
  vi.mocked(usageApi.getStatistics).mockResolvedValue(statistics() as never);
  vi.mocked(usageApi.getSummary).mockResolvedValue({ group_by: 'provider', limit: 20, rows: [] });
  vi.mocked(usageApi.getEvents).mockResolvedValue({ events: [], limit: 200 });
  vi.mocked(logsApi.fetchLogs).mockResolvedValue({
    lines: [],
    'line-count': 0,
    'latest-timestamp': 0,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  resolveAll();
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
});

describe('useOperationsFeed', () => {
  it('normalizes invalid cadence and absent response arrays into empty panels', async () => {
    localStorage.setItem('operations-cadence-ms', '999');
    vi.mocked(usageApi.getSummary).mockResolvedValue({ group_by: 'provider', limit: 20 } as never);
    vi.mocked(usageApi.getStatistics).mockResolvedValue(statistics(0) as UsageStatisticsResponse);
    vi.mocked(usageApi.getEvents).mockResolvedValue({ limit: 200 } as never);
    vi.mocked(logsApi.fetchLogs).mockResolvedValue({
      'line-count': 0,
      'latest-timestamp': 0,
    } as never);
    const { result } = renderHook(() => useOperationsFeed(fixedNow));

    await waitFor(() => expect(result.current.refreshing).toBe(false));
    expect(result.current.cadence).toBe(15000);
    expect(result.current.routes.status).toBe('empty');
    expect(result.current.events.status).toBe('empty');
    expect(result.current.logs.data?.lines).toEqual([]);
  });

  it('passes every active filter and reports all rejected panel sources', async () => {
    vi.mocked(usageApi.getStatistics).mockRejectedValue(new Error('traffic'));
    vi.mocked(usageApi.getSummary).mockRejectedValue('routes');
    vi.mocked(usageApi.getEvents).mockRejectedValue(new Error('events'));
    vi.mocked(logsApi.fetchLogs).mockRejectedValue(new Error('logs'));
    const { result } = renderHook(() => useOperationsFeed(fixedNow));
    await waitFor(() => expect(result.current.refreshing).toBe(false));
    expect(
      [
        result.current.traffic,
        result.current.routes,
        result.current.events,
        result.current.logs,
      ].map((panel) => panel.status)
    ).toEqual(['error', 'error', 'error', 'error']);
    expect(result.current.routes.error).toBe('unavailable');

    resolveAll();
    act(() =>
      result.current.setFilters({
        search: 'needle',
        provider: 'p',
        model: 'm',
        endpoint: '/v1',
        status: 'failed',
      })
    );
    await waitFor(() =>
      expect(usageApi.getEvents).toHaveBeenLastCalledWith({
        range: '1h',
        limit: 200,
        search: 'needle',
        provider: 'p',
        model: 'm',
        endpoint: '/v1',
        status: 'failed',
      })
    );
  });

  it('queues a second refresh while a request is running', async () => {
    const pending = Promise.withResolvers<UsageStatisticsResponse>();
    vi.mocked(usageApi.getStatistics).mockReturnValueOnce(pending.promise);
    const { result } = renderHook(() => useOperationsFeed(fixedNow));
    await waitFor(() => expect(usageApi.getStatistics).toHaveBeenCalledTimes(1));

    await act(async () => result.current.refresh());
    pending.resolve(statistics() as UsageStatisticsResponse);
    await waitFor(() => expect(usageApi.getStatistics).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.refreshing).toBe(false));
  });

  it('discards a completed response when filters change during the request', async () => {
    const pending = Promise.withResolvers<UsageStatisticsResponse>();
    vi.mocked(usageApi.getStatistics).mockReturnValueOnce(pending.promise);
    const { result } = renderHook(() => useOperationsFeed(fixedNow));
    await waitFor(() => expect(usageApi.getStatistics).toHaveBeenCalledTimes(1));

    act(() => result.current.setFilters((current) => ({ ...current, provider: 'new' })));
    pending.resolve(statistics(9) as UsageStatisticsResponse);
    await waitFor(() => expect(usageApi.getStatistics).toHaveBeenCalledTimes(2));
    expect(result.current.traffic.data?.usage.total_requests).not.toBe(9);
  });

  it('invalidates an in-flight response on unmount', async () => {
    const pending = Promise.withResolvers<UsageStatisticsResponse>();
    vi.mocked(usageApi.getStatistics).mockReturnValueOnce(pending.promise);
    const rendered = renderHook(() => useOperationsFeed(fixedNow));
    await waitFor(() => expect(usageApi.getStatistics).toHaveBeenCalledTimes(1));
    rendered.unmount();

    pending.resolve(statistics() as UsageStatisticsResponse);
    await pending.promise;
    await Promise.resolve();
    expect(usageApi.getStatistics).toHaveBeenCalledTimes(1);
  });

  it('honors pause and zero cadence without scheduling polling', async () => {
    vi.useFakeTimers();
    localStorage.setItem('operations-cadence-ms', '0');
    const zero = renderHook(() => useOperationsFeed(fixedNow));
    await vi.advanceTimersByTimeAsync(0);
    expect(zero.result.current.cadence).toBe(0);
    zero.unmount();

    localStorage.setItem('operations-cadence-ms', '8000');
    const paused = renderHook(() => useOperationsFeed(fixedNow));
    act(() => paused.result.current.setPaused(true));
    const calls = vi.mocked(usageApi.getStatistics).mock.calls.length;
    await vi.advanceTimersByTimeAsync(8000);
    expect(usageApi.getStatistics).toHaveBeenCalledTimes(calls);
    paused.unmount();
    vi.useRealTimers();
  });

  it('polls only while visible and refreshes immediately when visibility returns', async () => {
    vi.useFakeTimers();
    localStorage.setItem('operations-cadence-ms', '8000');
    const rendered = renderHook(() => useOperationsFeed(fixedNow));
    await vi.advanceTimersByTimeAsync(0);
    const initialCalls = vi.mocked(usageApi.getStatistics).mock.calls.length;
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    await vi.advanceTimersByTimeAsync(8000);
    expect(usageApi.getStatistics).toHaveBeenCalledTimes(initialCalls);

    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(usageApi.getStatistics).toHaveBeenCalledTimes(initialCalls + 1);
    rendered.unmount();
    vi.useRealTimers();
  });
});
