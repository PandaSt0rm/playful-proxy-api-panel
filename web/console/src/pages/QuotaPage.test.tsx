/**
 * Behaviour tests for the redesigned QuotaPage.
 *
 * The page loads auth files (+ Z.AI quota files derived from OpenAI providers),
 * hands them to useQuotaDashboard, and renders the dashboard header plus
 * provider groups built from the credential views. We mock the api modules we
 * own and the dashboard hook (so loading is controllable), and keep the real
 * header/group/row components so grouping and rendering are exercised end-to-end.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, render, screen, waitFor } from '@/test/utils';
import type { AuthFileItem } from '@/types';
import type { QuotaCredentialView } from '@/components/quota/useQuotaDashboard';

const listMock = vi.fn();
const getOpenAIProvidersMock = vi.fn();
const fetchConfigYamlMock = vi.fn();

vi.mock('@/services/api', () => ({
  authFilesApi: { list: () => listMock(), downloadText: vi.fn() },
  providersApi: { getOpenAIProviders: () => getOpenAIProvidersMock() },
  configFileApi: { fetchConfigYaml: () => fetchConfigYamlMock() },
  apiCallApi: { request: vi.fn() },
  getApiCallErrorMessage: vi.fn(() => 'error'),
}));

const useQuotaDashboardMock = vi.fn();

vi.mock('@/components/quota/useQuotaDashboard', () => ({
  useQuotaDashboard: (...args: unknown[]) => useQuotaDashboardMock(...args),
  AUTO_REFRESH_INTERVALS_MS: [60_000, 300_000, 900_000],
  DEFAULT_AUTO_REFRESH_MS: 300_000,
}));

import { QuotaPage } from './QuotaPage';
import { useAuthStore } from '@/stores';

type DashboardReturn = ReturnType<typeof buildDashboard>;

function buildDashboard(views: QuotaCredentialView[] = []) {
  return {
    credentialViews: views,
    overview: {
      total: views.length,
      ok: views.filter((v) => v.health === 'ok').length,
      warn: views.filter((v) => v.health === 'warn').length,
      critical: views.filter((v) => v.health === 'critical').length,
      error: views.filter((v) => v.health === 'error').length,
      loading: 0,
    },
    progress: { active: false, done: 0, total: 0 },
    lastUpdatedAt: null as number | null,
    refreshAll: vi.fn(),
    refreshOne: vi.fn(),
    autoRefresh: {
      enabled: false,
      setEnabled: vi.fn(),
      intervalMs: 300_000,
      setIntervalMs: vi.fn(),
    },
  };
}

function claudeView(name: string, remaining: number): QuotaCredentialView {
  return {
    key: `claude:${name}`,
    name,
    type: 'claude',
    i18nPrefix: 'claude_quota',
    file: { name, type: 'claude' },
    status: 'success',
    refreshing: false,
    health: remaining >= 70 ? 'ok' : remaining >= 30 ? 'warn' : 'critical',
    summary: {
      meters: [{ id: '5h', label: '5h window', remainingPercent: remaining }],
      extras: [],
    },
    worstRemaining: remaining,
    updatedAt: undefined,
  } as QuotaCredentialView;
}

let currentDashboard: DashboardReturn;
const authFile = (name: string, type: string): AuthFileItem => ({ name, type });

beforeEach(() => {
  listMock.mockReset().mockResolvedValue({ files: [] });
  getOpenAIProvidersMock.mockReset().mockResolvedValue([]);
  fetchConfigYamlMock.mockReset().mockResolvedValue('');
  currentDashboard = buildDashboard();
  useQuotaDashboardMock.mockReset().mockImplementation(() => currentDashboard);
  useAuthStore.setState({ connectionStatus: 'connected' });
});

// Render and flush the page's mount effects (file load, config load) inside act
// so deferred state updates don't trigger act() warnings.
async function renderSettled() {
  await act(async () => {
    render(<QuotaPage />);
  });
}

describe('QuotaPage shell', () => {
  it('renders the title and description', async () => {
    await renderSettled();
    expect(screen.getByText('Quota Management')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Monitor OAuth and coding-plan quota across all Claude, Antigravity, Codex, Gemini CLI, Kimi, and Z.AI credentials.'
      )
    ).toBeInTheDocument();
  });

  it('renders the global refresh control', async () => {
    await renderSettled();
    expect(screen.getByRole('button', { name: /refresh all/i })).toBeInTheDocument();
  });
});

describe('QuotaPage file loading', () => {
  it('passes the loaded auth files to the dashboard hook', async () => {
    listMock.mockResolvedValue({
      files: [authFile('a.json', 'claude'), authFile('b.json', 'codex')],
    });

    render(<QuotaPage />);

    await waitFor(() => {
      const lastCall = useQuotaDashboardMock.mock.calls.at(-1);
      expect(lastCall?.[0]).toHaveLength(2);
    });
  });

  it('appends Z.AI quota files derived from OpenAI providers', async () => {
    listMock.mockResolvedValue({ files: [authFile('a.json', 'claude')] });
    getOpenAIProvidersMock.mockResolvedValue([
      {
        name: 'Z.AI',
        prefix: 'zai',
        baseUrl: 'https://api.z.ai',
        apiKeyEntries: [{ apiKey: 'k', authIndex: 'idx-1' }],
      },
    ]);

    render(<QuotaPage />);

    await waitFor(() => {
      const files = (useQuotaDashboardMock.mock.calls.at(-1)?.[0] ?? []) as AuthFileItem[];
      expect(files.map((f) => f.name)).toContain('Z.AI #1');
    });
  });
});

describe('QuotaPage content', () => {
  it('renders provider groups and credential rows from the dashboard', async () => {
    currentDashboard = buildDashboard([claudeView('work.json', 60)]);

    await renderSettled();

    expect(screen.getByText('work.json')).toBeInTheDocument();
    expect(screen.getByText('60% left')).toBeInTheDocument();
  });

  it('shows the empty state when there are no credentials', async () => {
    currentDashboard = buildDashboard([]);

    await renderSettled();

    expect(screen.getByText('No credentials')).toBeInTheDocument();
  });
});

describe('QuotaPage error handling', () => {
  it('shows the thrown error when the auth files request fails', async () => {
    listMock.mockRejectedValue(new Error('auth files unavailable'));

    render(<QuotaPage />);

    await waitFor(() => expect(screen.getByText('auth files unavailable')).toBeInTheDocument());
  });
});

describe('QuotaPage disabled state', () => {
  it('disables the refresh control and reports disabled to the hook when not connected', async () => {
    useAuthStore.setState({ connectionStatus: 'disconnected' });

    await renderSettled();

    expect(screen.getByRole('button', { name: /refresh all/i })).toBeDisabled();
    const lastCall = useQuotaDashboardMock.mock.calls.at(-1);
    expect(lastCall?.[2]).toBe(true);
  });
});
