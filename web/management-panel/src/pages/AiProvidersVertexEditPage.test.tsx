import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithRouter, screen, userEvent, waitFor } from '@/test/utils';
import { useAuthStore, useConfigStore, useNotificationStore } from '@/stores';
import type { Config, ProviderKeyConfig } from '@/types';
import { AiProvidersVertexEditPage } from './AiProvidersVertexEditPage';

// Boundary mocks: the typed API modules the page imports from '@/services/api'.
const getVertexConfigs = vi.fn<() => Promise<ProviderKeyConfig[]>>();
const saveVertexConfigs = vi.fn<(list: ProviderKeyConfig[]) => Promise<void>>();
const saveProviderConcurrencyDraft = vi.fn<(...args: unknown[]) => Promise<void>>();

vi.mock('@/services/api', () => ({
  providersApi: {
    getVertexConfigs: () => getVertexConfigs(),
    saveVertexConfigs: (list: ProviderKeyConfig[]) => saveVertexConfigs(list),
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

const allowNextNavigation = vi.fn();
vi.mock('@/hooks/useUnsavedChangesGuard', () => ({
  useUnsavedChangesGuard: () => ({ allowNextNavigation }),
}));

const VERTEX_ROUTE_PATH = '/ai-providers/vertex/:index';

function seedConfig(vertexApiKeys: ProviderKeyConfig[], overrides: Partial<Config> = {}) {
  const config: Config = {
    raw: { 'vertex-api-key': vertexApiKeys },
    vertexApiKeys,
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
  getVertexConfigs.mockReset().mockResolvedValue([]);
  saveVertexConfigs.mockReset().mockResolvedValue(undefined);
  saveProviderConcurrencyDraft.mockReset().mockResolvedValue(undefined);
  getConfig.mockReset();
  allowNextNavigation.mockReset();
  useAuthStore.setState({ connectionStatus: 'connected' });
  useNotificationStore.setState({
    notifications: [],
    confirmation: { isOpen: false, isLoading: false, options: null },
  });
});

describe('AiProvidersVertexEditPage - title and load', () => {
  it('shows the add-configuration title when no index param is present', async () => {
    seedConfig([]);

    renderWithRouter(<AiProvidersVertexEditPage />, { route: '/ai-providers/vertex' });

    expect(await screen.findByText('Add Vertex API Configuration')).toBeInTheDocument();
  });

  it('shows the edit-configuration title when a valid index param is present', async () => {
    getVertexConfigs.mockResolvedValue([{ apiKey: 'v-key', baseUrl: 'https://vertex.example.com' }]);
    seedConfig([]);

    renderWithRouter(<AiProvidersVertexEditPage />, {
      route: '/ai-providers/vertex/0',
      path: VERTEX_ROUTE_PATH,
    });

    expect(await screen.findByText('Edit Vertex API Configuration')).toBeInTheDocument();
  });

  it('populates the API key field from the loaded config at the given index', async () => {
    getVertexConfigs.mockResolvedValue([
      { apiKey: 'v-key', baseUrl: 'https://vertex.example.com' },
    ]);
    seedConfig([]);

    renderWithRouter(<AiProvidersVertexEditPage />, {
      route: '/ai-providers/vertex/0',
      path: VERTEX_ROUTE_PATH,
    });

    expect(await screen.findByDisplayValue('v-key')).toBe(await screen.findByLabelText('API Key:'));
  });

  it('populates the base URL field from the config at the given non-zero index', async () => {
    getVertexConfigs.mockResolvedValue([
      { apiKey: 'first', baseUrl: 'https://a.example.com' },
      { apiKey: 'second', baseUrl: 'https://b.example.com' },
    ]);
    seedConfig([]);

    renderWithRouter(<AiProvidersVertexEditPage />, {
      route: '/ai-providers/vertex/1',
      path: VERTEX_ROUTE_PATH,
    });

    expect(await screen.findByDisplayValue('https://b.example.com')).toBe(
      await screen.findByLabelText('Base URL:')
    );
  });

  it('renders the invalid provider index hint when the index param is non-numeric', async () => {
    getVertexConfigs.mockResolvedValue([{ apiKey: 'v', baseUrl: 'https://x' }]);
    seedConfig([]);

    renderWithRouter(<AiProvidersVertexEditPage />, {
      route: '/ai-providers/vertex/abc',
      path: VERTEX_ROUTE_PATH,
    });

    expect(await screen.findByText('Invalid provider index.')).toBeInTheDocument();
  });

  it('renders the invalid provider index hint when the index is out of range', async () => {
    getVertexConfigs.mockResolvedValue([{ apiKey: 'v', baseUrl: 'https://x' }]);
    seedConfig([]);

    renderWithRouter(<AiProvidersVertexEditPage />, {
      route: '/ai-providers/vertex/9',
      path: VERTEX_ROUTE_PATH,
    });

    expect(await screen.findByText('Invalid provider index.')).toBeInTheDocument();
  });

  it('shows a refresh-failed error when loading the configs rejects', async () => {
    getVertexConfigs.mockRejectedValue(new Error('load boom'));
    seedConfig([]);

    renderWithRouter(<AiProvidersVertexEditPage />, { route: '/ai-providers/vertex' });

    expect(await screen.findByText('load boom')).toBeInTheDocument();
  });
});

describe('AiProvidersVertexEditPage - save gating', () => {
  it('disables Save when the connection is not connected', async () => {
    getVertexConfigs.mockResolvedValue([{ apiKey: 'v', baseUrl: 'https://x.example.com' }]);
    seedConfig([]);
    useAuthStore.setState({ connectionStatus: 'disconnected' });

    renderWithRouter(<AiProvidersVertexEditPage />, {
      route: '/ai-providers/vertex/0',
      path: VERTEX_ROUTE_PATH,
    });
    await screen.findByDisplayValue('https://x.example.com');

    expect(getFloatingSaveButton()).toBeDisabled();
  });

  it('enables Save when connected on the add screen', async () => {
    seedConfig([]);

    renderWithRouter(<AiProvidersVertexEditPage />, { route: '/ai-providers/vertex' });
    await screen.findByLabelText('API Key:');

    expect(getFloatingSaveButton()).toBeEnabled();
  });
});

describe('AiProvidersVertexEditPage - save contract', () => {
  it('saves a new config appended to the existing list with the entered API key', async () => {
    const user = userEvent.setup();
    getVertexConfigs.mockResolvedValue([
      { apiKey: 'existing', baseUrl: 'https://existing.example.com' },
    ]);
    seedConfig([]);

    renderWithRouter(<AiProvidersVertexEditPage />, { route: '/ai-providers/vertex' });
    await user.type(await screen.findByLabelText('API Key:'), 'new-key');
    await user.click(getFloatingSaveButton());

    await waitFor(() => expect(saveVertexConfigs).toHaveBeenCalledTimes(1));
    expect(saveVertexConfigs.mock.calls[0][0]).toEqual([
      { apiKey: 'existing', baseUrl: 'https://existing.example.com' },
      expect.objectContaining({ apiKey: 'new-key' }),
    ]);
  });

  it('replaces the config at the edited index and leaves the other entry untouched', async () => {
    const user = userEvent.setup();
    getVertexConfigs.mockResolvedValue([
      { apiKey: 'first', baseUrl: 'https://a.example.com' },
      { apiKey: 'second', baseUrl: 'https://b.example.com' },
    ]);
    seedConfig([]);

    renderWithRouter(<AiProvidersVertexEditPage />, {
      route: '/ai-providers/vertex/0',
      path: VERTEX_ROUTE_PATH,
    });
    await user.type(await screen.findByLabelText('Prefix (Optional):'), 'p-');
    await user.click(getFloatingSaveButton());

    await waitFor(() => expect(saveVertexConfigs).toHaveBeenCalledTimes(1));
    const savedList = saveVertexConfigs.mock.calls[0][0];
    expect(savedList).toHaveLength(2);
    expect(savedList[0]).toEqual(
      expect.objectContaining({ apiKey: 'first', baseUrl: 'https://a.example.com', prefix: 'p-' })
    );
    expect(savedList[1]).toEqual({ apiKey: 'second', baseUrl: 'https://b.example.com' });
  });

  it('trims the API key and omits a blank prefix in the saved payload', async () => {
    const user = userEvent.setup();
    seedConfig([]);

    renderWithRouter(<AiProvidersVertexEditPage />, { route: '/ai-providers/vertex' });
    await user.type(await screen.findByLabelText('API Key:'), '   trimmed-key   ');
    await user.click(getFloatingSaveButton());

    await waitFor(() => expect(saveVertexConfigs).toHaveBeenCalledTimes(1));
    const payload = saveVertexConfigs.mock.calls[0][0][0];
    expect(payload.apiKey).toBe('trimmed-key');
    expect(payload.prefix).toBeUndefined();
  });

  it('defaults a model alias to its name when the alias field is left blank', async () => {
    const user = userEvent.setup();
    getVertexConfigs.mockResolvedValue([
      {
        apiKey: 'k',
        baseUrl: 'https://x.example.com',
        models: [{ name: 'gemini-pro', alias: '' }],
      },
    ]);
    seedConfig([]);

    renderWithRouter(<AiProvidersVertexEditPage />, {
      route: '/ai-providers/vertex/0',
      path: VERTEX_ROUTE_PATH,
    });
    await screen.findByDisplayValue('https://x.example.com');
    await user.type(await screen.findByLabelText('API Key:'), 'x');
    await user.click(getFloatingSaveButton());

    await waitFor(() => expect(saveVertexConfigs).toHaveBeenCalledTimes(1));
    expect(saveVertexConfigs.mock.calls[0][0][0].models).toEqual([
      { name: 'gemini-pro', alias: 'gemini-pro' },
    ]);
  });

  it('persists the concurrency draft via saveProviderConcurrencyDraft on save', async () => {
    const user = userEvent.setup();
    seedConfig([]);

    renderWithRouter(<AiProvidersVertexEditPage />, { route: '/ai-providers/vertex' });
    await user.type(await screen.findByLabelText('API Key:'), 'k');
    await user.click(getFloatingSaveButton());

    await waitFor(() => expect(saveProviderConcurrencyDraft).toHaveBeenCalledTimes(1));
    expect(saveProviderConcurrencyDraft.mock.calls[0][0]).toEqual(
      expect.objectContaining({ providerKey: 'vertex' })
    );
  });

  it('shows the added-configuration success notification after a successful add', async () => {
    const user = userEvent.setup();
    seedConfig([]);

    renderWithRouter(<AiProvidersVertexEditPage />, { route: '/ai-providers/vertex' });
    await user.type(await screen.findByLabelText('API Key:'), 'k');
    await user.click(getFloatingSaveButton());

    await waitFor(() =>
      expect(
        useNotificationStore
          .getState()
          .notifications.some(
            (n) =>
              n.message === 'Vertex configuration added successfully' && n.type === 'success'
          )
      ).toBe(true)
    );
  });

  it('shows the updated-configuration success notification after a successful edit', async () => {
    const user = userEvent.setup();
    getVertexConfigs.mockResolvedValue([{ apiKey: 'k', baseUrl: 'https://x.example.com' }]);
    seedConfig([]);

    renderWithRouter(<AiProvidersVertexEditPage />, {
      route: '/ai-providers/vertex/0',
      path: VERTEX_ROUTE_PATH,
    });
    await user.type(await screen.findByLabelText('Prefix (Optional):'), 'p-');
    await user.click(getFloatingSaveButton());

    await waitFor(() =>
      expect(
        useNotificationStore
          .getState()
          .notifications.some(
            (n) =>
              n.message === 'Vertex configuration updated successfully' && n.type === 'success'
          )
      ).toBe(true)
    );
  });

  it('shows an update-failed error notification when saving rejects', async () => {
    const user = userEvent.setup();
    seedConfig([]);
    saveVertexConfigs.mockRejectedValue(new Error('boom'));

    renderWithRouter(<AiProvidersVertexEditPage />, { route: '/ai-providers/vertex' });
    await user.type(await screen.findByLabelText('API Key:'), 'k');
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
