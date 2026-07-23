import { describe, it, expect } from 'vitest';
import { render, screen } from '@/test/utils';
import type { UpstreamConcurrencyConfig } from '@/types';
import { ProviderConcurrencyBadge } from './ProviderConcurrencyBadge';

describe('ProviderConcurrencyBadge', () => {
  it('renders the Concurrency label', () => {
    render(<ProviderConcurrencyBadge providerKey="claude" />);

    expect(screen.getByText('Concurrency:')).toBeInTheDocument();
  });

  it('shows Unlimited when no config is provided', () => {
    render(<ProviderConcurrencyBadge providerKey="claude" />);

    expect(screen.getByText('Unlimited')).toBeInTheDocument();
  });

  it('shows Unlimited when neither a default nor a provider override applies', () => {
    const config: UpstreamConcurrencyConfig = { providers: {} };

    render(<ProviderConcurrencyBadge providerKey="claude" config={config} />);

    expect(screen.getByText('Unlimited')).toBeInTheDocument();
  });

  it('shows the default value annotation when only a positive default is set', () => {
    const config: UpstreamConcurrencyConfig = { default: 15 };

    render(<ProviderConcurrencyBadge providerKey="codex" config={config} />);

    expect(screen.getByText('15 (default)')).toBeInTheDocument();
  });

  it('shows the raw provider override value when it is a positive number', () => {
    const config: UpstreamConcurrencyConfig = { default: 15, providers: { codex: 3 } };

    render(<ProviderConcurrencyBadge providerKey="codex" config={config} />);

    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('shows Unlimited override when the provider override is explicitly 0', () => {
    const config: UpstreamConcurrencyConfig = { default: 15, providers: { claude: 0 } };

    render(<ProviderConcurrencyBadge providerKey="claude" config={config} />);

    expect(screen.getByText('Unlimited override')).toBeInTheDocument();
  });

  it('matches a provider override regardless of key casing', () => {
    const config: UpstreamConcurrencyConfig = { providers: { Claude: 8 } };

    render(<ProviderConcurrencyBadge providerKey="claude" config={config} />);

    expect(screen.getByText('8')).toBeInTheDocument();
  });

  it('ignores the default when it is zero and falls back to Unlimited', () => {
    const config: UpstreamConcurrencyConfig = { default: 0 };

    render(<ProviderConcurrencyBadge providerKey="vertex" config={config} />);

    expect(screen.getByText('Unlimited')).toBeInTheDocument();
  });
});
