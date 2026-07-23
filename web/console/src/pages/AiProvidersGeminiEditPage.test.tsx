import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithRouter, screen, userEvent, waitFor } from '@/test/utils';
import { useAuthStore, useConfigStore, useNotificationStore } from '@/stores';
import type { Config, GeminiKeyConfig } from '@/types';
import type { ModelInfo } from '@/utils/models';
import { AiProvidersGeminiEditPage } from './AiProvidersGeminiEditPage';

// Boundary mocks: the typed API modules the page imports from '@/services/api'.
const saveGeminiKeys = vi.fn<(list: GeminiKeyConfig[]) => Promise<void>>();
const fetchGeminiModelsViaApiCall = vi.fn<(...args: unknown[]) => Promise<ModelInfo[]>>();
const buildGeminiModelsEndpoint = vi.fn<(baseUrl: string) => string>();
const saveProviderConcurrencyDraft = vi.fn<(...args: unknown[]) => Promise<void>>();

vi.mock('@/services/api', () => ({
  providersApi: {
    saveGeminiKeys: (list: GeminiKeyConfig[]) => saveGeminiKeys(list),
  },
  modelsApi: {
    fetchGeminiModelsViaApiCall: (...args: unknown[]) => fetchGeminiModelsViaApiCall(...args),
    buildGeminiModelsEndpoint: (baseUrl: string) => buildGeminiModelsEndpoint(baseUrl),
  },
  saveProviderConcurrencyDraft: (...args: unknown[]) => saveProviderConcurrencyDraft(...args),
}));

const getConfig = vi.fn<() => Promise<Config>>();
vi.mock('@/services/api/config', () => ({
  configApi: {
    getConfig: (...args: unknown[]) => getConfig(...args),
  },
}));

const allowNextNavigation = vi.fn();
vi.mock('@/hooks/useUnsavedChangesGuard', () => ({
  useUnsavedChangesGuard: () => ({ allowNextNavigation }),
}));

const GEMINI_ROUTE_PATH = '/ai-providers/gemini/:index';

// Seed the config store so fetchConfig('gemini-api-key') resolves from the warm
// full-config cache (config.geminiApiKeys) instead of hitting the network.
function seedConfig(geminiApiKeys: GeminiKeyConfig[], overrides: Partial<Config> = {}) {
  const config: Config = {
    raw: { 'gemini-api-key': geminiApiKeys },
    geminiApiKeys,
    ...overrides,
  } as Config;
  useConfigStore.setState({
    config,
    cache: new Map([['__full__', { data: config, timestamp: Date.now() }]]),
    loading: false,
    error: null,
  });
  getConfig.mockResolvedValue(config);
}

function getFloatingSaveButton() {
  const buttons = screen.getAllByRole('button', { name: 'Save' });
  return buttons[buttons.length - 1];
}

beforeEach(() => {
  localStorage.clear();
  saveGeminiKeys.mockReset().mockResolvedValue(undefined);
  fetchGeminiModelsViaApiCall.mockReset().mockResolvedValue([]);
  buildGeminiModelsEndpoint
    .mockReset()
    .mockImplementation((baseUrl: string) =>
      baseUrl
        ? `${baseUrl.replace(/\/+$/, '')}/v1beta/models`
        : 'https://generativelanguage.googleapis.com/v1beta/models'
    );
  saveProviderConcurrencyDraft.mockReset().mockResolvedValue(undefined);
  getConfig.mockReset();
  allowNextNavigation.mockReset();
  useAuthStore.setState({ connectionStatus: 'connected' });
  useNotificationStore.setState({
    notifications: [],
    confirmation: { isOpen: false, isLoading: false, options: null },
  });
});

describe('AiProvidersGeminiEditPage - title and load', () => {
  it('shows the add-key title when no index param is present', async () => {
    seedConfig([]);

    renderWithRouter(<AiProvidersGeminiEditPage />, { route: '/ai-providers/gemini' });

    expect(await screen.findByText('Add Gemini API Key')).toBeInTheDocument();
  });

  it('shows the edit-key title when a valid index param is present', async () => {
    seedConfig([{ apiKey: 'g-key', baseUrl: 'https://gemini.example.com' }]);

    renderWithRouter(<AiProvidersGeminiEditPage />, {
      route: '/ai-providers/gemini/0',
      path: GEMINI_ROUTE_PATH,
    });

    expect(await screen.findByText('Edit Gemini API Key')).toBeInTheDocument();
  });

  it('populates the API key field from the loaded config at the given index', async () => {
    seedConfig([{ apiKey: 'g-key', baseUrl: 'https://gemini.example.com' }]);

    renderWithRouter(<AiProvidersGeminiEditPage />, {
      route: '/ai-providers/gemini/0',
      path: GEMINI_ROUTE_PATH,
    });

    expect(await screen.findByDisplayValue('g-key')).toBe(
      await screen.findByLabelText('API Keys:')
    );
  });

  it('populates the base URL field from the config at the given non-zero index', async () => {
    seedConfig([
      { apiKey: 'first', baseUrl: 'https://a.example.com' },
      { apiKey: 'second', baseUrl: 'https://b.example.com' },
    ]);

    renderWithRouter(<AiProvidersGeminiEditPage />, {
      route: '/ai-providers/gemini/1',
      path: GEMINI_ROUTE_PATH,
    });

    expect(await screen.findByDisplayValue('https://b.example.com')).toBe(
      await screen.findByLabelText('Base URL (Optional):')
    );
  });

  it('renders the invalid provider index hint when the index param is non-numeric', async () => {
    seedConfig([{ apiKey: 'g', baseUrl: 'https://x' }]);

    renderWithRouter(<AiProvidersGeminiEditPage />, {
      route: '/ai-providers/gemini/abc',
      path: GEMINI_ROUTE_PATH,
    });

    expect(await screen.findByText('Invalid provider index.')).toBeInTheDocument();
  });

  it('renders the invalid provider index hint when the index is out of range', async () => {
    seedConfig([{ apiKey: 'g', baseUrl: 'https://x' }]);

    renderWithRouter(<AiProvidersGeminiEditPage />, {
      route: '/ai-providers/gemini/9',
      path: GEMINI_ROUTE_PATH,
    });

    expect(await screen.findByText('Invalid provider index.')).toBeInTheDocument();
  });
});

describe('AiProvidersGeminiEditPage - save gating', () => {
  it('disables Save when the connection is not connected', async () => {
    seedConfig([{ apiKey: 'g', baseUrl: 'https://x.example.com' }]);
    useAuthStore.setState({ connectionStatus: 'disconnected' });

    renderWithRouter(<AiProvidersGeminiEditPage />, {
      route: '/ai-providers/gemini/0',
      path: GEMINI_ROUTE_PATH,
    });
    await screen.findByDisplayValue('https://x.example.com');

    expect(getFloatingSaveButton()).toBeDisabled();
  });

  it('enables Save when connected on the add screen', async () => {
    seedConfig([]);

    renderWithRouter(<AiProvidersGeminiEditPage />, { route: '/ai-providers/gemini' });
    await screen.findByLabelText('API Keys:');

    expect(getFloatingSaveButton()).toBeEnabled();
  });
});

describe('AiProvidersGeminiEditPage - save contract', () => {
  it('saves a new key appended to the existing list with the entered API key', async () => {
    const user = userEvent.setup();
    seedConfig([{ apiKey: 'existing' }]);

    renderWithRouter(<AiProvidersGeminiEditPage />, { route: '/ai-providers/gemini' });
    await user.type(await screen.findByLabelText('API Keys:'), 'new-key');
    await user.click(getFloatingSaveButton());

    await waitFor(() => expect(saveGeminiKeys).toHaveBeenCalledTimes(1));
    const savedList = saveGeminiKeys.mock.calls[0][0];
    expect(savedList).toHaveLength(2);
    expect(savedList[1]).toEqual(expect.objectContaining({ apiKey: 'new-key' }));
  });

  it('replaces the key at the edited index and leaves the other entry untouched', async () => {
    const user = userEvent.setup();
    seedConfig([
      { apiKey: 'first', baseUrl: 'https://a.example.com' },
      { apiKey: 'second', baseUrl: 'https://b.example.com' },
    ]);

    renderWithRouter(<AiProvidersGeminiEditPage />, {
      route: '/ai-providers/gemini/0',
      path: GEMINI_ROUTE_PATH,
    });
    await user.type(await screen.findByLabelText('Prefix (Optional):'), 'p-');
    await user.click(getFloatingSaveButton());

    await waitFor(() => expect(saveGeminiKeys).toHaveBeenCalledTimes(1));
    const savedList = saveGeminiKeys.mock.calls[0][0];
    expect(savedList).toHaveLength(2);
    expect(savedList[0]).toEqual(
      expect.objectContaining({ apiKey: 'first', baseUrl: 'https://a.example.com', prefix: 'p-' })
    );
    expect(savedList[1]).toEqual(
      expect.objectContaining({ apiKey: 'second', baseUrl: 'https://b.example.com' })
    );
  });

  it('trims the entered API key in the saved payload', async () => {
    const user = userEvent.setup();
    seedConfig([]);

    renderWithRouter(<AiProvidersGeminiEditPage />, { route: '/ai-providers/gemini' });
    await user.type(await screen.findByLabelText('API Keys:'), '   trimmed-key   ');
    await user.click(getFloatingSaveButton());

    await waitFor(() => expect(saveGeminiKeys).toHaveBeenCalledTimes(1));
    expect(saveGeminiKeys.mock.calls[0][0][0].apiKey).toBe('trimmed-key');
  });

  it('strips the models/ resource prefix from model names in the saved payload', async () => {
    const user = userEvent.setup();
    seedConfig([
      {
        apiKey: 'k',
        baseUrl: 'https://x.example.com',
        models: [{ name: 'models/gemini-pro', alias: '' }],
      },
    ]);

    renderWithRouter(<AiProvidersGeminiEditPage />, {
      route: '/ai-providers/gemini/0',
      path: GEMINI_ROUTE_PATH,
    });
    await screen.findByDisplayValue('https://x.example.com');
    await user.type(await screen.findByLabelText('API Keys:'), 'x');
    await user.click(getFloatingSaveButton());

    await waitFor(() => expect(saveGeminiKeys).toHaveBeenCalledTimes(1));
    expect(saveGeminiKeys.mock.calls[0][0][0].models).toEqual([{ name: 'gemini-pro' }]);
  });

  it('persists the concurrency draft via saveProviderConcurrencyDraft on save', async () => {
    const user = userEvent.setup();
    seedConfig([]);

    renderWithRouter(<AiProvidersGeminiEditPage />, { route: '/ai-providers/gemini' });
    await user.type(await screen.findByLabelText('API Keys:'), 'k');
    await user.click(getFloatingSaveButton());

    await waitFor(() => expect(saveProviderConcurrencyDraft).toHaveBeenCalledTimes(1));
    expect(saveProviderConcurrencyDraft.mock.calls[0][0]).toEqual(
      expect.objectContaining({ providerKey: 'gemini' })
    );
  });

  it('shows the added-key success notification after a successful add', async () => {
    const user = userEvent.setup();
    seedConfig([]);

    renderWithRouter(<AiProvidersGeminiEditPage />, { route: '/ai-providers/gemini' });
    await user.type(await screen.findByLabelText('API Keys:'), 'k');
    await user.click(getFloatingSaveButton());

    await waitFor(() =>
      expect(
        useNotificationStore
          .getState()
          .notifications.some(
            (n) => n.message === 'Gemini key added successfully' && n.type === 'success'
          )
      ).toBe(true)
    );
  });

  it('shows the updated-key success notification after a successful edit', async () => {
    const user = userEvent.setup();
    seedConfig([{ apiKey: 'k', baseUrl: 'https://x.example.com' }]);

    renderWithRouter(<AiProvidersGeminiEditPage />, {
      route: '/ai-providers/gemini/0',
      path: GEMINI_ROUTE_PATH,
    });
    await user.type(await screen.findByLabelText('Prefix (Optional):'), 'p-');
    await user.click(getFloatingSaveButton());

    await waitFor(() =>
      expect(
        useNotificationStore
          .getState()
          .notifications.some(
            (n) => n.message === 'Gemini key updated successfully' && n.type === 'success'
          )
      ).toBe(true)
    );
  });

  it('shows an update-failed error notification when saving rejects', async () => {
    const user = userEvent.setup();
    seedConfig([]);
    saveGeminiKeys.mockRejectedValue(new Error('boom'));

    renderWithRouter(<AiProvidersGeminiEditPage />, { route: '/ai-providers/gemini' });
    await user.type(await screen.findByLabelText('API Keys:'), 'k');
    await user.click(getFloatingSaveButton());

    await waitFor(() =>
      expect(
        useNotificationStore
          .getState()
          .notifications.some((n) => n.message === 'Update failed: boom' && n.type === 'error')
      ).toBe(true)
    );
  });
});

describe('AiProvidersGeminiEditPage - model discovery', () => {
  it('disables the fetch-models button when the connection is not connected', async () => {
    seedConfig([{ apiKey: 'k', baseUrl: 'https://x.example.com' }]);
    useAuthStore.setState({ connectionStatus: 'disconnected' });

    renderWithRouter(<AiProvidersGeminiEditPage />, {
      route: '/ai-providers/gemini/0',
      path: GEMINI_ROUTE_PATH,
    });
    await screen.findByDisplayValue('https://x.example.com');

    expect(screen.getByRole('button', { name: 'Fetch via /v1beta/models' })).toBeDisabled();
  });

  it('lists models returned by discovery after opening with an API key', async () => {
    const user = userEvent.setup();
    fetchGeminiModelsViaApiCall.mockResolvedValue([
      { name: 'gemini-alpha' },
      { name: 'gemini-beta' },
    ]);
    seedConfig([{ apiKey: 'k', baseUrl: 'https://x.example.com' }]);

    renderWithRouter(<AiProvidersGeminiEditPage />, {
      route: '/ai-providers/gemini/0',
      path: GEMINI_ROUTE_PATH,
    });
    await screen.findByDisplayValue('https://x.example.com');
    await user.click(screen.getByRole('button', { name: 'Fetch via /v1beta/models' }));

    expect(await screen.findByText('gemini-alpha')).toBeInTheDocument();
  });

  it('shows the fetch error message when discovery rejects', async () => {
    const user = userEvent.setup();
    fetchGeminiModelsViaApiCall.mockRejectedValue(new Error('network down'));
    seedConfig([{ apiKey: 'k', baseUrl: 'https://x.example.com' }]);

    renderWithRouter(<AiProvidersGeminiEditPage />, {
      route: '/ai-providers/gemini/0',
      path: GEMINI_ROUTE_PATH,
    });
    await screen.findByDisplayValue('https://x.example.com');
    await user.click(screen.getByRole('button', { name: 'Fetch via /v1beta/models' }));

    expect(
      await screen.findByText('Failed to fetch Gemini models: network down')
    ).toBeInTheDocument();
  });

  it('merges a selected discovered model into the model entries list on apply', async () => {
    const user = userEvent.setup();
    fetchGeminiModelsViaApiCall.mockResolvedValue([{ name: 'discovered-model' }]);
    seedConfig([{ apiKey: 'k', baseUrl: 'https://x.example.com' }]);

    renderWithRouter(<AiProvidersGeminiEditPage />, {
      route: '/ai-providers/gemini/0',
      path: GEMINI_ROUTE_PATH,
    });
    await screen.findByDisplayValue('https://x.example.com');
    await user.click(screen.getByRole('button', { name: 'Fetch via /v1beta/models' }));
    await screen.findByText('discovered-model');
    await user.click(screen.getByRole('checkbox', { name: 'discovered-model' }));
    await user.click(screen.getByRole('button', { name: 'Add selected models' }));

    // The applied model becomes a model-name field value in the form.
    expect(await screen.findByDisplayValue('discovered-model')).toBe(
      screen
        .getAllByPlaceholderText('Model name, e.g. claude-3-5-sonnet-20241022')
        .find((el) => (el as HTMLInputElement).value === 'discovered-model')
    );

    // The "N new models added" success notification fires with the count of
    // newly merged models.
    await waitFor(() =>
      expect(
        useNotificationStore
          .getState()
          .notifications.some((n) => n.message === '1 new models added' && n.type === 'success')
      ).toBe(true)
    );
  });
});
