import { describe, it, expect, vi } from 'vitest';
import { render, screen, userEvent, within } from '@/test/utils';
import type { OpenAIProviderConfig } from '@/types';
import type { RecentRequestUsageEntry } from '@/utils/recentRequests';
import { buildRecentRequestCompositeKey } from '@/utils/recentRequests';
import type { ProviderRecentUsageMap } from '../utils';
import { OpenAISection } from './OpenAISection';

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
  outer.set(provider.trim().toLowerCase(), inner);
  return outer;
}

function provider(overrides: Partial<OpenAIProviderConfig> = {}): OpenAIProviderConfig {
  return {
    name: 'p1',
    baseUrl: 'https://p1.test',
    apiKeyEntries: [],
    ...overrides,
  };
}

function baseProps(overrides: Partial<React.ComponentProps<typeof OpenAISection>> = {}) {
  return {
    configs: [],
    usageByProvider: new Map() as ProviderRecentUsageMap,
    loading: false,
    disableControls: false,
    isSwitching: false,
    resolvedTheme: 'light',
    onAdd: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onToggle: vi.fn(),
    ...overrides,
  } satisfies React.ComponentProps<typeof OpenAISection>;
}

describe('OpenAISection', () => {
  it('renders the OpenAI card title', () => {
    render(<OpenAISection {...baseProps()} />);

    expect(screen.getAllByText('OpenAI Compatible Providers').length).toBeGreaterThan(0);
  });

  it('shows the empty state when there are no configs', () => {
    render(<OpenAISection {...baseProps({ configs: [] })} />);

    expect(screen.getByText('No OpenAI Compatible Providers')).toBeInTheDocument();
  });

  it('shows the loading hint when loading and no configs are present', () => {
    render(<OpenAISection {...baseProps({ loading: true, configs: [] })} />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('invokes onAdd when the add button is clicked', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();

    render(<OpenAISection {...baseProps({ onAdd })} />);
    await user.click(screen.getByRole('button', { name: 'Add Provider' }));

    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('disables the add button when controls are disabled', () => {
    render(<OpenAISection {...baseProps({ disableControls: true })} />);

    expect(screen.getByRole('button', { name: 'Add Provider' })).toBeDisabled();
  });

  it('renders the provider name', () => {
    const configs = [provider({ name: 'My Provider' })];

    render(<OpenAISection {...baseProps({ configs })} />);

    expect(screen.getByText('My Provider')).toBeInTheDocument();
  });

  it('renders the provider base url', () => {
    const configs = [provider({ baseUrl: 'https://api.example' })];

    render(<OpenAISection {...baseProps({ configs })} />);

    expect(screen.getByText('https://api.example')).toBeInTheDocument();
  });

  it('renders the priority value when priority is defined', () => {
    const configs = [provider({ priority: 5 })];

    const { container } = render(<OpenAISection {...baseProps({ configs })} />);

    const label = within(container).getByText('Priority:');
    expect(label.nextElementSibling).toHaveTextContent('5');
  });

  it('does not render a priority row when priority is undefined', () => {
    const configs = [provider({ priority: undefined })];

    render(<OpenAISection {...baseProps({ configs })} />);

    expect(screen.queryByText('Priority:')).not.toBeInTheDocument();
  });

  it('renders the prefix when present', () => {
    const configs = [provider({ prefix: 'oai' })];

    const { container } = render(<OpenAISection {...baseProps({ configs })} />);

    const label = within(container).getByText('Prefix:');
    expect(label.nextElementSibling).toHaveTextContent('oai');
  });

  it('renders the models count reflecting the number of configured models', () => {
    const configs = [provider({ models: [{ name: 'a' }, { name: 'b' }] })];

    const { container } = render(<OpenAISection {...baseProps({ configs })} />);

    const label = within(container).getByText('Models Count:');
    expect(label.nextElementSibling).toHaveTextContent('2');
  });

  it('renders a models count of zero when there are no models', () => {
    const configs = [provider({ models: [] })];

    const { container } = render(<OpenAISection {...baseProps({ configs })} />);

    const label = within(container).getByText('Models Count:');
    expect(label.nextElementSibling).toHaveTextContent('0');
  });

  it('renders the model name for a configured model', () => {
    const configs = [provider({ models: [{ name: 'gpt-4o', alias: 'fast' }] })];

    render(<OpenAISection {...baseProps({ configs })} />);

    expect(screen.getByText('gpt-4o')).toBeInTheDocument();
  });

  it('renders the model alias when it differs from the model name', () => {
    const configs = [provider({ models: [{ name: 'gpt-4o', alias: 'fast' }] })];

    render(<OpenAISection {...baseProps({ configs })} />);

    expect(screen.getByText('fast')).toBeInTheDocument();
  });

  it('renders the test model when present', () => {
    const configs = [provider({ testModel: 'gpt-4o-mini' })];

    const { container } = render(<OpenAISection {...baseProps({ configs })} />);

    const label = within(container).getByText('Test Model:');
    expect(label.nextElementSibling).toHaveTextContent('gpt-4o-mini');
  });

  it('renders the keys count for a provider with api key entries', () => {
    const configs = [provider({ apiKeyEntries: [{ apiKey: 'k1' }, { apiKey: 'k2' }] })];

    render(<OpenAISection {...baseProps({ configs })} />);

    expect(screen.getByText('Keys Count: 2')).toBeInTheDocument();
  });

  it('renders the masked api key for an api key entry', () => {
    const configs = [provider({ apiKeyEntries: [{ apiKey: 'sk-1234567890abcdef' }] })];

    render(<OpenAISection {...baseProps({ configs })} />);

    expect(screen.getByText('sk******ef')).toBeInTheDocument();
  });

  it('renders the disabled badge when the provider is disabled', () => {
    const configs = [provider({ disabled: true })];

    render(<OpenAISection {...baseProps({ configs })} />);

    expect(screen.getByText('Disabled')).toBeInTheDocument();
  });

  it('renders a header badge for a configured header', () => {
    const configs = [provider({ headers: { 'X-Foo': 'bar' } })];

    render(<OpenAISection {...baseProps({ configs })} />);

    expect(screen.getByText('X-Foo:')).toBeInTheDocument();
  });

  it('renders the disable cooling value as Yes when disableCooling is true', () => {
    const configs = [provider({ disableCooling: true })];

    const { container } = render(<OpenAISection {...baseProps({ configs })} />);

    const label = within(container).getByText("Disable Cooling:");
    expect(label.nextElementSibling).toHaveTextContent('Yes');
  });

  it('renders the toggle as checked when the provider is not disabled', () => {
    const configs = [provider({ disabled: false })];

    render(<OpenAISection {...baseProps({ configs })} />);

    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('renders the toggle as unchecked when the provider is disabled', () => {
    const configs = [provider({ disabled: true })];

    render(<OpenAISection {...baseProps({ configs })} />);

    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('invokes onToggle with the original index and the new enabled value', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const configs = [provider({ disabled: true })];

    render(<OpenAISection {...baseProps({ configs, onToggle })} />);
    await user.click(screen.getByRole('checkbox'));

    expect(onToggle).toHaveBeenCalledWith(0, true);
  });

  it('invokes onEdit with the original index when Edit is clicked', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const configs = [provider({ name: 'only' })];

    render(<OpenAISection {...baseProps({ configs, onEdit })} />);
    await user.click(screen.getByRole('button', { name: 'Edit' }));

    expect(onEdit).toHaveBeenCalledWith(0);
  });

  it('invokes onDelete with the original index when Delete is clicked', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    const configs = [provider({ name: 'only' })];

    render(<OpenAISection {...baseProps({ configs, onDelete })} />);
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(onDelete).toHaveBeenCalledWith(0);
  });

  it('renders the total success count aggregated from the api key entries', () => {
    const configs = [
      provider({ name: 'pA', baseUrl: 'https://a.test', apiKeyEntries: [{ apiKey: 'kA' }] }),
    ];
    const usageByProvider = usageMap('pA', 'kA', 'https://a.test', { success: 9, failed: 2 });

    render(<OpenAISection {...baseProps({ configs, usageByProvider })} />);

    expect(screen.getByText('Success: 9')).toBeInTheDocument();
  });

  it('renders the total failure count aggregated from the api key entries', () => {
    const configs = [
      provider({ name: 'pA', baseUrl: 'https://a.test', apiKeyEntries: [{ apiKey: 'kA' }] }),
    ];
    const usageByProvider = usageMap('pA', 'kA', 'https://a.test', { success: 9, failed: 2 });

    render(<OpenAISection {...baseProps({ configs, usageByProvider })} />);

    expect(screen.getByText('Failure: 2')).toBeInTheDocument();
  });

  it('hides providers that the filterProvider predicate rejects', () => {
    const configs = [provider({ name: 'keep' }), provider({ name: 'drop' })];

    render(
      <OpenAISection
        {...baseProps({ configs, filterProvider: (p) => p.name === 'keep' })}
      />
    );

    expect(screen.queryByText('drop')).not.toBeInTheDocument();
  });

  it('shows the standard empty state when filterProvider rejects every provider', () => {
    const configs = [provider({ name: 'drop' })];

    render(<OpenAISection {...baseProps({ configs, filterProvider: () => false })} />);

    expect(screen.getByText('No OpenAI Compatible Providers')).toBeInTheDocument();
  });

  it('orders providers ascending by priority by default', () => {
    const configs = [provider({ name: 'low-pri', priority: 9 }), provider({ name: 'high-pri', priority: 1 })];

    const { container } = render(<OpenAISection {...baseProps({ configs })} />);

    const names = within(container)
      .getAllByText(/-pri$/)
      .map((el) => el.textContent);
    expect(names).toEqual(['high-pri', 'low-pri']);
  });

  it('lists every selectable model in the filter dropdown', async () => {
    const user = userEvent.setup();
    const configs = [provider({ name: 'p', models: [{ name: 'alpha' }, { name: 'beta' }] })];

    render(<OpenAISection {...baseProps({ configs })} />);
    await user.click(screen.getByRole('button', { name: 'Filter by models...' }));

    const dropdown = screen.getByRole('group', { name: 'Filter by models...' });
    expect(within(dropdown).getByText('beta')).toBeInTheDocument();
  });

  it('filters providers to those that have the selected model', async () => {
    const user = userEvent.setup();
    const configs = [
      provider({ name: 'has-alpha', models: [{ name: 'alpha' }] }),
      provider({ name: 'has-beta', models: [{ name: 'beta' }] }),
    ];

    render(<OpenAISection {...baseProps({ configs })} />);
    await user.click(screen.getByRole('button', { name: 'Filter by models...' }));
    const dropdown = screen.getByRole('group', { name: 'Filter by models...' });
    await user.click(within(dropdown).getByText('alpha'));

    expect(screen.queryByText('has-beta')).not.toBeInTheDocument();
  });

  it('keeps providers that have the selected model after filtering', async () => {
    const user = userEvent.setup();
    const configs = [
      provider({ name: 'has-alpha', models: [{ name: 'alpha' }] }),
      provider({ name: 'has-beta', models: [{ name: 'beta' }] }),
    ];

    render(<OpenAISection {...baseProps({ configs })} />);
    await user.click(screen.getByRole('button', { name: 'Filter by models...' }));
    const dropdown = screen.getByRole('group', { name: 'Filter by models...' });
    await user.click(within(dropdown).getByText('alpha'));

    expect(screen.getByText('has-alpha')).toBeInTheDocument();
  });
});
