import { describe, it, expect, vi } from 'vitest';
import { render, screen, userEvent, within } from '@/test/utils';
import type { OpenAIProviderConfig } from '@/types';
import type { RecentRequestUsageEntry } from '@/utils/recentRequests';
import { buildRecentRequestCompositeKey } from '@/utils/recentRequests';
import type { ProviderRecentUsageMap } from '../utils';
import { ZaiSection, type IndexedZaiProvider } from './ZaiSection';

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

function indexed(
  config: Partial<OpenAIProviderConfig>,
  originalIndex: number
): IndexedZaiProvider {
  return {
    originalIndex,
    config: {
      name: 'Z.AI',
      baseUrl: 'https://zai.test',
      apiKeyEntries: [],
      ...config,
    },
  };
}

function baseProps(overrides: Partial<React.ComponentProps<typeof ZaiSection>> = {}) {
  return {
    providers: [],
    usageByProvider: new Map() as ProviderRecentUsageMap,
    loading: false,
    disableControls: false,
    isSwitching: false,
    onAdd: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onToggle: vi.fn(),
    ...overrides,
  } satisfies React.ComponentProps<typeof ZaiSection>;
}

describe('ZaiSection', () => {
  it('renders the Z.AI card title', () => {
    render(<ZaiSection {...baseProps()} />);

    expect(screen.getByText('Z.AI')).toBeInTheDocument();
  });

  it('shows the empty state when there are no providers', () => {
    render(<ZaiSection {...baseProps({ providers: [] })} />);

    expect(screen.getByText('No Z.AI Providers')).toBeInTheDocument();
  });

  it('shows the loading hint when loading and there are no providers', () => {
    render(<ZaiSection {...baseProps({ loading: true, providers: [] })} />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('invokes onAdd when the add button is clicked', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();

    render(<ZaiSection {...baseProps({ onAdd })} />);
    await user.click(screen.getByRole('button', { name: 'Add Z.AI Provider' }));

    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('disables the add button when controls are disabled', () => {
    render(<ZaiSection {...baseProps({ disableControls: true })} />);

    expect(screen.getByRole('button', { name: 'Add Z.AI Provider' })).toBeDisabled();
  });

  it('renders the provider name when present', () => {
    const providers = [indexed({ name: 'Custom GLM' }, 0)];

    render(<ZaiSection {...baseProps({ providers })} />);

    expect(screen.getByText('Custom GLM')).toBeInTheDocument();
  });

  it('falls back to the Z.AI label when the provider name is empty', () => {
    const providers = [indexed({ name: '' }, 0)];

    const { container } = render(<ZaiSection {...baseProps({ providers })} />);

    expect(within(container).getAllByText('Z.AI').length).toBeGreaterThan(1);
  });

  it('renders the provider base url', () => {
    const providers = [indexed({ baseUrl: 'https://glm.example' }, 0)];

    render(<ZaiSection {...baseProps({ providers })} />);

    expect(screen.getByText('https://glm.example')).toBeInTheDocument();
  });

  it('renders the priority value when priority is defined', () => {
    const providers = [indexed({ priority: 4 }, 0)];

    const { container } = render(<ZaiSection {...baseProps({ providers })} />);

    const label = within(container).getByText('Priority:');
    expect(label.nextElementSibling).toHaveTextContent('4');
  });

  it('does not render a priority row when priority is undefined', () => {
    const providers = [indexed({ priority: undefined }, 0)];

    render(<ZaiSection {...baseProps({ providers })} />);

    expect(screen.queryByText('Priority:')).not.toBeInTheDocument();
  });

  it('renders the prefix when present', () => {
    const providers = [indexed({ prefix: 'glm' }, 0)];

    const { container } = render(<ZaiSection {...baseProps({ providers })} />);

    const label = within(container).getByText('Prefix:');
    expect(label.nextElementSibling).toHaveTextContent('glm');
  });

  it('renders the keys count for a provider with api key entries', () => {
    const providers = [indexed({ apiKeyEntries: [{ apiKey: 'k1' }, { apiKey: 'k2' }] }, 0)];

    render(<ZaiSection {...baseProps({ providers })} />);

    expect(screen.getByText('Keys Count: 2')).toBeInTheDocument();
  });

  it('renders the masked api key for an api key entry', () => {
    const providers = [indexed({ apiKeyEntries: [{ apiKey: 'sk-1234567890abcdef' }] }, 0)];

    render(<ZaiSection {...baseProps({ providers })} />);

    expect(screen.getByText('sk******ef')).toBeInTheDocument();
  });

  it('renders the models count reflecting the number of configured models', () => {
    const providers = [indexed({ models: [{ name: 'a' }, { name: 'b' }] }, 0)];

    const { container } = render(<ZaiSection {...baseProps({ providers })} />);

    const label = within(container).getByText('Models Count:');
    expect(label.nextElementSibling).toHaveTextContent('2');
  });

  it('renders the model alias when it differs from the model name', () => {
    const providers = [indexed({ models: [{ name: 'glm-4', alias: 'glm-fast' }] }, 0)];

    render(<ZaiSection {...baseProps({ providers })} />);

    expect(screen.getByText('glm-fast')).toBeInTheDocument();
  });

  it('renders the disabled badge when the provider is disabled', () => {
    const providers = [indexed({ disabled: true }, 0)];

    render(<ZaiSection {...baseProps({ providers })} />);

    expect(screen.getByText('Disabled')).toBeInTheDocument();
  });

  it('renders the test model when present', () => {
    const providers = [indexed({ testModel: 'glm-4-mini' }, 0)];

    const { container } = render(<ZaiSection {...baseProps({ providers })} />);

    const label = within(container).getByText('Test Model:');
    expect(label.nextElementSibling).toHaveTextContent('glm-4-mini');
  });

  it('renders the toggle as checked when the provider is not disabled', () => {
    const providers = [indexed({ disabled: false }, 0)];

    render(<ZaiSection {...baseProps({ providers })} />);

    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('renders the toggle as unchecked when the provider is disabled', () => {
    const providers = [indexed({ disabled: true }, 0)];

    render(<ZaiSection {...baseProps({ providers })} />);

    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('invokes onToggle with the original index and the new enabled value', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const providers = [indexed({ disabled: true }, 3)];

    render(<ZaiSection {...baseProps({ providers, onToggle })} />);
    await user.click(screen.getByRole('checkbox'));

    expect(onToggle).toHaveBeenCalledWith(3, true);
  });

  it('invokes onEdit with the original index when Edit is clicked', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const providers = [indexed({ name: 'only' }, 2)];

    render(<ZaiSection {...baseProps({ providers, onEdit })} />);
    await user.click(screen.getByRole('button', { name: 'Edit' }));

    expect(onEdit).toHaveBeenCalledWith(2);
  });

  it('invokes onDelete with the original index when Delete is clicked', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    const providers = [indexed({ name: 'only' }, 2)];

    render(<ZaiSection {...baseProps({ providers, onDelete })} />);
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(onDelete).toHaveBeenCalledWith(2);
  });

  it('renders the total success count aggregated from the api key entries', () => {
    const providers = [
      indexed({ name: 'pA', baseUrl: 'https://a.test', apiKeyEntries: [{ apiKey: 'kA' }] }, 0),
    ];
    const usageByProvider = usageMap('pA', 'kA', 'https://a.test', { success: 5, failed: 1 });

    render(<ZaiSection {...baseProps({ providers, usageByProvider })} />);

    expect(screen.getByText('Success: 5')).toBeInTheDocument();
  });

  it('renders the total failure count aggregated from the api key entries', () => {
    const providers = [
      indexed({ name: 'pA', baseUrl: 'https://a.test', apiKeyEntries: [{ apiKey: 'kA' }] }, 0),
    ];
    const usageByProvider = usageMap('pA', 'kA', 'https://a.test', { success: 5, failed: 1 });

    render(<ZaiSection {...baseProps({ providers, usageByProvider })} />);

    expect(screen.getByText('Failure: 1')).toBeInTheDocument();
  });

  it('orders providers ascending by priority', () => {
    const providers = [
      indexed({ name: 'low-pri', priority: 9 }, 0),
      indexed({ name: 'high-pri', priority: 1 }, 1),
    ];

    const { container } = render(<ZaiSection {...baseProps({ providers })} />);

    const names = within(container)
      .getAllByText(/-pri$/)
      .map((el) => el.textContent);
    expect(names).toEqual(['high-pri', 'low-pri']);
  });

  it('breaks priority ties by name in ascending alphabetical order', () => {
    const providers = [
      indexed({ name: 'zebra', priority: 1 }, 0),
      indexed({ name: 'apple', priority: 1 }, 1),
    ];

    const { container } = render(<ZaiSection {...baseProps({ providers })} />);

    const names = within(container)
      .getAllByText(/^(zebra|apple)$/)
      .map((el) => el.textContent);
    expect(names).toEqual(['apple', 'zebra']);
  });
});
