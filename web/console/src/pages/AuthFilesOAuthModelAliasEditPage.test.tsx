import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithRouter, screen, userEvent, waitFor } from '@/test/utils';
import { useAuthStore, useNotificationStore } from '@/stores';
import type { AuthFileModelItem } from '@/features/authFiles/constants';
import type { OAuthModelAliasEntry } from '@/types';

const list = vi.fn();
const getOauthExcludedModels = vi.fn();
const getOauthModelAlias = vi.fn();
const getModelDefinitions = vi.fn<(provider: string) => Promise<AuthFileModelItem[]>>();
const saveOauthModelAlias = vi.fn();
const deleteOauthModelAlias = vi.fn();

vi.mock('@/services/api', () => ({
  authFilesApi: {
    list: () => list(),
    getOauthExcludedModels: () => getOauthExcludedModels(),
    getOauthModelAlias: () => getOauthModelAlias(),
    getModelDefinitions: (provider: string) => getModelDefinitions(provider),
    saveOauthModelAlias: (channel: string, aliases: OAuthModelAliasEntry[]) =>
      saveOauthModelAlias(channel, aliases),
    deleteOauthModelAlias: (channel: string) => deleteOauthModelAlias(channel),
  },
}));

import { AuthFilesOAuthModelAliasEditPage } from './AuthFilesOAuthModelAliasEditPage';

const renderPage = (route = '/auth-files/oauth-model-alias') =>
  renderWithRouter(<AuthFilesOAuthModelAliasEditPage />, {
    route,
    path: '/auth-files/oauth-model-alias',
  });

const setConnected = (connected: boolean) => {
  useAuthStore.setState({ connectionStatus: connected ? 'connected' : 'disconnected' });
};

const resetNotifications = () => {
  useNotificationStore.setState({
    notifications: [],
    confirmation: { isOpen: false, isLoading: false, options: null },
  });
};

const getAliasInputs = () => screen.getAllByPlaceholderText('Alias (required)');
const getSourceInputs = () => screen.getAllByPlaceholderText('Source model name');

beforeEach(() => {
  list.mockReset();
  getOauthExcludedModels.mockReset();
  getOauthModelAlias.mockReset();
  getModelDefinitions.mockReset();
  saveOauthModelAlias.mockReset();
  deleteOauthModelAlias.mockReset();
  resetNotifications();
  setConnected(true);

  list.mockResolvedValue({ files: [] });
  getOauthExcludedModels.mockResolvedValue({});
  getOauthModelAlias.mockResolvedValue({});
  getModelDefinitions.mockResolvedValue([]);
});

describe('AuthFilesOAuthModelAliasEditPage initial load', () => {
  it('shows the add title once loading completes', async () => {
    renderPage();

    expect(await screen.findByText('Add provider model aliases')).toBeInTheDocument();
  });

  it('renders the upgrade-required empty state when aliases return a 404', async () => {
    getOauthModelAlias.mockRejectedValue({ status: 404 });

    renderPage();

    expect(await screen.findByText('Please upgrade CLI Proxy API')).toBeInTheDocument();
  });

  it('notifies on a non-404 alias load failure', async () => {
    getOauthModelAlias.mockRejectedValue(new Error('server exploded'));

    renderPage();

    await waitFor(() =>
      expect(useNotificationStore.getState().notifications).toEqual([
        expect.objectContaining({ type: 'error' }),
      ])
    );
    expect(useNotificationStore.getState().notifications[0].message).toContain('server exploded');
  });

  it('pre-fills mapping rows from the existing alias entries for the provider', async () => {
    getOauthModelAlias.mockResolvedValue({
      codex: [{ name: 'gpt-4o', alias: 'best' }],
    });

    renderPage('/auth-files/oauth-model-alias?provider=codex');

    await waitFor(() => expect(getAliasInputs()[0]).toHaveValue('best'));
    expect(getSourceInputs()[0]).toHaveValue('gpt-4o');
  });
});

describe('AuthFilesOAuthModelAliasEditPage mapping rows', () => {
  it('adds an empty mapping row when the add-alias button is clicked', async () => {
    const user = userEvent.setup();

    renderPage();
    await screen.findByPlaceholderText('Alias (required)');
    expect(getAliasInputs()).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Add alias' }));

    expect(getAliasInputs()).toHaveLength(2);
  });

  it('keeps a single empty row when removing the only mapping row', async () => {
    const user = userEvent.setup();

    renderPage();
    await screen.findByPlaceholderText('Alias (required)');
    await user.click(screen.getByRole('button', { name: 'Add alias' }));
    const removeButtons = screen.getAllByRole('button', { name: 'Delete' });

    await user.click(removeButtons[0]);

    expect(getAliasInputs()).toHaveLength(1);
  });

  it('disables the delete button when only one mapping row exists', async () => {
    renderPage();
    await screen.findByPlaceholderText('Alias (required)');

    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  });
});

describe('AuthFilesOAuthModelAliasEditPage save', () => {
  it('saves trimmed, complete mappings for the provider', async () => {
    const user = userEvent.setup();
    saveOauthModelAlias.mockResolvedValue(undefined);

    renderPage('/auth-files/oauth-model-alias?provider=codex');
    await screen.findByPlaceholderText('Alias (required)');
    // Let the mount-time requestAnimationFrame settle before interacting;
    // under full-suite load it otherwise races userEvent (see ProviderNav.test).
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await user.type(getSourceInputs()[0], 'gpt-4o');
    await user.type(getAliasInputs()[0], 'best');
    await user.click(screen.getByRole('button', { name: 'Save/Update' }));

    await waitFor(() =>
      expect(saveOauthModelAlias).toHaveBeenCalledWith('codex', [
        { name: 'gpt-4o', alias: 'best', fork: true },
      ])
    );
  });

  it('deletes the provider alias entry when saving with no complete mappings', async () => {
    const user = userEvent.setup();
    deleteOauthModelAlias.mockResolvedValue(undefined);

    renderPage('/auth-files/oauth-model-alias?provider=codex');
    await screen.findByPlaceholderText('Alias (required)');
    await user.click(screen.getByRole('button', { name: 'Save/Update' }));

    await waitFor(() => expect(deleteOauthModelAlias).toHaveBeenCalledWith('codex'));
  });

  it('shows a validation error and does not save when the provider is empty', async () => {
    const user = userEvent.setup();

    renderPage();
    await screen.findByText('Add provider model aliases');
    await user.click(screen.getByRole('button', { name: 'Save/Update' }));

    expect(saveOauthModelAlias).not.toHaveBeenCalled();
    expect(deleteOauthModelAlias).not.toHaveBeenCalled();
    expect(useNotificationStore.getState().notifications).toEqual([
      expect.objectContaining({ message: 'Please enter a provider first', type: 'error' }),
    ]);
  });

  it('shows a success notification after a successful save', async () => {
    const user = userEvent.setup();
    saveOauthModelAlias.mockResolvedValue(undefined);

    renderPage('/auth-files/oauth-model-alias?provider=codex');
    await screen.findByPlaceholderText('Alias (required)');
    await user.type(getSourceInputs()[0], 'gpt-4o');
    await user.type(getAliasInputs()[0], 'best');
    await user.click(screen.getByRole('button', { name: 'Save/Update' }));

    await waitFor(() =>
      expect(useNotificationStore.getState().notifications).toEqual([
        expect.objectContaining({ message: 'Model aliases updated', type: 'success' }),
      ])
    );
  });

  it('drops the fork flag when keep-original is toggled off before saving', async () => {
    const user = userEvent.setup();
    saveOauthModelAlias.mockResolvedValue(undefined);

    renderPage('/auth-files/oauth-model-alias?provider=codex');
    await screen.findByPlaceholderText('Alias (required)');
    await user.type(getSourceInputs()[0], 'gpt-4o');
    await user.type(getAliasInputs()[0], 'best');
    await user.click(screen.getByRole('checkbox', { name: 'Keep original' }));
    await user.click(screen.getByRole('button', { name: 'Save/Update' }));

    await waitFor(() =>
      expect(saveOauthModelAlias).toHaveBeenCalledWith('codex', [{ name: 'gpt-4o', alias: 'best' }])
    );
  });

  it('disables the save button when not connected', async () => {
    setConnected(false);

    renderPage('/auth-files/oauth-model-alias?provider=codex');

    expect(await screen.findByRole('button', { name: 'Save/Update' })).toBeDisabled();
  });
});
