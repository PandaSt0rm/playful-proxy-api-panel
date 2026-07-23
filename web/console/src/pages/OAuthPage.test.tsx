import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, renderWithRouter, screen, waitFor, userEvent } from '@/test/utils';
import { useNotificationStore } from '@/stores';
import type { OAuthProvider } from '@/services/api/oauth';
import type { VertexImportResponse } from '@/services/api/vertex';

// --- Boundary mocks -------------------------------------------------------

const navigateSpy = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateSpy };
});

const startAuth = vi.fn();
const getAuthStatus = vi.fn();
const submitCallback = vi.fn();

vi.mock('@/services/api/oauth', () => ({
  oauthApi: {
    startAuth: (provider: OAuthProvider) => startAuth(provider),
    getAuthStatus: (state: string) => getAuthStatus(state),
    submitCallback: (provider: OAuthProvider, redirectUrl: string, state?: string) =>
      submitCallback(provider, redirectUrl, state),
  },
}));

const importCredential = vi.fn();

vi.mock('@/services/api/vertex', () => ({
  vertexApi: {
    importCredential: (file: File, location?: string) => importCredential(file, location),
  },
}));

const copyToClipboard = vi.fn();
vi.mock('@/utils/clipboard', () => ({
  copyToClipboard: (text: string) => copyToClipboard(text),
}));

import { OAuthPage } from './OAuthPage';

const resetNotifications = () => {
  useNotificationStore.setState({
    notifications: [],
    confirmation: { isOpen: false, isLoading: false, options: null },
  });
};

const renderPage = () => renderWithRouter(<OAuthPage />);

// The Codex card is the first provider; use it as the canonical single-provider
// case so we are not coupled to other providers' positions.
const getCodexLoginButton = () => screen.getByRole('button', { name: 'Start Codex Login' });
const clickCodexLoginButton = () => fireEvent.click(getCodexLoginButton());

beforeEach(() => {
  startAuth.mockReset();
  getAuthStatus.mockReset();
  submitCallback.mockReset();
  importCredential.mockReset();
  copyToClipboard.mockReset();
  navigateSpy.mockReset();
  resetNotifications();
  copyToClipboard.mockResolvedValue(true);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('OAuthPage initial render', () => {
  it('renders the page title from the nav translation', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: 'OAuth Login' })).toBeInTheDocument();
  });

  it('renders a login button for every configured OAuth provider plus the Vertex card', () => {
    renderPage();

    expect(screen.getByRole('button', { name: 'Start Codex Login' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import Vertex Credential' })).toBeInTheDocument();
  });

  it('does not render the removed Gemini CLI OAuth login', () => {
    renderPage();

    expect(
      screen.queryByRole('button', { name: 'Start Gemini CLI Login' })
    ).not.toBeInTheDocument();
  });

  it('does not show any authorization URL box before a login attempt', () => {
    renderPage();

    expect(screen.queryByText('Authorization URL:')).not.toBeInTheDocument();
  });
});

describe('OAuthPage startAuth happy path', () => {
  it('calls startAuth with the provider id when the login button is clicked', async () => {
    startAuth.mockResolvedValue({ url: 'https://auth.example/codex', state: 'st-1' });
    getAuthStatus.mockResolvedValue({ status: 'wait' });
    renderPage();

    clickCodexLoginButton();

    await waitFor(() => expect(startAuth).toHaveBeenCalledWith('codex'));
  });

  it('renders the returned authorization URL after a successful start', async () => {
    startAuth.mockResolvedValue({ url: 'https://auth.example/codex', state: 'st-1' });
    getAuthStatus.mockResolvedValue({ status: 'wait' });
    renderPage();

    clickCodexLoginButton();

    expect(await screen.findByText('https://auth.example/codex')).toBeInTheDocument();
  });

  it('shows the waiting status badge after a successful start', async () => {
    startAuth.mockResolvedValue({ url: 'https://auth.example/codex', state: 'st-1' });
    getAuthStatus.mockResolvedValue({ status: 'wait' });
    renderPage();

    clickCodexLoginButton();

    expect(await screen.findByText('Waiting for authentication...')).toBeInTheDocument();
  });
});

describe('OAuthPage startAuth error paths', () => {
  it('shows an error badge and notification when startAuth rejects', async () => {
    startAuth.mockRejectedValue(new Error('network down'));
    renderPage();

    clickCodexLoginButton();

    expect(await screen.findByText('Authentication failed: network down')).toBeInTheDocument();
    await waitFor(() =>
      expect(useNotificationStore.getState().notifications).toEqual([
        expect.objectContaining({ type: 'error' }),
      ])
    );
  });

  it('reports a missing-state error when startAuth resolves without a state', async () => {
    startAuth.mockResolvedValue({ url: 'https://auth.example/codex' });
    renderPage();

    clickCodexLoginButton();

    expect(
      await screen.findByText(
        'Authentication failed: Unable to retrieve authentication state parameter'
      )
    ).toBeInTheDocument();
  });

  it('does not start polling when startAuth resolves without a state', async () => {
    startAuth.mockResolvedValue({ url: 'https://auth.example/codex' });
    renderPage();

    clickCodexLoginButton();

    await waitFor(() =>
      expect(
        screen.getByText('Authentication failed: Unable to retrieve authentication state parameter')
      ).toBeInTheDocument()
    );
    expect(getAuthStatus).not.toHaveBeenCalled();
  });
});

describe('OAuthPage polling outcomes', () => {
  it('shows the success status and a success notification when polling returns ok', async () => {
    vi.useFakeTimers();
    startAuth.mockResolvedValue({ url: 'https://auth.example/codex', state: 'st-1' });
    getAuthStatus.mockResolvedValue({ status: 'ok' });
    renderPage();

    screen.getByRole('button', { name: 'Start Codex Login' }).click();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(3000);

    expect(getAuthStatus).toHaveBeenCalledWith('st-1');
    expect(screen.getByText('Authentication successful!')).toBeInTheDocument();
  });

  it('shows the error status with the server message when polling returns error', async () => {
    vi.useFakeTimers();
    startAuth.mockResolvedValue({ url: 'https://auth.example/codex', state: 'st-1' });
    getAuthStatus.mockResolvedValue({ status: 'error', error: 'denied by user' });
    renderPage();

    screen.getByRole('button', { name: 'Start Codex Login' }).click();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(3000);

    expect(screen.getByText('Authentication failed: denied by user')).toBeInTheDocument();
  });

  it('offers the view-auth-files navigation after a successful authentication', async () => {
    vi.useFakeTimers();
    startAuth.mockResolvedValue({ url: 'https://auth.example/codex', state: 'st-1' });
    getAuthStatus.mockResolvedValue({ status: 'ok' });
    renderPage();

    screen.getByRole('button', { name: 'Start Codex Login' }).click();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(3000);

    expect(screen.getByRole('button', { name: 'View auth files' })).toBeInTheDocument();
  });
});

describe('OAuthPage copy link', () => {
  it('notifies success when the authorization URL is copied', async () => {
    const user = userEvent.setup();
    startAuth.mockResolvedValue({ url: 'https://auth.example/codex', state: 'st-1' });
    getAuthStatus.mockResolvedValue({ status: 'wait' });
    copyToClipboard.mockResolvedValue(true);
    renderPage();

    clickCodexLoginButton();
    await user.click(await screen.findByRole('button', { name: 'Copy Link' }));

    await waitFor(() =>
      expect(useNotificationStore.getState().notifications).toEqual([
        expect.objectContaining({ message: 'Link copied to clipboard', type: 'success' }),
      ])
    );
  });

  it('notifies failure when copying the authorization URL fails', async () => {
    const user = userEvent.setup();
    startAuth.mockResolvedValue({ url: 'https://auth.example/codex', state: 'st-1' });
    getAuthStatus.mockResolvedValue({ status: 'wait' });
    copyToClipboard.mockResolvedValue(false);
    renderPage();

    clickCodexLoginButton();
    await user.click(await screen.findByRole('button', { name: 'Copy Link' }));

    await waitFor(() =>
      expect(useNotificationStore.getState().notifications).toEqual([
        expect.objectContaining({ message: 'Copy failed', type: 'error' }),
      ])
    );
  });
});

describe('OAuthPage callback submission', () => {
  const startCodexWaiting = async () => {
    startAuth.mockResolvedValue({ url: 'https://auth.example/codex', state: 'st-1' });
    getAuthStatus.mockResolvedValue({ status: 'wait' });
    clickCodexLoginButton();
    await screen.findByText('https://auth.example/codex');
  };

  it('warns and skips the request when the callback url is empty', async () => {
    const user = userEvent.setup();
    renderPage();

    await startCodexWaiting();
    await user.click(screen.getByRole('button', { name: 'Submit Callback' }));

    expect(submitCallback).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(useNotificationStore.getState().notifications).toEqual([
        expect.objectContaining({ type: 'warning' }),
      ])
    );
  });

  it('submits the trimmed callback url with the captured state', async () => {
    const user = userEvent.setup();
    submitCallback.mockResolvedValue({ status: 'ok' });
    renderPage();

    await startCodexWaiting();
    await user.type(screen.getByPlaceholderText(/paste/i), 'https://callback.example/?code=abc');
    await user.click(screen.getByRole('button', { name: 'Submit Callback' }));

    await waitFor(() =>
      expect(submitCallback).toHaveBeenCalledWith(
        'codex',
        'https://callback.example/?code=abc',
        'st-1'
      )
    );
  });

  it('shows the callback success badge after a successful submission', async () => {
    const user = userEvent.setup();
    submitCallback.mockResolvedValue({ status: 'ok' });
    renderPage();

    await startCodexWaiting();
    await user.type(screen.getByPlaceholderText(/paste/i), 'code-123');
    await user.click(screen.getByRole('button', { name: 'Submit Callback' }));

    expect(
      await screen.findByText('Callback submitted, waiting for authentication...')
    ).toBeInTheDocument();
  });

  it('shows the upgrade hint when the callback request returns a 404', async () => {
    const user = userEvent.setup();
    submitCallback.mockRejectedValue({ status: 404 });
    renderPage();

    await startCodexWaiting();
    await user.type(screen.getByPlaceholderText(/paste/i), 'code-123');
    await user.click(screen.getByRole('button', { name: 'Submit Callback' }));

    expect(
      await screen.findByText(
        'Callback submission failed: Please update CLI Proxy API or check the connection.'
      )
    ).toBeInTheDocument();
  });
});

describe('OAuthPage Vertex import', () => {
  const pickVertexFile = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
    const file = new File(['{}'], name, { type: 'application/json' });
    const input = document.querySelector(
      'input[type="file"][accept=".json,application/json"]'
    ) as HTMLInputElement;
    await user.upload(input, file);
    return file;
  };

  it('warns and does not import when no file has been selected', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Import Vertex Credential' }));

    expect(importCredential).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(useNotificationStore.getState().notifications).toEqual([
        expect.objectContaining({ type: 'warning' }),
      ])
    );
  });

  it('rejects a chosen file that is not a .json file', async () => {
    const user = userEvent.setup();
    renderPage();

    await pickVertexFile(user, 'creds.txt');

    expect(screen.getByText('No file selected')).toBeInTheDocument();
    await waitFor(() =>
      expect(useNotificationStore.getState().notifications).toEqual([
        expect.objectContaining({ type: 'warning' }),
      ])
    );
  });

  it('shows the selected json file name after choosing a valid file', async () => {
    const user = userEvent.setup();
    renderPage();

    await pickVertexFile(user, 'service-account.json');

    expect(screen.getByText('service-account.json')).toBeInTheDocument();
  });

  it('imports the selected credential with the trimmed location', async () => {
    const user = userEvent.setup();
    const response: VertexImportResponse = { status: 'ok', project_id: 'proj-1' };
    importCredential.mockResolvedValue(response);
    renderPage();

    await user.type(screen.getByPlaceholderText('us-central1'), '  us-east1  ');
    const file = await pickVertexFile(user, 'service-account.json');
    await user.click(screen.getByRole('button', { name: 'Import Vertex Credential' }));

    await waitFor(() => expect(importCredential).toHaveBeenCalledWith(file, 'us-east1'));
  });

  it('renders the imported credential details on success', async () => {
    const user = userEvent.setup();
    importCredential.mockResolvedValue({
      status: 'ok',
      project_id: 'proj-42',
      email: 'svc@example.com',
      location: 'us-central1',
      'auth-file': 'vertex-proj-42.json',
    });
    renderPage();

    await pickVertexFile(user, 'service-account.json');
    await user.click(screen.getByRole('button', { name: 'Import Vertex Credential' }));

    expect(await screen.findByText('proj-42')).toBeInTheDocument();
    expect(screen.getByText('svc@example.com')).toBeInTheDocument();
    expect(screen.getByText('vertex-proj-42.json')).toBeInTheDocument();
  });

  it('shows the failure message when the import request rejects', async () => {
    const user = userEvent.setup();
    importCredential.mockRejectedValue(new Error('invalid key'));
    renderPage();

    await pickVertexFile(user, 'service-account.json');
    await user.click(screen.getByRole('button', { name: 'Import Vertex Credential' }));

    expect(await screen.findByText('invalid key')).toBeInTheDocument();
    await waitFor(() =>
      expect(useNotificationStore.getState().notifications).toEqual([
        expect.objectContaining({ type: 'error' }),
      ])
    );
  });
});
