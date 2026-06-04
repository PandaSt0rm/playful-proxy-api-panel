/**
 * Behaviour tests for QuotaPage.
 *
 * QuotaPage loads auth files (+ Z.AI quota files derived from OpenAI providers)
 * and the config YAML, then renders one QuotaSection per provider, propagating
 * loading/disabled/files. We mock the typed api modules we own
 * (authFilesApi.list, providersApi.getOpenAIProviders, configFileApi
 * .fetchConfigYaml) and stub QuotaSection to a lightweight probe that records
 * the props it receives — keeping the real quota config constants. Connection
 * status comes from the real useAuthStore, reset per test.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@/test/utils';
import type { AuthFileItem } from '@/types';

const listMock = vi.fn();
const getOpenAIProvidersMock = vi.fn();
const fetchConfigYamlMock = vi.fn();

vi.mock('@/services/api', () => ({
  authFilesApi: { list: () => listMock() },
  providersApi: { getOpenAIProviders: () => getOpenAIProvidersMock() },
  configFileApi: { fetchConfigYaml: () => fetchConfigYamlMock() },
}));

interface SectionProbeProps {
  config: { i18nPrefix: string };
  files: AuthFileItem[];
  loading: boolean;
  disabled: boolean;
}

vi.mock('@/components/quota', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/quota')>();
  return {
    ...actual,
    QuotaSection: ({ config, files, loading, disabled }: SectionProbeProps) => (
      <div
        data-testid={`section-${config.i18nPrefix}`}
        data-loading={String(loading)}
        data-disabled={String(disabled)}
        data-filecount={String(files.length)}
        data-filenames={files.map((f) => f.name).join(',')}
      />
    ),
  };
});

import { QuotaPage } from './QuotaPage';
import { useAuthStore } from '@/stores';

const authFile = (name: string, type: string): AuthFileItem => ({ name, type });

beforeEach(() => {
  listMock.mockReset().mockResolvedValue({ files: [] });
  getOpenAIProvidersMock.mockReset().mockResolvedValue([]);
  fetchConfigYamlMock.mockReset().mockResolvedValue('');
  useAuthStore.setState({ connectionStatus: 'connected' });
});

describe('QuotaPage rendering', () => {
  it('renders the page title', () => {
    render(<QuotaPage />);

    expect(screen.getByText('Quota Management')).toBeInTheDocument();
  });

  it('renders the page description', () => {
    render(<QuotaPage />);

    expect(
      screen.getByText(
        'Monitor OAuth and coding-plan quota status for Antigravity, Codex, Gemini CLI, Kimi, and Z.AI credentials.'
      )
    ).toBeInTheDocument();
  });

  it('renders exactly six quota sections', () => {
    render(<QuotaPage />);

    expect(screen.getAllByTestId(/^section-/)).toHaveLength(6);
  });

  it('renders a section for each provider in order', () => {
    render(<QuotaPage />);

    const ids = screen.getAllByTestId(/^section-/).map((el) => el.getAttribute('data-testid'));
    expect(ids).toEqual([
      'section-claude_quota',
      'section-antigravity_quota',
      'section-codex_quota',
      'section-gemini_cli_quota',
      'section-kimi_quota',
      'section-zai_quota',
    ]);
  });
});

describe('QuotaPage file loading', () => {
  it('passes the loaded auth files to every section', async () => {
    listMock.mockResolvedValue({ files: [authFile('a.json', 'claude'), authFile('b.json', 'codex')] });

    render(<QuotaPage />);

    await waitFor(() =>
      expect(screen.getByTestId('section-claude_quota')).toHaveAttribute('data-filenames', 'a.json,b.json')
    );
  });

  it('appends Z.AI quota files derived from OpenAI providers to the auth files', async () => {
    listMock.mockResolvedValue({ files: [authFile('a.json', 'claude')] });
    getOpenAIProvidersMock.mockResolvedValue([
      { name: 'Z.AI', prefix: 'zai', baseUrl: 'https://api.z.ai', apiKeyEntries: [{ apiKey: 'k', authIndex: 'idx-1' }] },
    ]);

    render(<QuotaPage />);

    await waitFor(() =>
      expect(screen.getByTestId('section-zai_quota')).toHaveAttribute('data-filenames', 'a.json,Z.AI #1')
    );
  });

  it('uses only the auth files when the OpenAI providers request fails', async () => {
    listMock.mockResolvedValue({ files: [authFile('a.json', 'claude')] });
    getOpenAIProvidersMock.mockRejectedValue(new Error('boom'));

    render(<QuotaPage />);

    await waitFor(() =>
      expect(screen.getByTestId('section-claude_quota')).toHaveAttribute('data-filecount', '1')
    );
  });

  it('treats a missing files field in the response as an empty list', async () => {
    listMock.mockResolvedValue({});

    render(<QuotaPage />);

    await waitFor(() =>
      expect(screen.getByTestId('section-claude_quota')).toHaveAttribute('data-filecount', '0')
    );
  });

  it('clears the loading flag on the sections after files resolve', async () => {
    listMock.mockResolvedValue({ files: [authFile('a.json', 'claude')] });

    render(<QuotaPage />);

    await waitFor(() =>
      expect(screen.getByTestId('section-claude_quota')).toHaveAttribute('data-loading', 'false')
    );
  });
});

describe('QuotaPage error handling', () => {
  it('shows the thrown error message when the auth files request fails', async () => {
    listMock.mockRejectedValue(new Error('auth files unavailable'));

    render(<QuotaPage />);

    await waitFor(() => expect(screen.getByText('auth files unavailable')).toBeInTheDocument());
  });

  it('shows the generic refresh-failed message when the rejection is not an Error', async () => {
    listMock.mockRejectedValue('plain string failure');

    render(<QuotaPage />);

    await waitFor(() => expect(screen.getByText('Refresh failed')).toBeInTheDocument());
  });

  it('does not show an error box when loading succeeds', async () => {
    listMock.mockResolvedValue({ files: [authFile('a.json', 'claude')] });

    render(<QuotaPage />);

    await waitFor(() =>
      expect(screen.getByTestId('section-claude_quota')).toHaveAttribute('data-filecount', '1')
    );
    expect(screen.queryByText('Refresh failed')).not.toBeInTheDocument();
  });
});

describe('QuotaPage disabled state', () => {
  it('disables the sections when the connection is not connected', () => {
    useAuthStore.setState({ connectionStatus: 'disconnected' });

    render(<QuotaPage />);

    expect(screen.getByTestId('section-claude_quota')).toHaveAttribute('data-disabled', 'true');
  });

  it('enables the sections when the connection is connected', () => {
    useAuthStore.setState({ connectionStatus: 'connected' });

    render(<QuotaPage />);

    expect(screen.getByTestId('section-claude_quota')).toHaveAttribute('data-disabled', 'false');
  });
});
