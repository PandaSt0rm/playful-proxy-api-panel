import { describe, it, expect, vi } from 'vitest';
import { render, screen, userEvent, within } from '@/test/utils';
import type { ProviderKeyConfig } from '@/types';
import type { RecentRequestUsageEntry } from '@/utils/recentRequests';
import { buildRecentRequestCompositeKey } from '@/utils/recentRequests';
import type { ProviderRecentUsageMap } from '../utils';
import { VertexSection } from './VertexSection';

function usageMap(
  provider: string,
  apiKey: string,
  baseUrl: string | undefined,
  entry: Partial<RecentRequestUsageEntry>
): ProviderRecentUsageMap {
  const composite = buildRecentRequestCompositeKey(baseUrl, apiKey);
  const inner = new Map<string, RecentRequestUsageEntry>();
  inner.set(composite, { success: 0, failed: 0, recentRequests: [], ...entry });
  const outer: ProviderRecentUsageMap = new Map();
  outer.set(provider, inner);
  return outer;
}

function baseProps(overrides: Partial<React.ComponentProps<typeof VertexSection>> = {}) {
  return {
    configs: [],
    usageByProvider: new Map() as ProviderRecentUsageMap,
    loading: false,
    disableControls: false,
    isSwitching: false,
    onAdd: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onToggle: vi.fn(),
    ...overrides,
  } satisfies React.ComponentProps<typeof VertexSection>;
}

describe('VertexSection', () => {
  it('renders the Vertex card title', () => {
    render(<VertexSection {...baseProps()} />);

    expect(screen.getByText('Vertex API Configuration')).toBeInTheDocument();
  });

  it('shows the empty state when there are no configs', () => {
    render(<VertexSection {...baseProps({ configs: [] })} />);

    expect(screen.getByText('No Vertex Configuration')).toBeInTheDocument();
  });

  it('renders a one-based item title for the first config', () => {
    const configs: ProviderKeyConfig[] = [{ apiKey: 'k1' }];

    render(<VertexSection {...baseProps({ configs })} />);

    expect(screen.getByText('Vertex Configuration #1')).toBeInTheDocument();
  });

  it('renders a one-based item title for the second config', () => {
    const configs: ProviderKeyConfig[] = [{ apiKey: 'k1' }, { apiKey: 'k2' }];

    render(<VertexSection {...baseProps({ configs })} />);

    expect(screen.getByText('Vertex Configuration #2')).toBeInTheDocument();
  });

  it('renders the masked api key for a config', () => {
    const configs: ProviderKeyConfig[] = [{ apiKey: 'sk-1234567890abcdef' }];

    render(<VertexSection {...baseProps({ configs })} />);

    expect(screen.getByText('sk******ef')).toBeInTheDocument();
  });

  it('renders the proxy url when present', () => {
    const configs: ProviderKeyConfig[] = [{ apiKey: 'k1', proxyUrl: 'http://proxy.test:8080' }];

    render(<VertexSection {...baseProps({ configs })} />);

    expect(screen.getByText('http://proxy.test:8080')).toBeInTheDocument();
  });

  it('renders the alias count using the vertex-specific models label', () => {
    const configs: ProviderKeyConfig[] = [
      { apiKey: 'k1', models: [{ name: 'gemini-pro' }, { name: 'gemini-flash' }] },
    ];

    render(<VertexSection {...baseProps({ configs })} />);

    expect(screen.getByText('Alias count: 2')).toBeInTheDocument();
  });

  it('suppresses the model alias when it equals the model name', () => {
    const configs: ProviderKeyConfig[] = [
      { apiKey: 'k1', models: [{ name: 'gemini-pro', alias: 'gemini-pro' }] },
    ];

    const { container } = render(<VertexSection {...baseProps({ configs })} />);

    expect(within(container).getAllByText('gemini-pro')).toHaveLength(1);
  });

  it('renders the model alias when it differs from the model name', () => {
    const configs: ProviderKeyConfig[] = [
      { apiKey: 'k1', models: [{ name: 'gemini-pro', alias: 'pro-alias' }] },
    ];

    render(<VertexSection {...baseProps({ configs })} />);

    expect(screen.getByText('pro-alias')).toBeInTheDocument();
  });

  it('renders the excluded models count', () => {
    const configs: ProviderKeyConfig[] = [{ apiKey: 'k1', excludedModels: ['m1', 'm2', 'm3'] }];

    render(<VertexSection {...baseProps({ configs })} />);

    expect(screen.getByText('Excluding 3 models')).toBeInTheDocument();
  });

  it('renders the disabled badge when the config disables all models', () => {
    const configs: ProviderKeyConfig[] = [{ apiKey: 'k1', excludedModels: ['*'] }];

    render(<VertexSection {...baseProps({ configs })} />);

    expect(screen.getByText('Disabled')).toBeInTheDocument();
  });

  it('renders the toggle as unchecked when the config is wildcard-disabled', () => {
    const configs: ProviderKeyConfig[] = [{ apiKey: 'k1', excludedModels: ['*'] }];

    render(<VertexSection {...baseProps({ configs })} />);

    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('invokes onToggle with the row index and the new enabled value', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const configs: ProviderKeyConfig[] = [{ apiKey: 'k1', excludedModels: ['*'] }];

    render(<VertexSection {...baseProps({ configs, onToggle })} />);
    await user.click(screen.getByRole('checkbox'));

    expect(onToggle).toHaveBeenCalledWith(0, true);
  });

  it('invokes onDelete with the row index when Delete is clicked', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    const configs: ProviderKeyConfig[] = [{ apiKey: 'k1' }, { apiKey: 'k2' }];

    render(<VertexSection {...baseProps({ configs, onDelete })} />);
    await user.click(screen.getAllByRole('button', { name: 'Delete' })[1]);

    expect(onDelete).toHaveBeenCalledWith(1);
  });

  it('disables the toggle when the section is switching', () => {
    const configs: ProviderKeyConfig[] = [{ apiKey: 'k1' }];

    render(<VertexSection {...baseProps({ configs, isSwitching: true })} />);

    expect(screen.getByRole('checkbox')).toBeDisabled();
  });

  it('renders the total success count from the usage map', () => {
    const configs: ProviderKeyConfig[] = [{ apiKey: 'kA', baseUrl: 'https://v.test' }];
    const usageByProvider = usageMap('vertex', 'kA', 'https://v.test', { success: 8, failed: 2 });

    render(<VertexSection {...baseProps({ configs, usageByProvider })} />);

    expect(screen.getByText('Success: 8')).toBeInTheDocument();
  });

  it('renders the total failure count from the usage map', () => {
    const configs: ProviderKeyConfig[] = [{ apiKey: 'kA', baseUrl: 'https://v.test' }];
    const usageByProvider = usageMap('vertex', 'kA', 'https://v.test', { success: 8, failed: 2 });

    render(<VertexSection {...baseProps({ configs, usageByProvider })} />);

    expect(screen.getByText('Failure: 2')).toBeInTheDocument();
  });

  it('shows the vertex concurrency override value from config', () => {
    const configs: ProviderKeyConfig[] = [{ apiKey: 'k1' }];

    render(
      <VertexSection
        {...baseProps({ configs, upstreamConcurrency: { providers: { vertex: 2 } } })}
      />
    );

    const label = screen.getByText('Concurrency:');
    expect(label.nextElementSibling).toHaveTextContent('2');
  });
});
