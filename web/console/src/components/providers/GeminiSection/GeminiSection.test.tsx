import { describe, it, expect, vi } from 'vitest';
import { render, screen, userEvent, within } from '@/test/utils';
import type { GeminiKeyConfig } from '@/types';
import type { RecentRequestUsageEntry } from '@/utils/recentRequests';
import { buildRecentRequestCompositeKey } from '@/utils/recentRequests';
import type { ProviderRecentUsageMap } from '../utils';
import { GeminiSection } from './GeminiSection';

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

function baseProps(overrides: Partial<React.ComponentProps<typeof GeminiSection>> = {}) {
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
  } satisfies React.ComponentProps<typeof GeminiSection>;
}

describe('GeminiSection', () => {
  it('renders the Gemini card title', () => {
    render(<GeminiSection {...baseProps()} />);

    expect(screen.getByText('Gemini API Keys')).toBeInTheDocument();
  });

  it('shows the empty state when there are no configs', () => {
    render(<GeminiSection {...baseProps({ configs: [] })} />);

    expect(screen.getByText('No Gemini Keys')).toBeInTheDocument();
  });

  it('invokes onAdd when the add button is clicked', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();

    render(<GeminiSection {...baseProps({ onAdd })} />);
    await user.click(screen.getByRole('button', { name: 'Add Key' }));

    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('disables the add button when controls are disabled', () => {
    render(<GeminiSection {...baseProps({ disableControls: true })} />);

    expect(screen.getByRole('button', { name: 'Add Key' })).toBeDisabled();
  });

  it('disables the add button while switching', () => {
    render(<GeminiSection {...baseProps({ isSwitching: true })} />);

    expect(screen.getByRole('button', { name: 'Add Key' })).toBeDisabled();
  });

  it('renders the item title with a one-based index', () => {
    const configs: GeminiKeyConfig[] = [{ apiKey: 'k1' }];

    render(<GeminiSection {...baseProps({ configs })} />);

    expect(screen.getByText('Gemini Key #1')).toBeInTheDocument();
  });

  it('renders the masked api key for a config', () => {
    const configs: GeminiKeyConfig[] = [{ apiKey: 'sk-1234567890abcdef' }];

    render(<GeminiSection {...baseProps({ configs })} />);

    expect(screen.getByText('sk******ef')).toBeInTheDocument();
  });

  it('renders the priority value when priority is defined', () => {
    const configs: GeminiKeyConfig[] = [{ apiKey: 'k1', priority: 7 }];

    const { container } = render(<GeminiSection {...baseProps({ configs })} />);

    const label = within(container).getByText('Priority:');
    expect(label.nextElementSibling).toHaveTextContent('7');
  });

  it('does not render a priority row when priority is undefined', () => {
    const configs: GeminiKeyConfig[] = [{ apiKey: 'k1' }];

    render(<GeminiSection {...baseProps({ configs })} />);

    expect(screen.queryByText('Priority:')).not.toBeInTheDocument();
  });

  it('renders the prefix when present', () => {
    const configs: GeminiKeyConfig[] = [{ apiKey: 'k1', prefix: 'gem' }];

    const { container } = render(<GeminiSection {...baseProps({ configs })} />);

    const label = within(container).getByText('Prefix:');
    expect(label.nextElementSibling).toHaveTextContent('gem');
  });

  it('renders the base url when present', () => {
    const configs: GeminiKeyConfig[] = [{ apiKey: 'k1', baseUrl: 'https://gem.test' }];

    render(<GeminiSection {...baseProps({ configs })} />);

    expect(screen.getByText('https://gem.test')).toBeInTheDocument();
  });

  it('renders the proxy url when present', () => {
    const configs: GeminiKeyConfig[] = [{ apiKey: 'k1', proxyUrl: 'http://proxy.test' }];

    render(<GeminiSection {...baseProps({ configs })} />);

    expect(screen.getByText('http://proxy.test')).toBeInTheDocument();
  });

  it('renders the model name for a configured model', () => {
    const configs: GeminiKeyConfig[] = [
      { apiKey: 'k1', models: [{ name: 'gemini-pro', alias: 'pro-fast' }] },
    ];

    render(<GeminiSection {...baseProps({ configs })} />);

    expect(screen.getByText('gemini-pro')).toBeInTheDocument();
  });

  it('renders the model alias when it differs from the model name', () => {
    const configs: GeminiKeyConfig[] = [
      { apiKey: 'k1', models: [{ name: 'gemini-pro', alias: 'pro-fast' }] },
    ];

    render(<GeminiSection {...baseProps({ configs })} />);

    expect(screen.getByText('pro-fast')).toBeInTheDocument();
  });

  it('suppresses the alias when it equals the model name', () => {
    const configs: GeminiKeyConfig[] = [
      { apiKey: 'k1', models: [{ name: 'gemini-pro', alias: 'gemini-pro' }] },
    ];

    const { container } = render(<GeminiSection {...baseProps({ configs })} />);

    const occurrences = within(container).getAllByText('gemini-pro');
    expect(occurrences).toHaveLength(1);
  });

  it('renders the models count reflecting the number of configured models', () => {
    const configs: GeminiKeyConfig[] = [{ apiKey: 'k1', models: [{ name: 'a' }, { name: 'b' }] }];

    render(<GeminiSection {...baseProps({ configs })} />);

    expect(screen.getByText('Models Count: 2')).toBeInTheDocument();
  });

  it('renders the excluded models count', () => {
    const configs: GeminiKeyConfig[] = [{ apiKey: 'k1', excludedModels: ['x', 'y'] }];

    render(<GeminiSection {...baseProps({ configs })} />);

    expect(screen.getByText('Excluding 2 models')).toBeInTheDocument();
  });

  it('renders the disabled badge when a config disables all models with the wildcard rule', () => {
    const configs: GeminiKeyConfig[] = [{ apiKey: 'k1', excludedModels: ['*'] }];

    render(<GeminiSection {...baseProps({ configs })} />);

    expect(screen.getByText('Disabled')).toBeInTheDocument();
  });

  it('renders a header badge for a configured header', () => {
    const configs: GeminiKeyConfig[] = [{ apiKey: 'k1', headers: { 'X-Test': 'value' } }];

    render(<GeminiSection {...baseProps({ configs })} />);

    expect(screen.getByText('X-Test:')).toBeInTheDocument();
  });

  it('renders the disable cooling value as Yes when disableCooling is true', () => {
    const configs: GeminiKeyConfig[] = [{ apiKey: 'k1', disableCooling: true }];

    const { container } = render(<GeminiSection {...baseProps({ configs })} />);

    const label = within(container).getByText('Disable Cooling:');
    expect(label.nextElementSibling).toHaveTextContent('Yes');
  });

  it('renders the disable cooling value as No when disableCooling is false', () => {
    const configs: GeminiKeyConfig[] = [{ apiKey: 'k1', disableCooling: false }];

    const { container } = render(<GeminiSection {...baseProps({ configs })} />);

    const label = within(container).getByText('Disable Cooling:');
    expect(label.nextElementSibling).toHaveTextContent('No');
  });

  it('does not render the disable cooling row when disableCooling is undefined', () => {
    const configs: GeminiKeyConfig[] = [{ apiKey: 'k1' }];

    render(<GeminiSection {...baseProps({ configs })} />);

    expect(screen.queryByText('Disable Cooling:')).not.toBeInTheDocument();
  });

  it('renders the toggle as checked when the config is not wildcard-disabled', () => {
    const configs: GeminiKeyConfig[] = [{ apiKey: 'k1', excludedModels: ['only-one'] }];

    render(<GeminiSection {...baseProps({ configs })} />);

    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('renders the toggle as unchecked when the config is wildcard-disabled', () => {
    const configs: GeminiKeyConfig[] = [{ apiKey: 'k1', excludedModels: ['*'] }];

    render(<GeminiSection {...baseProps({ configs })} />);

    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('invokes onToggle with the row index and the new enabled value', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const configs: GeminiKeyConfig[] = [{ apiKey: 'k1', excludedModels: ['*'] }];

    render(<GeminiSection {...baseProps({ configs, onToggle })} />);
    await user.click(screen.getByRole('checkbox'));

    expect(onToggle).toHaveBeenCalledWith(0, true);
  });

  it('invokes onEdit with the row index when Edit is clicked', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const configs: GeminiKeyConfig[] = [{ apiKey: 'k1' }, { apiKey: 'k2' }];

    render(<GeminiSection {...baseProps({ configs, onEdit })} />);
    await user.click(screen.getAllByRole('button', { name: 'Edit' })[1]);

    expect(onEdit).toHaveBeenCalledWith(1);
  });

  it('invokes onDelete with the row index when Delete is clicked', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    const configs: GeminiKeyConfig[] = [{ apiKey: 'k1' }];

    render(<GeminiSection {...baseProps({ configs, onDelete })} />);
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(onDelete).toHaveBeenCalledWith(0);
  });

  it('renders the total success count for a config from the usage map', () => {
    const configs: GeminiKeyConfig[] = [{ apiKey: 'kA', baseUrl: 'https://b.test' }];
    const usageByProvider = usageMap('gemini', 'kA', 'https://b.test', { success: 12, failed: 3 });

    render(<GeminiSection {...baseProps({ configs, usageByProvider })} />);

    expect(screen.getByText('Success: 12')).toBeInTheDocument();
  });

  it('renders the total failure count for a config from the usage map', () => {
    const configs: GeminiKeyConfig[] = [{ apiKey: 'kA', baseUrl: 'https://b.test' }];
    const usageByProvider = usageMap('gemini', 'kA', 'https://b.test', { success: 12, failed: 3 });

    render(<GeminiSection {...baseProps({ configs, usageByProvider })} />);

    expect(screen.getByText('Failure: 3')).toBeInTheDocument();
  });

  it('shows the Concurrency badge value for the gemini provider', () => {
    const configs: GeminiKeyConfig[] = [{ apiKey: 'k1' }];

    render(
      <GeminiSection
        {...baseProps({ configs, upstreamConcurrency: { providers: { gemini: 6 } } })}
      />
    );

    expect(screen.getByText('6')).toBeInTheDocument();
  });
});
