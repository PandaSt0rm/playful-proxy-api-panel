import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { renderHook } from '@testing-library/react';
import { type RefObject } from 'react';
import { useSplashTitleFit } from './useSplashTitleFit';

const DEFAULT_VARIABLE = '--splash-title-size';

// --- Deterministic requestAnimationFrame -----------------------------------
// The hook schedules its fit pass via rAF. We capture the callbacks so the
// test decides exactly when (and whether) a fit pass runs.
let rafCallbacks: Map<number, FrameRequestCallback>;
let rafSpy: MockInstance;
let cafSpy: MockInstance;

const flushFrames = () => {
  const pending = [...rafCallbacks.entries()];
  rafCallbacks.clear();
  for (const [, cb] of pending) {
    cb(performance.now());
  }
};

// --- Controllable ResizeObserver -------------------------------------------
let resizeObservers: Array<{ callback: ResizeObserverCallback; targets: Element[] }>;
class TestResizeObserver {
  private readonly entry: { callback: ResizeObserverCallback; targets: Element[] };
  constructor(callback: ResizeObserverCallback) {
    this.entry = { callback, targets: [] };
    resizeObservers.push(this.entry);
  }
  observe(target: Element) {
    this.entry.targets.push(target);
  }
  unobserve() {}
  disconnect() {
    this.entry.targets = [];
  }
}

const triggerResize = () => {
  for (const obs of resizeObservers) {
    obs.callback([], obs as unknown as ResizeObserver);
  }
};

// --- Element model ----------------------------------------------------------
// jsdom does no layout, so we model scrollWidth as a linear function of the
// font size the hook last wrote into the CSS variable: scrollWidth = round(font * k).
// container.clientWidth is the width budget; height always fits unless stated.
type ElementModel = {
  container: HTMLElement;
  title: HTMLElement;
  parent: HTMLElement | null;
};

function makeElements(opts: {
  widthLimit: number;
  k: number;
  variableName?: string;
  parentHeight?: number;
  withParent?: boolean;
}): ElementModel {
  const variableName = opts.variableName ?? DEFAULT_VARIABLE;
  const container = document.createElement('div');
  const title = document.createElement('span');
  container.appendChild(title);

  Object.defineProperty(container, 'clientWidth', {
    get: () => opts.widthLimit,
    configurable: true,
  });
  Object.defineProperty(container, 'scrollHeight', { get: () => 0, configurable: true });
  Object.defineProperty(title, 'scrollWidth', {
    get: () => {
      const raw = title.style.getPropertyValue(variableName);
      const font = Number.parseFloat(raw);
      return Number.isNaN(font) ? 0 : Math.round(font * opts.k);
    },
    configurable: true,
  });

  let parent: HTMLElement | null = null;
  if (opts.withParent !== false) {
    parent = document.createElement('div');
    Object.defineProperty(parent, 'clientHeight', {
      get: () => opts.parentHeight ?? 100000,
      configurable: true,
    });
    parent.appendChild(container);
  }

  return { container, title, parent };
}

const refTo = <T extends HTMLElement>(el: T | null): RefObject<T | null> => ({ current: el });

const readFontSize = (title: HTMLElement, variableName = DEFAULT_VARIABLE): number =>
  Number.parseFloat(title.style.getPropertyValue(variableName));

beforeEach(() => {
  rafCallbacks = new Map();
  resizeObservers = [];
  let nextId = 1;
  rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
    const id = nextId;
    nextId += 1;
    rafCallbacks.set(id, cb);
    return id;
  });
  cafSpy = vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation((id) => {
    rafCallbacks.delete(id);
  });
  vi.stubGlobal('ResizeObserver', TestResizeObserver);
});

let fontsDescriptor: PropertyDescriptor | undefined;

afterEach(() => {
  rafSpy.mockRestore();
  cafSpy.mockRestore();
  vi.unstubAllGlobals();
  if (fontsDescriptor) {
    Object.defineProperty(document, 'fonts', fontsDescriptor);
  } else {
    Reflect.deleteProperty(document as unknown as Record<string, unknown>, 'fonts');
  }
  fontsDescriptor = undefined;
});

const stubFontsReady = (ready: Promise<unknown>) => {
  fontsDescriptor =
    Object.getOwnPropertyDescriptor(document, 'fonts') ??
    Object.getOwnPropertyDescriptor(Document.prototype, 'fonts');
  Object.defineProperty(document, 'fonts', { value: { ready }, configurable: true });
};

describe('useSplashTitleFit — binary-search fit result', () => {
  it('does nothing before the scheduled frame runs (no font size written yet)', () => {
    const { container, title, parent } = makeElements({ widthLimit: 9999, k: 1 });
    renderHook(() =>
      useSplashTitleFit(refTo(container), refTo(title), 'key', {
        minFontSize: 10,
        maxFontSize: 100,
      })
    );

    void parent;

    expect(title.style.getPropertyValue(DEFAULT_VARIABLE)).toBe('');
  });

  it('converges toward the max size when the title always fits the width', () => {
    const { container, title } = makeElements({ widthLimit: 9999, k: 0 });
    renderHook(() =>
      useSplashTitleFit(refTo(container), refTo(title), 'key', {
        minFontSize: 10,
        maxFontSize: 100,
      })
    );

    flushFrames();

    expect(readFontSize(title)).toBe(99);
  });

  it('falls back to the floor of the min size when nothing fits the width', () => {
    const { container, title } = makeElements({ widthLimit: 0, k: 1000 });
    renderHook(() =>
      useSplashTitleFit(refTo(container), refTo(title), 'key', {
        minFontSize: 10,
        maxFontSize: 100,
      })
    );

    flushFrames();

    expect(readFontSize(title)).toBe(10);
  });

  it('lands on the largest fitting integer at a width boundary', () => {
    const { container, title } = makeElements({ widthLimit: 49, k: 1 });
    renderHook(() =>
      useSplashTitleFit(refTo(container), refTo(title), 'key', {
        minFontSize: 10,
        maxFontSize: 100,
      })
    );

    flushFrames();

    expect(readFontSize(title)).toBe(50);
  });

  it('uses the default size bounds when no options are provided', () => {
    const { container, title } = makeElements({ widthLimit: 9999, k: 0 });
    renderHook(() => useSplashTitleFit(refTo(container), refTo(title), 'key'));

    flushFrames();

    expect(readFontSize(title)).toBe(117);
  });

  it('writes the computed size to a custom CSS variable name', () => {
    const { container, title } = makeElements({
      widthLimit: 9999,
      k: 0,
      variableName: '--custom-size',
    });
    renderHook(() =>
      useSplashTitleFit(refTo(container), refTo(title), 'key', {
        minFontSize: 10,
        maxFontSize: 100,
        variableName: '--custom-size',
      })
    );

    flushFrames();

    expect(readFontSize(title, '--custom-size')).toBe(99);
  });

  it('shrinks the title when the parent height is the limiting dimension', () => {
    const { container, title, parent } = makeElements({ widthLimit: 9999, k: 0, parentHeight: 5 });
    // Height becomes the constraint: model container.scrollHeight from font size.
    Object.defineProperty(container, 'scrollHeight', {
      get: () => {
        const font = Number.parseFloat(title.style.getPropertyValue(DEFAULT_VARIABLE));
        return Number.isNaN(font) ? 0 : Math.round(font);
      },
      configurable: true,
    });
    void parent;
    renderHook(() =>
      useSplashTitleFit(refTo(container), refTo(title), 'key', { minFontSize: 1, maxFontSize: 20 })
    );

    flushFrames();

    // Height limit 5 (+1 tolerance): largest fitting integer is 6.
    expect(readFontSize(title)).toBe(6);
  });
});

describe('useSplashTitleFit — guards and scheduling', () => {
  it('does not schedule a frame when the container ref is null', () => {
    const { title } = makeElements({ widthLimit: 100, k: 1 });
    renderHook(() => useSplashTitleFit(refTo(null), refTo(title), 'key'));

    expect(rafSpy).not.toHaveBeenCalled();
  });

  it('does not schedule a frame when the title ref is null', () => {
    const { container } = makeElements({ widthLimit: 100, k: 1 });
    renderHook(() => useSplashTitleFit(refTo(container), refTo(null), 'key'));

    expect(rafSpy).not.toHaveBeenCalled();
  });

  it('schedules exactly one frame on mount', () => {
    const { container, title } = makeElements({ widthLimit: 100, k: 1 });
    renderHook(() => useSplashTitleFit(refTo(container), refTo(title), 'key'));

    expect(rafSpy).toHaveBeenCalledTimes(1);
  });

  it('re-runs the fit when the dependency key changes', () => {
    const { container, title } = makeElements({ widthLimit: 9999, k: 0 });
    const { rerender } = renderHook(
      ({ depKey }: { depKey: string }) =>
        useSplashTitleFit(refTo(container), refTo(title), depKey, {
          minFontSize: 10,
          maxFontSize: 100,
        }),
      { initialProps: { depKey: 'a' } }
    );
    flushFrames();
    title.style.removeProperty(DEFAULT_VARIABLE);

    rerender({ depKey: 'b' });
    flushFrames();

    expect(readFontSize(title)).toBe(99);
  });

  it('re-fits when an observed element resizes', () => {
    const { container, title } = makeElements({ widthLimit: 9999, k: 0 });
    renderHook(() =>
      useSplashTitleFit(refTo(container), refTo(title), 'key', {
        minFontSize: 10,
        maxFontSize: 100,
      })
    );
    flushFrames();
    title.style.removeProperty(DEFAULT_VARIABLE);

    triggerResize();
    flushFrames();

    expect(readFontSize(title)).toBe(99);
  });

  it('re-fits once the document fonts become ready', async () => {
    stubFontsReady(Promise.resolve());
    const { container, title } = makeElements({ widthLimit: 9999, k: 0 });
    renderHook(() =>
      useSplashTitleFit(refTo(container), refTo(title), 'key', {
        minFontSize: 10,
        maxFontSize: 100,
      })
    );
    flushFrames();
    title.style.removeProperty(DEFAULT_VARIABLE);

    await Promise.resolve();
    flushFrames();

    expect(readFontSize(title)).toBe(99);
  });

  it('re-fits when the window emits a resize event', () => {
    const { container, title } = makeElements({ widthLimit: 9999, k: 0 });
    renderHook(() =>
      useSplashTitleFit(refTo(container), refTo(title), 'key', {
        minFontSize: 10,
        maxFontSize: 100,
      })
    );
    flushFrames();
    title.style.removeProperty(DEFAULT_VARIABLE);

    window.dispatchEvent(new Event('resize'));
    flushFrames();

    expect(readFontSize(title)).toBe(99);
  });

  it('observes both the container and its parent element', () => {
    const { container, title, parent } = makeElements({ widthLimit: 100, k: 1 });
    renderHook(() => useSplashTitleFit(refTo(container), refTo(title), 'key'));

    expect(resizeObservers[0].targets).toEqual([container, parent]);
  });

  it('coalesces a resize during a pending frame into a single scheduled frame', () => {
    const { container, title } = makeElements({ widthLimit: 100, k: 1 });
    renderHook(() => useSplashTitleFit(refTo(container), refTo(title), 'key'));
    // One frame queued from mount; do not flush it yet.

    triggerResize();

    // cancelAnimationFrame was called for the pending frame before scheduling a new one.
    expect(cafSpy).toHaveBeenCalledTimes(1);
  });
});

describe('useSplashTitleFit — cleanup', () => {
  it('cancels the pending frame on unmount so no fit runs afterward', () => {
    const { container, title } = makeElements({ widthLimit: 9999, k: 0 });
    const { unmount } = renderHook(() =>
      useSplashTitleFit(refTo(container), refTo(title), 'key', {
        minFontSize: 10,
        maxFontSize: 100,
      })
    );

    unmount();
    flushFrames();

    expect(title.style.getPropertyValue(DEFAULT_VARIABLE)).toBe('');
  });

  it('stops re-fitting on resize after unmount', () => {
    const { container, title } = makeElements({ widthLimit: 9999, k: 0 });
    const { unmount } = renderHook(() =>
      useSplashTitleFit(refTo(container), refTo(title), 'key', {
        minFontSize: 10,
        maxFontSize: 100,
      })
    );
    flushFrames();
    title.style.removeProperty(DEFAULT_VARIABLE);

    unmount();
    window.dispatchEvent(new Event('resize'));
    flushFrames();

    expect(title.style.getPropertyValue(DEFAULT_VARIABLE)).toBe('');
  });
});
