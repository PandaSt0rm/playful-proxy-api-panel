import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@/test/utils';

import { useInterval } from './useInterval';

describe('useInterval', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not invoke the callback before the first interval elapses', () => {
    const callback = vi.fn();

    renderHook(() => useInterval(callback, 1000));
    act(() => {
      vi.advanceTimersByTime(999);
    });

    expect(callback).toHaveBeenCalledTimes(0);
  });

  it('invokes the callback once after a single interval elapses', () => {
    const callback = vi.fn();

    renderHook(() => useInterval(callback, 1000));
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('invokes the callback once per interval across multiple intervals', () => {
    const callback = vi.fn();

    renderHook(() => useInterval(callback, 1000));
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(callback).toHaveBeenCalledTimes(3);
  });

  it('never invokes the callback while the delay is null', () => {
    const callback = vi.fn();

    renderHook(() => useInterval(callback, null));
    act(() => {
      vi.advanceTimersByTime(10000);
    });

    expect(callback).toHaveBeenCalledTimes(0);
  });

  it('stops invoking the callback after the hook unmounts', () => {
    const callback = vi.fn();

    const { unmount } = renderHook(() => useInterval(callback, 1000));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    unmount();
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('invokes the latest callback when it is swapped without restarting the timer', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ cb }) => useInterval(cb, 1000), {
      initialProps: { cb: first },
    });

    rerender({ cb: second });
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(second).toHaveBeenCalledTimes(1);
  });

  it('does not invoke the superseded callback after it is replaced', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ cb }) => useInterval(cb, 1000), {
      initialProps: { cb: first },
    });

    rerender({ cb: second });
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(first).toHaveBeenCalledTimes(0);
  });

  it('preserves the timer phase when only the callback changes mid-interval', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ cb }) => useInterval(cb, 1000), {
      initialProps: { cb: first },
    });

    act(() => {
      vi.advanceTimersByTime(600);
    });
    rerender({ cb: second });
    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(second).toHaveBeenCalledTimes(1);
  });

  it('pauses the interval when the delay transitions from a number to null', () => {
    const callback = vi.fn();
    const { rerender } = renderHook(({ delay }) => useInterval(callback, delay), {
      initialProps: { delay: 1000 as number | null },
    });

    rerender({ delay: null });
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(callback).toHaveBeenCalledTimes(0);
  });

  it('resumes the interval when the delay transitions from null to a number', () => {
    const callback = vi.fn();
    const { rerender } = renderHook(({ delay }) => useInterval(callback, delay), {
      initialProps: { delay: null as number | null },
    });

    rerender({ delay: 1000 });
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('restarts the interval cadence when the delay value changes', () => {
    const callback = vi.fn();
    const { rerender } = renderHook(({ delay }) => useInterval(callback, delay), {
      initialProps: { delay: 1000 },
    });

    act(() => {
      vi.advanceTimersByTime(500);
    });
    rerender({ delay: 2000 });
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(callback).toHaveBeenCalledTimes(0);
  });

  it('fires on the new cadence after the delay value changes', () => {
    const callback = vi.fn();
    const { rerender } = renderHook(({ delay }) => useInterval(callback, delay), {
      initialProps: { delay: 1000 },
    });

    act(() => {
      vi.advanceTimersByTime(500);
    });
    rerender({ delay: 2000 });
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(callback).toHaveBeenCalledTimes(1);
  });
});
