import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRef } from 'react';
import { render, screen } from '@/test/utils';
import userEvent from '@testing-library/user-event';
import { SecondaryScreenShell } from './SecondaryScreenShell';
import {
  PageTransitionLayerContext,
  PAGE_TRANSITION_LAYER_CONTEXT_VALUES,
} from './PageTransitionLayer';

describe('SecondaryScreenShell', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders a string title as text content', () => {
    render(<SecondaryScreenShell title="Provider settings" />);

    expect(screen.getByText('Provider settings')).toBeInTheDocument();
  });

  it('renders a ReactNode title', () => {
    render(<SecondaryScreenShell title={<span data-testid="custom-title">Custom</span>} />);

    expect(screen.getByTestId('custom-title')).toBeInTheDocument();
  });

  it('renders children inside the content region', () => {
    render(
      <SecondaryScreenShell title="Title">
        <p>Body content</p>
      </SecondaryScreenShell>
    );

    expect(screen.getByText('Body content')).toBeInTheDocument();
  });

  it('renders a back button when onBack is provided', () => {
    render(<SecondaryScreenShell title="Title" onBack={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
  });

  it('does not render a back button when onBack is omitted', () => {
    render(<SecondaryScreenShell title="Title" />);

    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
  });

  it('uses the provided backLabel as the visible back button text', () => {
    render(<SecondaryScreenShell title="Title" onBack={vi.fn()} backLabel="Go back" />);

    expect(screen.getByRole('button', { name: 'Go back' })).toBeInTheDocument();
  });

  it('uses backAriaLabel for the accessible name when provided', () => {
    render(
      <SecondaryScreenShell
        title="Title"
        onBack={vi.fn()}
        backLabel="Back"
        backAriaLabel="Return to providers"
      />
    );

    expect(screen.getByRole('button', { name: 'Return to providers' })).toBeInTheDocument();
  });

  it('invokes onBack exactly once when the back button is clicked', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(<SecondaryScreenShell title="Title" onBack={onBack} />);

    await user.click(screen.getByRole('button', { name: 'Back' }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('hides the back button when hideTopBarBackButton is true', () => {
    render(<SecondaryScreenShell title="Title" onBack={vi.fn()} hideTopBarBackButton />);

    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
  });

  it('renders the right action when provided', () => {
    render(
      <SecondaryScreenShell title="Title" rightAction={<button type="button">Save</button>} />
    );

    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('hides the right action when hideTopBarRightAction is true', () => {
    render(
      <SecondaryScreenShell
        title="Title"
        rightAction={<button type="button">Save</button>}
        hideTopBarRightAction
      />
    );

    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });

  it('renders the loading spinner instead of children while loading', () => {
    render(
      <SecondaryScreenShell title="Title" isLoading>
        <p>Body content</p>
      </SecondaryScreenShell>
    );

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('does not render children while loading', () => {
    render(
      <SecondaryScreenShell title="Title" isLoading>
        <p>Body content</p>
      </SecondaryScreenShell>
    );

    expect(screen.queryByText('Body content')).not.toBeInTheDocument();
  });

  it('renders the default loading label while loading', () => {
    render(<SecondaryScreenShell title="Title" isLoading />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders a custom loading label while loading', () => {
    render(<SecondaryScreenShell title="Title" isLoading loadingLabel="Fetching providers" />);

    expect(screen.getByText('Fetching providers')).toBeInTheDocument();
  });

  it('does not render the loading spinner when not loading', () => {
    render(<SecondaryScreenShell title="Title">content</SecondaryScreenShell>);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('applies a custom container className', () => {
    const { container } = render(
      <SecondaryScreenShell title="Title" className="custom-container" />
    );

    expect(container.querySelector('.custom-container')).toBeInTheDocument();
  });

  it('applies a custom content className when not loading', () => {
    const { container } = render(
      <SecondaryScreenShell title="Title" contentClassName="custom-content">
        content
      </SecondaryScreenShell>
    );

    expect(container.querySelector('.custom-content')).toBeInTheDocument();
  });

  it('forwards the ref to the container element', () => {
    const ref = createRef<HTMLDivElement>();

    render(<SecondaryScreenShell ref={ref} title="Title" />);

    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('renders the action bar into the document body via a portal', () => {
    render(<SecondaryScreenShell title="Title" actionBar={<button type="button">Save</button>} />);

    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('does not render the action bar when the page transition layer is not current', () => {
    render(
      <PageTransitionLayerContext.Provider value={PAGE_TRANSITION_LAYER_CONTEXT_VALUES.stacked}>
        <SecondaryScreenShell title="Title" actionBar={<button type="button">Save</button>} />
      </PageTransitionLayerContext.Provider>
    );

    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });

  it('renders the action bar when the page transition layer is current', () => {
    render(
      <PageTransitionLayerContext.Provider value={PAGE_TRANSITION_LAYER_CONTEXT_VALUES.current}>
        <SecondaryScreenShell title="Title" actionBar={<button type="button">Save</button>} />
      </PageTransitionLayerContext.Provider>
    );

    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('does not render a action bar region when actionBar is omitted', () => {
    render(<SecondaryScreenShell title="Title">content</SecondaryScreenShell>);

    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });
});
