import { describe, it, expect, vi } from 'vitest';
import { render, screen, userEvent, within } from '@/test/utils';
import type { OpenAIProviderConfig } from '@/types';
import type { ProviderRecentUsageMap } from '../utils';
import { OpenRouterSection, type IndexedOpenRouterProvider } from './OpenRouterSection';

function indexed(
  config: Partial<OpenAIProviderConfig>,
  originalIndex: number
): IndexedOpenRouterProvider {
  return {
    originalIndex,
    config: {
      name: 'OpenRouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKeyEntries: [],
      ...config,
    },
  };
}

function baseProps(overrides: Partial<React.ComponentProps<typeof OpenRouterSection>> = {}) {
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
  } satisfies React.ComponentProps<typeof OpenRouterSection>;
}

describe('OpenRouterSection', () => {
  it('renders the OpenRouter card title', () => {
    render(<OpenRouterSection {...baseProps()} />);

    expect(screen.getByText('OpenRouter')).toBeInTheDocument();
  });

  it('shows the empty state when there are no providers', () => {
    render(<OpenRouterSection {...baseProps({ providers: [] })} />);

    expect(screen.getByText('No OpenRouter Providers')).toBeInTheDocument();
  });

  it('shows the loading hint when loading and there are no providers', () => {
    render(<OpenRouterSection {...baseProps({ loading: true, providers: [] })} />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('invokes onAdd when the add button is clicked', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();

    render(<OpenRouterSection {...baseProps({ onAdd })} />);
    await user.click(screen.getByRole('button', { name: 'Add OpenRouter Provider' }));

    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('disables the add button when controls are disabled', () => {
    render(<OpenRouterSection {...baseProps({ disableControls: true })} />);

    expect(screen.getByRole('button', { name: 'Add OpenRouter Provider' })).toBeDisabled();
  });

  it('renders the provider name and base url', () => {
    const providers = [indexed({ name: 'My Router', baseUrl: 'https://openrouter.ai/api/v1' }, 0)];

    render(<OpenRouterSection {...baseProps({ providers })} />);

    expect(screen.getByText('My Router')).toBeInTheDocument();
    expect(screen.getByText('https://openrouter.ai/api/v1')).toBeInTheDocument();
  });

  it('falls back to the OpenRouter label when the provider name is empty', () => {
    const providers = [indexed({ name: '' }, 0)];

    const { container } = render(<OpenRouterSection {...baseProps({ providers })} />);

    expect(within(container).getAllByText('OpenRouter').length).toBeGreaterThan(1);
  });

  it('renders the keys count for a provider with api key entries', () => {
    const providers = [indexed({ apiKeyEntries: [{ apiKey: 'k1' }, { apiKey: 'k2' }] }, 0)];

    render(<OpenRouterSection {...baseProps({ providers })} />);

    expect(screen.getByText('Keys Count: 2')).toBeInTheDocument();
  });

  it('renders the disabled badge when the provider is disabled', () => {
    const providers = [indexed({ disabled: true }, 0)];

    render(<OpenRouterSection {...baseProps({ providers })} />);

    expect(screen.getByText('Disabled')).toBeInTheDocument();
  });

  it('invokes onToggle with the original index and the new enabled value', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const providers = [indexed({ disabled: true }, 3)];

    render(<OpenRouterSection {...baseProps({ providers, onToggle })} />);
    await user.click(screen.getByRole('checkbox'));

    expect(onToggle).toHaveBeenCalledWith(3, true);
  });

  it('invokes onEdit with the original index when Edit is clicked', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const providers = [indexed({ name: 'only' }, 2)];

    render(<OpenRouterSection {...baseProps({ providers, onEdit })} />);
    await user.click(screen.getByRole('button', { name: 'Edit' }));

    expect(onEdit).toHaveBeenCalledWith(2);
  });

  it('invokes onDelete with the original index when Delete is clicked', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    const providers = [indexed({ name: 'only' }, 2)];

    render(<OpenRouterSection {...baseProps({ providers, onDelete })} />);
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(onDelete).toHaveBeenCalledWith(2);
  });

  it('orders providers ascending by priority', () => {
    const providers = [
      indexed({ name: 'low-pri', priority: 9 }, 0),
      indexed({ name: 'high-pri', priority: 1 }, 1),
    ];

    const { container } = render(<OpenRouterSection {...baseProps({ providers })} />);

    const names = within(container)
      .getAllByText(/-pri$/)
      .map((el) => el.textContent);
    expect(names).toEqual(['high-pri', 'low-pri']);
  });
});
