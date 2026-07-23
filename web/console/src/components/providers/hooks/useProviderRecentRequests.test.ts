import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@/test/utils';

import type { ApiKeyUsageResponse } from '@/utils/recentRequests';

/**
 * The hook keeps a module-level cache (cachedUsageByProvider / cachedAt /
 * inFlightRequest). To isolate tests we reset modules and re-import the hook
 * fresh in each test, and we mock the api boundary (apiKeyUsageApi.getUsage).
 */
const getUsageMock = vi.fn<() => Promise<ApiKeyUsageResponse>>();

vi.mock('@/services/api', () => ({
  apiKeyUsageApi: {
    getUsage: () => getUsageMock(),
  },
}));

const STALE_TIME_MS = 240_000;

// Re-import the hook against a freshly reset module graph so cache state is clean.
const loadHook = async () => {
  vi.resetModules();
  const mod = await import('./useProviderRecentRequests');
  return mod.useProviderRecentRequests;
};

beforeEach(() => {
  getUsageMock.mockReset();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-04T00:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useProviderRecentRequests: initial state', () => {
  it('starts with an empty usage map and not loading', async () => {
    getUsageMock.mockResolvedValue({});
    const useHook = await loadHook();

    const { result } = renderHook(() => useHook());

    expect({
      size: result.current.usageByProvider.size,
      loading: result.current.isLoading,
    }).toEqual({
      size: 0,
      loading: false,
    });
  });
});

describe('useProviderRecentRequests: loadRecentRequests', () => {
  it('normalizes the api payload into a provider -> composite-key map', async () => {
    getUsageMock.mockResolvedValue({
      OpenAI: {
        'http://base|key-1': { success: 5, failed: 2 },
      },
    });
    const useHook = await loadHook();
    const { result } = renderHook(() => useHook());

    let loaded!: Awaited<ReturnType<typeof result.current.loadRecentRequests>>;
    await act(async () => {
      loaded = await result.current.loadRecentRequests();
    });

    expect(loaded.get('openai')?.get('http://base|key-1')).toEqual({
      success: 5,
      failed: 2,
      recentRequests: [],
    });
  });

  it('lowercases and trims the provider key', async () => {
    getUsageMock.mockResolvedValue({
      '  Gemini  ': { 'b|k': { success: 1, failed: 0 } },
    });
    const useHook = await loadHook();
    const { result } = renderHook(() => useHook());

    await act(async () => {
      await result.current.loadRecentRequests();
    });

    expect(Array.from(result.current.usageByProvider.keys())).toEqual(['gemini']);
  });

  it('skips providers whose entries value is not a plain object', async () => {
    getUsageMock.mockResolvedValue({
      good: { 'b|k': { success: 1, failed: 0 } },
      bad: [] as unknown as Record<string, never>,
    });
    const useHook = await loadHook();
    const { result } = renderHook(() => useHook());

    await act(async () => {
      await result.current.loadRecentRequests();
    });

    expect(Array.from(result.current.usageByProvider.keys())).toEqual(['good']);
  });

  it('returns an empty map when the payload is an array', async () => {
    getUsageMock.mockResolvedValue([] as unknown as ApiKeyUsageResponse);
    const useHook = await loadHook();
    const { result } = renderHook(() => useHook());

    let loaded!: Awaited<ReturnType<typeof result.current.loadRecentRequests>>;
    await act(async () => {
      loaded = await result.current.loadRecentRequests();
    });

    expect(loaded.size).toBe(0);
  });

  it('calls the api exactly once when invoked concurrently (request de-duplication)', async () => {
    getUsageMock.mockResolvedValue({});
    const useHook = await loadHook();
    const { result } = renderHook(() => useHook());

    await act(async () => {
      await Promise.all([result.current.loadRecentRequests(), result.current.loadRecentRequests()]);
    });

    expect(getUsageMock).toHaveBeenCalledTimes(1);
  });
});

describe('useProviderRecentRequests: caching', () => {
  it('serves a fresh cache without calling the api again', async () => {
    getUsageMock.mockResolvedValue({ p: { 'b|k': { success: 1, failed: 0 } } });
    const useHook = await loadHook();
    const { result } = renderHook(() => useHook());
    await act(async () => {
      await result.current.loadRecentRequests();
    });

    await act(async () => {
      await result.current.loadRecentRequests();
    });

    expect(getUsageMock).toHaveBeenCalledTimes(1);
  });

  it('refetches once the cache has gone stale', async () => {
    getUsageMock.mockResolvedValue({ p: { 'b|k': { success: 1, failed: 0 } } });
    const useHook = await loadHook();
    const { result } = renderHook(() => useHook());
    await act(async () => {
      await result.current.loadRecentRequests();
    });

    vi.setSystemTime(new Date('2026-06-04T00:00:00.000Z').getTime() + STALE_TIME_MS + 1);
    await act(async () => {
      await result.current.loadRecentRequests();
    });

    expect(getUsageMock).toHaveBeenCalledTimes(2);
  });

  it('forces a refetch via refreshRecentRequests even when the cache is fresh', async () => {
    getUsageMock.mockResolvedValue({ p: { 'b|k': { success: 1, failed: 0 } } });
    const useHook = await loadHook();
    const { result } = renderHook(() => useHook());
    await act(async () => {
      await result.current.loadRecentRequests();
    });

    await act(async () => {
      await result.current.refreshRecentRequests();
    });

    expect(getUsageMock).toHaveBeenCalledTimes(2);
  });
});

describe('useProviderRecentRequests: error handling', () => {
  it('keeps an empty map and returns it when the first load rejects', async () => {
    getUsageMock.mockRejectedValue(new Error('network'));
    const useHook = await loadHook();
    const { result } = renderHook(() => useHook());

    let returned!: Awaited<ReturnType<typeof result.current.loadRecentRequests>>;
    await act(async () => {
      returned = await result.current.loadRecentRequests();
    });

    expect(returned.size).toBe(0);
  });

  it('clears the loading flag after a failed load', async () => {
    getUsageMock.mockRejectedValue(new Error('network'));
    const useHook = await loadHook();
    const { result } = renderHook(() => useHook());

    await act(async () => {
      await result.current.loadRecentRequests();
    });

    expect(result.current.isLoading).toBe(false);
  });

  it('retains the previously cached data when a later refresh rejects', async () => {
    getUsageMock.mockResolvedValueOnce({ p: { 'b|k': { success: 9, failed: 1 } } });
    const useHook = await loadHook();
    const { result } = renderHook(() => useHook());
    await act(async () => {
      await result.current.loadRecentRequests();
    });
    getUsageMock.mockRejectedValueOnce(new Error('later failure'));

    let returned!: Awaited<ReturnType<typeof result.current.refreshRecentRequests>>;
    await act(async () => {
      returned = await result.current.refreshRecentRequests();
    });

    expect(returned.get('p')?.get('b|k')).toEqual({ success: 9, failed: 1, recentRequests: [] });
  });
});

describe('useProviderRecentRequests: enabled flag', () => {
  it('returns an empty map without calling the api when disabled', async () => {
    getUsageMock.mockResolvedValue({ p: { 'b|k': { success: 1, failed: 0 } } });
    const useHook = await loadHook();
    const { result } = renderHook(() => useHook({ enabled: false }));

    let returned!: Awaited<ReturnType<typeof result.current.loadRecentRequests>>;
    await act(async () => {
      returned = await result.current.loadRecentRequests();
    });

    expect({ size: returned.size, called: getUsageMock.mock.calls.length }).toEqual({
      size: 0,
      called: 0,
    });
  });

  it('reports isLoading as false while disabled', async () => {
    getUsageMock.mockResolvedValue({});
    const useHook = await loadHook();

    const { result } = renderHook(() => useHook({ enabled: false }));

    expect(result.current.isLoading).toBe(false);
  });
});

describe('useProviderRecentRequests: polling', () => {
  it('refreshes on the stale-time interval while enabled', async () => {
    getUsageMock.mockResolvedValue({});
    const useHook = await loadHook();
    renderHook(() => useHook());
    await act(async () => {
      await Promise.resolve();
    });
    getUsageMock.mockClear();

    await act(async () => {
      vi.advanceTimersByTime(STALE_TIME_MS);
    });

    expect(getUsageMock).toHaveBeenCalledTimes(1);
  });

  it('does not poll the api while disabled', async () => {
    getUsageMock.mockResolvedValue({});
    const useHook = await loadHook();
    renderHook(() => useHook({ enabled: false }));
    getUsageMock.mockClear();

    await act(async () => {
      vi.advanceTimersByTime(STALE_TIME_MS * 3);
    });

    expect(getUsageMock).not.toHaveBeenCalled();
  });
});
