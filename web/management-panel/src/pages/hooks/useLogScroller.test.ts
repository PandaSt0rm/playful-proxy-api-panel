import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { Dispatch, SetStateAction, UIEvent } from 'react';
import { isNearBottom, useLogScroller } from './useLogScroller';
import type { LogState } from './logTypes';

// jsdom does not lay out, so build a div whose scroll geometry is fully
// controllable. scrollTop is writable (the hook assigns to it); the rest are
// fixed via defineProperty getters.
const makeNode = (geometry: {
  scrollHeight: number;
  clientHeight: number;
  scrollTop: number;
}): HTMLDivElement => {
  const node = document.createElement('div');
  let scrollTop = geometry.scrollTop;
  Object.defineProperty(node, 'scrollHeight', { configurable: true, get: () => geometry.scrollHeight });
  Object.defineProperty(node, 'clientHeight', { configurable: true, get: () => geometry.clientHeight });
  Object.defineProperty(node, 'scrollTop', {
    configurable: true,
    get: () => scrollTop,
    set: (value: number) => {
      scrollTop = value;
    },
  });
  return node;
};

interface ScrollerProps {
  logState: LogState;
  setLogState: Dispatch<SetStateAction<LogState>>;
  loading: boolean;
  isSearching: boolean;
  filteredLineCount: number;
  hasStructuredFilters: boolean;
  showRawLogs: boolean;
}

const baseProps = (overrides: Partial<ScrollerProps> = {}): ScrollerProps => ({
  logState: { buffer: [], visibleFrom: 0 },
  setLogState: vi.fn(),
  loading: false,
  isSearching: false,
  filteredLineCount: 0,
  hasStructuredFilters: false,
  showRawLogs: false,
  ...overrides,
});

const scrollEvent = {} as UIEvent<HTMLDivElement>;

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('isNearBottom', () => {
  it('returns true when the node is null', () => {
    expect(isNearBottom(null)).toBe(true);
  });

  it('returns true when the remaining scroll distance is within the threshold', () => {
    const node = makeNode({ scrollHeight: 1000, clientHeight: 500, scrollTop: 480 });

    expect(isNearBottom(node)).toBe(true);
  });

  it('returns true exactly at the 24px threshold boundary', () => {
    const node = makeNode({ scrollHeight: 1000, clientHeight: 500, scrollTop: 476 });

    expect(isNearBottom(node)).toBe(true);
  });

  it('returns false when the remaining scroll distance exceeds the threshold', () => {
    const node = makeNode({ scrollHeight: 1000, clientHeight: 500, scrollTop: 475 });

    expect(isNearBottom(node)).toBe(false);
  });
});

describe('useLogScroller canLoadMore', () => {
  it('is false when not searching but no lines are hidden above', () => {
    const { result } = renderHook((props: ScrollerProps) => useLogScroller(props), {
      initialProps: baseProps({ logState: { buffer: ['a'], visibleFrom: 0 } }),
    });

    expect(result.current.canLoadMore).toBe(false);
  });

  it('is true when not searching and lines are hidden above', () => {
    const { result } = renderHook((props: ScrollerProps) => useLogScroller(props), {
      initialProps: baseProps({ logState: { buffer: ['a', 'b'], visibleFrom: 1 } }),
    });

    expect(result.current.canLoadMore).toBe(true);
  });

  it('is false while searching even when lines are hidden above', () => {
    const { result } = renderHook((props: ScrollerProps) => useLogScroller(props), {
      initialProps: baseProps({ isSearching: true, logState: { buffer: ['a', 'b'], visibleFrom: 1 } }),
    });

    expect(result.current.canLoadMore).toBe(false);
  });
});

describe('useLogScroller scrollToBottom', () => {
  it('sets scrollTop to scrollHeight when a node is attached', () => {
    const node = makeNode({ scrollHeight: 1234, clientHeight: 400, scrollTop: 0 });
    const { result } = renderHook(() => useLogScroller(baseProps()));
    result.current.logViewerRef.current = node;

    act(() => {
      result.current.scrollToBottom();
    });

    expect(node.scrollTop).toBe(1234);
  });
});

describe('useLogScroller handleLogScroll prepend behavior', () => {
  it('loads 200 more hidden lines when scrolled to the top with more available', () => {
    const setLogState = vi.fn();
    const node = makeNode({ scrollHeight: 2000, clientHeight: 500, scrollTop: 10 });
    const { result } = renderHook(() =>
      useLogScroller(baseProps({ setLogState, logState: { buffer: [], visibleFrom: 500 } }))
    );
    result.current.logViewerRef.current = node;

    act(() => {
      result.current.handleLogScroll(scrollEvent);
    });
    const updater = setLogState.mock.calls[0][0] as (prev: LogState) => LogState;

    expect(updater({ buffer: [], visibleFrom: 500 })).toEqual({ buffer: [], visibleFrom: 300 });
  });

  it('clamps the new visibleFrom at zero when fewer than 200 lines are hidden', () => {
    const setLogState = vi.fn();
    const node = makeNode({ scrollHeight: 2000, clientHeight: 500, scrollTop: 10 });
    const { result } = renderHook(() =>
      useLogScroller(baseProps({ setLogState, logState: { buffer: [], visibleFrom: 50 } }))
    );
    result.current.logViewerRef.current = node;

    act(() => {
      result.current.handleLogScroll(scrollEvent);
    });
    const updater = setLogState.mock.calls[0][0] as (prev: LogState) => LogState;

    expect(updater({ buffer: [], visibleFrom: 50 })).toEqual({ buffer: [], visibleFrom: 0 });
  });

  it('does not prepend when the scroll position is below the load-more threshold', () => {
    const setLogState = vi.fn();
    const node = makeNode({ scrollHeight: 2000, clientHeight: 500, scrollTop: 73 });
    const { result } = renderHook(() =>
      useLogScroller(baseProps({ setLogState, logState: { buffer: [], visibleFrom: 500 } }))
    );
    result.current.logViewerRef.current = node;

    act(() => {
      result.current.handleLogScroll(scrollEvent);
    });

    expect(setLogState).not.toHaveBeenCalled();
  });

  it('does not prepend when searching is active', () => {
    const setLogState = vi.fn();
    const node = makeNode({ scrollHeight: 2000, clientHeight: 500, scrollTop: 0 });
    const { result } = renderHook(() =>
      useLogScroller(
        baseProps({ setLogState, isSearching: true, logState: { buffer: [], visibleFrom: 500 } })
      )
    );
    result.current.logViewerRef.current = node;

    act(() => {
      result.current.handleLogScroll(scrollEvent);
    });

    expect(setLogState).not.toHaveBeenCalled();
  });

  it('does not prepend when no lines are hidden above', () => {
    const setLogState = vi.fn();
    const node = makeNode({ scrollHeight: 2000, clientHeight: 500, scrollTop: 0 });
    const { result } = renderHook(() =>
      useLogScroller(baseProps({ setLogState, logState: { buffer: [], visibleFrom: 0 } }))
    );
    result.current.logViewerRef.current = node;

    act(() => {
      result.current.handleLogScroll(scrollEvent);
    });

    expect(setLogState).not.toHaveBeenCalled();
  });

  it('does nothing when no node is attached to the viewer ref', () => {
    const setLogState = vi.fn();
    const { result } = renderHook(() =>
      useLogScroller(baseProps({ setLogState, logState: { buffer: [], visibleFrom: 500 } }))
    );

    act(() => {
      result.current.handleLogScroll(scrollEvent);
    });

    expect(setLogState).not.toHaveBeenCalled();
  });
});
