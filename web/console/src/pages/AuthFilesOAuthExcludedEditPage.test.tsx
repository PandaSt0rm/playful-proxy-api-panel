import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithRouter, screen, userEvent, waitFor } from '@/test/utils';
import { useAuthStore, useNotificationStore } from '@/stores';
import type { AuthFileModelItem } from '@/features/authFiles/constants';

const list = vi.fn();
const getOauthExcludedModels = vi.fn();
const getOauthModelAlias = vi.fn();
const getModelDefinitions = vi.fn<(provider: string) => Promise<AuthFileModelItem[]>>();
const saveOauthExcludedModels = vi.fn();
const deleteOauthExcludedEntry = vi.fn();

vi.mock('@/services/api', () => ({
  authFilesApi: {
    list: () => list(),
    getOauthExcludedModels: () => getOauthExcludedModels(),
    getOauthModelAlias: () => getOauthModelAlias(),
    getModelDefinitions: (provider: string) => getModelDefinitions(provider),
    saveOauthExcludedModels: (provider: string, models: string[]) =>
      saveOauthExcludedModels(provider, models),
    deleteOauthExcludedEntry: (provider: string) => deleteOauthExcludedEntry(provider),
  },
}));

import { AuthFilesOAuthExcludedEditPage } from './AuthFilesOAuthExcludedEditPage';

const renderPage = (route = '/auth-files/oauth-excluded') =>
  renderWithRouter(<AuthFilesOAuthExcludedEditPage />, {
    route,
    path: '/auth-files/oauth-excluded',
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

beforeEach(() => {
  list.mockReset();
  getOauthExcludedModels.mockReset();
  getOauthModelAlias.mockReset();
  getModelDefinitions.mockReset();
  saveOauthExcludedModels.mockReset();
  deleteOauthExcludedEntry.mockReset();
  resetNotifications();
  setConnected(true);

  list.mockResolvedValue({ files: [] });
  getOauthExcludedModels.mockResolvedValue({});
  getOauthModelAlias.mockResolvedValue({});
  getModelDefinitions.mockResolvedValue([]);
});

describe('AuthFilesOAuthExcludedEditPage initial load', () => {
  it('shows the add title when no provider is selected', async () => {
    renderPage();

    expect(await screen.findByText('Add provider model disablement')).toBeInTheDocument();
  });

  it('shows the edit title when the provider already has excluded models', async () => {
    getOauthExcludedModels.mockResolvedValue({ codex: ['gpt-4o'] });

    renderPage('/auth-files/oauth-excluded?provider=codex');

    expect(await screen.findByText('Edit model disablement for codex')).toBeInTheDocument();
  });

  it('renders the upgrade-required empty state when excluded models return a 404', async () => {
    getOauthExcludedModels.mockRejectedValue({ status: 404 });

    renderPage();

    expect(await screen.findByText('Please upgrade CLI Proxy API')).toBeInTheDocument();
  });
});

describe('AuthFilesOAuthExcludedEditPage model list', () => {
  it('renders the model definitions returned for the selected provider', async () => {
    getModelDefinitions.mockResolvedValue([{ id: 'gpt-4o' }, { id: 'gpt-4' }]);

    renderPage('/auth-files/oauth-excluded?provider=codex');

    expect(await screen.findByText('gpt-4o')).toBeInTheDocument();
    expect(screen.getByText('gpt-4')).toBeInTheDocument();
  });

  it('shows the unsupported message when model definitions return a 404', async () => {
    getModelDefinitions.mockRejectedValue({ status: 404 });

    renderPage('/auth-files/oauth-excluded?provider=codex');

    expect(
      (await screen.findAllByText('Current CPA version does not support fetching model lists.'))
        .length
    ).toBeGreaterThanOrEqual(1);
  });

  it('pre-checks models that are already excluded for the provider', async () => {
    getOauthExcludedModels.mockResolvedValue({ codex: ['gpt-4o'] });
    getModelDefinitions.mockResolvedValue([{ id: 'gpt-4o' }, { id: 'gpt-4' }]);

    renderPage('/auth-files/oauth-excluded?provider=codex');
    const excludedRow = (await screen.findByText('gpt-4o')).closest('label');
    const otherRow = (await screen.findByText('gpt-4')).closest('label');
    const excludedCheckbox = excludedRow?.querySelector('input');
    const otherCheckbox = otherRow?.querySelector('input');
    if (
      !(excludedCheckbox instanceof HTMLInputElement) ||
      !(otherCheckbox instanceof HTMLInputElement)
    ) {
      throw new Error('expected two checkboxes');
    }

    await waitFor(() => expect(excludedCheckbox.checked).toBe(true));
    expect(otherCheckbox.checked).toBe(false);
  });
});

describe('AuthFilesOAuthExcludedEditPage save', () => {
  it('saves the selected excluded models for the provider', async () => {
    const user = userEvent.setup();
    saveOauthExcludedModels.mockResolvedValue(undefined);
    getModelDefinitions.mockResolvedValue([{ id: 'gpt-4o' }]);

    renderPage('/auth-files/oauth-excluded?provider=codex');
    const checkbox = (await screen.findByText('gpt-4o')).closest('label')?.querySelector('input');
    if (!(checkbox instanceof HTMLInputElement)) throw new Error('expected a checkbox');
    await user.click(checkbox);
    await user.click(screen.getByRole('button', { name: 'Save/Update' }));

    await waitFor(() => expect(saveOauthExcludedModels).toHaveBeenCalledWith('codex', ['gpt-4o']));
  });

  it('deletes the provider entry when saving with no selected models', async () => {
    const user = userEvent.setup();
    deleteOauthExcludedEntry.mockResolvedValue(undefined);
    getOauthExcludedModels.mockResolvedValue({ codex: ['gpt-4o'] });
    getModelDefinitions.mockResolvedValue([{ id: 'gpt-4o' }]);

    renderPage('/auth-files/oauth-excluded?provider=codex');
    const checkbox = (await screen.findByText('gpt-4o')).closest('label')?.querySelector('input');
    if (!(checkbox instanceof HTMLInputElement)) throw new Error('expected a checkbox');
    await user.click(checkbox);
    await user.click(screen.getByRole('button', { name: 'Save/Update' }));

    await waitFor(() => expect(deleteOauthExcludedEntry).toHaveBeenCalledWith('codex'));
  });

  it('shows a success notification after a successful save', async () => {
    const user = userEvent.setup();
    saveOauthExcludedModels.mockResolvedValue(undefined);
    getModelDefinitions.mockResolvedValue([{ id: 'gpt-4o' }]);

    renderPage('/auth-files/oauth-excluded?provider=codex');
    const checkbox = (await screen.findByText('gpt-4o')).closest('label')?.querySelector('input');
    if (!(checkbox instanceof HTMLInputElement)) throw new Error('expected a checkbox');
    await user.click(checkbox);
    await user.click(screen.getByRole('button', { name: 'Save/Update' }));

    await waitFor(() =>
      expect(useNotificationStore.getState().notifications).toEqual([
        expect.objectContaining({ message: 'Model disablement updated', type: 'success' }),
      ])
    );
  });

  it('shows a validation error and does not save when the provider is empty', async () => {
    const user = userEvent.setup();

    renderPage();
    await screen.findByText('Add provider model disablement');
    await user.click(screen.getByRole('button', { name: 'Save/Update' }));

    expect(saveOauthExcludedModels).not.toHaveBeenCalled();
    expect(useNotificationStore.getState().notifications).toEqual([
      expect.objectContaining({ message: 'Please enter a provider first', type: 'error' }),
    ]);
  });

  it('disables the save button when not connected', async () => {
    setConnected(false);

    renderPage('/auth-files/oauth-excluded?provider=codex');

    expect(await screen.findByRole('button', { name: 'Save/Update' })).toBeDisabled();
  });
});
