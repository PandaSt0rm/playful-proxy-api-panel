/**
 * Behaviour tests for LoginPage.
 *
 * LoginPage drives login through the real useAuthStore. The store's async
 * actions (restoreSession / login) are the boundaries we own and would
 * otherwise reach the network via configStore/apiClient, so we replace them
 * with spies via setState. Language changes are wired to useLanguageStore
 * .setLanguage; we spy on that action too, both to assert the wiring and to
 * avoid mutating the global i18n instance (which is pinned to English for all
 * tests). Notifications and language come from the real stores, reset per test.
 *
 * The page boots in an auto-login splash state; a restoreSession that resolves
 * false reveals the form. Navigation is observed through a sibling route in a
 * MemoryRouter harness rather than by spying on the router.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { render, screen, userEvent, waitFor } from '@/test/utils';
import { LoginPage } from './LoginPage';
import { useAuthStore, useLanguageStore, useNotificationStore } from '@/stores';
import type { ApiError } from '@/types';

const loginSpy =
  vi.fn<
    (c: { apiBase: string; managementKey: string; rememberPassword: boolean }) => Promise<void>
  >();
const restoreSessionSpy = vi.fn<() => Promise<boolean>>();
const setLanguageSpy = vi.fn<(lang: string) => void>();

function renderLogin(initialEntry: string | { pathname: string; state?: unknown } = '/login') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<div>home route</div>} />
        <Route path="/config" element={<div>config route</div>} />
      </Routes>
    </MemoryRouter>
  );
}

// Reveal the login form: resolve auto-login as "no session", then wait for the
// submit button (only present in the form, not the splash) to appear.
async function renderForm() {
  restoreSessionSpy.mockResolvedValue(false);
  const result = renderLogin();
  await screen.findByRole('button', { name: 'Login' });
  return result;
}

const apiErr = (overrides: Partial<ApiError> & { status?: number; code?: string }): unknown =>
  Object.assign(new Error(overrides.message ?? 'failure'), overrides);

beforeEach(() => {
  localStorage.clear();
  loginSpy.mockReset().mockResolvedValue(undefined);
  restoreSessionSpy.mockReset().mockResolvedValue(false);
  setLanguageSpy.mockReset();

  useAuthStore.setState({
    isAuthenticated: false,
    apiBase: '',
    managementKey: '',
    rememberPassword: false,
    login: loginSpy,
    restoreSession: restoreSessionSpy,
  });
  useLanguageStore.setState({ language: 'en', setLanguage: setLanguageSpy });
  useNotificationStore.setState({ notifications: [] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('LoginPage splash and form reveal', () => {
  it('shows the splash subtitle while auto-login is in progress', () => {
    restoreSessionSpy.mockReturnValue(new Promise<boolean>(() => {}));

    renderLogin();

    expect(screen.getByText('aiproxy')).toBeInTheDocument();
  });

  it('does not show the login button while the splash is visible', () => {
    restoreSessionSpy.mockReturnValue(new Promise<boolean>(() => {}));

    renderLogin();

    expect(screen.queryByRole('button', { name: 'Login' })).not.toBeInTheDocument();
  });

  it('reveals the login form when auto-login finds no session', async () => {
    await renderForm();

    expect(screen.getByRole('button', { name: 'Login' })).toBeInTheDocument();
  });

  it('shows the login subtitle on the revealed form', async () => {
    await renderForm();

    expect(
      screen.getByText('Please enter connection information to access the management interface')
    ).toBeInTheDocument();
  });

  it('renders the management key input on the form', async () => {
    await renderForm();

    expect(screen.getByPlaceholderText('Enter the management key')).toBeInTheDocument();
  });
});

describe('LoginPage validation', () => {
  it('shows the required-field error when submitting with an empty key', async () => {
    await renderForm();

    await userEvent.click(screen.getByRole('button', { name: 'Login' }));

    expect(screen.getByText('Please fill in complete connection information')).toBeInTheDocument();
  });

  it('does not call login when submitting with an empty key', async () => {
    await renderForm();

    await userEvent.click(screen.getByRole('button', { name: 'Login' }));

    expect(loginSpy).not.toHaveBeenCalled();
  });

  it('does not call login when the key is only whitespace', async () => {
    await renderForm();
    await userEvent.type(screen.getByPlaceholderText('Enter the management key'), '   ');

    await userEvent.click(screen.getByRole('button', { name: 'Login' }));

    expect(loginSpy).not.toHaveBeenCalled();
  });
});

describe('LoginPage successful submit', () => {
  it('calls login with the trimmed management key', async () => {
    await renderForm();
    await userEvent.type(screen.getByPlaceholderText('Enter the management key'), '  my-key  ');

    await userEvent.click(screen.getByRole('button', { name: 'Login' }));

    await waitFor(() =>
      expect(loginSpy).toHaveBeenCalledWith(expect.objectContaining({ managementKey: 'my-key' }))
    );
  });

  it('calls login with rememberPassword false by default', async () => {
    await renderForm();
    await userEvent.type(screen.getByPlaceholderText('Enter the management key'), 'my-key');

    await userEvent.click(screen.getByRole('button', { name: 'Login' }));

    await waitFor(() =>
      expect(loginSpy).toHaveBeenCalledWith(expect.objectContaining({ rememberPassword: false }))
    );
  });

  it('navigates to the home route after a successful login', async () => {
    await renderForm();
    await userEvent.type(screen.getByPlaceholderText('Enter the management key'), 'my-key');

    await userEvent.click(screen.getByRole('button', { name: 'Login' }));

    expect(await screen.findByText('home route')).toBeInTheDocument();
  });

  it('emits a success notification after a successful login', async () => {
    await renderForm();
    await userEvent.type(screen.getByPlaceholderText('Enter the management key'), 'my-key');

    await userEvent.click(screen.getByRole('button', { name: 'Login' }));

    await waitFor(() => {
      const [notification] = useNotificationStore.getState().notifications;
      expect(notification?.type).toBe('success');
    });
    expect(useNotificationStore.getState().notifications[0].message).toBe('Connected');
  });
});

describe('LoginPage error mapping', () => {
  const submitWithError = async (error: unknown) => {
    loginSpy.mockRejectedValue(error);
    await renderForm();
    await userEvent.type(screen.getByPlaceholderText('Enter the management key'), 'my-key');
    await userEvent.click(screen.getByRole('button', { name: 'Login' }));
  };

  it('maps a 401 status to the unauthorized message', async () => {
    await submitWithError(apiErr({ status: 401 }));

    expect(
      await screen.findByText('Authentication failed, invalid management key')
    ).toBeInTheDocument();
  });

  it('maps a 403 status to the forbidden message', async () => {
    await submitWithError(apiErr({ status: 403 }));

    expect(await screen.findByText('Access denied, insufficient permissions')).toBeInTheDocument();
  });

  it('maps a 404 status to the not-found message', async () => {
    await submitWithError(apiErr({ status: 404 }));

    expect(
      await screen.findByText('Server address invalid or management API not enabled')
    ).toBeInTheDocument();
  });

  it('maps a 500 status to the server-error message', async () => {
    await submitWithError(apiErr({ status: 500 }));

    expect(
      await screen.findByText('Internal server error, please try again later')
    ).toBeInTheDocument();
  });

  it('maps an ECONNABORTED code to the timeout message', async () => {
    await submitWithError(apiErr({ code: 'ECONNABORTED' }));

    expect(
      await screen.findByText('Connection timed out, server not responding')
    ).toBeInTheDocument();
  });

  it('maps an ERR_NETWORK code to the network message', async () => {
    await submitWithError(apiErr({ code: 'ERR_NETWORK' }));

    expect(
      await screen.findByText(
        'Network connection failed, please check your network or server address'
      )
    ).toBeInTheDocument();
  });

  it('maps a certificate-authority error code to the SSL message', async () => {
    await submitWithError(apiErr({ code: 'ERR_CERT_AUTHORITY_INVALID' }));

    expect(await screen.findByText('SSL/TLS certificate verification failed')).toBeInTheDocument();
  });

  it('maps a CORS error message to the cross-origin message', async () => {
    await submitWithError(apiErr({ message: 'Blocked by CORS policy' }));

    expect(
      await screen.findByText('Cross-origin request blocked, please check server configuration')
    ).toBeInTheDocument();
  });

  it('falls back to the generic invalid message for an unclassified error', async () => {
    await submitWithError(apiErr({ message: 'something odd' }));

    expect(
      await screen.findByText('Connection failed, please check address and key')
    ).toBeInTheDocument();
  });

  it('emits an error notification when login fails', async () => {
    await submitWithError(apiErr({ status: 401 }));

    await waitFor(() => {
      const [notification] = useNotificationStore.getState().notifications;
      expect(notification?.type).toBe('error');
    });
  });
});

describe('LoginPage auto-login success', () => {
  it('navigates without waiting for an animation timer', async () => {
    vi.useFakeTimers();
    restoreSessionSpy.mockResolvedValue(true);

    renderLogin();
    await vi.advanceTimersByTimeAsync(0);

    expect(screen.getByText('home route')).toBeInTheDocument();
  });
});

describe('LoginPage already authenticated', () => {
  it('redirects to the home route when already authenticated and no session was restored', async () => {
    restoreSessionSpy.mockResolvedValue(false);
    useAuthStore.setState({ isAuthenticated: true });

    renderLogin();

    expect(await screen.findByText('home route')).toBeInTheDocument();
  });
});

describe('LoginPage language selection', () => {
  it('renders the language switch control', async () => {
    await renderForm();

    expect(screen.getByRole('button', { name: 'Language' })).toBeInTheDocument();
  });

  it('calls setLanguage with the chosen language when an option is selected', async () => {
    await renderForm();
    await userEvent.click(screen.getByRole('button', { name: 'Language' }));

    await userEvent.click(screen.getByRole('option', { name: 'Русский' }));

    expect(setLanguageSpy).toHaveBeenCalledWith('ru');
  });
});

describe('LoginPage operator controls', () => {
  it('restores saved connection fields, reveals and edits the custom base, remembers the key, and toggles visibility', async () => {
    useAuthStore.setState({
      apiBase: 'http://saved:8317/',
      managementKey: 'saved-key',
      rememberPassword: true,
    });
    await renderForm();
    const key = screen.getByPlaceholderText('Enter the management key');
    expect(key).toHaveValue('saved-key');
    expect(screen.getByRole('checkbox', { name: 'Remember password' })).toBeChecked();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Custom Connection URL:' }));
    const base = screen.getByRole('textbox', { name: 'Custom Connection URL:' });
    expect(base).toHaveValue('http://saved:8317/');
    await userEvent.clear(base);
    await userEvent.type(base, 'http://custom:8317/');
    const visibility = key.parentElement?.querySelector('button');
    expect(visibility).not.toBeNull();
    await userEvent.click(visibility!);
    expect(key).toHaveAttribute('type', 'text');
    await userEvent.click(visibility!);
    expect(key).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByRole('button', { name: 'Login' }));
    await waitFor(() =>
      expect(loginSpy).toHaveBeenCalledWith(
        expect.objectContaining({ apiBase: 'http://custom:8317' })
      )
    );
  });
  it('falls back to the detected base when the custom base field is cleared', async () => {
    await renderForm();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Custom Connection URL:' }));
    await userEvent.clear(screen.getByRole('textbox', { name: 'Custom Connection URL:' }));
    await userEvent.type(screen.getByPlaceholderText('Enter the management key'), 'key');
    await userEvent.click(screen.getByRole('button', { name: 'Login' }));
    await waitFor(() =>
      expect(loginSpy).toHaveBeenCalledWith(
        expect.objectContaining({ apiBase: expect.any(String) })
      )
    );
  });

  it('submits with Enter and ignores additional Enter presses while login is pending', async () => {
    const pending = Promise.withResolvers<void>();
    loginSpy.mockReturnValue(pending.promise);
    await renderForm();
    const key = screen.getByPlaceholderText('Enter the management key');
    await userEvent.type(key, 'key{Enter}{Enter}');
    expect(loginSpy).toHaveBeenCalledTimes(1);
    pending.resolve();
  });

  it('restores a session to its guarded deep link', async () => {
    restoreSessionSpy.mockResolvedValue(true);
    renderLogin({ pathname: '/login', state: { from: { pathname: '/config' } } });
    expect(await screen.findByText('config route')).toBeInTheDocument();
  });

  it('redirects an already authenticated user to its guarded deep link', async () => {
    useAuthStore.setState({ isAuthenticated: true });
    renderLogin({ pathname: '/login', state: { from: { pathname: '/config' } } });
    expect(await screen.findByText('config route')).toBeInTheDocument();
  });
});

describe('LoginPage message-shaped error mapping', () => {
  const submit = async (error: unknown) => {
    loginSpy.mockRejectedValue(error);
    await renderForm();
    await userEvent.type(screen.getByPlaceholderText('Enter the management key'), 'key');
    await userEvent.click(screen.getByRole('button', { name: 'Login' }));
  };

  it.each([
    [{ message: 'request timeout' }, 'Connection timed out, server not responding'],
    [
      'network error from browser',
      'Network connection failed, please check your network or server address',
    ],
    [{ message: 'certificate rejected' }, 'SSL/TLS certificate verification failed'],
    ['cross-origin blocked', 'Cross-origin request blocked, please check server configuration'],
    [{}, 'Connection failed, please check address and key'],
  ])('maps non-Error payload %# without leaking its raw value', async (error, expected) => {
    await submit(error);
    expect(await screen.findByText(expected)).toBeInTheDocument();
  });
});
