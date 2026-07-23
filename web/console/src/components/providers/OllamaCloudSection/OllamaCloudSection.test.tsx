import { describe, it, expect, vi } from 'vitest';
import { render, screen, userEvent, within } from '@/test/utils';
import type { OpenAIProviderConfig } from '@/types';
import type { ProviderRecentUsageMap } from '../utils';
import { OllamaCloudSection, type IndexedOllamaCloudProvider } from './OllamaCloudSection';

function indexed(
  config: Partial<OpenAIProviderConfig>,
  originalIndex: number
): IndexedOllamaCloudProvider {
  return {
    originalIndex,
    config: {
      name: 'Ollama Cloud',
      baseUrl: 'https://ollama.com/v1',
      apiKeyEntries: [],
      ...config,
    },
  };
}

function baseProps(overrides: Partial<React.ComponentProps<typeof OllamaCloudSection>> = {}) {
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
  } satisfies React.ComponentProps<typeof OllamaCloudSection>;
}

describe('OllamaCloudSection', () => {
  it('renders the Ollama Cloud card title', () => {
    render(<OllamaCloudSection {...baseProps()} />);

    expect(screen.getByText('Ollama Cloud')).toBeInTheDocument();
  });

  it('shows the empty state when there are no providers', () => {
    render(<OllamaCloudSection {...baseProps({ providers: [] })} />);

    expect(screen.getByText('No Ollama Cloud Providers')).toBeInTheDocument();
  });

  it('shows the loading hint when loading and there are no providers', () => {
    render(<OllamaCloudSection {...baseProps({ loading: true, providers: [] })} />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('invokes onAdd when the add button is clicked', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();

    render(<OllamaCloudSection {...baseProps({ onAdd })} />);
    await user.click(screen.getByRole('button', { name: 'Add Ollama Cloud Provider' }));

    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('renders the provider name and base url', () => {
    const providers = [indexed({ name: 'Hosted Ollama', baseUrl: 'https://ollama.com/v1' }, 0)];

    render(<OllamaCloudSection {...baseProps({ providers })} />);

    expect(screen.getByText('Hosted Ollama')).toBeInTheDocument();
    expect(screen.getByText('https://ollama.com/v1')).toBeInTheDocument();
  });

  it('falls back to the Ollama Cloud label when the provider name is empty', () => {
    const providers = [indexed({ name: '' }, 0)];

    const { container } = render(<OllamaCloudSection {...baseProps({ providers })} />);

    expect(within(container).getAllByText('Ollama Cloud').length).toBeGreaterThan(1);
  });

  it('renders the keys count for a provider with api key entries', () => {
    const providers = [indexed({ apiKeyEntries: [{ apiKey: 'k1' }, { apiKey: 'k2' }] }, 0)];

    render(<OllamaCloudSection {...baseProps({ providers })} />);

    expect(screen.getByText('Keys Count: 2')).toBeInTheDocument();
  });

  it('invokes onToggle with the original index and the new enabled value', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const providers = [indexed({ disabled: true }, 3)];

    render(<OllamaCloudSection {...baseProps({ providers, onToggle })} />);
    await user.click(screen.getByRole('checkbox'));

    expect(onToggle).toHaveBeenCalledWith(3, true);
  });

  it('invokes onEdit with the original index when Edit is clicked', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const providers = [indexed({ name: 'only' }, 2)];

    render(<OllamaCloudSection {...baseProps({ providers, onEdit })} />);
    await user.click(screen.getByRole('button', { name: 'Edit' }));

    expect(onEdit).toHaveBeenCalledWith(2);
  });

  it('invokes onDelete with the original index when Delete is clicked', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    const providers = [indexed({ name: 'only' }, 2)];

    render(<OllamaCloudSection {...baseProps({ providers, onDelete })} />);
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(onDelete).toHaveBeenCalledWith(2);
  });

  it('orders providers ascending by priority', () => {
    const providers = [
      indexed({ name: 'low-pri', priority: 9 }, 0),
      indexed({ name: 'high-pri', priority: 1 }, 1),
    ];

    const { container } = render(<OllamaCloudSection {...baseProps({ providers })} />);

    const names = within(container)
      .getAllByText(/-pri$/)
      .map((el) => el.textContent);
    expect(names).toEqual(['high-pri', 'low-pri']);
  });
});
