import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './Button';

describe('Button', () => {
  it('renders its children inside a button element', () => {
    render(<Button>Save</Button>);

    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('applies the primary variant class by default', () => {
    render(<Button>Save</Button>);

    expect(screen.getByRole('button', { name: 'Save' })).toHaveClass('btn', 'btn-primary');
  });

  it('applies the requested variant and small-size classes', () => {
    render(
      <Button variant="danger" size="sm">
        Delete
      </Button>
    );

    expect(screen.getByRole('button', { name: 'Delete' })).toHaveClass(
      'btn',
      'btn-danger',
      'btn-sm'
    );
  });

  it('disables the button and shows a spinner while loading', () => {
    const { container } = render(<Button loading>Save</Button>);

    expect(screen.getByRole('button')).toBeDisabled();
    expect(container.querySelector('.loading-spinner')).toBeInTheDocument();
  });

  it('invokes onClick when clicked', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not invoke onClick when disabled', async () => {
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} disabled>
        Save
      </Button>
    );

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onClick).not.toHaveBeenCalled();
  });
});
