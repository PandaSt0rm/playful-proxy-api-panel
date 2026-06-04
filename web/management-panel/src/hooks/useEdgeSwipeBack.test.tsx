import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';
import { useEdgeSwipeBack } from './useEdgeSwipeBack';

type HarnessProps = {
  enabled?: boolean;
  edgeSize?: number;
  threshold?: number;
  onBack: () => void;
};

// The hook returns a ref that must be attached to a live DOM node before its
// effect binds the pointerdown listener (the effect reads containerRef.current).
// renderHook never attaches the ref to an element, so we drive the hook through
// a tiny component that binds the ref to a div.
function Harness({ enabled, edgeSize, threshold, onBack }: HarnessProps) {
  const ref = useEdgeSwipeBack({ enabled, edgeSize, threshold, onBack });
  return <div ref={ref} data-testid="surface" />;
}

const pointerDown = (target: EventTarget, init: PointerEventInit & { pointerType?: string }) => {
  act(() => {
    target.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, ...init } as PointerEventInit)
    );
  });
};

const windowPointer = (
  type: 'pointermove' | 'pointerup' | 'pointercancel',
  init: PointerEventInit
) => {
  act(() => {
    window.dispatchEvent(new PointerEvent(type, init));
  });
};

// Defaults from the implementation: edgeSize 28, threshold 90.
const startTouchAtEdge = (target: EventTarget, x = 5, y = 100, pointerId = 1) =>
  pointerDown(target, { pointerType: 'touch', isPrimary: true, pointerId, clientX: x, clientY: y });

beforeEach(() => {
  cleanup();
});

describe('useEdgeSwipeBack — completed back gesture', () => {
  it('calls onBack once for a horizontal swipe from the edge past the threshold', () => {
    const onBack = vi.fn();
    const { getByTestId } = render(<Harness onBack={onBack} />);
    const surface = getByTestId('surface');

    startTouchAtEdge(surface, 5, 100);
    windowPointer('pointerup', { pointerId: 1, clientX: 100, clientY: 105 });

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('calls onBack when the horizontal distance equals the threshold exactly', () => {
    const onBack = vi.fn();
    const { getByTestId } = render(<Harness onBack={onBack} />);
    const surface = getByTestId('surface');

    startTouchAtEdge(surface, 0, 100);
    windowPointer('pointerup', { pointerId: 1, clientX: 90, clientY: 100 });

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('respects a custom threshold for triggering the back gesture', () => {
    const onBack = vi.fn();
    const { getByTestId } = render(<Harness onBack={onBack} threshold={40} />);
    const surface = getByTestId('surface');

    startTouchAtEdge(surface, 0, 100);
    windowPointer('pointerup', { pointerId: 1, clientX: 45, clientY: 100 });

    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe('useEdgeSwipeBack — gestures that must not trigger back', () => {
  it('does not call onBack when the swipe distance is below the threshold', () => {
    const onBack = vi.fn();
    const { getByTestId } = render(<Harness onBack={onBack} />);
    const surface = getByTestId('surface');

    startTouchAtEdge(surface, 0, 100);
    windowPointer('pointerup', { pointerId: 1, clientX: 89, clientY: 100 });

    expect(onBack).not.toHaveBeenCalled();
  });

  it('does not call onBack when the pointer starts outside the edge zone', () => {
    const onBack = vi.fn();
    const { getByTestId } = render(<Harness onBack={onBack} />);
    const surface = getByTestId('surface');

    pointerDown(surface, { pointerType: 'touch', isPrimary: true, pointerId: 1, clientX: 29, clientY: 100 });
    windowPointer('pointerup', { pointerId: 1, clientX: 200, clientY: 100 });

    expect(onBack).not.toHaveBeenCalled();
  });

  it('does not call onBack for a non-touch pointer (mouse)', () => {
    const onBack = vi.fn();
    const { getByTestId } = render(<Harness onBack={onBack} />);
    const surface = getByTestId('surface');

    pointerDown(surface, { pointerType: 'mouse', isPrimary: true, pointerId: 1, clientX: 5, clientY: 100 });
    windowPointer('pointerup', { pointerId: 1, clientX: 200, clientY: 100 });

    expect(onBack).not.toHaveBeenCalled();
  });

  it('does not call onBack for a non-primary touch pointer', () => {
    const onBack = vi.fn();
    const { getByTestId } = render(<Harness onBack={onBack} />);
    const surface = getByTestId('surface');

    pointerDown(surface, { pointerType: 'touch', isPrimary: false, pointerId: 2, clientX: 5, clientY: 100 });
    windowPointer('pointerup', { pointerId: 2, clientX: 200, clientY: 100 });

    expect(onBack).not.toHaveBeenCalled();
  });

  it('does not call onBack when the release is vertically dominant', () => {
    const onBack = vi.fn();
    const { getByTestId } = render(<Harness onBack={onBack} />);
    const surface = getByTestId('surface');

    startTouchAtEdge(surface, 0, 0);
    windowPointer('pointerup', { pointerId: 1, clientX: 100, clientY: 200 });

    expect(onBack).not.toHaveBeenCalled();
  });

  it('cancels an in-progress gesture when a move is vertically dominant', () => {
    const onBack = vi.fn();
    const { getByTestId } = render(<Harness onBack={onBack} />);
    const surface = getByTestId('surface');

    startTouchAtEdge(surface, 0, 0);
    windowPointer('pointermove', { pointerId: 1, clientX: 10, clientY: 100 });
    windowPointer('pointerup', { pointerId: 1, clientX: 200, clientY: 100 });

    expect(onBack).not.toHaveBeenCalled();
  });

  it('aborts the gesture on pointercancel so a later up does not fire onBack', () => {
    const onBack = vi.fn();
    const { getByTestId } = render(<Harness onBack={onBack} />);
    const surface = getByTestId('surface');

    startTouchAtEdge(surface, 0, 100);
    windowPointer('pointercancel', { pointerId: 1, clientX: 50, clientY: 100 });
    windowPointer('pointerup', { pointerId: 1, clientX: 200, clientY: 100 });

    expect(onBack).not.toHaveBeenCalled();
  });

  it('ignores a pointerup whose pointerId does not match the active gesture', () => {
    const onBack = vi.fn();
    const { getByTestId } = render(<Harness onBack={onBack} />);
    const surface = getByTestId('surface');

    startTouchAtEdge(surface, 0, 100, 1);
    windowPointer('pointerup', { pointerId: 99, clientX: 200, clientY: 100 });

    expect(onBack).not.toHaveBeenCalled();
  });

  it('does not call onBack when no gesture was started before pointerup', () => {
    const onBack = vi.fn();
    render(<Harness onBack={onBack} />);

    windowPointer('pointerup', { pointerId: 1, clientX: 200, clientY: 100 });

    expect(onBack).not.toHaveBeenCalled();
  });
});

describe('useEdgeSwipeBack — enable/disable and options', () => {
  it('binds no listeners when disabled, so a full swipe does not trigger onBack', () => {
    const onBack = vi.fn();
    const { getByTestId } = render(<Harness onBack={onBack} enabled={false} />);
    const surface = getByTestId('surface');

    startTouchAtEdge(surface, 0, 100);
    windowPointer('pointerup', { pointerId: 1, clientX: 200, clientY: 100 });

    expect(onBack).not.toHaveBeenCalled();
  });

  it('treats a touch beyond a smaller custom edgeSize as outside the edge zone', () => {
    const onBack = vi.fn();
    const { getByTestId } = render(<Harness onBack={onBack} edgeSize={10} />);
    const surface = getByTestId('surface');

    pointerDown(surface, { pointerType: 'touch', isPrimary: true, pointerId: 1, clientX: 11, clientY: 100 });
    windowPointer('pointerup', { pointerId: 1, clientX: 200, clientY: 100 });

    expect(onBack).not.toHaveBeenCalled();
  });
});

describe('useEdgeSwipeBack — listener lifecycle', () => {
  it('removes window listeners on unmount so a later swipe does nothing', () => {
    const onBack = vi.fn();
    const { getByTestId, unmount } = render(<Harness onBack={onBack} />);
    const surface = getByTestId('surface');

    startTouchAtEdge(surface, 0, 100);
    unmount();
    windowPointer('pointerup', { pointerId: 1, clientX: 200, clientY: 100 });

    expect(onBack).not.toHaveBeenCalled();
  });

  it('invokes the latest onBack after the handler prop changes', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { getByTestId, rerender } = render(<Harness onBack={first} />);

    rerender(<Harness onBack={second} />);
    const surface = getByTestId('surface');
    startTouchAtEdge(surface, 0, 100);
    windowPointer('pointerup', { pointerId: 1, clientX: 200, clientY: 100 });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
