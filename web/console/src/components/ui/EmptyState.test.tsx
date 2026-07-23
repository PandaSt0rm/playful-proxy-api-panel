import { describe, it, expect } from 'vitest';

import { render, screen } from '@/test/utils';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('renders the title text', () => {
    render(<EmptyState title="No providers" />);

    expect(screen.getByText('No providers')).toBeInTheDocument();
  });

  it('renders the description when provided', () => {
    render(<EmptyState title="No providers" description="Add one to get started" />);

    expect(screen.getByText('Add one to get started')).toBeInTheDocument();
  });

  it('omits the description element when no description is given', () => {
    const { container } = render(<EmptyState title="No providers" />);

    expect(container.querySelector('.empty-desc')).toBeNull();
  });

  it('renders the action node when provided', () => {
    render(<EmptyState title="No providers" action={<button>Add provider</button>} />);

    expect(screen.getByRole('button', { name: 'Add provider' })).toBeInTheDocument();
  });

  it('omits the action container when no action is given', () => {
    const { container } = render(<EmptyState title="No providers" />);

    expect(container.querySelector('.empty-action')).toBeNull();
  });

  it('marks the icon as decorative with aria-hidden', () => {
    const { container } = render(<EmptyState title="No providers" />);

    expect(container.querySelector('.empty-icon')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('renders an empty title element when given an empty string', () => {
    const { container } = render(<EmptyState title="" />);

    expect(container.querySelector('.empty-title')?.textContent).toBe('');
  });
});
