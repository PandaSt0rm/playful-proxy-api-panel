import { describe, it, expect, vi } from 'vitest';
import { render, screen, userEvent } from '@/test/utils';
import type { UpstreamConcurrencyConfig } from '@/types';
import { ProviderConcurrencyInput } from './ProviderConcurrencyInput';

describe('ProviderConcurrencyInput', () => {
  it('renders the upstream concurrency limit label', () => {
    render(<ProviderConcurrencyInput providerKey="claude" value="" onChange={vi.fn()} />);

    expect(screen.getByLabelText('Upstream Concurrency Limit')).toBeInTheDocument();
  });

  it('reflects the provided value in the number input', () => {
    render(<ProviderConcurrencyInput providerKey="claude" value="7" onChange={vi.fn()} />);

    expect(screen.getByLabelText('Upstream Concurrency Limit')).toHaveValue(7);
  });

  it('shows the blank-removes-override hint when no config default applies', () => {
    render(<ProviderConcurrencyInput providerKey="claude" value="" onChange={vi.fn()} />);

    expect(
      screen.getByText('Blank removes the provider override. 0 explicitly means unlimited.')
    ).toBeInTheDocument();
  });

  it('shows the inherited-default hint when config supplies a default limit and no provider override', () => {
    const config: UpstreamConcurrencyConfig = { default: 12 };

    render(<ProviderConcurrencyInput providerKey="claude" value="" config={config} onChange={vi.fn()} />);

    expect(screen.getByText('Blank inherits default limit 12.')).toBeInTheDocument();
  });

  it('shows the blank-removes-override hint when a provider override exists even with a default present', () => {
    const config: UpstreamConcurrencyConfig = { default: 12, providers: { claude: 4 } };

    render(<ProviderConcurrencyInput providerKey="claude" value="" config={config} onChange={vi.fn()} />);

    expect(
      screen.getByText('Blank removes the provider override. 0 explicitly means unlimited.')
    ).toBeInTheDocument();
  });

  it('uses the default limit as the placeholder when the effective source is default', () => {
    const config: UpstreamConcurrencyConfig = { default: 9 };

    render(<ProviderConcurrencyInput providerKey="codex" value="" config={config} onChange={vi.fn()} />);

    expect(screen.getByLabelText('Upstream Concurrency Limit')).toHaveAttribute('placeholder', '9');
  });

  it('uses 0 as the placeholder when there is no effective default', () => {
    render(<ProviderConcurrencyInput providerKey="codex" value="" onChange={vi.fn()} />);

    expect(screen.getByLabelText('Upstream Concurrency Limit')).toHaveAttribute('placeholder', '0');
  });

  it('renders the supplied error message', () => {
    render(
      <ProviderConcurrencyInput
        providerKey="claude"
        value="abc"
        error="Must be a non-negative integer"
        onChange={vi.fn()}
      />
    );

    expect(screen.getByText('Must be a non-negative integer')).toBeInTheDocument();
  });

  it('marks the input as invalid when an error is present', () => {
    render(
      <ProviderConcurrencyInput
        providerKey="claude"
        value="abc"
        error="Bad value"
        onChange={vi.fn()}
      />
    );

    expect(screen.getByLabelText('Upstream Concurrency Limit')).toHaveAttribute('aria-invalid', 'true');
  });

  it('disables the input when disabled is true', () => {
    render(<ProviderConcurrencyInput providerKey="claude" value="3" disabled onChange={vi.fn()} />);

    expect(screen.getByLabelText('Upstream Concurrency Limit')).toBeDisabled();
  });

  it('invokes onChange with the typed string value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<ProviderConcurrencyInput providerKey="claude" value="" onChange={onChange} />);
    await user.type(screen.getByLabelText('Upstream Concurrency Limit'), '5');

    expect(onChange).toHaveBeenCalledWith('5');
  });
});
