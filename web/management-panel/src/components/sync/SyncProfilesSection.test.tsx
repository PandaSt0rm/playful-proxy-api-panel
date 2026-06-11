import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, userEvent, waitFor, within } from '@/test/utils';
import { SyncProfilesSection } from './SyncProfilesSection';
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
    getSyncState: vi.fn(),
  },
}));

const EMPTY_CONFIGS: SyncAvailableConfigs = {
  base_url: 'http://localhost:8317',
  api_keys: [],
  providers: [],
  oauth_channels: [],
  all_models: [],
};

const PROFILES: SyncProfile[] = [
  {
    name: 'Production',
    targets: [
      { tool: 'codex', 'active-model': 'gpt-5', 'model-filter': '^gpt-.*' },
      { tool: 'claude-code' },
    ],
  },
  {
    name: 'Staging',
    targets: [{ tool: 'aider' }],
  },
];

const mockedApi = vi.mocked(syncApi);

beforeEach(() => {
  vi.clearAllMocks();
  useNotificationStore.setState({ notifications: [], confirmation: { isOpen: false, isLoading: false, options: null } });
  mockedApi.getSyncAvailableConfigs.mockResolvedValue(EMPTY_CONFIGS);
  mockedApi.getSyncState.mockResolvedValue({ hosts: {} });
});

describe('SyncProfilesSection — load states', () => {
  it('shows the loading indicator before the profiles resolve', () => {
    mockedApi.getSyncProfiles.mockReturnValue(new Promise(() => {}));

    render(<SyncProfilesSection />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders the empty state when the profile list is empty', async () => {
    mockedApi.getSyncProfiles.mockResolvedValue([]);

    render(<SyncProfilesSection />);

    expect(await screen.findByText('No sync profiles configured')).toBeInTheDocument();
  });

  it('renders the error state when loading profiles fails', async () => {
    mockedApi.getSyncProfiles.mockRejectedValue(new Error('network down'));

    render(<SyncProfilesSection />);

    expect(await screen.findByText('Failed to load sync profiles.')).toBeInTheDocument();
  });

  it('refetches profiles when the retry button is clicked after an error', async () => {
    mockedApi.getSyncProfiles.mockRejectedValueOnce(new Error('network down')).mockResolvedValueOnce([]);

    render(<SyncProfilesSection />);
    const retry = await screen.findByRole('button', { name: 'Refresh' });

    await userEvent.click(retry);

    expect(await screen.findByText('No sync profiles configured')).toBeInTheDocument();
    expect(mockedApi.getSyncProfiles).toHaveBeenCalledTimes(2);
  });

  it('renders each profile name once profiles resolve', async () => {
    mockedApi.getSyncProfiles.mockResolvedValue(PROFILES);

    render(<SyncProfilesSection />);

    expect(await screen.findByRole('button', { name: /Production/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Staging/ })).toBeInTheDocument();
  });
});

describe('SyncProfilesSection — profile metadata', () => {
  beforeEach(() => {
    mockedApi.getSyncProfiles.mockResolvedValue(PROFILES);
  });

  it('shows the tool count for a profile', async () => {
    render(<SyncProfilesSection />);
    await screen.findByRole('button', { name: /Production/ });

    expect(screen.getByText('2 tool(s)')).toBeInTheDocument();
  });

  it('lists the tool labels joined for a profile', async () => {
    render(<SyncProfilesSection />);
    await screen.findByRole('button', { name: /Production/ });

    expect(screen.getByText('Codex, Claude Code')).toBeInTheDocument();
  });
});

describe('SyncProfilesSection — expand/collapse', () => {
  beforeEach(() => {
    mockedApi.getSyncProfiles.mockResolvedValue(PROFILES);
  });

  it('does not show target detail rows until a profile is expanded', async () => {
    render(<SyncProfilesSection />);
    await screen.findByRole('button', { name: /Production/ });

    expect(screen.queryByText('gpt-5')).not.toBeInTheDocument();
  });

  it('reveals the active model and filter when a profile is expanded', async () => {
    render(<SyncProfilesSection />);
    const nameButton = await screen.findByRole('button', { name: /Production/ });

    await userEvent.click(nameButton);

    expect(screen.getByText('gpt-5')).toBeInTheDocument();
    expect(screen.getByText('/^gpt-.*/')).toBeInTheDocument();
  });

  it('marks the expanded profile button as aria-expanded', async () => {
    render(<SyncProfilesSection />);
    const nameButton = await screen.findByRole('button', { name: /Production/ });

    await userEvent.click(nameButton);

    expect(nameButton).toHaveAttribute('aria-expanded', 'true');
  });

  it('collapses an expanded profile when its name is clicked again', async () => {
    render(<SyncProfilesSection />);
    const nameButton = await screen.findByRole('button', { name: /Production/ });
    await userEvent.click(nameButton);

    await userEvent.click(nameButton);

    expect(screen.queryByText('gpt-5')).not.toBeInTheDocument();
  });
});

describe('SyncProfilesSection — sync status', () => {
  beforeEach(() => {
    mockedApi.getSyncProfiles.mockResolvedValue(PROFILES);
  });

  it('shows never-synced when no host has reported the tool', async () => {
    render(<SyncProfilesSection />);
    const nameButton = await screen.findByRole('button', { name: /Staging/ });

    await userEvent.click(nameButton);

    expect(screen.getByText('Never Synced')).toBeInTheDocument();
  });

  it('shows the reported status and timestamp for a synced tool', async () => {
    mockedApi.getSyncState.mockResolvedValue({
      hosts: {
        devbox: {
          reported_at: '2026-06-11T10:00:00Z',
          profile: 'Production',
          tools: {
            codex: { tool: 'codex', status: 'synced', timestamp: '2026-06-11T10:00:00Z' },
          },
        },
      },
    });
    render(<SyncProfilesSection />);
    const nameButton = await screen.findByRole('button', { name: /Production/ });

    await userEvent.click(nameButton);

    await waitFor(() => expect(screen.getByText('Synced')).toBeInTheDocument());
    // claude-code in the same profile has no report.
    expect(screen.getByText('Never Synced')).toBeInTheDocument();
  });

  it('uses the most recent report when multiple hosts cover the same tool', async () => {
    mockedApi.getSyncState.mockResolvedValue({
      hosts: {
        older: {
          reported_at: '2026-06-10T08:00:00Z',
          tools: {
            codex: { tool: 'codex', status: 'error', timestamp: '2026-06-10T08:00:00Z', error: 'stale' },
          },
        },
        newer: {
          reported_at: '2026-06-11T09:00:00Z',
          tools: {
            codex: { tool: 'codex', status: 'synced', timestamp: '2026-06-11T09:00:00Z' },
          },
        },
      },
    });
    render(<SyncProfilesSection />);
    const nameButton = await screen.findByRole('button', { name: /Production/ });

    await userEvent.click(nameButton);

    await waitFor(() => expect(screen.getByText('Synced')).toBeInTheDocument());
    expect(screen.queryByText('Error')).not.toBeInTheDocument();
  });

  it('shows a conflict status with its error detail', async () => {
    mockedApi.getSyncState.mockResolvedValue({
      hosts: {
        devbox: {
          reported_at: '2026-06-11T10:00:00Z',
          tools: {
            codex: { tool: 'codex', status: 'conflict', timestamp: '2026-06-11T10:00:00Z', error: 'hash mismatch' },
          },
        },
      },
    });
    render(<SyncProfilesSection />);
    const nameButton = await screen.findByRole('button', { name: /Production/ });

    await userEvent.click(nameButton);

    await waitFor(() => expect(screen.getByText('Conflict')).toBeInTheDocument());
    expect(screen.getByText('(hash mismatch)')).toBeInTheDocument();
  });

  it('still renders profiles when the sync state request fails', async () => {
    mockedApi.getSyncState.mockRejectedValue(new Error('boom'));
    render(<SyncProfilesSection />);
    const nameButton = await screen.findByRole('button', { name: /Production/ });

    await userEvent.click(nameButton);

    expect(screen.getAllByText('Never Synced').length).toBeGreaterThan(0);
  });
});

describe('SyncProfilesSection — create flow', () => {
  beforeEach(() => {
    mockedApi.getSyncProfiles.mockResolvedValue([]);
  });

  it('opens the create modal when the create button is clicked', async () => {
    render(<SyncProfilesSection />);
    await screen.findByText('No sync profiles configured');

    await userEvent.click(screen.getByRole('button', { name: 'Create First Profile' }));

    expect(await screen.findByText('Create Sync Profile')).toBeInTheDocument();
  });

  it('disables the header create button while a modal is open', async () => {
    render(<SyncProfilesSection />);
    await screen.findByText('No sync profiles configured');

    await userEvent.click(screen.getByRole('button', { name: '+ Create Profile' }));

    await screen.findByText('Create Sync Profile');
    expect(screen.getByRole('button', { name: '+ Create Profile' })).toBeDisabled();
  });
});

describe('SyncProfilesSection — edit flow', () => {
  beforeEach(() => {
    mockedApi.getSyncProfiles.mockResolvedValue(PROFILES);
  });

  it('opens the edit modal titled "Edit Sync Profile" when Edit is clicked', async () => {
    render(<SyncProfilesSection />);
    await screen.findByRole('button', { name: /Production/ });

    await userEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);

    expect(await screen.findByText('Edit Sync Profile')).toBeInTheDocument();
  });

  it('prefills the edited profile name into the form', async () => {
    render(<SyncProfilesSection />);
    await screen.findByRole('button', { name: /Production/ });

    await userEvent.click(screen.getAllByRole('button', { name: 'Edit' })[1]);

    expect(await screen.findByDisplayValue('Staging')).toBeInTheDocument();
  });
});

describe('SyncProfilesSection — delete flow', () => {
  beforeEach(() => {
    mockedApi.getSyncProfiles.mockResolvedValue(PROFILES);
  });

  it('opens the delete confirmation naming the targeted profile', async () => {
    render(<SyncProfilesSection />);
    await screen.findByRole('button', { name: /Production/ });

    await userEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);

    expect(
      await screen.findByText(/Are you sure you want to delete the sync profile "Production"/)
    ).toBeInTheDocument();
  });

  it('calls deleteSyncProfile with the profile name on confirm', async () => {
    mockedApi.deleteSyncProfile.mockResolvedValue({ status: 'ok' });
    render(<SyncProfilesSection />);
    await screen.findByRole('button', { name: /Production/ });
    await userEvent.click(screen.getAllByRole('button', { name: 'Delete' })[1]);
    const dialog = await screen.findByRole('dialog');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(mockedApi.deleteSyncProfile).toHaveBeenCalledWith('Staging'));
  });

  it('shows a success notification after a successful delete', async () => {
    mockedApi.deleteSyncProfile.mockResolvedValue({ status: 'ok' });
    render(<SyncProfilesSection />);
    await screen.findByRole('button', { name: /Production/ });
    await userEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);
    const dialog = await screen.findByRole('dialog');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() =>
      expect(useNotificationStore.getState().notifications[0]).toMatchObject({
        message: 'Profile "Production" deleted',
        type: 'success',
      })
    );
  });

  it('refetches the profile list after a successful delete', async () => {
    mockedApi.deleteSyncProfile.mockResolvedValue({ status: 'ok' });
    render(<SyncProfilesSection />);
    await screen.findByRole('button', { name: /Production/ });
    await userEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);
    const dialog = await screen.findByRole('dialog');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(mockedApi.getSyncProfiles).toHaveBeenCalledTimes(2));
  });

  it('surfaces an error notification when the delete request fails', async () => {
    mockedApi.deleteSyncProfile.mockRejectedValue(new Error('delete blew up'));
    render(<SyncProfilesSection />);
    await screen.findByRole('button', { name: /Production/ });
    await userEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);
    const dialog = await screen.findByRole('dialog');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() =>
      expect(useNotificationStore.getState().notifications[0]).toMatchObject({
        message: 'delete blew up',
        type: 'error',
      })
    );
  });

  it('does not call deleteSyncProfile when the confirmation is cancelled', async () => {
    render(<SyncProfilesSection />);
    await screen.findByRole('button', { name: /Production/ });
    await userEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);
    const dialog = await screen.findByRole('dialog');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(mockedApi.deleteSyncProfile).not.toHaveBeenCalled();
  });
});
