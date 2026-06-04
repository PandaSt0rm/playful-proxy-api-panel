import { describe, it, expect, vi } from 'vitest';
import { render, screen, userEvent, within } from '@/test/utils';
import type { ProviderKeyConfig } from '@/types';
import type { RecentRequestUsageEntry } from '@/utils/recentRequests';
import { buildRecentRequestCompositeKey } from '@/utils/recentRequests';
import type { ProviderRecentUsageMap } from '../utils';
import { ClaudeSection } from './ClaudeSection';

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

function baseProps(overrides: Partial<React.ComponentProps<typeof ClaudeSection>> = {}) {
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
  } satisfies React.ComponentProps<typeof ClaudeSection>;
}

describe('ClaudeSection', () => {
  it('renders the Claude card title', () => {
    render(<ClaudeSection {...baseProps()} />);

    expect(screen.getByText('Claude API Configuration')).toBeInTheDocument();
  });

  it('shows the empty state when there are no configs', () => {
    render(<ClaudeSection {...baseProps({ configs: [] })} />);

    expect(screen.getByText('No Claude Configuration')).toBeInTheDocument();
  });

  it('invokes onAdd when the add button is clicked', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();

    render(<ClaudeSection {...baseProps({ onAdd })} />);
    await user.click(screen.getByRole('button', { name: 'Add Configuration' }));

    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('disables the add button when controls are disabled', () => {
    render(<ClaudeSection {...baseProps({ disableControls: true })} />);

    expect(screen.getByRole('button', { name: 'Add Configuration' })).toBeDisabled();
  });

  it('renders the masked api key for a config', () => {
    const configs: ProviderKeyConfig[] = [{ apiKey: 'sk-1234567890abcdef' }];

    render(<ClaudeSection {...baseProps({ configs })} />);

    expect(screen.getByText('sk******ef')).toBeInTheDocument();
  });

  it('renders the priority value when priority is defined', () => {
    const configs: ProviderKeyConfig[] = [{ apiKey: 'k1', priority: 7 }];

    render(<ClaudeSection {...baseProps({ configs })} />);

    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('renders a zero priority value because priority is checked for being defined not truthy', () => {
    const configs: ProviderKeyConfig[] = [{ apiKey: 'k1', priority: 0 }];

    const { container } = render(<ClaudeSection {...baseProps({ configs })} />);

    const priorityLabel = within(container).getByText('Priority:');
    expect(priorityLabel.nextElementSibling).toHaveTextContent('0');
  });

  it('does not render a priority row when priority is undefined', () => {
    const configs: ProviderKeyConfig[] = [{ apiKey: 'k1' }];

    render(<ClaudeSection {...baseProps({ configs })} />);

    expect(screen.queryByText('Priority:')).not.toBeInTheDocument();
  });

  it('renders the base url when present', () => {
    const configs: ProviderKeyConfig[] = [{ apiKey: 'k1', baseUrl: 'https://example.test' }];

    render(<ClaudeSection {...baseProps({ configs })} />);

    expect(screen.getByText('https://example.test')).toBeInTheDocument();
  });

  it('renders the model name for a configured model', () => {
    const configs: ProviderKeyConfig[] = [
      { apiKey: 'k1', models: [{ name: 'claude-3-opus', alias: 'opus-fast' }] },
    ];

    render(<ClaudeSection {...baseProps({ configs })} />);

    expect(screen.getByText('claude-3-opus')).toBeInTheDocument();
  });

  it('renders the model alias when it differs from the model name', () => {
    const configs: ProviderKeyConfig[] = [
      { apiKey: 'k1', models: [{ name: 'claude-3-opus', alias: 'opus-fast' }] },
    ];

    render(<ClaudeSection {...baseProps({ configs })} />);

    expect(screen.getByText('opus-fast')).toBeInTheDocument();
  });

  it('suppresses the alias when it equals the model name', () => {
    const configs: ProviderKeyConfig[] = [
      { apiKey: 'k1', models: [{ name: 'claude-3-opus', alias: 'claude-3-opus' }] },
    ];

    const { container } = render(<ClaudeSection {...baseProps({ configs })} />);

    const occurrences = within(container).getAllByText('claude-3-opus');
    expect(occurrences).toHaveLength(1);
  });

  it('renders the models count reflecting the number of configured models', () => {
    const configs: ProviderKeyConfig[] = [
      { apiKey: 'k1', models: [{ name: 'a' }, { name: 'b' }] },
    ];

    render(<ClaudeSection {...baseProps({ configs })} />);

    expect(screen.getByText('Models Count: 2')).toBeInTheDocument();
  });

  it('renders the excluded models count', () => {
    const configs: ProviderKeyConfig[] = [{ apiKey: 'k1', excludedModels: ['x', 'y'] }];

    render(<ClaudeSection {...baseProps({ configs })} />);

    expect(screen.getByText('Excluding 2 models')).toBeInTheDocument();
  });

  it('renders the disabled badge when a config disables all models with the wildcard rule', () => {
    const configs: ProviderKeyConfig[] = [{ apiKey: 'k1', excludedModels: ['*'] }];

    render(<ClaudeSection {...baseProps({ configs })} />);

    expect(screen.getByText('Disabled')).toBeInTheDocument();
  });

  it('renders the toggle as checked when the config is not wildcard-disabled', () => {
    const configs: ProviderKeyConfig[] = [{ apiKey: 'k1', excludedModels: ['only-one'] }];

    render(<ClaudeSection {...baseProps({ configs })} />);

    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('renders the toggle as unchecked when the config is wildcard-disabled', () => {
    const configs: ProviderKeyConfig[] = [{ apiKey: 'k1', excludedModels: ['*'] }];

    render(<ClaudeSection {...baseProps({ configs })} />);

    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('invokes onToggle with the row index and the new enabled value', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const configs: ProviderKeyConfig[] = [{ apiKey: 'k1', excludedModels: ['*'] }];

    render(<ClaudeSection {...baseProps({ configs, onToggle })} />);
    await user.click(screen.getByRole('checkbox'));

    expect(onToggle).toHaveBeenCalledWith(0, true);
  });

  it('invokes onEdit with the row index when Edit is clicked', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const configs: ProviderKeyConfig[] = [{ apiKey: 'k1' }, { apiKey: 'k2' }];

    render(<ClaudeSection {...baseProps({ configs, onEdit })} />);
    await user.click(screen.getAllByRole('button', { name: 'Edit' })[1]);

    expect(onEdit).toHaveBeenCalledWith(1);
  });

  it('invokes onDelete with the row index when Delete is clicked', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    const configs: ProviderKeyConfig[] = [{ apiKey: 'k1' }];

    render(<ClaudeSection {...baseProps({ configs, onDelete })} />);
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(onDelete).toHaveBeenCalledWith(0);
  });

  it('renders the total success count for a config from the usage map', () => {
    const configs: ProviderKeyConfig[] = [{ apiKey: 'kA', baseUrl: 'https://b.test' }];
    const usageByProvider = usageMap('claude', 'kA', 'https://b.test', { success: 12, failed: 3 });

    render(<ClaudeSection {...baseProps({ configs, usageByProvider })} />);

    expect(screen.getByText('Success: 12')).toBeInTheDocument();
  });

  it('renders the total failure count for a config from the usage map', () => {
    const configs: ProviderKeyConfig[] = [{ apiKey: 'kA', baseUrl: 'https://b.test' }];
    const usageByProvider = usageMap('claude', 'kA', 'https://b.test', { success: 12, failed: 3 });

    render(<ClaudeSection {...baseProps({ configs, usageByProvider })} />);

    expect(screen.getByText('Failure: 3')).toBeInTheDocument();
  });

  it('renders the cloak mode label as Always when the cloak mode is always', () => {
    const configs: ProviderKeyConfig[] = [{ apiKey: 'k1', cloak: { mode: 'always' } }];

    render(<ClaudeSection {...baseProps({ configs })} />);

    expect(screen.getByText('Always')).toBeInTheDocument();
  });

  it('falls back to the Auto cloak mode label for an unrecognized mode', () => {
    const configs: ProviderKeyConfig[] = [{ apiKey: 'k1', cloak: { mode: 'weird-value' } }];

    render(<ClaudeSection {...baseProps({ configs })} />);

    expect(screen.getByText('Auto (non-Claude-Code only)')).toBeInTheDocument();
  });

  it('renders the sensitive words count from the cloak config', () => {
    const configs: ProviderKeyConfig[] = [
      { apiKey: 'k1', cloak: { sensitiveWords: ['a', 'b', 'c'] } },
    ];

    const { container } = render(<ClaudeSection {...baseProps({ configs })} />);

    const label = within(container).getByText('Sensitive words:');
    expect(label.nextElementSibling).toHaveTextContent('3');
  });

  it('renders the disable cooling value as Yes when disableCooling is true', () => {
    const configs: ProviderKeyConfig[] = [{ apiKey: 'k1', disableCooling: true }];

    const { container } = render(<ClaudeSection {...baseProps({ configs })} />);

    const label = within(container).getByText('Disable Cooling:');
    expect(label.nextElementSibling).toHaveTextContent('Yes');
  });

  it('shows the Concurrency badge for the claude provider', () => {
    const configs: ProviderKeyConfig[] = [{ apiKey: 'k1' }];

    render(
      <ClaudeSection
        {...baseProps({ configs, upstreamConcurrency: { providers: { claude: 6 } } })}
      />
    );

    expect(screen.getByText('6')).toBeInTheDocument();
  });
});
