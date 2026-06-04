import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useHeaderRefresh, triggerHeaderRefresh } from './useHeaderRefresh';

// The hook coordinates a module-level singleton (the "active" header-refresh
// handler). Each test must leave that singleton clean. Unmounting every
// rendered hook in afterEach (RTL cleanup) plus asserting the no-handler state
// at the start keeps tests isolated.
beforeEach(async () => {
  // Drain any handler a prior test forgot to clear by registering then
  // unmounting a no-op via the public API is not possible without a handler,
  // so instead confirm a fresh module-singleton by triggering with nothing
  // registered (resolves to undefined and is a no-op).
  await triggerHeaderRefresh();
});

describe('triggerHeaderRefresh', () => {
  it('resolves without throwing when no handler is registered', async () => {
    await expect(triggerHeaderRefresh()).resolves.toBeUndefined();
  });

  it('invokes the registered handler exactly once per trigger', async () => {
    const handler = vi.fn();
    renderHook(() => useHeaderRefresh(handler));

    await triggerHeaderRefresh();

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('awaits an async handler before resolving', async () => {
    const order: string[] = [];
    const handler = vi.fn(async () => {
      order.push('handler-start');
      await Promise.resolve();
      order.push('handler-end');
    });
    renderHook(() => useHeaderRefresh(handler));

    await triggerHeaderRefresh();
    order.push('after-trigger');

    expect(order).toEqual(['handler-start', 'handler-end', 'after-trigger']);
  });
});

describe('useHeaderRefresh registration', () => {
  it('does not register the handler when enabled is false', async () => {
    const handler = vi.fn();
    renderHook(() => useHeaderRefresh(handler, false));

    await triggerHeaderRefresh();

    expect(handler).not.toHaveBeenCalled();
  });

  it('does not register when handler is null', async () => {
    renderHook(() => useHeaderRefresh(null));

    await expect(triggerHeaderRefresh()).resolves.toBeUndefined();
  });

  it('does not register when handler is undefined', async () => {
    renderHook(() => useHeaderRefresh(undefined));

    await expect(triggerHeaderRefresh()).resolves.toBeUndefined();
  });

  it('clears the active handler on unmount so a later trigger is a no-op', async () => {
    const handler = vi.fn();
    const { unmount } = renderHook(() => useHeaderRefresh(handler));

    unmount();
    await triggerHeaderRefresh();

    expect(handler).not.toHaveBeenCalled();
  });

  it('invokes the most recently registered handler when two hooks register', async () => {
    const first = vi.fn();
    const second = vi.fn();
    renderHook(() => useHeaderRefresh(first));
    renderHook(() => useHeaderRefresh(second));

    await triggerHeaderRefresh();

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('uses the updated handler after a re-render with a new handler reference', async () => {
    const initial = vi.fn();
    const updated = vi.fn();
    const { rerender } = renderHook(({ h }: { h: () => void }) => useHeaderRefresh(h), {
      initialProps: { h: initial },
    });

    rerender({ h: updated });
    await triggerHeaderRefresh();

    expect(initial).not.toHaveBeenCalled();
    expect(updated).toHaveBeenCalledTimes(1);
  });

  it('clears the active handler when re-rendered from enabled to disabled', async () => {
    const handler = vi.fn();
    const { rerender } = renderHook(
      ({ on }: { on: boolean }) => useHeaderRefresh(handler, on),
      { initialProps: { on: true } }
    );

    rerender({ on: false });
    await triggerHeaderRefresh();

    expect(handler).not.toHaveBeenCalled();
  });

  it('re-registers the handler when re-rendered from disabled to enabled', async () => {
    const handler = vi.fn();
    const { rerender } = renderHook(
      ({ on }: { on: boolean }) => useHeaderRefresh(handler, on),
      { initialProps: { on: false } }
    );

    rerender({ on: true });
    await triggerHeaderRefresh();

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not clear a newer hook handler when an older hook unmounts', async () => {
    const older = vi.fn();
    const newer = vi.fn();
    const olderHook = renderHook(() => useHeaderRefresh(older));
    renderHook(() => useHeaderRefresh(newer));

    olderHook.unmount();
    await triggerHeaderRefresh();

    expect(newer).toHaveBeenCalledTimes(1);
  });
});
