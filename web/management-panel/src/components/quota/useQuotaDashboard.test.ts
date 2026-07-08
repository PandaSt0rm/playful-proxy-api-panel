/**
 * Orchestration tests for useQuotaDashboard. The provider registry is mocked
 * with two lightweight fake configs wired to real store slices, so these tests
 * exercise loading/concurrency/refresh behaviour without provider parsing.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { AuthFileItem } from '@/types';

const { fetchA, fetchB } = vi.hoisted(() => ({ fetchA: vi.fn(), fetchB: vi.fn() }));

vi.mock('./quotaConfigs', () => {
  const makeConfig = (
    type: string,
    selector: string,
    setter: string,
    fetchQuota: (...args: unknown[]) => unknown
  ) => ({
    type,
    i18nPrefix: `${type}_quota`,
    filterFn: (file: AuthFileItem) => file.type === type,
    fetchQuota,
    storeSelector: (state: Record<string, unknown>) => state[selector],
    storeSetter: setter,
    buildLoadingState: () => ({ status: 'loading' }),
    buildSuccessState: (data: Record<string, unknown>) => ({ status: 'success', ...(data ?? {}) }),
    buildErrorState: (message: string, errorStatus?: number) => ({ status: 'error', error: message, errorStatus }),
    getSummary: () => ({ meters: [], extras: [] }),
  });
  return {
    QUOTA_CONFIGS: [
      makeConfig('claude', 'claudeQuota', 'setClaudeQuota', (...args) => fetchA(...args)),
      makeConfig('codex', 'codexQuota', 'setCodexQuota', (...args) => fetchB(...args)),
    ],
  };
});

import { useQuotaDashboard } from './useQuotaDashboard';
import { useQuotaStore } from '@/stores';
import { useNotificationStore } from '@/stores';

const file = (name: string, type: string): AuthFileItem => ({ name, type });

function resetStores() {
  useQuotaStore.setState({
    claudeQuota: {},
    codexQuota: {},
    antigravityQuota: {},
    geminiCliQuota: {},
    kimiQuota: {},
    zaiQuota: {},
    xaiQuota: {},
    quotaUpdatedAt: {},
  });
}

beforeEach(() => {
  fetchA.mockReset().mockResolvedValue({});
  fetchB.mockReset().mockResolvedValue({});
  resetStores();
});

describe('useQuotaDashboard auto-load', () => {
  it('fetches every idle credential once files are ready', async () => {
    const files = [file('a.json', 'claude'), file('b.json', 'codex')];
    const { result } = renderHook(() => useQuotaDashboard(files, false, false));

    await waitFor(() => {
      expect(fetchA).toHaveBeenCalledTimes(1);
      expect(fetchB).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(result.current.credentialViews.every((view) => view.status === 'success')).toBe(true);
      expect(result.current.progress.active).toBe(false);
    });
  });

  it('does not fetch while files are still loading', async () => {
    renderHook(() => useQuotaDashboard([file('a.json', 'claude')], true, false));
    await Promise.resolve();
    expect(fetchA).not.toHaveBeenCalled();
  });

  it('does not fetch when controls are disabled', async () => {
    renderHook(() => useQuotaDashboard([file('a.json', 'claude')], false, true));
    await Promise.resolve();
    expect(fetchA).not.toHaveBeenCalled();
  });

  it('does not refetch credentials that already have data', async () => {
    useQuotaStore.setState({ claudeQuota: { 'a.json': { status: 'success' } } });
    renderHook(() => useQuotaDashboard([file('a.json', 'claude')], false, false));
    await Promise.resolve();
    await Promise.resolve();
    expect(fetchA).not.toHaveBeenCalled();
  });
});

describe('useQuotaDashboard concurrency', () => {
  it('caps concurrent fetches at the pool size', async () => {
    let active = 0;
    let maxActive = 0;
    fetchA.mockImplementation(() => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      return Promise.resolve({}).then((value) => {
        active -= 1;
        return value;
      });
    });
    const files = Array.from({ length: 15 }, (_, i) => file(`a${i}.json`, 'claude'));

    renderHook(() => useQuotaDashboard(files, false, false));

    await waitFor(() => expect(fetchA).toHaveBeenCalledTimes(15));
    expect(maxActive).toBeLessThanOrEqual(6);
    expect(maxActive).toBe(6);
  });
});

describe('useQuotaDashboard refresh actions', () => {
  it('refreshAll notifies success when all credentials succeed', async () => {
    const spy = vi.spyOn(useNotificationStore.getState(), 'showNotification');
    const files = [file('a.json', 'claude'), file('b.json', 'codex')];
    const { result } = renderHook(() => useQuotaDashboard(files, false, false));
    await waitFor(() => expect(fetchA).toHaveBeenCalled());

    await act(async () => {
      await result.current.refreshAll();
    });

    expect(spy).toHaveBeenCalledWith(expect.stringContaining('2'), 'success');
  });

  it('refreshAll reports partial failure when a credential errors', async () => {
    fetchB.mockRejectedValue(new Error('nope'));
    const spy = vi.spyOn(useNotificationStore.getState(), 'showNotification');
    const files = [file('a.json', 'claude'), file('b.json', 'codex')];
    const { result } = renderHook(() => useQuotaDashboard(files, false, false));
    await waitFor(() => expect(fetchB).toHaveBeenCalled());

    await act(async () => {
      await result.current.refreshAll();
    });

    expect(spy).toHaveBeenLastCalledWith(expect.any(String), 'error');
  });

  it('refreshOne fetches a single credential and records its timestamp', async () => {
    const files = [file('a.json', 'claude'), file('b.json', 'codex')];
    const { result } = renderHook(() => useQuotaDashboard(files, false, false));
    await waitFor(() => expect(fetchA).toHaveBeenCalledTimes(1));
    fetchA.mockClear();

    await act(async () => {
      await result.current.refreshOne('claude:a.json');
    });

    expect(fetchA).toHaveBeenCalledTimes(1);
    expect(useQuotaStore.getState().quotaUpdatedAt['claude:a.json']).toBeTypeOf('number');
  });
});

describe('useQuotaDashboard auto-refresh', () => {
  it('re-polls on the configured interval when enabled', async () => {
    vi.useFakeTimers();
    try {
      const files = [file('a.json', 'claude')];
      const { result } = renderHook(() => useQuotaDashboard(files, false, false));
      await vi.advanceTimersByTimeAsync(0);
      const initialCalls = fetchA.mock.calls.length;

      act(() => {
        result.current.autoRefresh.setEnabled(true);
        result.current.autoRefresh.setIntervalMs(60_000);
      });

      await vi.advanceTimersByTimeAsync(60_000);
      expect(fetchA.mock.calls.length).toBeGreaterThan(initialCalls);
    } finally {
      vi.useRealTimers();
    }
  });
});
