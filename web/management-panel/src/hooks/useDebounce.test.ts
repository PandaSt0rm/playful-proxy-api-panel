import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@/test/utils';

import { useDebounce } from './useDebounce';

describe('useDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the initial value immediately before any delay elapses', () => {
    const { result } = renderHook(() => useDebounce('initial', 500));

    expect(result.current).toBe('initial');
  });

  it('keeps returning the previous value until the full delay has elapsed', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 500), {
      initialProps: { value: 'a' },
    });

    rerender({ value: 'b' });
    act(() => {
      vi.advanceTimersByTime(499);
    });

    expect(result.current).toBe('a');
  });

  it('updates to the new value exactly when the delay elapses', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 500), {
      initialProps: { value: 'a' },
    });

    rerender({ value: 'b' });
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(result.current).toBe('b');
  });

  it('only surfaces the last value when the value changes rapidly within one delay window', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 500), {
      initialProps: { value: 'a' },
    });

    rerender({ value: 'b' });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    rerender({ value: 'c' });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current).toBe('a');
  });

  it('settles on the final value after the delay following the last rapid change', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 500), {
      initialProps: { value: 'a' },
    });

    rerender({ value: 'b' });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    rerender({ value: 'c' });
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(result.current).toBe('c');
  });

  it('uses the default delay of 500ms when no delay is provided', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value), {
      initialProps: { value: 'a' },
    });

    rerender({ value: 'b' });
    act(() => {
      vi.advanceTimersByTime(499);
    });

    expect(result.current).toBe('a');
  });

  it('applies the default delay update once 500ms has fully elapsed', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value), {
      initialProps: { value: 'a' },
    });

    rerender({ value: 'b' });
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(result.current).toBe('b');
  });

  it('updates immediately on the next tick when delay is zero', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 0), {
      initialProps: { value: 'a' },
    });

    rerender({ value: 'b' });
    act(() => {
      vi.advanceTimersByTime(0);
    });

    expect(result.current).toBe('b');
  });

  it('debounces numeric values using the same delay semantics', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 200), {
      initialProps: { value: 1 },
    });

    rerender({ value: 2 });
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(result.current).toBe(2);
  });

  it('debounces object values and surfaces the latest reference after the delay', () => {
    const first = { id: 1 };
    const second = { id: 2 };
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 100), {
      initialProps: { value: first },
    });

    rerender({ value: second });
    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(result.current).toBe(second);
  });

  it('restarts the debounce window when only the delay changes', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'a', delay: 500 } }
    );

    rerender({ value: 'b', delay: 1000 });
    act(() => {
      vi.advanceTimersByTime(999);
    });

    expect(result.current).toBe('a');
  });

  it('emits the pending value once the newly extended delay elapses', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'a', delay: 500 } }
    );

    rerender({ value: 'b', delay: 1000 });
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current).toBe('b');
  });
});
