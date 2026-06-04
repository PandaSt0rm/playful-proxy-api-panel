import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithRouter, screen, userEvent, waitFor } from '@/test/utils';
import { useAuthStore, useConfigStore, useNotificationStore } from '@/stores';
import type { Config, ProviderKeyConfig } from '@/types';
import type { ModelInfo } from '@/utils/models';
import { AiProvidersCodexEditPage } from './AiProvidersCodexEditPage';

// Boundary mocks: the typed API modules the page imports from '@/services/api'.
const saveCodexConfigs = vi.fn<(list: ProviderKeyConfig[]) => Promise<void>>();
const fetchV1ModelsViaApiCall =
  vi.fn<(...args: unknown[]) => Promise<ModelInfo[]>>();
const buildV1ModelsEndpoint = vi.fn<(baseUrl: string) => string>();
const saveProviderConcurrencyDraft = vi.fn<(...args: unknown[]) => Promise<void>>();

vi.mock('@/services/api', () => ({
  providersApi: {
    saveCodexConfigs: (list: ProviderKeyConfig[]) => saveCodexConfigs(list),
  },
  modelsApi: {
    fetchV1ModelsViaApiCall: (...args: unknown[]) => fetchV1ModelsViaApiCall(...args),
    buildV1ModelsEndpoint: (baseUrl: string) => buildV1ModelsEndpoint(baseUrl),
  },
  saveProviderConcurrencyDraft: (...args: unknown[]) => saveProviderConcurrencyDraft(...args),
}));

// The config store calls configApi.getConfig() directly on a forced refresh.
const getConfig = vi.fn<() => Promise<Config>>();
vi.mock('@/services/api/config', () => ({
  configApi: {
    getConfig: (...args: unknown[]) => getConfig(...args),
  },
}));

// The unsaved-changes guard relies on react-router's data-router (useBlocker),
// which a declarative MemoryRouter does not provide. Stub the app-owned hook so
// the page renders; allowNextNavigation is observed only as a side effect.
const allowNextNavigation = vi.fn();
vi.mock('@/hooks/useUnsavedChangesGuard', () => ({
  useUnsavedChangesGuard: () => ({ allowNextNavigation }),
}));

const CODEX_ROUTE_PATH = '/ai-providers/codex/:index';

// Seed the config store so fetchConfig('codex-api-key') resolves from the warm
// full-config cache instead of hitting the network.
function seedConfig(codexApiKeys: ProviderKeyConfig[], overrides: Partial<Config> = {}) {
  const config: Config = {
    raw: { 'codex-api-key': codexApiKeys },
    codexApiKeys,
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
  // The shell renders [Back, Save] in a portal; Save is the last button.
  const buttons = screen.getAllByRole('button', { name: 'Save' });
  return buttons[buttons.length - 1];
}

beforeEach(() => {
  localStorage.clear();
  saveCodexConfigs.mockReset().mockResolvedValue(undefined);
  fetchV1ModelsViaApiCall.mockReset().mockResolvedValue([]);
  buildV1ModelsEndpoint.mockReset().mockImplementation(
    (baseUrl: string) => (baseUrl ? `${baseUrl.replace(/\/+$/, '')}/v1/models` : '')
  );
  saveProviderConcurrencyDraft.mockReset().mockResolvedValue(undefined);
  getConfig.mockReset();
  useAuthStore.setState({ connectionStatus: 'connected' });
  useNotificationStore.setState({
    notifications: [],
    confirmation: { isOpen: false, isLoading: false, options: null },
  });
});

describe('AiProvidersCodexEditPage - title and load', () => {
  it('shows the add-configuration title when no index param is present', async () => {
    seedConfig([]);

    renderWithRouter(<AiProvidersCodexEditPage />, { route: '/ai-providers/codex' });

    expect(await screen.findByText('Add Codex API Configuration')).toBeInTheDocument();
  });

  it('shows the edit-configuration title when a valid index param is present', async () => {
    seedConfig([{ apiKey: 'sk-codex', baseUrl: 'https://codex.example.com' }]);

    renderWithRouter(<AiProvidersCodexEditPage />, {
      route: '/ai-providers/codex/0',
      path: CODEX_ROUTE_PATH,
    });

    expect(await screen.findByText('Edit Codex API Configuration')).toBeInTheDocument();
  });

  it('populates the base URL field from the loaded config at the given index', async () => {
    seedConfig([{ apiKey: 'sk-codex', baseUrl: 'https://codex.example.com' }]);

    renderWithRouter(<AiProvidersCodexEditPage />, {
      route: '/ai-providers/codex/0',
      path: CODEX_ROUTE_PATH,
    });

    expect(await screen.findByDisplayValue('https://codex.example.com')).toBe(
      await screen.findByLabelText('Base URL (Required):')
    );
  });

  it('populates the API key field from the config at the given non-zero index', async () => {
    seedConfig([
      { apiKey: 'first', baseUrl: 'https://a.example.com' },
      { apiKey: 'second-key', baseUrl: 'https://b.example.com' },
    ]);

    renderWithRouter(<AiProvidersCodexEditPage />, {
      route: '/ai-providers/codex/1',
      path: CODEX_ROUTE_PATH,
    });

    expect(await screen.findByDisplayValue('second-key')).toBe(
      await screen.findByLabelText('API Key:')
    );
  });

  it('renders the invalid provider index hint when the index param is non-numeric', async () => {
    seedConfig([{ apiKey: 'sk', baseUrl: 'https://x' }]);

    renderWithRouter(<AiProvidersCodexEditPage />, {
      route: '/ai-providers/codex/abc',
      path: CODEX_ROUTE_PATH,
    });

    expect(await screen.findByText('Invalid provider index.')).toBeInTheDocument();
  });

  it('renders the invalid provider index hint when the index is out of range', async () => {
    seedConfig([{ apiKey: 'sk', baseUrl: 'https://x' }]);

    renderWithRouter(<AiProvidersCodexEditPage />, {
      route: '/ai-providers/codex/9',
      path: CODEX_ROUTE_PATH,
    });

    expect(await screen.findByText('Invalid provider index.')).toBeInTheDocument();
  });
});

describe('AiProvidersCodexEditPage - save gating', () => {
  it('disables Save when the base URL is empty', async () => {
    seedConfig([]);

    renderWithRouter(<AiProvidersCodexEditPage />, { route: '/ai-providers/codex' });
    await screen.findByLabelText('Base URL (Required):');

    expect(getFloatingSaveButton()).toBeDisabled();
  });

  it('enables Save once a base URL is entered', async () => {
    const user = userEvent.setup();
    seedConfig([]);

    renderWithRouter(<AiProvidersCodexEditPage />, { route: '/ai-providers/codex' });
    await user.type(await screen.findByLabelText('Base URL (Required):'), 'https://new.example.com');

    expect(getFloatingSaveButton()).toBeEnabled();
  });

  it('disables Save when the connection is not connected', async () => {
    seedConfig([{ apiKey: 'sk', baseUrl: 'https://x.example.com' }]);
    useAuthStore.setState({ connectionStatus: 'disconnected' });

    renderWithRouter(<AiProvidersCodexEditPage />, {
      route: '/ai-providers/codex/0',
      path: CODEX_ROUTE_PATH,
    });
    await screen.findByDisplayValue('https://x.example.com');

    expect(getFloatingSaveButton()).toBeDisabled();
  });
});

describe('AiProvidersCodexEditPage - save contract', () => {
  it('saves a new config appended to the existing list with the entered base URL', async () => {
    const user = userEvent.setup();
    seedConfig([{ apiKey: 'existing', baseUrl: 'https://existing.example.com' }]);

    renderWithRouter(<AiProvidersCodexEditPage />, { route: '/ai-providers/codex' });
    await user.type(await screen.findByLabelText('Base URL (Required):'), 'https://added.example.com');
    await user.type(screen.getByLabelText('API Key:'), 'new-key');
    await user.click(getFloatingSaveButton());

    await waitFor(() => expect(saveCodexConfigs).toHaveBeenCalledTimes(1));
    expect(saveCodexConfigs.mock.calls[0][0]).toEqual([
      { apiKey: 'existing', baseUrl: 'https://existing.example.com' },
      expect.objectContaining({ apiKey: 'new-key', baseUrl: 'https://added.example.com' }),
    ]);
  });

  it('replaces the config at the edited index and leaves the other entry untouched', async () => {
    const user = userEvent.setup();
    seedConfig([
      { apiKey: 'first', baseUrl: 'https://a.example.com' },
      { apiKey: 'second', baseUrl: 'https://b.example.com' },
    ]);

    renderWithRouter(<AiProvidersCodexEditPage />, {
      route: '/ai-providers/codex/0',
      path: CODEX_ROUTE_PATH,
    });
    // Make index 0 dirty by typing into its empty prefix field, then save.
    await user.type(await screen.findByLabelText('Prefix (Optional):'), 'p-');
    await user.click(getFloatingSaveButton());

    await waitFor(() => expect(saveCodexConfigs).toHaveBeenCalledTimes(1));
    const savedList = saveCodexConfigs.mock.calls[0][0];
    expect(savedList).toHaveLength(2);
    expect(savedList[0]).toEqual(
      expect.objectContaining({ apiKey: 'first', baseUrl: 'https://a.example.com', prefix: 'p-' })
    );
    expect(savedList[1]).toEqual({ apiKey: 'second', baseUrl: 'https://b.example.com' });
  });

  it('trims the base URL and omits the prefix when blank in the saved payload', async () => {
    const user = userEvent.setup();
    seedConfig([]);

    renderWithRouter(<AiProvidersCodexEditPage />, { route: '/ai-providers/codex' });
    await user.type(
      await screen.findByLabelText('Base URL (Required):'),
      '   https://trimmed.example.com   '
    );
    await user.click(getFloatingSaveButton());

    await waitFor(() => expect(saveCodexConfigs).toHaveBeenCalledTimes(1));
    const payload = saveCodexConfigs.mock.calls[0][0][0];
    expect(payload.baseUrl).toBe('https://trimmed.example.com');
    expect(payload.prefix).toBeUndefined();
  });

  it('normalizes a model alias equal to its name to an undefined alias in the saved payload', async () => {
    const user = userEvent.setup();
    seedConfig([
      {
        apiKey: 'k',
        baseUrl: 'https://x.example.com',
        models: [{ name: 'gpt-4', alias: 'gpt-4' }],
      },
    ]);

    renderWithRouter(<AiProvidersCodexEditPage />, {
      route: '/ai-providers/codex/0',
      path: CODEX_ROUTE_PATH,
    });
    await screen.findByDisplayValue('https://x.example.com');
    // Trigger a save without touching the model (alias === name).
    await user.click(getFloatingSaveButton());

    await waitFor(() => expect(saveCodexConfigs).toHaveBeenCalledTimes(1));
    expect(saveCodexConfigs.mock.calls[0][0][0].models).toEqual([{ name: 'gpt-4' }]);
  });

  it('persists the concurrency draft via saveProviderConcurrencyDraft on save', async () => {
    const user = userEvent.setup();
    seedConfig([]);

    renderWithRouter(<AiProvidersCodexEditPage />, { route: '/ai-providers/codex' });
    await user.type(await screen.findByLabelText('Base URL (Required):'), 'https://x.example.com');
    await user.click(getFloatingSaveButton());

    await waitFor(() => expect(saveProviderConcurrencyDraft).toHaveBeenCalledTimes(1));
    expect(saveProviderConcurrencyDraft.mock.calls[0][0]).toEqual(
      expect.objectContaining({ providerKey: 'codex' })
    );
  });

  it('shows the added-configuration success notification after a successful add', async () => {
    const user = userEvent.setup();
    seedConfig([]);

    renderWithRouter(<AiProvidersCodexEditPage />, { route: '/ai-providers/codex' });
    await user.type(await screen.findByLabelText('Base URL (Required):'), 'https://x.example.com');
    await user.click(getFloatingSaveButton());

    await waitFor(() =>
      expect(
        useNotificationStore.getState().notifications.some(
          (n) => n.message === 'Codex configuration added successfully' && n.type === 'success'
        )
      ).toBe(true)
    );
  });

  it('shows an update-failed error notification when saving rejects', async () => {
    const user = userEvent.setup();
    seedConfig([]);
    saveCodexConfigs.mockRejectedValue(new Error('boom'));

    renderWithRouter(<AiProvidersCodexEditPage />, { route: '/ai-providers/codex' });
    await user.type(await screen.findByLabelText('Base URL (Required):'), 'https://x.example.com');
    await user.click(getFloatingSaveButton());

    await waitFor(() =>
      expect(
        useNotificationStore.getState().notifications.some(
          (n) => n.message === 'Update failed: boom' && n.type === 'error'
        )
      ).toBe(true)
    );
  });
});

describe('AiProvidersCodexEditPage - model discovery', () => {
  it('disables the fetch-models button when the base URL is empty', async () => {
    seedConfig([]);

    renderWithRouter(<AiProvidersCodexEditPage />, { route: '/ai-providers/codex' });
    await screen.findByLabelText('Base URL (Required):');

    expect(screen.getByRole('button', { name: 'Fetch via /v1/models' })).toBeDisabled();
  });

  it('enables the fetch-models button once a base URL is present', async () => {
    seedConfig([{ apiKey: 'k', baseUrl: 'https://x.example.com' }]);

    renderWithRouter(<AiProvidersCodexEditPage />, {
      route: '/ai-providers/codex/0',
      path: CODEX_ROUTE_PATH,
    });
    await screen.findByDisplayValue('https://x.example.com');

    expect(screen.getByRole('button', { name: 'Fetch via /v1/models' })).toBeEnabled();
  });

  it('auto-fetches discovered models when opened with an API key and lists them', async () => {
    const user = userEvent.setup();
    fetchV1ModelsViaApiCall.mockResolvedValue([
      { name: 'model-alpha' },
      { name: 'model-beta' },
    ]);
    seedConfig([{ apiKey: 'k', baseUrl: 'https://x.example.com' }]);

    renderWithRouter(<AiProvidersCodexEditPage />, {
      route: '/ai-providers/codex/0',
      path: CODEX_ROUTE_PATH,
    });
    await screen.findByDisplayValue('https://x.example.com');
    await user.click(screen.getByRole('button', { name: 'Fetch via /v1/models' }));

    expect(await screen.findByText('model-alpha')).toBeInTheDocument();
  });

  it('shows the fetch error message when discovery rejects', async () => {
    const user = userEvent.setup();
    fetchV1ModelsViaApiCall.mockRejectedValue(new Error('network down'));
    seedConfig([{ apiKey: 'k', baseUrl: 'https://x.example.com' }]);

    renderWithRouter(<AiProvidersCodexEditPage />, {
      route: '/ai-providers/codex/0',
      path: CODEX_ROUTE_PATH,
    });
    await screen.findByDisplayValue('https://x.example.com');
    await user.click(screen.getByRole('button', { name: 'Fetch via /v1/models' }));

    expect(await screen.findByText('Failed to fetch models: network down')).toBeInTheDocument();
  });

  it('merges a selected discovered model into the model entries and notifies the added count', async () => {
    const user = userEvent.setup();
    fetchV1ModelsViaApiCall.mockResolvedValue([{ name: 'discovered-model' }]);
    seedConfig([{ apiKey: 'k', baseUrl: 'https://x.example.com' }]);

    renderWithRouter(<AiProvidersCodexEditPage />, {
      route: '/ai-providers/codex/0',
      path: CODEX_ROUTE_PATH,
    });
    await screen.findByDisplayValue('https://x.example.com');
    await user.click(screen.getByRole('button', { name: 'Fetch via /v1/models' }));
    await user.click(await screen.findByRole('checkbox', { name: 'discovered-model' }));
    await user.click(screen.getByRole('button', { name: 'Add selected models' }));

    await waitFor(() =>
      expect(
        useNotificationStore.getState().notifications.some(
          (n) => n.message === '1 new models added' && n.type === 'success'
        )
      ).toBe(true)
    );
  });
});
