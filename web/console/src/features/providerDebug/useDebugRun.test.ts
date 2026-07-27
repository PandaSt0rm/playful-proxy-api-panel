import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useDebugRun, type DebugJob } from './useDebugRun';
import type { DebugTrace } from './types';

const request = vi.fn();
vi.mock('@/services/api', () => ({
  apiCallApi: { request: (...args: unknown[]) => request(...args) },
  getApiCallErrorMessage: () => '',
  getApiErrorDetail: () => '',
}));

const trace = (id: string, status: DebugTrace['status'] = 'pass'): DebugTrace => ({
  id,
  checkId: 'auth',
  keyIndex: null,
  lane: 'direct',
  status,
  message: { key: 'provider_debug.result.key_accepted' },
  timing: { totalMs: 1, hops: [] },
});

/** A job that resolves after `delayMs`, recording concurrency as it goes. */
const buildJobs = (
  count: number,
  delayMs = 0,
  observer?: { inFlight: number; peak: number }
): DebugJob[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `job-${index}`,
    run: () =>
      new Promise<DebugTrace>((resolve) => {
        if (observer) {
          observer.inFlight += 1;
          observer.peak = Math.max(observer.peak, observer.inFlight);
        }
        setTimeout(() => {
          if (observer) observer.inFlight -= 1;
          resolve(trace(`job-${index}`));
        }, delayMs);
      }),
  }));

const settledIds = (states: Record<string, { status: string }>) =>
  Object.entries(states)
    .filter(([, state]) => state.status === 'settled')
    .map(([id]) => id);

beforeEach(() => request.mockReset());

describe('useDebugRun', () => {
  it('runs every job and settles each one', async () => {
    const { result } = renderHook(() => useDebugRun());

    act(() => result.current.run(buildJobs(3)));

    await waitFor(() => expect(result.current.running).toBe(false));
    expect(settledIds(result.current.states)).toEqual(['job-0', 'job-1', 'job-2']);
  });

  it('never exceeds the concurrency limit', async () => {
    const observer = { inFlight: 0, peak: 0 };
    const { result } = renderHook(() => useDebugRun());

    act(() => result.current.run(buildJobs(10, 5, observer)));

    await waitFor(() => expect(result.current.running).toBe(false), { timeout: 3000 });
    expect(settledIds(result.current.states)).toHaveLength(10);
    expect(observer.peak).toBeLessThanOrEqual(4);
  });

  it('does not start running for an empty job list', () => {
    const { result } = renderHook(() => useDebugRun());

    act(() => result.current.run([]));

    expect(result.current.running).toBe(false);
    expect(result.current.states).toEqual({});
  });

  it('marks every job pending before any of them resolve', async () => {
    const { result } = renderHook(() => useDebugRun());

    act(() => result.current.run(buildJobs(6, 200)));

    expect(Object.keys(result.current.states)).toHaveLength(6);
    await waitFor(() => expect(result.current.running).toBe(true));
  });

  it('cancels in-flight work without reporting it as a provider failure', async () => {
    const { result } = renderHook(() => useDebugRun());

    act(() => result.current.run(buildJobs(4, 200)));
    await waitFor(() => expect(result.current.running).toBe(true));
    act(() => result.current.cancel());

    expect(result.current.running).toBe(false);
    expect(Object.values(result.current.states).every((state) => state.status !== 'running')).toBe(
      true
    );
  });

  it('keeps results that already settled when the run is cancelled', async () => {
    const { result } = renderHook(() => useDebugRun());

    act(() => result.current.run(buildJobs(1)));
    await waitFor(() => expect(settledIds(result.current.states)).toHaveLength(1));
    act(() => result.current.cancel());

    expect(settledIds(result.current.states)).toEqual(['job-0']);
  });

  it('clears everything on reset, so a new run starts from a blank rail', async () => {
    const { result } = renderHook(() => useDebugRun());

    act(() => result.current.run(buildJobs(2)));
    await waitFor(() => expect(result.current.running).toBe(false));
    act(() => result.current.reset());

    expect(result.current.states).toEqual({});
    expect(result.current.running).toBe(false);
  });

  it('discards a superseded run so its results cannot overwrite the newer one', async () => {
    const { result } = renderHook(() => useDebugRun());

    act(() => result.current.run(buildJobs(2, 50)));
    act(() =>
      result.current.run([{ id: 'fresh', run: () => Promise.resolve(trace('fresh')) }])
    );

    await waitFor(() => expect(result.current.running).toBe(false), { timeout: 3000 });
    expect(Object.keys(result.current.states)).toEqual(['fresh']);
  });

  it('aborts outstanding requests when the bench unmounts', async () => {
    let captured: AbortSignal | undefined;
    const { result, unmount } = renderHook(() => useDebugRun());

    act(() =>
      result.current.run([
        {
          id: 'slow',
          run: (deps) => {
            captured = deps.signal;
            return new Promise<DebugTrace>((resolve) =>
              setTimeout(() => resolve(trace('slow')), 200)
            );
          },
        },
      ])
    );

    await waitFor(() => expect(captured).toBeDefined());
    expect(captured?.aborted).toBe(false);
    unmount();
    expect(captured?.aborted).toBe(true);
  });
});
