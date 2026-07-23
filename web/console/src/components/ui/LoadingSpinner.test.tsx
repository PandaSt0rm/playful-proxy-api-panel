import { describe, it, expect } from 'vitest';
import { render, screen } from '@/test/utils';
import { LoadingSpinner } from './LoadingSpinner';

describe('LoadingSpinner', () => {
  it('renders a status region for assistive technology', () => {
    render(<LoadingSpinner />);

    const spinner = screen.getByRole('status');

    expect(spinner).toBeInTheDocument();
  });

  it('exposes a polite aria-live region', () => {
    render(<LoadingSpinner />);

    const spinner = screen.getByRole('status');

    expect(spinner).toHaveAttribute('aria-live', 'polite');
  });

  it('applies the loading-spinner class', () => {
    render(<LoadingSpinner />);

    const spinner = screen.getByRole('status');

    expect(spinner).toHaveClass('loading-spinner');
  });

  it('defaults to a 20px square with a proportional border width', () => {
    render(<LoadingSpinner />);

    const spinner = screen.getByRole('status');

    expect(spinner).toHaveStyle({ width: '20px', height: '20px', borderWidth: `${20 / 7}px` });
  });

  it('sizes the square to the provided size prop', () => {
    render(<LoadingSpinner size={42} />);

    const spinner = screen.getByRole('status');

    expect(spinner).toHaveStyle({ width: '42px', height: '42px' });
  });

  it('derives border width as one seventh of the size', () => {
    render(<LoadingSpinner size={70} />);

    const spinner = screen.getByRole('status');

    expect(spinner).toHaveStyle({ borderWidth: '10px' });
  });

  it('renders a zero-size spinner with a zero border for a size of 0', () => {
    render(<LoadingSpinner size={0} />);

    const spinner = screen.getByRole('status');

    expect(spinner).toHaveStyle({ width: '0px', height: '0px', borderWidth: '0px' });
  });

  it('appends an extra class while keeping the base class', () => {
    render(<LoadingSpinner className="inline" />);

    const spinner = screen.getByRole('status');

    expect(spinner).toHaveClass('loading-spinner', 'inline');
  });

  it('uses only the base class when className is the empty default', () => {
    render(<LoadingSpinner />);

    const spinner = screen.getByRole('status');

    expect(spinner.getAttribute('class')).toBe('loading-spinner');
  });
});
