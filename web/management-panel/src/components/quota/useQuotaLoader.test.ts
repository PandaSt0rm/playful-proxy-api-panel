/**
 * Behaviour tests for useQuotaLoader.
 *
 * The hook orchestrates a batch quota fetch: it flips a loading callback, writes
 * per-target loading/success/error states into the zustand quota store via a
 * config-provided setter, and drops stale results using an internal request id.
 * We use the real useQuotaStore (reset per test) as the observable sink and a
 * fake QuotaConfig whose fetchQuota is a controllable mock so success, error,
 * concurrency, and staleness paths are deterministic. We assert the resulting
 * store state and setLoading calls, never internal call order.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { TFunction } from 'i18next';
import { useQuotaLoader } from './useQuotaLoader';
import type { QuotaConfig } from './quotaConfigs';
import { useQuotaStore } from '@/stores';
import type { AuthFileItem, CodexQuotaState } from '@/types';

// Minimal data + state shapes that exercise the generic loader through the real
// codexQuota store slice. buildSuccessState echoes the planType so we can assert
// the fetched value flowed through to the store unchanged.
interface FakeData {
  planType: string;
}

const makeConfig = (
  fetchQuota: (file: AuthFileItem, t: TFunction) => Promise<FakeData>
): QuotaConfig<CodexQuotaState, FakeData> => ({
  type: 'codex',
  i18nPrefix: 'codex_quota',
  filterFn: () => true,
  fetchQuota,
  storeSelector: (state) => state.codexQuota,
  storeSetter: 'setCodexQuota',
  buildLoadingState: () => ({ status: 'loading', windows: [] }),
  buildSuccessState: (data) => ({ status: 'success', windows: [], planType: data.planType }),
  buildErrorState: (message, status) => ({
    status: 'error',
    windows: [],
    error: message,
    errorStatus: status,
  }),
  cardClassName: '',
  controlsClassName: '',
  controlClassName: '',
  gridClassName: '',
  renderQuotaItems: () => null,
});

const fileA: AuthFileItem = { name: 'a.json', type: 'codex' };
const fileB: AuthFileItem = { name: 'b.json', type: 'codex' };

const statusErr = (message: string, status: number): Error & { status: number } =>
  Object.assign(new Error(message), { status });

beforeEach(() => {
  useQuotaStore.setState({
    antigravityQuota: {},
    claudeQuota: {},
    codexQuota: {},
    geminiCliQuota: {},
    kimiQuota: {},
    zaiQuota: {},
  });
});

describe('useQuotaLoader success path', () => {
  it('writes a success state with the fetched data for each target', async () => {
    const fetchQuota = vi.fn(async (file: AuthFileItem) => ({ planType: `plan-${file.name}` }));
    const { result } = renderHook(() => useQuotaLoader(makeConfig(fetchQuota)));
    const setLoading = vi.fn();

    await act(async () => {
      await result.current.loadQuota([fileA, fileB], 'page', setLoading);
    });

    expect(useQuotaStore.getState().codexQuota).toEqual({
      'a.json': { status: 'success', windows: [], planType: 'plan-a.json' },
      'b.json': { status: 'success', windows: [], planType: 'plan-b.json' },
    });
  });

  it('toggles the loading callback on at the start and off at the end', async () => {
    const fetchQuota = vi.fn(async () => ({ planType: 'p' }));
    const { result } = renderHook(() => useQuotaLoader(makeConfig(fetchQuota)));
    const setLoading = vi.fn();

    await act(async () => {
      await result.current.loadQuota([fileA], 'all', setLoading);
    });

    expect(setLoading.mock.calls).toEqual([
      [true, 'all'],
      [false],
    ]);
  });

  it('calls fetchQuota once per target', async () => {
    const fetchQuota = vi.fn(async () => ({ planType: 'p' }));
    const { result } = renderHook(() => useQuotaLoader(makeConfig(fetchQuota)));

    await act(async () => {
      await result.current.loadQuota([fileA, fileB], 'page', vi.fn());
    });

    expect(fetchQuota).toHaveBeenCalledTimes(2);
  });
});

describe('useQuotaLoader error path', () => {
  it('writes an error state with the thrown message and status', async () => {
    const fetchQuota = vi.fn(async () => {
      throw statusErr('upstream down', 503);
    });
    const { result } = renderHook(() => useQuotaLoader(makeConfig(fetchQuota)));

    await act(async () => {
      await result.current.loadQuota([fileA], 'page', vi.fn());
    });

    expect(useQuotaStore.getState().codexQuota['a.json']).toEqual({
      status: 'error',
      windows: [],
      error: 'upstream down',
      errorStatus: 503,
    });
  });

  it('records each target independently when one succeeds and one fails', async () => {
    const fetchQuota = vi.fn(async (file: AuthFileItem) => {
      if (file.name === 'b.json') throw statusErr('forbidden', 403);
      return { planType: 'ok' };
    });
    const { result } = renderHook(() => useQuotaLoader(makeConfig(fetchQuota)));

    await act(async () => {
      await result.current.loadQuota([fileA, fileB], 'page', vi.fn());
    });

    const state = useQuotaStore.getState().codexQuota;
    expect(state).toEqual({
      'a.json': { status: 'success', windows: [], planType: 'ok' },
      'b.json': { status: 'error', windows: [], error: 'forbidden', errorStatus: 403 },
    });
  });

  it('uses the unknown-error fallback message when a non-Error value is thrown', async () => {
    const fetchQuota = vi.fn(async () => {
      throw 'string failure';
    });
    const { result } = renderHook(() => useQuotaLoader(makeConfig(fetchQuota)));

    await act(async () => {
      await result.current.loadQuota([fileA], 'page', vi.fn());
    });

    expect(useQuotaStore.getState().codexQuota['a.json']).toEqual({
      status: 'error',
      windows: [],
      error: 'Unknown error',
      errorStatus: undefined,
    });
  });

  it('still turns the loading callback off after a fetch failure', async () => {
    const fetchQuota = vi.fn(async () => {
      throw new Error('nope');
    });
    const { result } = renderHook(() => useQuotaLoader(makeConfig(fetchQuota)));
    const setLoading = vi.fn();

    await act(async () => {
      await result.current.loadQuota([fileA], 'page', setLoading);
    });

    expect(setLoading).toHaveBeenLastCalledWith(false);
  });
});

describe('useQuotaLoader empty targets', () => {
  it('does not write any quota state when targets is empty', async () => {
    const fetchQuota = vi.fn(async () => ({ planType: 'p' }));
    const { result } = renderHook(() => useQuotaLoader(makeConfig(fetchQuota)));

    await act(async () => {
      await result.current.loadQuota([], 'page', vi.fn());
    });

    expect(useQuotaStore.getState().codexQuota).toEqual({});
  });

  it('does not invoke fetchQuota when targets is empty', async () => {
    const fetchQuota = vi.fn(async () => ({ planType: 'p' }));
    const { result } = renderHook(() => useQuotaLoader(makeConfig(fetchQuota)));

    await act(async () => {
      await result.current.loadQuota([], 'page', vi.fn());
    });

    expect(fetchQuota).not.toHaveBeenCalled();
  });

  it('still toggles the loading callback on and off for an empty batch', async () => {
    const fetchQuota = vi.fn(async () => ({ planType: 'p' }));
    const { result } = renderHook(() => useQuotaLoader(makeConfig(fetchQuota)));
    const setLoading = vi.fn();

    await act(async () => {
      await result.current.loadQuota([], 'page', setLoading);
    });

    expect(setLoading.mock.calls).toEqual([
      [true, 'page'],
      [false],
    ]);
  });
});

describe('useQuotaLoader concurrency guard', () => {
  it('ignores a second loadQuota call while the first is in flight', async () => {
    let resolveFirst: ((value: FakeData) => void) | undefined;
    const firstFetch = vi.fn(
      () =>
        new Promise<FakeData>((resolve) => {
          resolveFirst = resolve;
        })
    );
    const { result } = renderHook(() => useQuotaLoader(makeConfig(firstFetch)));
    const setLoadingFirst = vi.fn();
    const setLoadingSecond = vi.fn();

    let firstCall: Promise<void> = Promise.resolve();
    act(() => {
      firstCall = result.current.loadQuota([fileA], 'page', setLoadingFirst);
    });
    // Second call must be a no-op while the first is unresolved.
    await act(async () => {
      await result.current.loadQuota([fileB], 'page', setLoadingSecond);
    });
    await act(async () => {
      resolveFirst?.({ planType: 'done' });
      await firstCall;
    });

    expect(setLoadingSecond).not.toHaveBeenCalled();
    expect(firstFetch).toHaveBeenCalledTimes(1);
  });

  it('allows a fresh loadQuota call after the previous one completes', async () => {
    const fetchQuota = vi.fn(async (file: AuthFileItem) => ({ planType: file.name }));
    const { result } = renderHook(() => useQuotaLoader(makeConfig(fetchQuota)));

    await act(async () => {
      await result.current.loadQuota([fileA], 'page', vi.fn());
    });
    await act(async () => {
      await result.current.loadQuota([fileB], 'page', vi.fn());
    });

    expect(fetchQuota).toHaveBeenCalledTimes(2);
  });
});

describe('useQuotaLoader return value', () => {
  it('exposes the current quota store slice via the selector', async () => {
    const fetchQuota = vi.fn(async () => ({ planType: 'p' }));
    const { result, rerender } = renderHook(() => useQuotaLoader(makeConfig(fetchQuota)));

    await act(async () => {
      await result.current.loadQuota([fileA], 'page', vi.fn());
    });
    rerender();

    expect(result.current.quota['a.json']).toEqual({
      status: 'success',
      windows: [],
      planType: 'p',
    });
  });
});
