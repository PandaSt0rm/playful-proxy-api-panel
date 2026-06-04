import { describe, it, expect } from 'vitest';
import { render, screen } from '@/test/utils';
import { Card } from './Card';

describe('Card', () => {
  it('renders its children', () => {
    render(<Card>Card body content</Card>);

    expect(screen.getByText('Card body content')).toBeInTheDocument();
  });

  it('applies the base card class when no className is provided', () => {
    const { container } = render(<Card>body</Card>);

    expect(container.firstChild).toHaveClass('card');
  });

  it('appends a custom className alongside the base card class', () => {
    const { container } = render(<Card className="compact">body</Card>);

    expect(container.firstChild as HTMLElement).toHaveClass('card', 'compact');
  });

  it('uses exactly the base class string when no className is provided', () => {
    const { container } = render(<Card>body</Card>);

    expect((container.firstChild as HTMLElement).getAttribute('class')).toBe('card');
  });

  it('renders the title text inside the header', () => {
    render(<Card title="Settings">body</Card>);

    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('renders the extra node in the header', () => {
    render(<Card extra={<button type="button">Action</button>}>body</Card>);

    expect(screen.getByRole('button', { name: 'Action' })).toBeInTheDocument();
  });

  it('renders the header when only a title is provided', () => {
    const { container } = render(<Card title="Only title">body</Card>);

    expect(container.querySelector('.card-header')).toBeInTheDocument();
  });

  it('renders the header when only extra is provided', () => {
    const { container } = render(<Card extra={<span>badge</span>}>body</Card>);

    expect(container.querySelector('.card-header')).toBeInTheDocument();
  });

  it('omits the header entirely when neither title nor extra is provided', () => {
    const { container } = render(<Card>body</Card>);

    expect(container.querySelector('.card-header')).not.toBeInTheDocument();
  });

  it('renders both title and extra in the header together', () => {
    render(
      <Card title="Header" extra={<span>extra-node</span>}>
        body
      </Card>
    );

    expect(screen.getByText('Header')).toBeInTheDocument();
    expect(screen.getByText('extra-node')).toBeInTheDocument();
  });

  it('renders the title node inside the title wrapper', () => {
    const { container } = render(<Card title="Wrapped">body</Card>);

    expect(container.querySelector('.card-header .title')?.textContent).toBe('Wrapped');
  });
});
