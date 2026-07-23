import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@/test/utils';

import { useMediaQuery } from './useMediaQuery';

interface FakeMediaQueryList {
  media: string;
  matches: boolean;
  addEventListener: (type: 'change', listener: (event: MediaQueryListEvent) => void) => void;
  removeEventListener: (type: 'change', listener: (event: MediaQueryListEvent) => void) => void;
  emit: (matches: boolean) => void;
  listenerCount: () => number;
}

/**
 * Builds a controllable matchMedia stand-in. `getMatches(query)` decides the
 * initial match state per query; `emit` drives a synthetic `change` event so
 * tests can observe how the hook reacts to media changes.
 */
function installFakeMatchMedia(getMatches: (query: string) => boolean) {
  const lists = new Map<string, FakeMediaQueryList>();

  const factory = (query: string): MediaQueryList => {
    const listeners = new Set<(event: MediaQueryListEvent) => void>();
    const list: FakeMediaQueryList = {
      media: query,
      matches: getMatches(query),
      addEventListener: (_type, listener) => {
        listeners.add(listener);
      },
      removeEventListener: (_type, listener) => {
        listeners.delete(listener);
      },
      emit: (matches: boolean) => {
        list.matches = matches;
        listeners.forEach((listener) => listener({ matches } as MediaQueryListEvent));
      },
      listenerCount: () => listeners.size,
    };
    lists.set(query, list);
    return list as unknown as MediaQueryList;
  };

  window.matchMedia = factory as typeof window.matchMedia;

  return {
    get: (query: string) => lists.get(query),
  };
}

describe('useMediaQuery', () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    window.matchMedia = originalMatchMedia;
  });

  it('returns true when the query initially matches', () => {
    installFakeMatchMedia(() => true);

    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));

    expect(result.current).toBe(true);
  });

  it('returns false when the query initially does not match', () => {
    installFakeMatchMedia(() => false);

    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));

    expect(result.current).toBe(false);
  });

  it('updates to true when a change event reports a newly matching query', () => {
    const media = installFakeMatchMedia(() => false);
    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));

    act(() => {
      media.get('(min-width: 768px)')?.emit(true);
    });

    expect(result.current).toBe(true);
  });

  it('updates to false when a change event reports a query that stopped matching', () => {
    const media = installFakeMatchMedia(() => true);
    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));

    act(() => {
      media.get('(min-width: 768px)')?.emit(false);
    });

    expect(result.current).toBe(false);
  });

  it('reflects the latest match state after consecutive change events', () => {
    const media = installFakeMatchMedia(() => false);
    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));

    act(() => {
      media.get('(min-width: 768px)')?.emit(true);
    });
    act(() => {
      media.get('(min-width: 768px)')?.emit(false);
    });

    expect(result.current).toBe(false);
  });

  it('re-evaluates against the new query when the query string changes', () => {
    installFakeMatchMedia((query) => query === '(max-width: 600px)');
    const { result, rerender } = renderHook(({ query }) => useMediaQuery(query), {
      initialProps: { query: '(min-width: 768px)' },
    });

    rerender({ query: '(max-width: 600px)' });

    expect(result.current).toBe(true);
  });

  it('subscribes to the new query and ignores stale events from the previous query', () => {
    const media = installFakeMatchMedia(() => false);
    const { result, rerender } = renderHook(({ query }) => useMediaQuery(query), {
      initialProps: { query: '(min-width: 768px)' },
    });

    rerender({ query: '(max-width: 600px)' });
    act(() => {
      media.get('(min-width: 768px)')?.emit(true);
    });

    expect(result.current).toBe(false);
  });

  it('responds to change events on the new query after the query string changes', () => {
    const media = installFakeMatchMedia(() => false);
    const { result, rerender } = renderHook(({ query }) => useMediaQuery(query), {
      initialProps: { query: '(min-width: 768px)' },
    });

    rerender({ query: '(max-width: 600px)' });
    act(() => {
      media.get('(max-width: 600px)')?.emit(true);
    });

    expect(result.current).toBe(true);
  });

  it('removes its change listener from the previous query after the query changes', () => {
    const media = installFakeMatchMedia(() => false);
    const { rerender } = renderHook(({ query }) => useMediaQuery(query), {
      initialProps: { query: '(min-width: 768px)' },
    });

    rerender({ query: '(max-width: 600px)' });

    expect(media.get('(min-width: 768px)')?.listenerCount()).toBe(0);
  });

  it('removes its change listener on unmount', () => {
    const media = installFakeMatchMedia(() => false);
    const { unmount } = renderHook(() => useMediaQuery('(min-width: 768px)'));

    unmount();

    expect(media.get('(min-width: 768px)')?.listenerCount()).toBe(0);
  });

  it('ignores change events after the hook has unmounted', () => {
    const media = installFakeMatchMedia(() => false);
    const { result, unmount } = renderHook(() => useMediaQuery('(min-width: 768px)'));

    unmount();
    act(() => {
      media.get('(min-width: 768px)')?.emit(true);
    });

    expect(result.current).toBe(false);
  });
});
