import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithRouter, screen, userEvent, waitFor } from '@/test/utils';
import { useAuthStore, useConfigStore, useNotificationStore } from '@/stores';
import type { AmpcodeConfig, Config } from '@/types';
import { AiProvidersAmpcodeEditPage } from './AiProvidersAmpcodeEditPage';

// Boundary mocks: the typed ampcodeApi the page imports from '@/services/api'.
const getAmpcode = vi.fn<() => Promise<AmpcodeConfig>>();
const updateUpstreamUrl = vi.fn<(url: string) => Promise<void>>();
const clearUpstreamUrl = vi.fn<() => Promise<void>>();
const updateUpstreamApiKey = vi.fn<(key: string) => Promise<void>>();
const clearUpstreamApiKey = vi.fn<() => Promise<void>>();
const updateRestrictManagementToLocalhost = vi.fn<(enabled: boolean) => Promise<void>>();
const updateForceModelMappings = vi.fn<(enabled: boolean) => Promise<void>>();
const saveUpstreamApiKeys = vi.fn<(...args: unknown[]) => Promise<void>>();
const deleteUpstreamApiKeys = vi.fn<(...args: unknown[]) => Promise<void>>();
const saveModelMappings = vi.fn<(...args: unknown[]) => Promise<void>>();
const clearModelMappings = vi.fn<() => Promise<void>>();

vi.mock('@/services/api', () => ({
  ampcodeApi: {
    getAmpcode: () => getAmpcode(),
    updateUpstreamUrl: (url: string) => updateUpstreamUrl(url),
    clearUpstreamUrl: () => clearUpstreamUrl(),
    updateUpstreamApiKey: (key: string) => updateUpstreamApiKey(key),
    clearUpstreamApiKey: () => clearUpstreamApiKey(),
    updateRestrictManagementToLocalhost: (enabled: boolean) =>
      updateRestrictManagementToLocalhost(enabled),
    updateForceModelMappings: (enabled: boolean) => updateForceModelMappings(enabled),
    saveUpstreamApiKeys: (...args: unknown[]) => saveUpstreamApiKeys(...args),
    deleteUpstreamApiKeys: (...args: unknown[]) => deleteUpstreamApiKeys(...args),
    saveModelMappings: (...args: unknown[]) => saveModelMappings(...args),
    clearModelMappings: () => clearModelMappings(),
  },
}));

// Stub the app-owned unsaved-changes guard: the declarative MemoryRouter has no
// data-router for useBlocker. allowNextNavigation is observed as a side effect only.
const allowNextNavigation = vi.fn();
vi.mock('@/hooks/useUnsavedChangesGuard', () => ({
  useUnsavedChangesGuard: () => ({ allowNextNavigation }),
}));

function seedConfig(ampcode: AmpcodeConfig | undefined, overrides: Partial<Config> = {}) {
  const config: Config = {
    raw: { ampcode },
    ampcode,
    ...overrides,
  } as Config;
  useConfigStore.setState({
    config,
    cache: new Map([['__full__', { data: config, timestamp: Date.now() }]]),
    loading: false,
    error: null,
  });
}

function getFloatingSaveButton() {
  const buttons = screen.getAllByRole('button', { name: 'Save' });
  return buttons[buttons.length - 1];
}

beforeEach(() => {
  localStorage.clear();
  getAmpcode.mockReset().mockResolvedValue({});
  updateUpstreamUrl.mockReset().mockResolvedValue(undefined);
  clearUpstreamUrl.mockReset().mockResolvedValue(undefined);
  updateUpstreamApiKey.mockReset().mockResolvedValue(undefined);
  clearUpstreamApiKey.mockReset().mockResolvedValue(undefined);
  updateRestrictManagementToLocalhost.mockReset().mockResolvedValue(undefined);
  updateForceModelMappings.mockReset().mockResolvedValue(undefined);
  saveUpstreamApiKeys.mockReset().mockResolvedValue(undefined);
  deleteUpstreamApiKeys.mockReset().mockResolvedValue(undefined);
  saveModelMappings.mockReset().mockResolvedValue(undefined);
  clearModelMappings.mockReset().mockResolvedValue(undefined);
  allowNextNavigation.mockReset();
  useAuthStore.setState({ connectionStatus: 'connected' });
  useNotificationStore.setState({
    notifications: [],
    confirmation: { isOpen: false, isLoading: false, options: null },
  });
});

describe('AiProvidersAmpcodeEditPage - initial load', () => {
  it('renders the configure-ampcode title', async () => {
    seedConfig({});

    renderWithRouter(<AiProvidersAmpcodeEditPage />, { route: '/ai-providers/ampcode' });

    expect(await screen.findByText('Configure Ampcode')).toBeInTheDocument();
  });

  it('populates the upstream URL field from the fetched ampcode config', async () => {
    getAmpcode.mockResolvedValue({ upstreamUrl: 'https://ampcode.example.com' });
    seedConfig({});

    renderWithRouter(<AiProvidersAmpcodeEditPage />, { route: '/ai-providers/ampcode' });

    expect(await screen.findByDisplayValue('https://ampcode.example.com')).toBe(
      await screen.findByLabelText('Upstream URL')
    );
  });

  it('shows the not-set current-key hint when no upstream API key is configured', async () => {
    seedConfig({});

    renderWithRouter(<AiProvidersAmpcodeEditPage />, { route: '/ai-providers/ampcode' });

    expect(await screen.findByText('Current Amp official key: Not set')).toBeInTheDocument();
  });

  it('shows a refresh-failed error when fetching ampcode rejects', async () => {
    getAmpcode.mockRejectedValue(new Error('fetch boom'));
    seedConfig({});

    renderWithRouter(<AiProvidersAmpcodeEditPage />, { route: '/ai-providers/ampcode' });

    expect(await screen.findByText('fetch boom')).toBeInTheDocument();
  });
});

describe('AiProvidersAmpcodeEditPage - clear current key button', () => {
  it('disables the clear-official-key button when no upstream API key exists in config', async () => {
    getAmpcode.mockResolvedValue({});
    seedConfig({});

    renderWithRouter(<AiProvidersAmpcodeEditPage />, { route: '/ai-providers/ampcode' });
    await screen.findByText('Current Amp official key: Not set');

    expect(screen.getByRole('button', { name: 'Clear official key' })).toBeDisabled();
  });

  it('enables the clear-official-key button when an upstream API key exists in config', async () => {
    getAmpcode.mockResolvedValue({ upstreamApiKey: 'sk-amp-secret' });
    seedConfig({ upstreamApiKey: 'sk-amp-secret' });

    renderWithRouter(<AiProvidersAmpcodeEditPage />, { route: '/ai-providers/ampcode' });
    await screen.findByLabelText('Upstream URL');

    expect(screen.getByRole('button', { name: 'Clear official key' })).toBeEnabled();
  });
});

describe('AiProvidersAmpcodeEditPage - save contract', () => {
  it('persists the trimmed upstream URL via updateUpstreamUrl on save', async () => {
    const user = userEvent.setup();
    seedConfig({});

    renderWithRouter(<AiProvidersAmpcodeEditPage />, { route: '/ai-providers/ampcode' });
    await user.type(
      await screen.findByLabelText('Upstream URL'),
      '   https://ampcode.example.com   '
    );
    await user.click(getFloatingSaveButton());

    await waitFor(() => expect(updateUpstreamUrl).toHaveBeenCalledTimes(1));
    expect(updateUpstreamUrl).toHaveBeenCalledWith('https://ampcode.example.com');
  });

  it('clears the upstream URL via clearUpstreamUrl when the field is empty on save', async () => {
    const user = userEvent.setup();
    getAmpcode.mockResolvedValue({ forceModelMappings: false });
    seedConfig({});

    renderWithRouter(<AiProvidersAmpcodeEditPage />, { route: '/ai-providers/ampcode' });
    // Toggle force-model-mappings to make the form dirty without entering a URL.
    await user.click(await screen.findByLabelText('Force model mappings'));
    await user.click(getFloatingSaveButton());

    await waitFor(() => expect(clearUpstreamUrl).toHaveBeenCalledTimes(1));
    expect(updateUpstreamUrl).not.toHaveBeenCalled();
  });

  it('persists the override key via updateUpstreamApiKey when entered on save', async () => {
    const user = userEvent.setup();
    seedConfig({});

    renderWithRouter(<AiProvidersAmpcodeEditPage />, { route: '/ai-providers/ampcode' });
    await user.type(await screen.findByLabelText('Upstream API Key (Amp Official)'), 'sk-amp-new');
    await user.click(getFloatingSaveButton());

    await waitFor(() => expect(updateUpstreamApiKey).toHaveBeenCalledTimes(1));
    expect(updateUpstreamApiKey).toHaveBeenCalledWith('sk-amp-new');
  });

  it('does not call updateUpstreamApiKey when the override key field is left blank', async () => {
    const user = userEvent.setup();
    seedConfig({});

    renderWithRouter(<AiProvidersAmpcodeEditPage />, { route: '/ai-providers/ampcode' });
    await user.type(await screen.findByLabelText('Upstream URL'), 'https://ampcode.example.com');
    await user.click(getFloatingSaveButton());

    await waitFor(() => expect(updateUpstreamUrl).toHaveBeenCalledTimes(1));
    expect(updateUpstreamApiKey).not.toHaveBeenCalled();
  });

  it('forwards the force-model-mappings toggle value to updateForceModelMappings on save', async () => {
    const user = userEvent.setup();
    seedConfig({});

    renderWithRouter(<AiProvidersAmpcodeEditPage />, { route: '/ai-providers/ampcode' });
    await user.click(await screen.findByLabelText('Force model mappings'));
    await user.click(getFloatingSaveButton());

    await waitFor(() => expect(updateForceModelMappings).toHaveBeenCalledTimes(1));
    expect(updateForceModelMappings).toHaveBeenCalledWith(true);
  });

  it('shows the ampcode-updated success notification after a successful save', async () => {
    const user = userEvent.setup();
    seedConfig({});

    renderWithRouter(<AiProvidersAmpcodeEditPage />, { route: '/ai-providers/ampcode' });
    await user.type(await screen.findByLabelText('Upstream URL'), 'https://ampcode.example.com');
    await user.click(getFloatingSaveButton());

    await waitFor(() =>
      expect(
        useNotificationStore
          .getState()
          .notifications.some(
            (n) => n.message === 'Ampcode configuration updated' && n.type === 'success'
          )
      ).toBe(true)
    );
  });

  it('shows an update-failed error notification when saving rejects', async () => {
    const user = userEvent.setup();
    seedConfig({});
    updateUpstreamUrl.mockRejectedValue(new Error('save boom'));

    renderWithRouter(<AiProvidersAmpcodeEditPage />, { route: '/ai-providers/ampcode' });
    await user.type(await screen.findByLabelText('Upstream URL'), 'https://ampcode.example.com');
    await user.click(getFloatingSaveButton());

    await waitFor(() =>
      expect(
        useNotificationStore
          .getState()
          .notifications.some(
            (n) => n.message === 'Update failed: save boom' && n.type === 'error'
          )
      ).toBe(true)
    );
  });
});

describe('AiProvidersAmpcodeEditPage - clear upstream key flow', () => {
  it('opens a confirmation dialog when clicking clear official key', async () => {
    const user = userEvent.setup();
    getAmpcode.mockResolvedValue({ upstreamApiKey: 'sk-amp-secret' });
    seedConfig({ upstreamApiKey: 'sk-amp-secret' });

    renderWithRouter(<AiProvidersAmpcodeEditPage />, { route: '/ai-providers/ampcode' });
    await screen.findByLabelText('Upstream URL');
    await user.click(screen.getByRole('button', { name: 'Clear official key' }));

    expect(useNotificationStore.getState().confirmation.isOpen).toBe(true);
  });

  it('calls clearUpstreamApiKey when the clear confirmation is confirmed', async () => {
    const user = userEvent.setup();
    getAmpcode.mockResolvedValue({ upstreamApiKey: 'sk-amp-secret' });
    seedConfig({ upstreamApiKey: 'sk-amp-secret' });

    renderWithRouter(<AiProvidersAmpcodeEditPage />, { route: '/ai-providers/ampcode' });
    await screen.findByLabelText('Upstream URL');
    await user.click(screen.getByRole('button', { name: 'Clear official key' }));
    await useNotificationStore.getState().confirmation.options?.onConfirm?.();

    expect(clearUpstreamApiKey).toHaveBeenCalledTimes(1);
  });
});

describe('AiProvidersAmpcodeEditPage - control gating', () => {
  it('disables Save when the connection is not connected', async () => {
    seedConfig({});
    useAuthStore.setState({ connectionStatus: 'disconnected' });

    renderWithRouter(<AiProvidersAmpcodeEditPage />, { route: '/ai-providers/ampcode' });
    await screen.findByLabelText('Upstream URL');

    expect(getFloatingSaveButton()).toBeDisabled();
  });
});
