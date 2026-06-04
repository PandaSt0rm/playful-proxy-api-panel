import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderWithRouter, screen, waitFor, userEvent } from '@/test/utils';
import { useAuthStore, useNotificationStore } from '@/stores';
import type { AuthFileItem, AuthFilesResponse } from '@/types/authFile';

// --- Boundary mocks -------------------------------------------------------

const navigateSpy = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateSpy };
});

// Animations are not behaviour under test; replace the motion driver with a
// no-op that resolves so the batch action bar transitions never block.
vi.mock('motion/mini', () => ({
  animate: () => ({ stop: () => {}, then: (fn: () => void) => fn() }),
}));

// downloadBlob touches window.URL.createObjectURL which jsdom does not provide;
// stub it so download flows can be exercised by observable side effects.
const downloadBlob = vi.fn();
vi.mock('@/utils/download', () => ({
  downloadBlob: (opts: unknown) => downloadBlob(opts),
}));

const copyToClipboard = vi.fn();
vi.mock('@/utils/clipboard', () => ({
  copyToClipboard: (text: string) => copyToClipboard(text),
}));

const list = vi.fn<() => Promise<AuthFilesResponse>>();
const setStatus = vi.fn();
const deleteFiles = vi.fn();
const deleteAll = vi.fn();
const cleanupDisabled = vi.fn();
const exportArchive = vi.fn();
const getOauthExcludedModels = vi.fn();
const getOauthModelAlias = vi.fn();
const getModelsForAuthFile = vi.fn();
const getModelDefinitions = vi.fn();
const patchFields = vi.fn();

vi.mock('@/services/api/authFiles', () => ({
  AUTH_FILE_INVALID_JSON_OBJECT_ERROR: 'AUTH_FILE_INVALID_JSON_OBJECT',
  isAuthFileInvalidJsonObjectError: () => false,
  authFilesApi: {
    list: () => list(),
    setStatus: (name: string, disabled: boolean) => setStatus(name, disabled),
    deleteFile: (name: string) => deleteFiles([name]),
    deleteFiles: (names: string[]) => deleteFiles(names),
    deleteAll: () => deleteAll(),
    cleanupDisabled: () => cleanupDisabled(),
    exportArchive: () => exportArchive(),
    uploadFiles: vi.fn(),
    upload: vi.fn(),
    getOauthExcludedModels: () => getOauthExcludedModels(),
    getOauthModelAlias: () => getOauthModelAlias(),
    getModelsForAuthFile: (name: string) => getModelsForAuthFile(name),
    getModelDefinitions: (channel: string) => getModelDefinitions(channel),
    patchFields: (name: string, fields: unknown) => patchFields(name, fields),
    downloadText: vi.fn(),
    downloadJsonObject: vi.fn(),
    saveText: vi.fn(),
    saveJsonObject: vi.fn(),
  },
}));

const getRaw = vi.fn();
vi.mock('@/services/api/client', () => ({
  apiClient: {
    getRaw: (url: string, config?: unknown) => getRaw(url, config),
  },
}));

import { AuthFilesPage } from './AuthFilesPage';

const makeFile = (overrides: Partial<AuthFileItem> = {}): AuthFileItem => ({
  name: 'codex-1.json',
  type: 'codex',
  provider: 'codex',
  disabled: false,
  ...overrides,
});

const resetNotifications = () => {
  useNotificationStore.setState({
    notifications: [],
    confirmation: { isOpen: false, isLoading: false, options: null },
  });
};

const setConnected = (connected: boolean) => {
  useAuthStore.setState({ connectionStatus: connected ? 'connected' : 'disconnected' });
};

const renderPage = () => renderWithRouter(<AuthFilesPage />, { route: '/auth-files' });

beforeEach(() => {
  localStorage.clear();
  list.mockReset();
  setStatus.mockReset();
  deleteFiles.mockReset();
  deleteAll.mockReset();
  cleanupDisabled.mockReset();
  exportArchive.mockReset();
  getOauthExcludedModels.mockReset();
  getOauthModelAlias.mockReset();
  getModelsForAuthFile.mockReset();
  getModelDefinitions.mockReset();
  patchFields.mockReset();
  getRaw.mockReset();
  downloadBlob.mockReset();
  copyToClipboard.mockReset();
  navigateSpy.mockReset();
  resetNotifications();
  setConnected(true);

  list.mockResolvedValue({ files: [] });
  getOauthExcludedModels.mockResolvedValue({});
  getOauthModelAlias.mockResolvedValue({});
  copyToClipboard.mockResolvedValue(true);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AuthFilesPage initial load', () => {
  it('renders the page title and description', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Auth Files Management' })).toBeInTheDocument();
  });

  it('requests the auth file list on mount', async () => {
    renderPage();

    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
  });

  it('shows the empty state when no files are returned', async () => {
    list.mockResolvedValue({ files: [] });

    renderPage();

    expect(await screen.findByText('No matching files')).toBeInTheDocument();
  });
});

describe('AuthFilesPage list rendering', () => {
  it('renders a card for each returned auth file', async () => {
    list.mockResolvedValue({
      files: [makeFile({ name: 'codex-1.json' }), makeFile({ name: 'claude-9.json', type: 'claude' })],
    });

    renderPage();

    expect(await screen.findByText('codex-1.json')).toBeInTheDocument();
    expect(screen.getByText('claude-9.json')).toBeInTheDocument();
  });

  it('shows the total file count badge next to the section title', async () => {
    list.mockResolvedValue({ files: [makeFile({ name: 'a.json' }), makeFile({ name: 'b.json' })] });

    renderPage();

    await screen.findByText('a.json');
    const sectionTitle = screen.getByText('Auth Files');
    const badge = sectionTitle.parentElement?.querySelector('span:last-child');
    expect(badge?.textContent).toBe('2');
  });
});

describe('AuthFilesPage error state', () => {
  it('shows the error message when the list request rejects', async () => {
    list.mockRejectedValue(new Error('boom while loading'));

    renderPage();

    expect(await screen.findByText('boom while loading')).toBeInTheDocument();
  });
});

describe('AuthFilesPage refresh', () => {
  it('reloads files, excluded models, and aliases when refresh is clicked', async () => {
    const user = userEvent.setup();
    list.mockResolvedValue({ files: [makeFile({ name: 'a.json' })] });
    renderPage();
    await screen.findByText('a.json');
    list.mockClear();
    getOauthExcludedModels.mockClear();
    getOauthModelAlias.mockClear();

    await user.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
    expect(getOauthExcludedModels).toHaveBeenCalledTimes(1);
    expect(getOauthModelAlias).toHaveBeenCalledTimes(1);
  });
});

describe('AuthFilesPage search filtering', () => {
  it('shows only files whose name matches the search term', async () => {
    const user = userEvent.setup();
    list.mockResolvedValue({
      files: [makeFile({ name: 'codex-1.json' }), makeFile({ name: 'claude-9.json', type: 'claude' })],
    });
    renderPage();
    await screen.findByText('codex-1.json');

    await user.type(screen.getByPlaceholderText(/wildcard/i), 'claude');

    expect(await screen.findByText('claude-9.json')).toBeInTheDocument();
    expect(screen.queryByText('codex-1.json')).not.toBeInTheDocument();
  });

  it('shows the empty state when the search matches no files', async () => {
    const user = userEvent.setup();
    list.mockResolvedValue({ files: [makeFile({ name: 'codex-1.json' })] });
    renderPage();
    await screen.findByText('codex-1.json');

    await user.type(screen.getByPlaceholderText(/wildcard/i), 'no-such-file');

    expect(await screen.findByText('No matching files')).toBeInTheDocument();
  });
});

describe('AuthFilesPage type filter tags', () => {
  it('filters the list to a single provider type when its filter tag is clicked', async () => {
    const user = userEvent.setup();
    list.mockResolvedValue({
      files: [makeFile({ name: 'codex-1.json', type: 'codex' }), makeFile({ name: 'kimi-1.json', type: 'kimi' })],
    });
    renderPage();
    await screen.findByText('codex-1.json');

    await user.click(screen.getByRole('button', { name: /Kimi/ }));

    expect(await screen.findByText('kimi-1.json')).toBeInTheDocument();
    expect(screen.queryByText('codex-1.json')).not.toBeInTheDocument();
  });
});

describe('AuthFilesPage delete flow', () => {
  it('opens a confirmation dialog before deleting a file', async () => {
    const user = userEvent.setup();
    list.mockResolvedValue({ files: [makeFile({ name: 'codex-1.json' })] });
    renderPage();
    await screen.findByText('codex-1.json');

    await user.click(screen.getByTitle('Delete'));

    expect(useNotificationStore.getState().confirmation.isOpen).toBe(true);
    expect(deleteFiles).not.toHaveBeenCalled();
  });

  it('deletes the file and notifies success when the confirmation is accepted', async () => {
    const user = userEvent.setup();
    list.mockResolvedValue({ files: [makeFile({ name: 'codex-1.json' })] });
    deleteFiles.mockResolvedValue({ status: 'ok', deleted: 1, files: ['codex-1.json'], failed: [] });
    renderPage();
    await screen.findByText('codex-1.json');

    await user.click(screen.getByTitle('Delete'));
    await useNotificationStore.getState().confirmation.options?.onConfirm();

    expect(deleteFiles).toHaveBeenCalledWith(['codex-1.json']);
    await waitFor(() =>
      expect(useNotificationStore.getState().notifications).toContainEqual(
        expect.objectContaining({ message: 'File deleted successfully', type: 'success' })
      )
    );
  });

  it('removes the deleted card from the list after a successful delete', async () => {
    const user = userEvent.setup();
    list.mockResolvedValue({ files: [makeFile({ name: 'codex-1.json' })] });
    deleteFiles.mockResolvedValue({ status: 'ok', deleted: 1, files: ['codex-1.json'], failed: [] });
    renderPage();
    await screen.findByText('codex-1.json');

    await user.click(screen.getByTitle('Delete'));
    await useNotificationStore.getState().confirmation.options?.onConfirm();

    await waitFor(() => expect(screen.queryByText('codex-1.json')).not.toBeInTheDocument());
  });
});

describe('AuthFilesPage export library', () => {
  it('exports the archive and notifies success', async () => {
    const user = userEvent.setup();
    exportArchive.mockResolvedValue({ data: new Blob(['zip'], { type: 'application/zip' }) });
    renderPage();
    await screen.findByText('No matching files');

    await user.click(screen.getByRole('button', { name: /Export auth library/ }));

    await waitFor(() => expect(exportArchive).toHaveBeenCalledTimes(1));
    expect(downloadBlob).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(useNotificationStore.getState().notifications).toContainEqual(
        expect.objectContaining({ message: 'Auth library exported', type: 'success' })
      )
    );
  });

  it('notifies an error when the export request rejects', async () => {
    const user = userEvent.setup();
    exportArchive.mockRejectedValue(new Error('export blew up'));
    renderPage();
    await screen.findByText('No matching files');

    await user.click(screen.getByRole('button', { name: /Export auth library/ }));

    await waitFor(() =>
      expect(useNotificationStore.getState().notifications).toContainEqual(
        expect.objectContaining({ message: 'export blew up', type: 'error' })
      )
    );
  });
});

describe('AuthFilesPage cleanup disabled', () => {
  it('confirms before cleaning up disabled auth files', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('No matching files');

    await user.click(screen.getByRole('button', { name: /Clean disabled auth/ }));

    expect(useNotificationStore.getState().confirmation.isOpen).toBe(true);
    expect(cleanupDisabled).not.toHaveBeenCalled();
  });

  it('reports the deleted count after a successful cleanup', async () => {
    const user = userEvent.setup();
    cleanupDisabled.mockResolvedValue({ status: 'ok', deleted: 3, files: [], failed: [] });
    renderPage();
    await screen.findByText('No matching files');

    await user.click(screen.getByRole('button', { name: /Clean disabled auth/ }));
    await useNotificationStore.getState().confirmation.options?.onConfirm();

    expect(cleanupDisabled).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(useNotificationStore.getState().notifications).toContainEqual(
        expect.objectContaining({ message: 'Deleted 3 disabled auth files', type: 'success' })
      )
    );
  });

  it('reports the no-op message when no disabled files can be cleaned', async () => {
    const user = userEvent.setup();
    cleanupDisabled.mockResolvedValue({ status: 'ok', deleted: 0, files: [], failed: [] });
    renderPage();
    await screen.findByText('No matching files');

    await user.click(screen.getByRole('button', { name: /Clean disabled auth/ }));
    await useNotificationStore.getState().confirmation.options?.onConfirm();

    await waitFor(() =>
      expect(useNotificationStore.getState().notifications).toContainEqual(
        expect.objectContaining({
          message: 'No disabled auth files can be deleted',
          type: 'info',
        })
      )
    );
  });
});

describe('AuthFilesPage status toggle', () => {
  it('disables an enabled file and notifies success', async () => {
    const user = userEvent.setup();
    list.mockResolvedValue({ files: [makeFile({ name: 'codex-1.json', disabled: false })] });
    setStatus.mockResolvedValue({ status: 'ok', disabled: true });
    renderPage();
    await screen.findByText('codex-1.json');

    await user.click(screen.getByRole('checkbox', { name: 'Enabled' }));

    await waitFor(() => expect(setStatus).toHaveBeenCalledWith('codex-1.json', true));
    await waitFor(() =>
      expect(useNotificationStore.getState().notifications).toContainEqual(
        expect.objectContaining({ message: '"codex-1.json" disabled', type: 'success' })
      )
    );
  });
});

describe('AuthFilesPage disabled-only filter', () => {
  it('shows only disabled files when the disabled-only toggle is on', async () => {
    const user = userEvent.setup();
    list.mockResolvedValue({
      files: [
        makeFile({ name: 'enabled.json', disabled: false }),
        makeFile({ name: 'disabled.json', disabled: true }),
      ],
    });
    renderPage();
    await screen.findByText('enabled.json');

    await user.click(screen.getByRole('checkbox', { name: 'Only show disabled credentials' }));

    expect(await screen.findByText('disabled.json')).toBeInTheDocument();
    expect(screen.queryByText('enabled.json')).not.toBeInTheDocument();
  });
});

describe('AuthFilesPage connection gating', () => {
  it('disables the upload control while disconnected', async () => {
    setConnected(false);

    renderPage();

    await screen.findByText('No matching files');
    expect(screen.getByRole('button', { name: 'Upload File' })).toBeDisabled();
  });

  it('disables the export control while disconnected', async () => {
    setConnected(false);

    renderPage();

    await screen.findByText('No matching files');
    expect(screen.getByRole('button', { name: /Export auth library/ })).toBeDisabled();
  });
});

describe('AuthFilesPage batch selection bar', () => {
  it('shows the batch action bar with the selection count after selecting a file', async () => {
    const user = userEvent.setup();
    list.mockResolvedValue({ files: [makeFile({ name: 'codex-1.json' })] });
    renderPage();
    await screen.findByText('codex-1.json');

    await user.click(screen.getByTitle('Select All'));

    expect(await screen.findByText('1 selected')).toBeInTheDocument();
  });

  it('batch-downloads the selected files when the download button is clicked', async () => {
    const user = userEvent.setup();
    list.mockResolvedValue({ files: [makeFile({ name: 'codex-1.json' })] });
    getRaw.mockResolvedValue({ data: new Blob(['x']) });
    renderPage();
    await screen.findByText('codex-1.json');

    await user.click(screen.getByTitle('Select All'));
    await screen.findByText('1 selected');
    await user.click(screen.getByRole('button', { name: 'Download selected' }));

    await waitFor(() => expect(getRaw).toHaveBeenCalledTimes(1));
    expect(downloadBlob).toHaveBeenCalledTimes(1);
  });
});

describe('AuthFilesPage periodic refresh', () => {
  it('reloads the list on the 4-minute interval while the layer is current', async () => {
    vi.useFakeTimers();
    list.mockResolvedValue({ files: [] });
    renderPage();
    await vi.advanceTimersByTimeAsync(0);
    list.mockClear();

    await vi.advanceTimersByTimeAsync(240_000);

    expect(list).toHaveBeenCalledTimes(1);
  });
});
