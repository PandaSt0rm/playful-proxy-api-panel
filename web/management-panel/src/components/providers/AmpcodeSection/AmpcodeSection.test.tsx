import { describe, it, expect, vi } from 'vitest';
import { render, screen, userEvent, within } from '@/test/utils';
import type { AmpcodeConfig } from '@/types';
import { AmpcodeSection } from './AmpcodeSection';

function baseProps(overrides: Partial<React.ComponentProps<typeof AmpcodeSection>> = {}) {
  return {
    config: null,
    loading: false,
    disableControls: false,
    isSwitching: false,
    onEdit: vi.fn(),
    ...overrides,
  } satisfies React.ComponentProps<typeof AmpcodeSection>;
}

describe('AmpcodeSection', () => {
  it('renders the Ampcode card title', () => {
    render(<AmpcodeSection {...baseProps()} />);

    expect(screen.getByText('Amp CLI Integration (ampcode)')).toBeInTheDocument();
  });

  it('shows the loading placeholder when loading and config is absent', () => {
    render(<AmpcodeSection {...baseProps({ loading: true, config: null })} />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders fields instead of the loading placeholder when loading but config is present', () => {
    const config: AmpcodeConfig = { upstreamUrl: 'https://amp.test' };

    render(<AmpcodeSection {...baseProps({ loading: true, config })} />);

    expect(screen.getByText('https://amp.test')).toBeInTheDocument();
  });

  it('invokes onEdit when the Edit button is clicked', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();

    render(<AmpcodeSection {...baseProps({ onEdit })} />);
    await user.click(screen.getByRole('button', { name: 'Edit' }));

    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('disables the Edit button when controls are disabled', () => {
    render(<AmpcodeSection {...baseProps({ disableControls: true })} />);

    expect(screen.getByRole('button', { name: 'Edit' })).toBeDisabled();
  });

  it('disables the Edit button when switching', () => {
    render(<AmpcodeSection {...baseProps({ isSwitching: true })} />);

    expect(screen.getByRole('button', { name: 'Edit' })).toBeDisabled();
  });

  it('disables the Edit button when loading with a present config', () => {
    const config: AmpcodeConfig = { upstreamUrl: 'https://amp.test' };

    render(<AmpcodeSection {...baseProps({ loading: true, config })} />);

    expect(screen.getByRole('button', { name: 'Edit' })).toBeDisabled();
  });

  it('renders the upstream url value when present', () => {
    const config: AmpcodeConfig = { upstreamUrl: 'https://amp.example' };

    const { container } = render(<AmpcodeSection {...baseProps({ config })} />);

    const label = within(container).getByText('Upstream URL:');
    expect(label.nextElementSibling).toHaveTextContent('https://amp.example');
  });

  it('renders Not set for the upstream url when missing', () => {
    const config: AmpcodeConfig = {};

    const { container } = render(<AmpcodeSection {...baseProps({ config })} />);

    const label = within(container).getByText('Upstream URL:');
    expect(label.nextElementSibling).toHaveTextContent('Not set');
  });

  it('renders the masked upstream api key when present', () => {
    const config: AmpcodeConfig = { upstreamApiKey: 'sk-amp-1234567890' };

    const { container } = render(<AmpcodeSection {...baseProps({ config })} />);

    const label = within(container).getByText('Upstream API Key (Amp Official):');
    expect(label.nextElementSibling).toHaveTextContent('sk******90');
  });

  it('renders Not set for the upstream api key when missing', () => {
    const config: AmpcodeConfig = {};

    const { container } = render(<AmpcodeSection {...baseProps({ config })} />);

    const label = within(container).getByText('Upstream API Key (Amp Official):');
    expect(label.nextElementSibling).toHaveTextContent('Not set');
  });

  it('renders Yes for force model mappings when enabled', () => {
    const config: AmpcodeConfig = { forceModelMappings: true };

    const { container } = render(<AmpcodeSection {...baseProps({ config })} />);

    const label = within(container).getByText('Force model mappings:');
    expect(label.nextElementSibling).toHaveTextContent('Yes');
  });

  it('renders No for force model mappings when disabled', () => {
    const config: AmpcodeConfig = { forceModelMappings: false };

    const { container } = render(<AmpcodeSection {...baseProps({ config })} />);

    const label = within(container).getByText('Force model mappings:');
    expect(label.nextElementSibling).toHaveTextContent('No');
  });

  it('renders No for force model mappings when the field is undefined', () => {
    const config: AmpcodeConfig = {};

    const { container } = render(<AmpcodeSection {...baseProps({ config })} />);

    const label = within(container).getByText('Force model mappings:');
    expect(label.nextElementSibling).toHaveTextContent('No');
  });

  it('renders Yes for restrict management to localhost when enabled', () => {
    const config: AmpcodeConfig = { restrictManagementToLocalhost: true };

    const { container } = render(<AmpcodeSection {...baseProps({ config })} />);

    const label = within(container).getByText('Restrict Management to Localhost:');
    expect(label.nextElementSibling).toHaveTextContent('Yes');
  });

  it('renders No for restrict management to localhost when disabled', () => {
    const config: AmpcodeConfig = { restrictManagementToLocalhost: false };

    const { container } = render(<AmpcodeSection {...baseProps({ config })} />);

    const label = within(container).getByText('Restrict Management to Localhost:');
    expect(label.nextElementSibling).toHaveTextContent('No');
  });

  it('renders the mappings count reflecting the number of model mappings', () => {
    const config: AmpcodeConfig = {
      modelMappings: [
        { from: 'a', to: 'x' },
        { from: 'b', to: 'y' },
      ],
    };

    const { container } = render(<AmpcodeSection {...baseProps({ config })} />);

    const label = within(container).getByText('Mappings Count:');
    expect(label.nextElementSibling).toHaveTextContent('2');
  });

  it('renders a mappings count of zero when there are no model mappings', () => {
    const config: AmpcodeConfig = {};

    const { container } = render(<AmpcodeSection {...baseProps({ config })} />);

    const label = within(container).getByText('Mappings Count:');
    expect(label.nextElementSibling).toHaveTextContent('0');
  });

  it('renders the upstream mappings count reflecting the number of upstream api keys', () => {
    const config: AmpcodeConfig = {
      upstreamApiKeys: [{ upstreamApiKey: 'u1', apiKeys: ['c1'] }],
    };

    const { container } = render(<AmpcodeSection {...baseProps({ config })} />);

    const label = within(container).getByText('Upstream mappings:');
    expect(label.nextElementSibling).toHaveTextContent('1');
  });

  it('renders the from model name for a configured mapping', () => {
    const config: AmpcodeConfig = { modelMappings: [{ from: 'gpt-4', to: 'gpt-4o' }] };

    render(<AmpcodeSection {...baseProps({ config })} />);

    expect(screen.getByText('gpt-4')).toBeInTheDocument();
  });

  it('renders the to model name for a configured mapping', () => {
    const config: AmpcodeConfig = { modelMappings: [{ from: 'gpt-4', to: 'gpt-4o' }] };

    render(<AmpcodeSection {...baseProps({ config })} />);

    expect(screen.getByText('gpt-4o')).toBeInTheDocument();
  });

  it('renders only the first five mappings as tags', () => {
    const config: AmpcodeConfig = {
      modelMappings: [
        { from: 'm0', to: 't0' },
        { from: 'm1', to: 't1' },
        { from: 'm2', to: 't2' },
        { from: 'm3', to: 't3' },
        { from: 'm4', to: 't4' },
        { from: 'm5', to: 't5' },
      ],
    };

    render(<AmpcodeSection {...baseProps({ config })} />);

    expect(screen.queryByText('m5')).not.toBeInTheDocument();
  });

  it('renders an overflow tag with the count of mappings beyond the first five', () => {
    const config: AmpcodeConfig = {
      modelMappings: [
        { from: 'm0', to: 't0' },
        { from: 'm1', to: 't1' },
        { from: 'm2', to: 't2' },
        { from: 'm3', to: 't3' },
        { from: 'm4', to: 't4' },
        { from: 'm5', to: 't5' },
        { from: 'm6', to: 't6' },
      ],
    };

    render(<AmpcodeSection {...baseProps({ config })} />);

    expect(screen.getByText('+2')).toBeInTheDocument();
  });

  it('does not render an overflow tag when there are exactly five mappings', () => {
    const config: AmpcodeConfig = {
      modelMappings: [
        { from: 'm0', to: 't0' },
        { from: 'm1', to: 't1' },
        { from: 'm2', to: 't2' },
        { from: 'm3', to: 't3' },
        { from: 'm4', to: 't4' },
      ],
    };

    render(<AmpcodeSection {...baseProps({ config })} />);

    expect(screen.queryByText('+0')).not.toBeInTheDocument();
  });

  it('renders Not set values when config is null', () => {
    const { container } = render(<AmpcodeSection {...baseProps({ config: null })} />);

    const label = within(container).getByText('Upstream URL:');
    expect(label.nextElementSibling).toHaveTextContent('Not set');
  });
});
