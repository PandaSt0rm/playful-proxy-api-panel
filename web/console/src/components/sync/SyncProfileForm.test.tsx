import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, userEvent, waitFor } from '@/test/utils';
import { SyncProfileForm } from './SyncProfileForm';
import { syncApi } from '@/services/api/sync';
import { useNotificationStore } from '@/stores';
import type { SyncProfile, SyncAvailableConfigs } from '@/types';

vi.mock('@/services/api/sync', () => ({
  syncApi: {
    getSyncProfiles: vi.fn(),
    saveSyncProfiles: vi.fn(),
    updateSyncProfileByName: vi.fn(),
    deleteSyncProfile: vi.fn(),
    getSyncAvailableConfigs: vi.fn(),
  },
}));

const CONFIGS: SyncAvailableConfigs = {
  base_url: 'http://localhost:8317',
  api_keys: [
    { masked: '****abcd', index: 0 },
    { masked: '****wxyz', index: 1 },
  ],
  providers: [{ type: 'codex-api-key', models: ['gpt-5', 'gpt-5-mini'] }],
  oauth_channels: [],
  all_models: ['gpt-5', 'gpt-5-mini'],
};

const mockedApi = vi.mocked(syncApi);

beforeEach(() => {
  vi.clearAllMocks();
  useNotificationStore.setState({
    notifications: [],
    confirmation: { isOpen: false, isLoading: false, options: null },
  });
  mockedApi.getSyncAvailableConfigs.mockResolvedValue(CONFIGS);
  mockedApi.getSyncProfiles.mockResolvedValue([]);
  mockedApi.saveSyncProfiles.mockResolvedValue({ status: 'ok' });
  mockedApi.updateSyncProfileByName.mockResolvedValue({ status: 'ok' });
});

function renderCreate(extra: Partial<Parameters<typeof SyncProfileForm>[0]> = {}) {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  render(<SyncProfileForm onClose={onClose} onSaved={onSaved} {...extra} />);
  return { onClose, onSaved };
}

function renderEdit(
  profile: SyncProfile,
  extra: Partial<Parameters<typeof SyncProfileForm>[0]> = {}
) {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  render(<SyncProfileForm profile={profile} onClose={onClose} onSaved={onSaved} {...extra} />);
  return { onClose, onSaved };
}

/** Flush the on-mount getSyncAvailableConfigs effect so its state update settles. */
async function flushConfigs() {
  await waitFor(() => expect(mockedApi.getSyncAvailableConfigs).toHaveBeenCalled());
}

describe('SyncProfileForm — rendering', () => {
  it('renders the profile name input', async () => {
    renderCreate();

    expect(screen.getByLabelText('Profile name')).toBeInTheDocument();
    await flushConfigs();
  });

  it('renders a slim row for every sync tool', async () => {
    renderCreate();

    expect(screen.getByRole('checkbox', { name: 'Codex' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Claude Code' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Hermes' })).toBeInTheDocument();
    await flushConfigs();
  });

  it('shows the "Create Profile" submit button in create mode', async () => {
    renderCreate();

    expect(screen.getByRole('button', { name: 'Create Profile' })).toBeInTheDocument();
    await flushConfigs();
  });

  it('shows the "Save" submit button in edit mode', async () => {
    renderEdit({ name: 'Prod', targets: [{ tool: 'codex' }] });

    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    await flushConfigs();
  });

  it('prefills the name from an existing profile in edit mode', async () => {
    renderEdit({ name: 'Prod', targets: [{ tool: 'codex' }] });

    expect(screen.getByLabelText('Profile name')).toHaveValue('Prod');
    await flushConfigs();
  });

  it('expands the target tool into a config card in edit mode', async () => {
    renderEdit({ name: 'Prod', targets: [{ tool: 'codex' }] });

    expect(screen.getByRole('checkbox', { name: 'Codex' })).toBeChecked();
    await flushConfigs();
  });
});

describe('SyncProfileForm — validation', () => {
  it('shows a name-required error when submitting with a blank name', async () => {
    renderCreate();
    await flushConfigs();

    await userEvent.click(screen.getByRole('button', { name: 'Create Profile' }));

    expect(await screen.findByText('Profile name is required')).toBeInTheDocument();
  });

  it('shows a tools-required error when submitting with no tools selected', async () => {
    renderCreate();
    await flushConfigs();
    await userEvent.type(screen.getByLabelText('Profile name'), 'My Profile');

    await userEvent.click(screen.getByRole('button', { name: 'Create Profile' }));

    expect(await screen.findByText('Select at least one tool')).toBeInTheDocument();
  });

  it('does not call saveSyncProfiles when validation fails', async () => {
    renderCreate();
    await flushConfigs();

    await userEvent.click(screen.getByRole('button', { name: 'Create Profile' }));

    expect(mockedApi.saveSyncProfiles).not.toHaveBeenCalled();
  });

  it('treats a whitespace-only name as missing', async () => {
    renderCreate();
    await flushConfigs();
    await userEvent.type(screen.getByLabelText('Profile name'), '   ');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Codex' }));

    await userEvent.click(screen.getByRole('button', { name: 'Create Profile' }));

    expect(await screen.findByText('Profile name is required')).toBeInTheDocument();
  });

  it('clears the name error once the user edits the name field', async () => {
    renderCreate();
    await flushConfigs();
    await userEvent.click(screen.getByRole('button', { name: 'Create Profile' }));
    await screen.findByText('Profile name is required');

    await userEvent.type(screen.getByLabelText('Profile name'), 'X');

    expect(screen.queryByText('Profile name is required')).not.toBeInTheDocument();
  });
});

describe('SyncProfileForm — tool selection', () => {
  it('expands a tool into a config card when its slim row is checked', async () => {
    renderCreate();
    await flushConfigs();

    await userEvent.click(screen.getByRole('checkbox', { name: 'Codex' }));

    expect(screen.getByRole('checkbox', { name: 'Codex' })).toBeChecked();
  });

  it('collapses a selected tool back to a slim row when unchecked', async () => {
    renderCreate();
    await flushConfigs();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Codex' }));

    await userEvent.click(screen.getByRole('checkbox', { name: 'Codex' }));

    expect(screen.getByRole('checkbox', { name: 'Codex' })).not.toBeChecked();
  });
});

describe('SyncProfileForm — submit payload (create)', () => {
  it('sends a profile with the trimmed name and selected tool', async () => {
    renderCreate();
    await userEvent.type(screen.getByLabelText('Profile name'), '  My Profile  ');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Codex' }));

    await userEvent.click(screen.getByRole('button', { name: 'Create Profile' }));

    await waitFor(() => expect(mockedApi.saveSyncProfiles).toHaveBeenCalledTimes(1));
    expect(mockedApi.saveSyncProfiles).toHaveBeenCalledWith([
      { name: 'My Profile', targets: [{ tool: 'codex' }] },
    ]);
  });

  it('appends the new profile to the existing list', async () => {
    mockedApi.getSyncProfiles.mockResolvedValue([
      { name: 'Existing', targets: [{ tool: 'aider' }] },
    ]);
    renderCreate();
    await userEvent.type(screen.getByLabelText('Profile name'), 'Fresh');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Codex' }));

    await userEvent.click(screen.getByRole('button', { name: 'Create Profile' }));

    await waitFor(() => expect(mockedApi.saveSyncProfiles).toHaveBeenCalledTimes(1));
    expect(mockedApi.saveSyncProfiles).toHaveBeenCalledWith([
      { name: 'Existing', targets: [{ tool: 'aider' }] },
      { name: 'Fresh', targets: [{ tool: 'codex' }] },
    ]);
  });

  it('invokes onSaved after a successful create', async () => {
    const { onSaved } = renderCreate();
    await userEvent.type(screen.getByLabelText('Profile name'), 'Fresh');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Codex' }));

    await userEvent.click(screen.getByRole('button', { name: 'Create Profile' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  });

  it('shows a success notification after a successful create', async () => {
    renderCreate();
    await userEvent.type(screen.getByLabelText('Profile name'), 'Fresh');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Codex' }));

    await userEvent.click(screen.getByRole('button', { name: 'Create Profile' }));

    await waitFor(() =>
      expect(useNotificationStore.getState().notifications[0]).toMatchObject({
        message: 'Profile "Fresh" created',
        type: 'success',
      })
    );
  });
});

describe('SyncProfileForm — submit payload (edit)', () => {
  it('patches the profile by its original name instead of rewriting the list', async () => {
    renderEdit({ name: 'B', targets: [{ tool: 'codex' }] });
    await screen.findByDisplayValue('B');

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mockedApi.updateSyncProfileByName).toHaveBeenCalledTimes(1));
    expect(mockedApi.updateSyncProfileByName).toHaveBeenCalledWith('B', {
      name: 'B',
      targets: [{ tool: 'codex' }],
    });
    expect(mockedApi.saveSyncProfiles).not.toHaveBeenCalled();
  });

  it('patches under the original name when the profile is renamed', async () => {
    renderEdit({ name: 'Old', targets: [{ tool: 'codex' }] });
    await screen.findByDisplayValue('Old');
    await userEvent.clear(screen.getByLabelText('Profile name'));
    await userEvent.type(screen.getByLabelText('Profile name'), 'New');

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mockedApi.updateSyncProfileByName).toHaveBeenCalledTimes(1));
    expect(mockedApi.updateSyncProfileByName).toHaveBeenCalledWith('Old', {
      name: 'New',
      targets: [{ tool: 'codex' }],
    });
  });

  it('preserves an active-model on the round-trip through edit', async () => {
    renderEdit({ name: 'Prod', targets: [{ tool: 'codex', 'active-model': 'gpt-5' }] });
    await screen.findByDisplayValue('Prod');

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mockedApi.updateSyncProfileByName).toHaveBeenCalledTimes(1));
    expect(mockedApi.updateSyncProfileByName).toHaveBeenCalledWith('Prod', {
      name: 'Prod',
      targets: [{ tool: 'codex', 'active-model': 'gpt-5' }],
    });
  });

  it('preserves an api-key-index as a number on the round-trip through edit', async () => {
    renderEdit({ name: 'Prod', targets: [{ tool: 'codex', 'api-key-index': 1 }] });
    await screen.findByDisplayValue('Prod');

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mockedApi.updateSyncProfileByName).toHaveBeenCalledTimes(1));
    expect(mockedApi.updateSyncProfileByName).toHaveBeenCalledWith('Prod', {
      name: 'Prod',
      targets: [{ tool: 'codex', 'api-key-index': 1 }],
    });
  });

  it('re-encodes a decoded chip-list model-filter to its canonical regex on save', async () => {
    renderEdit({ name: 'Prod', targets: [{ tool: 'codex', 'model-filter': '^(?:gpt-5)$' }] });
    await screen.findByDisplayValue('Prod');

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mockedApi.updateSyncProfileByName).toHaveBeenCalledTimes(1));
    expect(mockedApi.updateSyncProfileByName).toHaveBeenCalledWith('Prod', {
      name: 'Prod',
      targets: [{ tool: 'codex', 'model-filter': '^(?:gpt-5)$' }],
    });
  });

  it('preserves a raw regex model-filter verbatim on save', async () => {
    renderEdit({ name: 'Prod', targets: [{ tool: 'codex', 'model-filter': '^gpt-.*' }] });
    await screen.findByDisplayValue('Prod');

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mockedApi.updateSyncProfileByName).toHaveBeenCalledTimes(1));
    expect(mockedApi.updateSyncProfileByName).toHaveBeenCalledWith('Prod', {
      name: 'Prod',
      targets: [{ tool: 'codex', 'model-filter': '^gpt-.*' }],
    });
  });
});

describe('SyncProfileForm — error handling', () => {
  it('shows the server error message when saving fails', async () => {
    mockedApi.saveSyncProfiles.mockRejectedValue(new Error('server exploded'));
    renderCreate();
    await userEvent.type(screen.getByLabelText('Profile name'), 'Fresh');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Codex' }));

    await userEvent.click(screen.getByRole('button', { name: 'Create Profile' }));

    expect(await screen.findByText('server exploded')).toBeInTheDocument();
  });

  it('does not invoke onSaved when saving fails', async () => {
    mockedApi.saveSyncProfiles.mockRejectedValue(new Error('server exploded'));
    const { onSaved } = renderCreate();
    await userEvent.type(screen.getByLabelText('Profile name'), 'Fresh');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Codex' }));

    await userEvent.click(screen.getByRole('button', { name: 'Create Profile' }));

    await screen.findByText('server exploded');
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('shows an error notification when saving fails', async () => {
    mockedApi.saveSyncProfiles.mockRejectedValue(new Error('server exploded'));
    renderCreate();
    await userEvent.type(screen.getByLabelText('Profile name'), 'Fresh');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Codex' }));

    await userEvent.click(screen.getByRole('button', { name: 'Create Profile' }));

    await waitFor(() =>
      expect(useNotificationStore.getState().notifications[0]).toMatchObject({
        message: 'Failed to save profile',
        type: 'error',
      })
    );
  });
});

describe('SyncProfileForm — cancel', () => {
  it('invokes onClose when the Cancel button is clicked', async () => {
    const { onClose } = renderCreate();
    await flushConfigs();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('SyncProfileForm — api key options', () => {
  it('renders the default api-key option with the first key tail in edit mode', async () => {
    renderEdit({ name: 'Prod', targets: [{ tool: 'codex' }] });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'API key' })).toHaveTextContent(
        'Default (Key #1 · ****abcd)'
      )
    );
  });
});
