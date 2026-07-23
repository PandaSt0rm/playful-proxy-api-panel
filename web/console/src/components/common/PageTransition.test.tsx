import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, useNavigate, type Location } from 'react-router-dom';

import { render, screen, waitFor, userEvent } from '@/test/utils';

/**
 * `animate` from motion/mini is the external animation transport this component
 * owns. We mock it so the transition lifecycle is deterministic: each call
 * returns a handle whose `finished` promise we resolve on demand, letting us
 * observe the DOM during the animation and after it completes.
 */
const animationResolvers: Array<() => void> = [];
const animateMock = vi.fn(() => {
  let resolveFinished!: () => void;
  const finished = new Promise<void>((resolve) => {
    resolveFinished = () => resolve();
  });
  animationResolvers.push(resolveFinished);
  return { finished, stop: vi.fn() };
});

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

beforeEach(() => {
  animateMock.mockClear();
  animationResolvers.length = 0;
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
