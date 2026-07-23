import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { RefObject } from 'react';
import { MemoryRouter, useNavigate, type Location } from 'react-router-dom';

import { render, screen, waitFor, userEvent } from '@/test/utils';

/**
 * `animate` from motion/mini is the external animation transport this component
 * owns. We mock it so the transition lifecycle is deterministic: each call
 * returns a handle whose `finished` promise we resolve on demand, letting us
 * observe the DOM during the animation and after it completes.
 */
const animationResolvers: Array<() => void> = [];
const animationStops: Mock[] = [];
const createAnimation = () => {
  let resolveFinished!: () => void;
  const finished = new Promise<void>((resolve) => {
    resolveFinished = resolve;
  });
  const stop = vi.fn();
  animationResolvers.push(resolveFinished);
  animationStops.push(stop);
  return { finished, stop };
};
const animateMock = vi.fn(createAnimation);

vi.mock('motion/mini', () => ({
  animate: (...args: unknown[]) => animateMock(...args),
}));

const finishAllAnimations = () => {
  animationResolvers.splice(0).forEach((resolve) => resolve());
};

// Import after the mock is registered.
const { PageTransition } = await import('./PageTransition');

const renderLocation = (location: Location) => (
  <div data-testid="page-content">{location.pathname}</div>
);

function Navigator({ to }: { to: string }) {
  const navigate = useNavigate();
  return <button onClick={() => navigate(to)}>go-{to}</button>;
}

function Harness({ initial = '/' }: { initial?: string }) {
  return (
    <MemoryRouter initialEntries={[initial]}>
      <Navigator to="/second" />
      <PageTransition render={renderLocation} />
    </MemoryRouter>
  );
}

function AdvancedHarness({
  initial = '/auth-files',
  variant = 'ios',
  scrollContainerRef,
  order = (pathname: string) =>
    ({ '/auth-files': 0, '/auth-files/a': 1, '/auth-files/a/models': 2, '/auth-files/other': 0 })[
      pathname
    ] ?? -1,
}: {
  initial?: string;
  variant?: 'vertical' | 'ios';
  scrollContainerRef?: RefObject<HTMLElement | null>;
  order?: (pathname: string) => number | null;
}) {
  return (
    <MemoryRouter initialEntries={[initial]}>
      <RouteControls />
      <PageTransition
        render={renderLocation}
        getRouteOrder={order}
        getTransitionVariant={() => variant}
        scrollContainerRef={scrollContainerRef}
      />
    </MemoryRouter>
  );
}

function RouteControls() {
  const navigate = useNavigate();
  return (
    <>
      <button onClick={() => navigate('/auth-files')}>root</button>
      <button onClick={() => navigate('/auth-files/a')}>child</button>
      <button onClick={() => navigate('/auth-files/a/models')}>grandchild</button>
      <button onClick={() => navigate('/auth-files/other')}>other</button>
      <button onClick={() => navigate(-1)}>back</button>
      <button onClick={() => navigate('/same')}>same</button>
    </>
  );
}
beforeEach(() => {
  animateMock.mockClear();
  animationResolvers.length = 0;
  animationStops.length = 0;
  animateMock.mockImplementation(createAnimation);
});

describe('PageTransition initial render', () => {
  it('renders the content for the current location', () => {
    render(<Harness initial="/start" />);

    expect(screen.getByTestId('page-content')).toHaveTextContent('/start');
  });

  it('renders exactly one layer before any navigation', () => {
    const { container } = render(<Harness initial="/start" />);

    expect(container.querySelectorAll('.page-transition__layer')).toHaveLength(1);
  });

  it('marks the sole current layer as visible (not aria-hidden)', () => {
    const { container } = render(<Harness initial="/start" />);

    expect(container.querySelector('.page-transition__layer')?.getAttribute('aria-hidden')).toBe(
      'false'
    );
  });

  it('does not add the animating modifier class at rest', () => {
    const { container } = render(<Harness initial="/start" />);

    expect(container.querySelector('.page-transition')?.className).toBe('page-transition');
  });
});

describe('PageTransition during navigation', () => {
  it('renders both the exiting and entering layers while animating', async () => {
    const { container } = render(<Harness initial="/start" />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'go-/second' }));

    await waitFor(() =>
      expect(container.querySelectorAll('.page-transition__layer')).toHaveLength(2)
    );
  });

  it('adds the animating modifier class during the transition', async () => {
    const { container } = render(<Harness initial="/start" />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'go-/second' }));

    await waitFor(() =>
      expect(container.querySelector('.page-transition')?.className).toContain(
        'page-transition--animating'
      )
    );
  });

  it('marks the exiting layer with the exit modifier class', async () => {
    const { container } = render(<Harness initial="/start" />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'go-/second' }));

    await waitFor(() =>
      expect(container.querySelector('.page-transition__layer--exit')).not.toBeNull()
    );
  });

  it('triggers the animation transport once per layer (enter + exit)', async () => {
    render(<Harness initial="/start" />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'go-/second' }));

    await waitFor(() => expect(animateMock).toHaveBeenCalledTimes(2));
  });
});

describe('PageTransition completion', () => {
  it('removes the exiting layer once the animation finishes', async () => {
    const { container } = render(<Harness initial="/start" />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'go-/second' }));
    await waitFor(() => expect(animateMock).toHaveBeenCalledTimes(2));
    finishAllAnimations();

    await waitFor(() =>
      expect(container.querySelectorAll('.page-transition__layer')).toHaveLength(1)
    );
  });

  it('drops the animating modifier class after the animation finishes', async () => {
    const { container } = render(<Harness initial="/start" />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'go-/second' }));
    await waitFor(() => expect(animateMock).toHaveBeenCalledTimes(2));
    finishAllAnimations();

    await waitFor(() =>
      expect(container.querySelector('.page-transition')?.className).toBe('page-transition')
    );
  });

  it('shows the destination content after the transition completes', async () => {
    render(<Harness initial="/start" />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'go-/second' }));
    await waitFor(() => expect(animateMock).toHaveBeenCalledTimes(2));
    finishAllAnimations();

    await waitFor(() => expect(screen.getByTestId('page-content')).toHaveTextContent('/second'));
  });
});

describe('PageTransition route policy', () => {
  it('does not animate a new history entry with the same pathname', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/same']}>
        <RouteControls />
        <PageTransition render={renderLocation} />
      </MemoryRouter>
    );
    await user.click(screen.getByRole('button', { name: 'same' }));
    expect(animateMock).not.toHaveBeenCalled();
  });

  it('treats missing, invalid, equal, forward, and backward route orders deterministically', async () => {
    const user = userEvent.setup();
    const invalidOrder = vi.fn((pathname: string) => (pathname.endsWith('/a') ? -1 : null));
    const first = render(<AdvancedHarness order={invalidOrder} variant="vertical" />);
    await user.click(screen.getByRole('button', { name: 'child' }));
    await waitFor(() => expect(animateMock).toHaveBeenCalledTimes(2));
    finishAllAnimations();
    await waitFor(() => expect(screen.getAllByTestId('page-content')).toHaveLength(1));
    first.unmount();

    animateMock.mockClear();
    const equalOrder = () => 1;
    render(<AdvancedHarness order={equalOrder} variant="vertical" />);
    await user.click(screen.getByRole('button', { name: 'child' }));
    await waitFor(() => expect(animateMock).toHaveBeenCalledTimes(2));
    const entering = animateMock.mock.calls[1]?.[1] as { transform: string[] };
    expect(entering.transform[0]).toContain('8px');
  });
});

describe('PageTransition iOS stack', () => {
  it('keeps a stacked parent, animates nested back navigation, and skips the root exit layer', async () => {
    const user = userEvent.setup();
    const { container } = render(<AdvancedHarness />);
    await user.click(screen.getByRole('button', { name: 'child' }));
    await waitFor(() => expect(animateMock).toHaveBeenCalledTimes(2));
    const forwardEase = (animateMock.mock.calls[0]?.[2] as { ease: (value: number) => number })
      .ease;
    expect(forwardEase(0.5)).toBeGreaterThan(0.5);
    finishAllAnimations();
    await waitFor(() =>
      expect(container.querySelector('.page-transition__layer--stacked')).not.toBeNull()
    );

    await user.click(screen.getByRole('button', { name: 'grandchild' }));
    await waitFor(() => expect(animateMock).toHaveBeenCalledTimes(4));
    finishAllAnimations();
    await waitFor(() =>
      expect(screen.getAllByTestId('page-content').at(-1)).toHaveTextContent('/auth-files/a/models')
    );

    await user.click(screen.getByRole('button', { name: 'back' }));
    await waitFor(() => expect(animateMock).toHaveBeenCalledTimes(6));
    const backwardEnter = animateMock.mock.calls[5]?.[1] as { transform: string[] };
    expect(backwardEnter.transform[0]).toContain('-30%');
    finishAllAnimations();
    await waitFor(() =>
      expect(screen.getAllByTestId('page-content').at(-1)).toHaveTextContent('/auth-files/a')
    );

    await user.click(screen.getByRole('button', { name: 'back' }));
    await waitFor(() => expect(animateMock).toHaveBeenCalledTimes(7));
    expect(container.querySelector('.page-transition__layer--exit')).toBeNull();
    finishAllAnimations();
    await waitFor(() => expect(screen.getAllByTestId('page-content')).toHaveLength(1));
  });

  it('handles a backward iOS destination that is not already stacked', async () => {
    const user = userEvent.setup();
    render(<AdvancedHarness initial="/auth-files/a" />);
    await user.click(screen.getByRole('button', { name: 'other' }));
    await waitFor(() => expect(animateMock).toHaveBeenCalledTimes(2));
    const exit = animateMock.mock.calls[0]?.[1] as { opacity: number[] };
    expect(exit.opacity).toEqual([1, 1]);
  });

  it('skips exit for a new backward section-root entry', async () => {
    const user = userEvent.setup();
    const { container } = render(<AdvancedHarness initial="/auth-files/a" />);
    await user.click(screen.getByRole('button', { name: 'root' }));
    await waitFor(() => expect(animateMock).toHaveBeenCalledTimes(1));
    expect(container.querySelector('.page-transition__layer--exit')).toBeNull();
  });

  it('does not apply section-root skipping when either route has no path segments', async () => {
    const user = userEvent.setup();
    render(<AdvancedHarness initial="/" order={(pathname) => (pathname === '/' ? 1 : 0)} />);
    await user.click(screen.getByRole('button', { name: 'root' }));
    await waitFor(() => expect(animateMock).toHaveBeenCalledTimes(2));
  });
});

describe('PageTransition motion lifecycle', () => {
  it('completes immediately when reduced motion is requested', async () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
    const user = userEvent.setup();
    const { container } = render(<AdvancedHarness variant="vertical" />);
    await user.click(screen.getByRole('button', { name: 'child' }));
    await waitFor(() =>
      expect(container.querySelectorAll('.page-transition__layer')).toHaveLength(1)
    );
    expect(animateMock).not.toHaveBeenCalled();
  });

  it('restores saved scroll positions across forward and backward navigation', async () => {
    const user = userEvent.setup();
    const scrollContainer = document.createElement('div');
    scrollContainer.scrollTop = 42;
    const scrollTo = vi.fn(({ top }: ScrollToOptions) => {
      scrollContainer.scrollTop = Number(top);
    });
    scrollContainer.scrollTo = scrollTo;
    render(
      <AdvancedHarness variant="vertical" scrollContainerRef={{ current: scrollContainer }} />
    );
    await user.click(screen.getByRole('button', { name: 'child' }));
    await waitFor(() =>
      expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'auto' })
    );
    const verticalEase = (animateMock.mock.calls[0]?.[2] as { ease: (value: number) => number })
      .ease;
    expect(verticalEase(0.5)).toBeGreaterThan(0);
    finishAllAnimations();
    await waitFor(() => expect(screen.getAllByTestId('page-content')).toHaveLength(1));
    scrollContainer.scrollTop = 7;
    await user.click(screen.getByRole('button', { name: 'back' }));
    await waitFor(() =>
      expect(scrollTo).toHaveBeenLastCalledWith({ top: 42, left: 0, behavior: 'auto' })
    );
  });

  it('absorbs animation rejection and still completes the transition', async () => {
    animateMock.mockImplementation(() => ({
      finished: Promise.reject(new Error('cancelled')),
      stop: vi.fn(),
    }));
    const user = userEvent.setup();
    const { container } = render(<AdvancedHarness variant="vertical" />);
    await user.click(screen.getByRole('button', { name: 'child' }));
    await waitFor(() =>
      expect(container.querySelectorAll('.page-transition__layer')).toHaveLength(1)
    );
  });

  it('stops active animations and ignores their completion after unmount', async () => {
    const user = userEvent.setup();
    const rendered = render(<AdvancedHarness variant="vertical" />);
    await user.click(screen.getByRole('button', { name: 'child' }));
    await waitFor(() => expect(animationStops).toHaveLength(2));
    rendered.unmount();
    expect(animationStops.every((stop) => stop.mock.calls.length === 1)).toBe(true);
    finishAllAnimations();
    await Promise.resolve();
  });
});
