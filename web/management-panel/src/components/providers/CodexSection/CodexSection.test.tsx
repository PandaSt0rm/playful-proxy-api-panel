import { describe, it, expect, vi } from 'vitest';
import { render, screen, userEvent, within } from '@/test/utils';
import type { ProviderKeyConfig } from '@/types';
import type { RecentRequestUsageEntry } from '@/utils/recentRequests';
import { buildRecentRequestCompositeKey } from '@/utils/recentRequests';
import type { ProviderRecentUsageMap } from '../utils';
import { CodexSection } from './CodexSection';

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

function baseProps(overrides: Partial<React.ComponentProps<typeof CodexSection>> = {}) {
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
  } satisfies React.ComponentProps<typeof CodexSection>;
}

describe('CodexSection', () => {
  it('renders the Codex card title', () => {
    render(<CodexSection {...baseProps()} />);

    expect(screen.getByText('Codex API Configuration')).toBeInTheDocument();
  });

  it('shows the empty state when there are no configs', () => {
    render(<CodexSection {...baseProps({ configs: [] })} />);

    expect(screen.getByText('No Codex Configuration')).toBeInTheDocument();
  });

  it('invokes onAdd when the add button is clicked', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();

    render(<CodexSection {...baseProps({ onAdd })} />);
    await user.click(screen.getByRole('button', { name: 'Add Configuration' }));

    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('renders the masked api key for a config', () => {
    const configs: ProviderKeyConfig[] = [{ apiKey: 'sk-1234567890abcdef' }];

    render(<CodexSection {...baseProps({ configs })} />);

    expect(screen.getByText('sk******ef')).toBeInTheDocument();
  });

  it('renders the websockets value as Yes when websockets is true', () => {
    const configs: ProviderKeyConfig[] = [{ apiKey: 'k1', websockets: true }];

    const { container } = render(<CodexSection {...baseProps({ configs })} />);

    const label = within(container).getByText('Websockets:');
    expect(label.nextElementSibling).toHaveTextContent('Yes');
  });

  it('renders the websockets value as No when websockets is false', () => {
    const configs: ProviderKeyConfig[] = [{ apiKey: 'k1', websockets: false }];

    const { container } = render(<CodexSection {...baseProps({ configs })} />);

    const label = within(container).getByText('Websockets:');
    expect(label.nextElementSibling).toHaveTextContent('No');
  });

  it('does not render a websockets row when websockets is undefined', () => {
    const configs: ProviderKeyConfig[] = [{ apiKey: 'k1' }];

    render(<CodexSection {...baseProps({ configs })} />);

    expect(screen.queryByText('Websockets:')).not.toBeInTheDocument();
  });

  it('renders the disable cooling value as No when disableCooling is false', () => {
    const configs: ProviderKeyConfig[] = [{ apiKey: 'k1', disableCooling: false }];

    const { container } = render(<CodexSection {...baseProps({ configs })} />);

    const label = within(container).getByText('Disable Cooling:');
    expect(label.nextElementSibling).toHaveTextContent('No');
  });

  it('renders the models count using the codex label', () => {
    const configs: ProviderKeyConfig[] = [{ apiKey: 'k1', models: [{ name: 'a' }] }];

    render(<CodexSection {...baseProps({ configs })} />);

    expect(screen.getByText('Models Count: 1')).toBeInTheDocument();
  });

  it('suppresses the model alias when it equals the model name', () => {
    const configs: ProviderKeyConfig[] = [
      { apiKey: 'k1', models: [{ name: 'gpt-5-codex', alias: 'gpt-5-codex' }] },
    ];

    const { container } = render(<CodexSection {...baseProps({ configs })} />);

    expect(within(container).getAllByText('gpt-5-codex')).toHaveLength(1);
  });

  it('renders the model alias when it differs from the model name', () => {
    const configs: ProviderKeyConfig[] = [
      { apiKey: 'k1', models: [{ name: 'gpt-5-codex', alias: 'codex-fast' }] },
    ];

    render(<CodexSection {...baseProps({ configs })} />);

    expect(screen.getByText('codex-fast')).toBeInTheDocument();
  });

  it('renders the disabled badge when the config disables all models', () => {
    const configs: ProviderKeyConfig[] = [{ apiKey: 'k1', excludedModels: ['*'] }];

    render(<CodexSection {...baseProps({ configs })} />);

    expect(screen.getByText('Disabled')).toBeInTheDocument();
  });

  it('invokes onToggle with the row index and the new enabled value', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const configs: ProviderKeyConfig[] = [{ apiKey: 'k1' }];

    render(<CodexSection {...baseProps({ configs, onToggle })} />);
    await user.click(screen.getByRole('checkbox'));

    expect(onToggle).toHaveBeenCalledWith(0, false);
  });

  it('invokes onEdit with the row index when Edit is clicked', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const configs: ProviderKeyConfig[] = [{ apiKey: 'k1' }];

    render(<CodexSection {...baseProps({ configs, onEdit })} />);
    await user.click(screen.getByRole('button', { name: 'Edit' }));

    expect(onEdit).toHaveBeenCalledWith(0);
  });

  it('renders the total success count from the usage map', () => {
    const configs: ProviderKeyConfig[] = [{ apiKey: 'kA', baseUrl: 'https://b.test' }];
    const usageByProvider = usageMap('codex', 'kA', 'https://b.test', { success: 4, failed: 9 });

    render(<CodexSection {...baseProps({ configs, usageByProvider })} />);

    expect(screen.getByText('Success: 4')).toBeInTheDocument();
  });

  it('renders the total failure count from the usage map', () => {
    const configs: ProviderKeyConfig[] = [{ apiKey: 'kA', baseUrl: 'https://b.test' }];
    const usageByProvider = usageMap('codex', 'kA', 'https://b.test', { success: 4, failed: 9 });

    render(<CodexSection {...baseProps({ configs, usageByProvider })} />);

    expect(screen.getByText('Failure: 9')).toBeInTheDocument();
  });

  it('shows the codex concurrency override value from config', () => {
    const configs: ProviderKeyConfig[] = [{ apiKey: 'k1' }];

    render(
      <CodexSection
        {...baseProps({ configs, upstreamConcurrency: { providers: { codex: 11 } } })}
      />
    );

    expect(screen.getByText('11')).toBeInTheDocument();
  });
});
