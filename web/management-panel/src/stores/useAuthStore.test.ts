import { describe, it, expect, vi, beforeEach } from 'vitest';

import { useAuthStore } from './useAuthStore';
import { useConfigStore } from './useConfigStore';
import { useModelsStore } from './useModelsStore';
import { apiClient } from '@/services/api/client';
import { configApi } from '@/services/api/config';
import type { Config } from '@/types';

// Boundaries we own: the typed config API (reached via useConfigStore.fetchConfig)
// and the apiClient wrapper that auth configures.
vi.mock('@/services/api/config', () => ({
  configApi: {
    getConfig: vi.fn(),
  },
}));

vi.mock('@/services/api/client', () => ({
  apiClient: {
    setConfig: vi.fn(),
  },
}));

const mockedGetConfig = vi.mocked(configApi.getConfig);
const mockedSetConfig = vi.mocked(apiClient.setConfig);

const okConfig = (): Config => ({ debug: false, raw: {} });

beforeEach(() => {
  localStorage.clear();
  mockedGetConfig.mockReset();
  mockedSetConfig.mockReset();
  mockedGetConfig.mockResolvedValue(okConfig());
  // logout() resets the module-level restoreSession promise and clears auth state;
  // also wipe the config store cache + module token between tests.
  useConfigStore.setState({ config: null, cache: new Map(), loading: false, error: null });
  useConfigStore.getState().clearCache();
  useModelsStore.setState({ models: [], cache: null, loading: false, error: null });
  useAuthStore.getState().logout();
  // logout writes isLoggedIn removal + clears state; clear storage again so the
  // persistence assertions start from a clean slate.
  localStorage.clear();
});

describe('useAuthStore.login — success path', () => {
  it('marks the store authenticated after a successful config fetch', async () => {
    await useAuthStore.getState().login({ apiBase: 'localhost:8317', managementKey: 'secret' });

    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it('sets connectionStatus to connected on success', async () => {
    await useAuthStore.getState().login({ apiBase: 'localhost:8317', managementKey: 'secret' });

    expect(useAuthStore.getState().connectionStatus).toBe('connected');
  });

  it('clears any prior connectionError on success', async () => {
    useAuthStore.setState({ connectionError: 'stale error' });

    await useAuthStore.getState().login({ apiBase: 'localhost:8317', managementKey: 'secret' });

    expect(useAuthStore.getState().connectionError).toBeNull();
  });

  it('normalizes the apiBase before storing it', async () => {
    await useAuthStore.getState().login({ apiBase: 'localhost:8317/v0/management', managementKey: 'secret' });

    expect(useAuthStore.getState().apiBase).toBe('http://localhost:8317');
  });

  it('trims surrounding whitespace from the management key', async () => {
    await useAuthStore.getState().login({ apiBase: 'localhost:8317', managementKey: '  padded  ' });

    expect(useAuthStore.getState().managementKey).toBe('padded');
  });

  it('configures the apiClient with the normalized base and trimmed key', async () => {
    await useAuthStore.getState().login({ apiBase: 'localhost:8317/', managementKey: '  k  ' });

    expect(mockedSetConfig).toHaveBeenCalledWith({ apiBase: 'http://localhost:8317', managementKey: 'k' });
  });

  it('forces a fresh config fetch to validate the connection', async () => {
    const spy = vi.spyOn(useConfigStore.getState(), 'fetchConfig');

    await useAuthStore.getState().login({ apiBase: 'localhost:8317', managementKey: 'secret' });

    expect(spy).toHaveBeenCalledWith(undefined, true);
  });

  it('persists isLoggedIn when rememberPassword is true', async () => {
    await useAuthStore.getState().login({ apiBase: 'localhost:8317', managementKey: 'secret', rememberPassword: true });

    expect(localStorage.getItem('isLoggedIn')).toBe('true');
  });

  it('does not persist isLoggedIn when rememberPassword is false', async () => {
    await useAuthStore.getState().login({ apiBase: 'localhost:8317', managementKey: 'secret', rememberPassword: false });

    expect(localStorage.getItem('isLoggedIn')).toBeNull();
  });

  it('removes a previously persisted isLoggedIn flag when logging in without remember', async () => {
    localStorage.setItem('isLoggedIn', 'true');

    await useAuthStore.getState().login({ apiBase: 'localhost:8317', managementKey: 'secret', rememberPassword: false });

    expect(localStorage.getItem('isLoggedIn')).toBeNull();
  });

  it('falls back to the stored rememberPassword preference when the flag is omitted', async () => {
    useAuthStore.setState({ rememberPassword: true });

    await useAuthStore.getState().login({ apiBase: 'localhost:8317', managementKey: 'secret' });

    expect(localStorage.getItem('isLoggedIn')).toBe('true');
  });

  it('clears the models cache on login', async () => {
    useModelsStore.setState({ cache: { data: [], timestamp: Date.now(), apiBase: 'x', apiKey: 'y' }, models: [{ id: 'm' }] as never });

    await useAuthStore.getState().login({ apiBase: 'localhost:8317', managementKey: 'secret' });

    expect(useModelsStore.getState().cache).toBeNull();
  });
});

describe('useAuthStore.login — failure path', () => {
  it('rejects with the original error from the config fetch', async () => {
    const failure = new Error('unauthorized');
    mockedGetConfig.mockRejectedValue(failure);

    await expect(
      useAuthStore.getState().login({ apiBase: 'localhost:8317', managementKey: 'bad' })
    ).rejects.toBe(failure);
  });

  it('leaves the store unauthenticated after a failed login', async () => {
    mockedGetConfig.mockRejectedValue(new Error('unauthorized'));

    await expect(
      useAuthStore.getState().login({ apiBase: 'localhost:8317', managementKey: 'bad' })
    ).rejects.toThrow();

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('sets connectionStatus to error after a failed login', async () => {
    mockedGetConfig.mockRejectedValue(new Error('unauthorized'));

    await expect(
      useAuthStore.getState().login({ apiBase: 'localhost:8317', managementKey: 'bad' })
    ).rejects.toThrow();

    expect(useAuthStore.getState().connectionStatus).toBe('error');
  });

  it('records the Error message as the connectionError', async () => {
    mockedGetConfig.mockRejectedValue(new Error('Connection refused'));

    await expect(
      useAuthStore.getState().login({ apiBase: 'localhost:8317', managementKey: 'bad' })
    ).rejects.toThrow();

    expect(useAuthStore.getState().connectionError).toBe('Connection refused');
  });

  it('records a string rejection as the connectionError', async () => {
    mockedGetConfig.mockRejectedValue('plain string failure');

    await expect(
      useAuthStore.getState().login({ apiBase: 'localhost:8317', managementKey: 'bad' })
    ).rejects.toBe('plain string failure');

    expect(useAuthStore.getState().connectionError).toBe('plain string failure');
  });

  it('falls back to a default connectionError for a non-Error, non-string rejection', async () => {
    mockedGetConfig.mockRejectedValue({ weird: true });

    await expect(
      useAuthStore.getState().login({ apiBase: 'localhost:8317', managementKey: 'bad' })
    ).rejects.toEqual({ weird: true });

    expect(useAuthStore.getState().connectionError).toBe('Connection failed');
  });

  it('does not persist isLoggedIn after a failed login', async () => {
    mockedGetConfig.mockRejectedValue(new Error('unauthorized'));

    await expect(
      useAuthStore.getState().login({ apiBase: 'localhost:8317', managementKey: 'bad', rememberPassword: true })
    ).rejects.toThrow();

    expect(localStorage.getItem('isLoggedIn')).toBeNull();
  });
});

describe('useAuthStore.logout', () => {
  it('clears the authenticated flag', async () => {
    await useAuthStore.getState().login({ apiBase: 'localhost:8317', managementKey: 'secret' });

    useAuthStore.getState().logout();

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('wipes the management key', async () => {
    await useAuthStore.getState().login({ apiBase: 'localhost:8317', managementKey: 'secret' });

    useAuthStore.getState().logout();

    expect(useAuthStore.getState().managementKey).toBe('');
  });

  it('wipes the apiBase', async () => {
    await useAuthStore.getState().login({ apiBase: 'localhost:8317', managementKey: 'secret' });

    useAuthStore.getState().logout();

    expect(useAuthStore.getState().apiBase).toBe('');
  });

  it('resets connectionStatus to disconnected', async () => {
    await useAuthStore.getState().login({ apiBase: 'localhost:8317', managementKey: 'secret' });

    useAuthStore.getState().logout();

    expect(useAuthStore.getState().connectionStatus).toBe('disconnected');
  });

  it('clears the server version metadata', () => {
    useAuthStore.setState({ serverVersion: '1.2.3', serverBuildDate: '2026-01-01' });

    useAuthStore.getState().logout();

    expect([useAuthStore.getState().serverVersion, useAuthStore.getState().serverBuildDate]).toEqual([null, null]);
  });

  it('removes the persisted isLoggedIn flag', async () => {
    await useAuthStore.getState().login({ apiBase: 'localhost:8317', managementKey: 'secret', rememberPassword: true });

    useAuthStore.getState().logout();

    expect(localStorage.getItem('isLoggedIn')).toBeNull();
  });

  it('clears the config store cache', async () => {
    mockedGetConfig.mockResolvedValue(okConfig());
    await useConfigStore.getState().fetchConfig();

    useAuthStore.getState().logout();

    expect(useConfigStore.getState().config).toBeNull();
  });

  it('clears the models store cache', () => {
    useModelsStore.setState({ cache: { data: [], timestamp: Date.now(), apiBase: 'x', apiKey: 'y' } });

    useAuthStore.getState().logout();

    expect(useModelsStore.getState().cache).toBeNull();
  });
});

describe('useAuthStore.checkAuth', () => {
  it('returns false without contacting the API when the management key is missing', async () => {
    useAuthStore.setState({ apiBase: 'http://localhost:8317', managementKey: '' });

    const result = await useAuthStore.getState().checkAuth();

    expect(result).toBe(false);
  });

  it('does not call the config API when credentials are incomplete', async () => {
    useAuthStore.setState({ apiBase: '', managementKey: 'secret' });

    await useAuthStore.getState().checkAuth();

    expect(mockedGetConfig).not.toHaveBeenCalled();
  });

  it('returns true when the config fetch succeeds', async () => {
    useAuthStore.setState({ apiBase: 'http://localhost:8317', managementKey: 'secret' });

    const result = await useAuthStore.getState().checkAuth();

    expect(result).toBe(true);
  });

  it('marks the store authenticated on a successful check', async () => {
    useAuthStore.setState({ apiBase: 'http://localhost:8317', managementKey: 'secret' });

    await useAuthStore.getState().checkAuth();

    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it('reconfigures the apiClient with the current credentials', async () => {
    useAuthStore.setState({ apiBase: 'http://localhost:8317', managementKey: 'secret' });

    await useAuthStore.getState().checkAuth();

    expect(mockedSetConfig).toHaveBeenCalledWith({ apiBase: 'http://localhost:8317', managementKey: 'secret' });
  });

  it('returns false when the config fetch rejects', async () => {
    useAuthStore.setState({ apiBase: 'http://localhost:8317', managementKey: 'secret' });
    mockedGetConfig.mockRejectedValue(new Error('boom'));

    const result = await useAuthStore.getState().checkAuth();

    expect(result).toBe(false);
  });

  it('marks the store unauthenticated when the check fails', async () => {
    useAuthStore.setState({ apiBase: 'http://localhost:8317', managementKey: 'secret', isAuthenticated: true });
    mockedGetConfig.mockRejectedValue(new Error('boom'));

    await useAuthStore.getState().checkAuth();

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('sets connectionStatus to error when the check fails', async () => {
    useAuthStore.setState({ apiBase: 'http://localhost:8317', managementKey: 'secret' });
    mockedGetConfig.mockRejectedValue(new Error('boom'));

    await useAuthStore.getState().checkAuth();

    expect(useAuthStore.getState().connectionStatus).toBe('error');
  });
});

describe('useAuthStore.restoreSession', () => {
  it('returns false when there is no prior session', async () => {
    const result = await useAuthStore.getState().restoreSession();

    expect(result).toBe(false);
  });

  it('resolves the apiBase from window.location when nothing is stored', async () => {
    await useAuthStore.getState().restoreSession();

    expect(useAuthStore.getState().apiBase).toBe('http://localhost:3000');
  });

  it('configures the apiClient with the resolved base during restore', async () => {
    await useAuthStore.getState().restoreSession();

    expect(mockedSetConfig).toHaveBeenCalledWith({ apiBase: 'http://localhost:3000', managementKey: '' });
  });

  it('auto-logs-in and returns true when a remembered session is present', async () => {
    localStorage.setItem('isLoggedIn', 'true');
    useAuthStore.setState({ apiBase: 'http://localhost:8317', managementKey: 'secret', rememberPassword: true });

    const result = await useAuthStore.getState().restoreSession();

    expect(result).toBe(true);
  });

  it('marks the store authenticated after a successful auto-login', async () => {
    localStorage.setItem('isLoggedIn', 'true');
    useAuthStore.setState({ apiBase: 'http://localhost:8317', managementKey: 'secret', rememberPassword: true });

    await useAuthStore.getState().restoreSession();

    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it('returns false when the auto-login fails', async () => {
    localStorage.setItem('isLoggedIn', 'true');
    useAuthStore.setState({ apiBase: 'http://localhost:8317', managementKey: 'secret', rememberPassword: true });
    mockedGetConfig.mockRejectedValue(new Error('expired key'));

    const result = await useAuthStore.getState().restoreSession();

    expect(result).toBe(false);
  });

  it('returns the same in-flight promise for concurrent restore calls', () => {
    localStorage.setItem('isLoggedIn', 'true');
    useAuthStore.setState({ apiBase: 'http://localhost:8317', managementKey: 'secret', rememberPassword: true });

    const first = useAuthStore.getState().restoreSession();
    const second = useAuthStore.getState().restoreSession();

    expect(second).toBe(first);
  });

  it('does not auto-login when isLoggedIn is set but the management key is missing', async () => {
    localStorage.setItem('isLoggedIn', 'true');
    useAuthStore.setState({ apiBase: 'http://localhost:8317', managementKey: '', rememberPassword: false });

    const result = await useAuthStore.getState().restoreSession();

    expect(result).toBe(false);
  });
});

describe('useAuthStore.updateServerVersion', () => {
  it('stores the provided version and build date', () => {
    useAuthStore.getState().updateServerVersion('2.0.0', '2026-06-01');

    expect([useAuthStore.getState().serverVersion, useAuthStore.getState().serverBuildDate]).toEqual([
      '2.0.0',
      '2026-06-01',
    ]);
  });

  it('normalizes an empty version string to null', () => {
    useAuthStore.getState().updateServerVersion('', '');

    expect([useAuthStore.getState().serverVersion, useAuthStore.getState().serverBuildDate]).toEqual([null, null]);
  });

  it('defaults the build date to null when omitted', () => {
    useAuthStore.getState().updateServerVersion('3.1.4');

    expect(useAuthStore.getState().serverBuildDate).toBeNull();
  });
});

describe('useAuthStore.updateConnectionStatus', () => {
  it('updates the connection status', () => {
    useAuthStore.getState().updateConnectionStatus('connecting');

    expect(useAuthStore.getState().connectionStatus).toBe('connecting');
  });

  it('defaults the error to null when not supplied', () => {
    useAuthStore.setState({ connectionError: 'old error' });

    useAuthStore.getState().updateConnectionStatus('connected');

    expect(useAuthStore.getState().connectionError).toBeNull();
  });

  it('stores the supplied error message', () => {
    useAuthStore.getState().updateConnectionStatus('error', 'timed out');

    expect(useAuthStore.getState().connectionError).toBe('timed out');
  });
});

describe('useAuthStore — global window event listeners', () => {
  it('logs out when an unauthorized event is dispatched', async () => {
    await useAuthStore.getState().login({ apiBase: 'localhost:8317', managementKey: 'secret' });

    window.dispatchEvent(new Event('unauthorized'));

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('updates the server version when a server-version-update event is dispatched', () => {
    window.dispatchEvent(
      new CustomEvent('server-version-update', { detail: { version: '9.9.9', buildDate: '2026-12-31' } })
    );

    expect([useAuthStore.getState().serverVersion, useAuthStore.getState().serverBuildDate]).toEqual([
      '9.9.9',
      '2026-12-31',
    ]);
  });

  it('clamps missing event detail fields to null on a server-version-update event', () => {
    window.dispatchEvent(new CustomEvent('server-version-update', { detail: {} }));

    expect([useAuthStore.getState().serverVersion, useAuthStore.getState().serverBuildDate]).toEqual([null, null]);
  });
});
