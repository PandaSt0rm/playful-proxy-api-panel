import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderWithRouter, screen, waitFor, userEvent } from '@/test/utils';
import { SystemPage } from './SystemPage';
import { useAuthStore } from '@/stores/useAuthStore';
import { useConfigStore } from '@/stores/useConfigStore';
import { useModelsStore } from '@/stores/useModelsStore';
import { useNotificationStore } from '@/stores/useNotificationStore';
import { useThemeStore } from '@/stores/useThemeStore';
import { configApi, versionApi } from '@/services/api';
import { apiKeysApi } from '@/services/api/apiKeys';
import type { ModelInfo } from '@/utils/models';

// Mock the typed API boundary modules. The store's fetchConfig calls
// configApi.getConfig under the hood, so it must be mockable too.
vi.mock('@/services/api', () => ({
  configApi: {
    getConfig: vi.fn(),
    updateRequestLog: vi.fn(),
  },
  versionApi: {
    checkLatest: vi.fn(),
  },
}));

vi.mock('@/services/api/apiKeys', () => ({
  apiKeysApi: {
    list: vi.fn(),
  },
}));

const mockedGetConfig = vi.mocked(configApi.getConfig);
const mockedUpdateRequestLog = vi.mocked(configApi.updateRequestLog);
const mockedCheckLatest = vi.mocked(versionApi.checkLatest);
const mockedApiKeysList = vi.mocked(apiKeysApi.list);

/**
 * Seed the models store so SystemPage's mount-time fetchModels call
 * (gated on connectionStatus === 'connected') resolves predictably.
 */
function seedModelsStore(models: ModelInfo[] = []) {
  useModelsStore.setState({
    models,
    loading: false,
    error: null,
    cache: null,
  });
  vi.spyOn(useModelsStore.getState(), 'fetchModels').mockResolvedValue(models);
}

beforeEach(() => {
  localStorage.clear();

  mockedGetConfig.mockResolvedValue({ requestLog: false, raw: {} } as never);
  mockedUpdateRequestLog.mockResolvedValue(undefined as never);
  mockedCheckLatest.mockResolvedValue({});
  mockedApiKeysList.mockResolvedValue([]);

  useAuthStore.setState({
    isAuthenticated: false,
    apiBase: '',
    managementKey: '',
    serverVersion: null,
    serverBuildDate: null,
    connectionStatus: 'disconnected',
    connectionError: null,
  });
  useConfigStore.setState({ config: null, cache: new Map(), loading: false, error: null });
  useModelsStore.setState({ models: [], loading: false, error: null, cache: null });
  useNotificationStore.setState({
    notifications: [],
    confirmation: { isOpen: false, isLoading: false, options: null },
  });
  useThemeStore.setState({ theme: 'light', resolvedTheme: 'light' });

  seedModelsStore([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('SystemPage version/info render', () => {
  it('renders the management UI version from the build define', () => {
    renderWithRouter(<SystemPage />);

    // __APP_VERSION__ is defined as 'test' in vitest.config.ts.
    expect(screen.getByText('test')).toBeInTheDocument();
  });

  it('shows Unknown for the API version when the server version is null', () => {
    useAuthStore.setState({ serverVersion: null });

    renderWithRouter(<SystemPage />);

    // The label lives in a tileHeader div; the value tile is its next sibling.
    const apiVersionLabel = screen.getByText('CLI Proxy API Version');
    const valueTile = apiVersionLabel.parentElement?.nextElementSibling as HTMLElement;
    expect(valueTile).toHaveTextContent('Unknown');
  });

  it('renders the server version string when present', () => {
    useAuthStore.setState({ serverVersion: 'v7.1.39' });

    renderWithRouter(<SystemPage />);

    expect(screen.getByText('v7.1.39')).toBeInTheDocument();
  });

  it('renders the connected status label when connection status is connected', () => {
    useAuthStore.setState({ connectionStatus: 'connected', apiBase: 'http://localhost:8317' });

    renderWithRouter(<SystemPage />);

    expect(screen.getByText('Connected')).toBeInTheDocument();
  });

  it('renders the api base under the connection status', () => {
    useAuthStore.setState({ connectionStatus: 'connected', apiBase: 'http://localhost:8317' });

    renderWithRouter(<SystemPage />);

    expect(screen.getByText('http://localhost:8317')).toBeInTheDocument();
  });

  it('renders a dash for the api base when it is empty', () => {
    useAuthStore.setState({ connectionStatus: 'disconnected', apiBase: '' });

    renderWithRouter(<SystemPage />);

    expect(screen.getByText('-')).toBeInTheDocument();
  });
});

describe('SystemPage models list', () => {
  it('shows the empty hint when no models are returned', () => {
    useModelsStore.setState({ models: [], loading: false });

    renderWithRouter(<SystemPage />);

    expect(screen.getByText('No models returned by /models')).toBeInTheDocument();
  });

  it('renders a model name inside its classified group', () => {
    useModelsStore.setState({
      models: [{ name: 'gpt-4o' }],
      loading: false,
    });

    renderWithRouter(<SystemPage />);

    expect(screen.getByText('gpt-4o')).toBeInTheDocument();
  });

  it('renders the group label for a recognized model category', () => {
    useModelsStore.setState({
      models: [{ name: 'claude-3-opus' }],
      loading: false,
    });

    renderWithRouter(<SystemPage />);

    expect(screen.getByText('Claude')).toBeInTheDocument();
  });

  it('renders a model alias alongside its name', () => {
    useModelsStore.setState({
      models: [{ name: 'gpt-4o', alias: 'flagship' }],
      loading: false,
    });

    renderWithRouter(<SystemPage />);

    expect(screen.getByText('flagship')).toBeInTheDocument();
  });

  it('shows the loading hint while models are loading', () => {
    useModelsStore.setState({ models: [], loading: true });

    renderWithRouter(<SystemPage />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows the models error box when the store has an error', () => {
    useModelsStore.setState({ models: [], loading: false, error: 'boom' });

    renderWithRouter(<SystemPage />);

    expect(screen.getByText('boom')).toBeInTheDocument();
  });
});

describe('SystemPage version check action', () => {
  it('shows the latest-version success notification when current matches latest', async () => {
    useAuthStore.setState({ serverVersion: 'v1.0.0' });
    mockedCheckLatest.mockResolvedValue({ 'latest-version': '1.0.0' });
    const user = userEvent.setup();

    renderWithRouter(<SystemPage />);
    await user.click(screen.getByRole('button', { name: 'Check for updates' }));

    await waitFor(() => {
      expect(useNotificationStore.getState().notifications[0]?.message).toBe(
        'You are on the latest version'
      );
    });
    expect(useNotificationStore.getState().notifications[0]?.type).toBe('success');
  });

  it('shows an update-available warning when latest is newer than current', async () => {
    useAuthStore.setState({ serverVersion: 'v1.0.0' });
    mockedCheckLatest.mockResolvedValue({ 'latest-version': '2.0.0' });
    const user = userEvent.setup();

    renderWithRouter(<SystemPage />);
    await user.click(screen.getByRole('button', { name: 'Check for updates' }));

    await waitFor(() => {
      expect(useNotificationStore.getState().notifications[0]?.message).toBe(
        'An update is available: 2.0.0'
      );
    });
    expect(useNotificationStore.getState().notifications[0]?.type).toBe('warning');
  });

  it('warns that comparison is impossible when the server version is missing', async () => {
    useAuthStore.setState({ serverVersion: null });
    mockedCheckLatest.mockResolvedValue({ 'latest-version': '2.0.0' });
    const user = userEvent.setup();

    renderWithRouter(<SystemPage />);
    await user.click(screen.getByRole('button', { name: 'Check for updates' }));

    await waitFor(() => {
      expect(useNotificationStore.getState().notifications[0]?.message).toBe(
        'Server version is unavailable; cannot compare'
      );
    });
    expect(useNotificationStore.getState().notifications[0]?.type).toBe('warning');
  });

  it('shows an error notification when the latest version is absent from the response', async () => {
    useAuthStore.setState({ serverVersion: 'v1.0.0' });
    mockedCheckLatest.mockResolvedValue({});
    const user = userEvent.setup();

    renderWithRouter(<SystemPage />);
    await user.click(screen.getByRole('button', { name: 'Check for updates' }));

    await waitFor(() => {
      expect(useNotificationStore.getState().notifications[0]?.message).toBe('Update check failed');
    });
    expect(useNotificationStore.getState().notifications[0]?.type).toBe('error');
  });

  it('appends the rejection message to the error notification on failure', async () => {
    useAuthStore.setState({ serverVersion: 'v1.0.0' });
    mockedCheckLatest.mockRejectedValue(new Error('network down'));
    const user = userEvent.setup();

    renderWithRouter(<SystemPage />);
    await user.click(screen.getByRole('button', { name: 'Check for updates' }));

    await waitFor(() => {
      expect(useNotificationStore.getState().notifications[0]?.message).toBe(
        'Update check failed: network down'
      );
    });
    expect(useNotificationStore.getState().notifications[0]?.type).toBe('error');
  });
});

describe('SystemPage clear-login action', () => {
  it('opens a danger confirmation dialog when clear login is clicked', async () => {
    const user = userEvent.setup();

    renderWithRouter(<SystemPage />);
    await user.click(screen.getByRole('button', { name: 'Clear login data' }));

    const confirmation = useNotificationStore.getState().confirmation;
    expect(confirmation.isOpen).toBe(true);
    expect(confirmation.options?.variant).toBe('danger');
  });

  it('clears auth storage keys and logs out when the confirmation is accepted', async () => {
    localStorage.setItem('isLoggedIn', 'true');
    localStorage.setItem('apiBase', 'http://x');
    useAuthStore.setState({ isAuthenticated: true, connectionStatus: 'connected' });
    const user = userEvent.setup();

    renderWithRouter(<SystemPage />);
    await user.click(screen.getByRole('button', { name: 'Clear login data' }));
    await useNotificationStore.getState().confirmation.options?.onConfirm();

    expect(localStorage.getItem('isLoggedIn')).toBeNull();
    expect(localStorage.getItem('apiBase')).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('shows a success notification after clearing login storage', async () => {
    const user = userEvent.setup();

    renderWithRouter(<SystemPage />);
    await user.click(screen.getByRole('button', { name: 'Clear login data' }));
    await useNotificationStore.getState().confirmation.options?.onConfirm();

    expect(useNotificationStore.getState().notifications[0]?.message).toBe(
      'Local login data cleared'
    );
  });
});

describe('SystemPage request-log hidden modal', () => {
  it('opens the request-log modal after seven taps on the version tile', async () => {
    useAuthStore.setState({ connectionStatus: 'connected', apiBase: 'http://localhost:8317' });
    useConfigStore.setState({ config: { requestLog: false, raw: {} }, cache: new Map() });
    const user = userEvent.setup();

    renderWithRouter(<SystemPage />);
    const tapTile = screen.getByText('Management UI Version').closest('button') as HTMLElement;
    for (let i = 0; i < 7; i += 1) {
      await user.click(tapTile);
    }

    expect(screen.getByText('Request Logging')).toBeInTheDocument();
  });

  it('does not open the request-log modal after only six taps', async () => {
    useAuthStore.setState({ connectionStatus: 'connected', apiBase: 'http://localhost:8317' });
    useConfigStore.setState({ config: { requestLog: false, raw: {} }, cache: new Map() });
    const user = userEvent.setup();

    renderWithRouter(<SystemPage />);
    const tapTile = screen.getByText('Management UI Version').closest('button') as HTMLElement;
    for (let i = 0; i < 6; i += 1) {
      await user.click(tapTile);
    }

    expect(screen.queryByText('Request Logging')).not.toBeInTheDocument();
  });
});

describe('SystemPage request-log save flow', () => {
  async function openRequestLogModal(user: ReturnType<typeof userEvent.setup>) {
    const tapTile = screen.getByText('Management UI Version').closest('button') as HTMLElement;
    for (let i = 0; i < 7; i += 1) {
      await user.click(tapTile);
    }
  }

  it('persists the new value via the api and notifies on success', async () => {
    useAuthStore.setState({ connectionStatus: 'connected', apiBase: 'http://localhost:8317' });
    useConfigStore.setState({ config: { requestLog: false, raw: {} }, cache: new Map() });
    const user = userEvent.setup();

    renderWithRouter(<SystemPage />);
    await openRequestLogModal(user);
    await user.click(screen.getByRole('checkbox', { name: 'Enable request logging' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockedUpdateRequestLog).toHaveBeenCalledWith(true);
    });
    await waitFor(() => {
      expect(useNotificationStore.getState().notifications[0]?.message).toBe(
        'Request logging setting updated'
      );
    });
  });

  it('rolls back the optimistic value and notifies when the save fails', async () => {
    useAuthStore.setState({ connectionStatus: 'connected', apiBase: 'http://localhost:8317' });
    useConfigStore.setState({ config: { requestLog: false, raw: {} }, cache: new Map() });
    mockedUpdateRequestLog.mockRejectedValue(new Error('save failed'));
    const user = userEvent.setup();

    renderWithRouter(<SystemPage />);
    await openRequestLogModal(user);
    await user.click(screen.getByRole('checkbox', { name: 'Enable request logging' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(useNotificationStore.getState().notifications[0]?.message).toBe(
        'Update failed: save failed'
      );
    });
    expect(useConfigStore.getState().config?.requestLog).toBe(false);
  });
});
