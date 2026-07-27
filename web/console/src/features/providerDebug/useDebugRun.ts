/**
 * Bounded-concurrency executor for the provider debug bench.
 *
 * Jobs run through a small worker pool rather than `Promise.all`: the inline test this
 * replaces fans out unbounded across every key, which is tolerable for one request and is
 * not tolerable once a run covers several billable checks per key per model.
 *
 * The hook knows nothing about checks or matrices — callers hand it opaque jobs. That keeps
 * one executor behind both the rail and the matrix instead of two copies of the same
 * cancel-and-supersede logic.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiCallApi } from '@/services/api';
import type { DirectRunnerDeps } from './directRunner';
import type { DebugTrace, DebugUnitState } from './types';

/** Simultaneous upstream calls. Low enough to stay polite to rate-limited providers. */
const CONCURRENCY = 4;

export interface DebugJob {
  id: string;
  run: (deps: DirectRunnerDeps) => Promise<DebugTrace>;
}

export interface DebugRunController {
  states: Record<string, DebugUnitState>;
  running: boolean;
  run: (jobs: readonly DebugJob[]) => void;
  cancel: () => void;
  reset: () => void;
}

export function useDebugRun(): DebugRunController {
  const [states, setStates] = useState<Record<string, DebugUnitState>>({});
  const [running, setRunning] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  // Guards against a superseded run writing results over a newer one.
  const runSeqRef = useRef(0);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    runSeqRef.current += 1;
    setRunning(false);
    // Settled results stay; anything still in flight returns to pending rather than being
    // reported as a failure the provider never caused.
    setStates((previous) =>
      Object.fromEntries(
        Object.entries(previous).map(([id, state]) => [
          id,
          state.status === 'settled' ? state : { status: 'pending' },
        ])
      )
    );
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    runSeqRef.current += 1;
    setRunning(false);
    setStates({});
  }, []);

  // An unmounting drawer must not leave requests in flight writing into dead state.
  useEffect(() => () => abortRef.current?.abort(), []);

  const run = useCallback((jobs: readonly DebugJob[]) => {
    abortRef.current?.abort();

    const controller = new AbortController();
    abortRef.current = controller;
    runSeqRef.current += 1;
    const runSeq = runSeqRef.current;

    setStates(
      Object.fromEntries(jobs.map((job) => [job.id, { status: 'pending' } as DebugUnitState]))
    );

    if (!jobs.length) {
      setRunning(false);
      return;
    }
    setRunning(true);

    const deps: DirectRunnerDeps = {
      request: apiCallApi.request,
      now: () => performance.now(),
      signal: controller.signal,
    };
    const queue = [...jobs];
    const isStale = () => controller.signal.aborted || runSeqRef.current !== runSeq;

    const worker = async () => {
      for (;;) {
        const job = queue.shift();
        if (!job || isStale()) return;

        setStates((previous) => ({ ...previous, [job.id]: { status: 'running' } }));
        const trace = await job.run(deps);
        if (isStale()) return;
        setStates((previous) => ({ ...previous, [job.id]: { status: 'settled', trace } }));
      }
    };

    const workers = Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, worker);
    void Promise.all(workers).then(() => {
      if (runSeqRef.current === runSeq) setRunning(false);
    });
  }, []);

  return { states, running, run, cancel, reset };
}
