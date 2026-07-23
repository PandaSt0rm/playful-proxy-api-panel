import { describe, it, expect } from 'vitest';
import { createRef } from 'react';
import { render, screen } from '@/test/utils';
import { ConfigSection } from './ConfigSection';

describe('ConfigSection', () => {
  it('renders the title inside a level-2 heading', () => {
    render(<ConfigSection title="Server Settings">content</ConfigSection>);

    const heading = screen.getByRole('heading', { level: 2 });

    expect(heading).toHaveTextContent('Server Settings');
  });

  it('renders children inside the section', () => {
    render(
      <ConfigSection title="Server">
        <span data-testid="child">child node</span>
      </ConfigSection>
    );

    const child = screen.getByTestId('child');

    expect(child).toHaveTextContent('child node');
  });

  it('renders the description when provided', () => {
    render(
      <ConfigSection title="Server" description="Configure the listen address">
        body
      </ConfigSection>
    );

    const description = screen.getByText('Configure the listen address');

    expect(description.tagName).toBe('P');
  });

  it('does not render a description paragraph when description is omitted', () => {
    const { container } = render(<ConfigSection title="Server">body</ConfigSection>);

    const paragraphs = container.querySelectorAll('p');

    expect(paragraphs.length).toBe(0);
  });

  it('renders the index label when provided', () => {
    render(
      <ConfigSection title="Server" indexLabel="01">
        body
      </ConfigSection>
    );

    expect(screen.getByText('01')).toBeInTheDocument();
  });

  it('does not render the index badge when indexLabel is omitted', () => {
    render(<ConfigSection title="Server">body</ConfigSection>);

    expect(screen.queryByText('01')).not.toBeInTheDocument();
  });

  it('renders the icon node when provided', () => {
    render(
      <ConfigSection title="Server" icon={<svg data-testid="section-icon" />}>
        body
      </ConfigSection>
    );

    expect(screen.getByTestId('section-icon')).toBeInTheDocument();
  });

  it('does not render an icon badge when icon is omitted', () => {
    render(<ConfigSection title="Server">body</ConfigSection>);

    expect(screen.queryByTestId('section-icon')).not.toBeInTheDocument();
  });

  it('forwards the ref to the underlying section element', () => {
    const ref = createRef<HTMLElement>();

    render(
      <ConfigSection ref={ref} title="Server">
        body
      </ConfigSection>
    );

    expect(ref.current?.tagName).toBe('SECTION');
  });

  it('spreads arbitrary HTML attributes onto the section element', () => {
    const ref = createRef<HTMLElement>();

    render(
      <ConfigSection ref={ref} title="Server" id="server-section" data-role="panel">
        body
      </ConfigSection>
    );

    expect(ref.current?.id).toBe('server-section');
  });

  it('forwards data attributes through the rest props', () => {
    const ref = createRef<HTMLElement>();

    render(
      <ConfigSection ref={ref} title="Server" data-role="panel">
        body
      </ConfigSection>
    );

    expect(ref.current?.getAttribute('data-role')).toBe('panel');
  });

  it('appends a caller-supplied className to the section', () => {
    const ref = createRef<HTMLElement>();

    render(
      <ConfigSection ref={ref} title="Server" className="extra-class">
        body
      </ConfigSection>
    );

    expect(ref.current?.classList.contains('extra-class')).toBe(true);
  });

  it('renders a ReactNode title rather than coercing it to text', () => {
    render(
      <ConfigSection title={<em data-testid="rich-title">Rich Title</em>}>body</ConfigSection>
    );

    expect(screen.getByTestId('rich-title')).toBeInTheDocument();
  });
});
