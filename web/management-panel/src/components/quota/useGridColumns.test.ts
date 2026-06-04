/**
 * Behaviour tests for useGridColumns.
 *
 * The hook derives a column count from a measured container width and an item
 * min-width + gap, and recomputes on ResizeObserver callbacks. We drive it by
 * (1) stubbing element.clientWidth, (2) attaching the returned ref callback to a
 * real DOM node, and (3) replacing ResizeObserver with a controllable fake so we
 * can fire resize callbacks deterministically. Column counts are computed by
 * hand from the documented formula, never restated from the implementation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGridColumns } from './useGridColumns';

// A ResizeObserver fake that records its callback so a test can invoke it on
// demand, modelling a real container resize without a layout engine.
let latestResizeCallback: ResizeObserverCallback | null = null;
const observeSpy = vi.fn();
const disconnectSpy = vi.fn();

class FakeResizeObserver {
  constructor(callback: ResizeObserverCallback) {
    latestResizeCallback = callback;
  }
  observe = observeSpy;
  unobserve = vi.fn();
  disconnect = disconnectSpy;
}

const originalResizeObserver = globalThis.ResizeObserver;

// Build a detached div whose clientWidth getter returns a fixed value, so the
// hook's measurement is fully under test control.
const makeContainer = (clientWidth: number): HTMLDivElement => {
  const node = document.createElement('div');
  Object.defineProperty(node, 'clientWidth', {
    configurable: true,
    get: () => clientWidth,
  });
  return node;
};

beforeEach(() => {
  latestResizeCallback = null;
  observeSpy.mockClear();
  disconnectSpy.mockClear();
  globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
});

afterEach(() => {
  globalThis.ResizeObserver = originalResizeObserver;
});

describe('useGridColumns initial state', () => {
  it('returns 1 column before any element is attached', () => {
    const { result } = renderHook(() => useGridColumns(380));

    const [columns] = result.current;

    expect(columns).toBe(1);
  });

  it('returns a stable ref callback identity across re-renders', () => {
    const { result, rerender } = renderHook(() => useGridColumns(380));
    const firstRef = result.current[1];

    rerender();

    expect(result.current[1]).toBe(firstRef);
  });
});

describe('useGridColumns column math', () => {
  // expected = max(1, floor((width + gap) / max(1, itemMinWidth + gap)))
  // With itemMinWidth=380, gap=16 (defaults): divisor = 396.
  it.each([
    { width: 396, expected: 1 }, // floor((396+16)/396) = floor(1.04) = 1
    { width: 792, expected: 2 }, // floor((792+16)/396) = floor(2.04) = 2
    { width: 1188, expected: 3 }, // floor((1188+16)/396) = floor(3.04) = 3
    { width: 100, expected: 1 }, // floor((100+16)/396) = 0 -> clamped to 1
  ])(
    'computes $expected columns for container width $width with defaults',
    ({ width, expected }) => {
      const node = makeContainer(width);

      const { result } = renderHook(() => useGridColumns(380));
      act(() => {
        result.current[1](node);
      });

      expect(result.current[0]).toBe(expected);
    }
  );

  it('uses a custom gap when computing columns', () => {
    // itemMinWidth=200, gap=50 -> divisor=250. width=760: floor((760+50)/250)=3.
    const node = makeContainer(760);

    const { result } = renderHook(() => useGridColumns(200, 50));
    act(() => {
      result.current[1](node);
    });

    expect(result.current[0]).toBe(3);
  });

  it('clamps to a single column when the container is narrower than one item', () => {
    const node = makeContainer(50);

    const { result } = renderHook(() => useGridColumns(380));
    act(() => {
      result.current[1](node);
    });

    expect(result.current[0]).toBe(1);
  });
});

describe('useGridColumns divide-by-zero guard', () => {
  it('falls back to a divisor of 1 when itemMinWidth + gap is zero', () => {
    // itemMinWidth=-16, gap=16 -> effectiveItemWidth=0 -> guarded to 1.
    // count = floor((800 + 16) / 1) = 816, clamped only at the lower bound.
    const node = makeContainer(800);

    const { result } = renderHook(() => useGridColumns(-16, 16));
    act(() => {
      result.current[1](node);
    });

    expect(result.current[0]).toBe(816);
  });

  it('clamps to 1 column when itemMinWidth + gap is negative', () => {
    // effectiveItemWidth=-1 -> guarded to 1. count = floor((0 + 1) / 1) = 1.
    const node = makeContainer(0);

    const { result } = renderHook(() => useGridColumns(-2, 1));
    act(() => {
      result.current[1](node);
    });

    expect(result.current[0]).toBe(1);
  });
});

describe('useGridColumns ResizeObserver lifecycle', () => {
  it('observes the element after the ref callback attaches it', () => {
    const node = makeContainer(396);

    const { result } = renderHook(() => useGridColumns(380));
    act(() => {
      result.current[1](node);
    });

    expect(observeSpy).toHaveBeenCalledWith(node);
  });

  it('recomputes columns when the ResizeObserver callback fires after a width change', () => {
    let width = 396;
    const node = document.createElement('div');
    Object.defineProperty(node, 'clientWidth', {
      configurable: true,
      get: () => width,
    });

    const { result } = renderHook(() => useGridColumns(380));
    act(() => {
      result.current[1](node);
    });
    width = 1188;
    act(() => {
      latestResizeCallback?.([], {} as ResizeObserver);
    });

    expect(result.current[0]).toBe(3);
  });

  it('disconnects the observer when the element is detached via a null ref', () => {
    const node = makeContainer(396);
    const { result } = renderHook(() => useGridColumns(380));
    act(() => {
      result.current[1](node);
    });

    act(() => {
      result.current[1](null);
    });

    expect(disconnectSpy).toHaveBeenCalledTimes(1);
  });

  it('disconnects the observer on unmount', () => {
    const node = makeContainer(396);
    const { result, unmount } = renderHook(() => useGridColumns(380));
    act(() => {
      result.current[1](node);
    });

    unmount();

    expect(disconnectSpy).toHaveBeenCalledTimes(1);
  });
});
