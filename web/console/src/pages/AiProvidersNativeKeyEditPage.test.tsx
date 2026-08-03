import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithRouter, screen, userEvent, waitFor } from '@/test/utils';
import { useAuthStore, useConfigStore, useNotificationStore } from '@/stores';
import type { Config, GeminiKeyConfig, ProviderKeyConfig } from '@/types';
import { AiProvidersNativeKeyEditPage } from './AiProvidersNativeKeyEditPage';

const getInteractionsConfigs = vi.fn<() => Promise<ProviderKeyConfig[]>>();
const getXAIConfigs = vi.fn<() => Promise<ProviderKeyConfig[]>>();
const saveInteractionsConfigs = vi.fn<(configs: GeminiKeyConfig[]) => Promise<void>>();
const saveXAIConfigs = vi.fn<(configs: ProviderKeyConfig[]) => Promise<void>>();
const getConfig = vi.fn<() => Promise<Config>>();
const allowNextNavigation = vi.fn();

vi.mock('@/services/api', () => ({
  providersApi: {
    getInteractionsConfigs: () => getInteractionsConfigs(),
    getXAIConfigs: () => getXAIConfigs(),
    saveInteractionsConfigs: (configs: GeminiKeyConfig[]) => saveInteractionsConfigs(configs),
    saveXAIConfigs: (configs: ProviderKeyConfig[]) => saveXAIConfigs(configs),
  },
}));

vi.mock('@/services/api/config', () => ({
  configApi: { getConfig: () => getConfig() },
}));

vi.mock('@/hooks/useUnsavedChangesGuard', () => ({
  useUnsavedChangesGuard: () => ({ allowNextNavigation }),
}));

function seedConfig(): void {
  const config = { raw: {} } as Config;
  useConfigStore.setState({
    config,
    cache: new Map([['__full__', { data: config, timestamp: Date.now() }]]),
    loading: false,
    error: null,
  });
  getConfig.mockResolvedValue(config);
}

function saveButton() {
  return screen.getByRole('button', { name: 'Save' });
}

beforeEach(() => {
  localStorage.clear();
  getInteractionsConfigs.mockReset().mockResolvedValue([]);
  getXAIConfigs.mockReset().mockResolvedValue([]);
  saveInteractionsConfigs.mockReset().mockResolvedValue(undefined);
  saveXAIConfigs.mockReset().mockResolvedValue(undefined);
  getConfig.mockReset();
  allowNextNavigation.mockReset();
  useAuthStore.setState({ connectionStatus: 'connected' });
  useNotificationStore.setState({
    notifications: [],
    confirmation: { isOpen: false, isLoading: false, options: null },
  });
  seedConfig();
});

describe('AiProvidersNativeKeyEditPage', () => {
  it('loads and saves every xAI-specific field without dropping raw provider data', async () => {
    const user = userEvent.setup();
    getXAIConfigs.mockResolvedValue([
      {
        apiKey: 'old-key',
        priority: 2,
        prefix: 'old',
        baseUrl: 'https://old.example',
        proxyUrl: 'socks5://old',
        websockets: false,
        disableCooling: false,
        headers: { 'X-Old': 'value' },
        models: [{ name: 'old-model', alias: 'old-alias' }],
        excludedModels: ['blocked-old'],
        raw: { vendorFlag: true },
      },
    ]);

    renderWithRouter(<AiProvidersNativeKeyEditPage kind="xai" />, {
      route: '/ai-providers/xai/0',
      path: '/ai-providers/xai/:index',
      state: { fromAiProviders: true },
    });

    expect(await screen.findByRole('heading', { name: 'Edit xAI API Key' })).toBeVisible();
    await user.clear(screen.getByLabelText('Key'));
    await user.type(screen.getByLabelText('Key'), '  new-key  ');
    await user.clear(screen.getByLabelText('Priority'));
    await user.type(screen.getByLabelText('Priority'), '7');
    await user.clear(screen.getByLabelText('Prefix'));
    await user.type(screen.getByLabelText('Prefix'), 'next');
    await user.clear(screen.getByLabelText('Address'));
    await user.type(screen.getByLabelText('Address'), 'https://new.example');
    await user.clear(screen.getByLabelText('Proxy'));
    await user.type(screen.getByLabelText('Proxy'), 'http://proxy.example');
    await user.click(screen.getByRole('checkbox', { name: 'Responses WebSocket transport' }));
    await user.click(screen.getByRole('checkbox', { name: /Disable cooling/ }));
    await user.clear(screen.getByPlaceholderText('Header name, e.g. X-Custom-Header'));
    await user.type(screen.getByPlaceholderText('Header name, e.g. X-Custom-Header'), 'X-New');
    await user.clear(screen.getByPlaceholderText('Header value'));
    await user.type(screen.getByPlaceholderText('Header value'), 'new-value');
    await user.clear(screen.getByPlaceholderText(/Model name/));
    await user.type(screen.getByPlaceholderText(/Model name/), 'new-model');
    await user.clear(screen.getByPlaceholderText(/Model alias/));
    await user.type(screen.getByPlaceholderText(/Model alias/), 'new-alias');
    await user.clear(screen.getByRole('textbox', { name: 'Excluded models (optional):' }));
    await user.type(
      screen.getByRole('textbox', { name: 'Excluded models (optional):' }),
      'blocked-a, blocked-b'
    );
    await user.click(saveButton());

    await waitFor(() => expect(saveXAIConfigs).toHaveBeenCalledTimes(1));
    expect(saveXAIConfigs.mock.calls[0][0][0]).toEqual({
      apiKey: 'new-key',
      priority: 7,
      prefix: 'next',
      baseUrl: 'https://new.example',
      proxyUrl: 'http://proxy.example',
      websockets: true,
      disableCooling: true,
      headers: { 'X-New': 'new-value' },
      models: [{ name: 'new-model', alias: 'new-alias' }],
      excludedModels: ['blocked-a', 'blocked-b'],
      raw: { vendorFlag: true },
    });
    expect(allowNextNavigation).toHaveBeenCalledOnce();
  });

  it('appends an Interactions key without the xAI websocket field', async () => {
    const user = userEvent.setup();
    getInteractionsConfigs.mockResolvedValue([{ apiKey: 'existing' }]);
    renderWithRouter(<AiProvidersNativeKeyEditPage kind="interactions" />, {
      route: '/ai-providers/interactions/new',
      path: '/ai-providers/interactions/new',
    });

    await user.type(await screen.findByLabelText('Key'), 'interaction-key');
    await user.click(screen.getByRole('button', { name: 'Add model' }));
    expect(screen.getAllByPlaceholderText(/Model name/)).toHaveLength(2);
    await user.click(saveButton());

    await waitFor(() => expect(saveInteractionsConfigs).toHaveBeenCalledOnce());
    expect(saveInteractionsConfigs.mock.calls[0][0]).toEqual([
      { apiKey: 'existing' },
      expect.not.objectContaining({ websockets: expect.anything() }),
    ]);
  });

  it('normalizes missing optional fields and preserves untouched entries during an edit', async () => {
    const user = userEvent.setup();
    getInteractionsConfigs.mockResolvedValue([{ apiKey: 'first' }, { apiKey: 'second' }]);
    renderWithRouter(<AiProvidersNativeKeyEditPage kind="interactions" />, {
      route: '/ai-providers/interactions/1',
      path: '/ai-providers/interactions/:index',
    });

    expect(await screen.findByLabelText('Key')).toHaveValue('second');
    expect(screen.getByLabelText('Prefix')).toHaveValue('');
    expect(screen.getByLabelText('Address')).toHaveValue('');
    expect(screen.getByLabelText('Proxy')).toHaveValue('');
    await user.type(screen.getByLabelText('Priority'), '3');
    await user.clear(screen.getByLabelText('Priority'));
    await user.click(saveButton());

    await waitFor(() => expect(saveInteractionsConfigs).toHaveBeenCalledOnce());
    expect(saveInteractionsConfigs.mock.calls[0][0][0]).toEqual({ apiKey: 'first' });
    expect(saveInteractionsConfigs.mock.calls[0][0][1]).toEqual({
      apiKey: 'second',
      priority: undefined,
      prefix: undefined,
      baseUrl: undefined,
      proxyUrl: undefined,
      headers: {},
      models: [],
      excludedModels: [],
      disableCooling: undefined,
      raw: undefined,
    });
  });

  it('treats a non-array API response as an empty provider list', async () => {
    getXAIConfigs.mockResolvedValue({ entries: [] } as unknown as ProviderKeyConfig[]);
    renderWithRouter(<AiProvidersNativeKeyEditPage kind="xai" />, {
      route: '/ai-providers/xai/new',
    });
    expect(await screen.findByRole('heading', { name: 'Add xAI API Key' })).toBeVisible();
    expect(screen.getByLabelText('Key')).toHaveValue('');
  });

  it('does not commit a fulfilled or rejected load after the editor unmounts', async () => {
    let resolveLoad!: (value: ProviderKeyConfig[]) => void;
    getInteractionsConfigs.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveLoad = resolve;
      })
    );
    const fulfilled = renderWithRouter(<AiProvidersNativeKeyEditPage kind="interactions" />, {
      route: '/ai-providers/interactions/new',
    });
    fulfilled.unmount();
    resolveLoad([{ apiKey: 'late' }]);
    await Promise.resolve();

    let rejectLoad!: (reason: unknown) => void;
    getInteractionsConfigs.mockReturnValueOnce(
      new Promise((_, reject) => {
        rejectLoad = reject;
      })
    );
    const rejected = renderWithRouter(<AiProvidersNativeKeyEditPage kind="interactions" />, {
      route: '/ai-providers/interactions/new',
    });
    rejected.unmount();
    rejectLoad(new Error('late failure'));
    await Promise.resolve();
    expect(useNotificationStore.getState().notifications).toEqual([]);
  });

  it.each([
    { route: '/ai-providers/xai/not-a-number', path: '/ai-providers/xai/:index' },
    { route: '/ai-providers/xai/-1', path: '/ai-providers/xai/:index' },
    { route: '/ai-providers/xai/4', path: '/ai-providers/xai/:index' },
  ])('rejects an invalid or missing provider index at $route', async ({ route, path }) => {
    getXAIConfigs.mockResolvedValue([{ apiKey: 'only' }]);
    renderWithRouter(<AiProvidersNativeKeyEditPage kind="xai" />, { route, path });
    expect(await screen.findByText('Invalid provider index.')).toBeVisible();
    expect(saveButton()).toBeDisabled();
  });

  it('shows a useful load error for Error, string, and unknown failures', async () => {
    getInteractionsConfigs.mockRejectedValueOnce(new Error('load failed'));
    const first = renderWithRouter(<AiProvidersNativeKeyEditPage kind="interactions" />, {
      route: '/ai-providers/interactions/new',
    });
    expect(await screen.findByText('load failed')).toBeVisible();
    first.unmount();

    getInteractionsConfigs.mockRejectedValueOnce('string failure');
    const second = renderWithRouter(<AiProvidersNativeKeyEditPage kind="interactions" />, {
      route: '/ai-providers/interactions/new',
    });
    expect(await screen.findByText('string failure')).toBeVisible();
    second.unmount();

    getInteractionsConfigs.mockRejectedValueOnce({ reason: 'unknown' });
    renderWithRouter(<AiProvidersNativeKeyEditPage kind="interactions" />, {
      route: '/ai-providers/interactions/new',
    });
    expect(await screen.findByText('Refresh failed')).toBeVisible();
  });

  it('reports a save failure and keeps the editor available for retry', async () => {
    const user = userEvent.setup();
    saveXAIConfigs.mockRejectedValue(new Error('write failed'));
    renderWithRouter(<AiProvidersNativeKeyEditPage kind="xai" />, {
      route: '/ai-providers/xai/new',
    });
    await user.type(await screen.findByLabelText('Key'), 'key');
    await user.click(saveButton());
    await waitFor(() => expect(saveXAIConfigs).toHaveBeenCalledOnce());
    expect(useNotificationStore.getState().notifications.at(-1)?.message).toContain('write failed');
    expect(saveButton()).toBeEnabled();
  });

  it('disables editing while disconnected and returns to the provider list from a cold route', async () => {
    const user = userEvent.setup();
    useAuthStore.setState({ connectionStatus: 'disconnected' });
    renderWithRouter(<AiProvidersNativeKeyEditPage kind="interactions" />, {
      route: '/ai-providers/interactions/new',
    });
    expect(await screen.findByLabelText('Key')).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(screen.queryByLabelText('Key')).not.toBeInTheDocument());
  });

  it.each(['interactions', 'xai'] as const)(
    'offers %s model rows only the options a native key persists',
    async (kind) => {
      const user = userEvent.setup();
      renderWithRouter(<AiProvidersNativeKeyEditPage kind={kind} />, {
        route: `/ai-providers/${kind}/new`,
      });
      await screen.findByLabelText('Key');

      await user.click(screen.getByRole('button', { name: 'model options' }));

      expect(screen.getByPlaceholderText('Display name (optional)')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'effort payloads' })).not.toBeInTheDocument();
      expect(screen.queryByText('templates')).not.toBeInTheDocument();
      expect(
        screen.queryByRole('checkbox', { name: 'Image generation model' })
      ).not.toBeInTheDocument();
    }
  );
});
