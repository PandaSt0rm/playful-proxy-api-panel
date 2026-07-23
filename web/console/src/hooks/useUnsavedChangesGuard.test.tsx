import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { BlockerFunction, Blocker, Location } from 'react-router';
import { useUnsavedChangesGuard, type UnsavedChangesDialog } from './useUnsavedChangesGuard';
import { useNotificationStore } from '@/stores';

// Mock the routing boundary the hook owns its logic against:
//  - useBlocker: capture the predicate the hook passes in and return a blocker
//    object the test fully controls.
//  - useLocation: return a location whose `key` the test can change to drive
//    the "navigation happened" reset effect.
let capturedShouldBlock: BlockerFunction | null = null;
let mockBlocker: Blocker;
let mockLocation: Location;

vi.mock('react-router', () => ({
  useBlocker: (fn: BlockerFunction) => {
    capturedShouldBlock = fn;
    return mockBlocker;
  },
  useLocation: () => mockLocation,
}));

const makeLocation = (overrides: Partial<Location> = {}): Location => ({
  pathname: '/current',
  search: '',
  hash: '',
  state: null,
  key: 'loc-1',
  ...overrides,
});

const makeBlockerArgs = (next: Partial<Location>) => ({
  currentLocation: makeLocation(),
  nextLocation: makeLocation({ key: 'next', ...next }),
  historyAction: 'PUSH' as const,
});

const DIALOG: UnsavedChangesDialog = {
  title: 'Discard changes?',
  message: 'You have unsaved edits.',
  confirmText: 'Leave',
  cancelText: 'Stay',
};

const proceed = vi.fn();
const reset = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  capturedShouldBlock = null;
  proceed.mockClear();
  reset.mockClear();
  mockLocation = makeLocation();
  mockBlocker = {
    state: 'unblocked',
    location: undefined,
    proceed,
    reset,
  } as unknown as Blocker;
  useNotificationStore.setState({
    notifications: [],
    confirmation: { isOpen: false, isLoading: false, options: null },
  });
});

afterEach(() => {
  vi.useRealTimers();
});

const renderGuard = (options?: Partial<Parameters<typeof useUnsavedChangesGuard>[0]>) =>
  renderHook(() =>
    useUnsavedChangesGuard({
      shouldBlock: true,
      dialog: DIALOG,
      ...options,
    })
  );

describe('useUnsavedChangesGuard — block predicate', () => {
  it('blocks navigation when shouldBlock is the boolean true', () => {
    renderGuard({ shouldBlock: true });

    const result = capturedShouldBlock?.(makeBlockerArgs({ pathname: '/elsewhere' }));

    expect(result).toBe(true);
  });

  it('allows navigation when shouldBlock is the boolean false', () => {
    renderGuard({ shouldBlock: false });

    const result = capturedShouldBlock?.(makeBlockerArgs({ pathname: '/elsewhere' }));

    expect(result).toBe(false);
  });

  it('delegates to a shouldBlock function and returns its decision', () => {
    const decider = vi.fn(() => true);
    renderGuard({ shouldBlock: decider });

    const result = capturedShouldBlock?.(makeBlockerArgs({ pathname: '/elsewhere' }));

    expect(result).toBe(true);
  });

  it('passes the navigation args through to the shouldBlock function', () => {
    const decider = vi.fn(() => false);
    renderGuard({ shouldBlock: decider });
    const args = makeBlockerArgs({ pathname: '/elsewhere' });

    capturedShouldBlock?.(args);

    expect(decider).toHaveBeenCalledWith(args);
  });

  it('never blocks when the guard is disabled', () => {
    renderGuard({ enabled: false, shouldBlock: true });

    const result = capturedShouldBlock?.(makeBlockerArgs({ pathname: '/elsewhere' }));

    expect(result).toBe(false);
  });
});

describe('useUnsavedChangesGuard — allowNextNavigation window', () => {
  it('allows the next navigation after allowNextNavigation is called', () => {
    const { result } = renderGuard({ shouldBlock: true });

    act(() => result.current.allowNextNavigation());
    const decision = capturedShouldBlock?.(makeBlockerArgs({ pathname: '/saved' }));

    expect(decision).toBe(false);
  });

  it('blocks a navigation to a different target than the first allowed one', () => {
    const { result } = renderGuard({ shouldBlock: true });

    act(() => result.current.allowNextNavigation());
    capturedShouldBlock?.(makeBlockerArgs({ pathname: '/first' }));
    const second = capturedShouldBlock?.(makeBlockerArgs({ pathname: '/second' }));

    expect(second).toBe(true);
  });

  it('keeps allowing repeated checks for the same allowed target within the window', () => {
    const { result } = renderGuard({ shouldBlock: true });

    act(() => result.current.allowNextNavigation());
    capturedShouldBlock?.(makeBlockerArgs({ pathname: '/saved' }));
    const repeat = capturedShouldBlock?.(makeBlockerArgs({ pathname: '/saved' }));

    expect(repeat).toBe(false);
  });

  it('stops allowing navigation once the 2 second window has elapsed', () => {
    const { result } = renderGuard({ shouldBlock: true });

    act(() => result.current.allowNextNavigation());
    vi.advanceTimersByTime(2001);
    const decision = capturedShouldBlock?.(makeBlockerArgs({ pathname: '/saved' }));

    expect(decision).toBe(true);
  });

  it('still allows navigation at the last millisecond inside the window', () => {
    const { result } = renderGuard({ shouldBlock: true });

    act(() => result.current.allowNextNavigation());
    vi.advanceTimersByTime(1999);
    const decision = capturedShouldBlock?.(makeBlockerArgs({ pathname: '/saved' }));

    expect(decision).toBe(false);
  });
});

describe('useUnsavedChangesGuard — confirmation dialog', () => {
  const renderBlocked = (blockedLocation: Partial<Location>) => {
    mockBlocker = {
      state: 'blocked',
      location: makeLocation({ key: 'blocked', ...blockedLocation }),
      proceed,
      reset,
    } as unknown as Blocker;
    return renderGuard({ shouldBlock: true });
  };

  it('opens a confirmation dialog when navigation is blocked', () => {
    renderBlocked({ pathname: '/away' });

    const { confirmation } = useNotificationStore.getState();

    expect(confirmation.isOpen).toBe(true);
  });

  it('passes the dialog title, message and button labels to the confirmation', () => {
    renderBlocked({ pathname: '/away' });

    const { options } = useNotificationStore.getState().confirmation;

    expect(options).toMatchObject({
      title: 'Discard changes?',
      message: 'You have unsaved edits.',
      confirmText: 'Leave',
      cancelText: 'Stay',
    });
  });

  it('defaults the confirmation variant to danger when none is provided', () => {
    renderBlocked({ pathname: '/away' });

    const { options } = useNotificationStore.getState().confirmation;

    expect(options?.variant).toBe('danger');
  });

  it('uses the explicitly provided confirmation variant', () => {
    mockBlocker = {
      state: 'blocked',
      location: makeLocation({ key: 'blocked', pathname: '/away' }),
      proceed,
      reset,
    } as unknown as Blocker;
    renderGuard({ shouldBlock: true, dialog: { ...DIALOG, variant: 'primary' } });

    const { options } = useNotificationStore.getState().confirmation;

    expect(options?.variant).toBe('primary');
  });

  it('calls blocker.proceed when the confirmation is confirmed', () => {
    renderBlocked({ pathname: '/away' });

    act(() => {
      void useNotificationStore.getState().confirmation.options?.onConfirm();
    });

    expect(proceed).toHaveBeenCalledTimes(1);
  });

  it('calls blocker.reset when the confirmation is cancelled', () => {
    renderBlocked({ pathname: '/away' });

    act(() => {
      useNotificationStore.getState().confirmation.options?.onCancel?.();
    });

    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('does not open a confirmation when the blocker is not in the blocked state', () => {
    renderGuard({ shouldBlock: true });

    const { confirmation } = useNotificationStore.getState();

    expect(confirmation.isOpen).toBe(false);
  });

  it('opens the dialog exactly once for a single blocked target across re-renders', () => {
    const showConfirmation = vi.fn();
    useNotificationStore.setState({ showConfirmation });
    mockBlocker = {
      state: 'blocked',
      location: makeLocation({ key: 'blocked', pathname: '/away' }),
      proceed,
      reset,
    } as unknown as Blocker;
    const { rerender } = renderGuard({ shouldBlock: true });

    rerender();

    expect(showConfirmation).toHaveBeenCalledTimes(1);
  });

  it('opens a new dialog when the blocked target changes', () => {
    const showConfirmation = vi.fn();
    useNotificationStore.setState({ showConfirmation });
    mockBlocker = {
      state: 'blocked',
      location: makeLocation({ key: 'blocked-a', pathname: '/away-a' }),
      proceed,
      reset,
    } as unknown as Blocker;
    const { rerender } = renderGuard({ shouldBlock: true });

    mockBlocker = {
      state: 'blocked',
      location: makeLocation({ key: 'blocked-b', pathname: '/away-b' }),
      proceed,
      reset,
    } as unknown as Blocker;
    rerender();

    expect(showConfirmation).toHaveBeenCalledTimes(2);
  });
});
