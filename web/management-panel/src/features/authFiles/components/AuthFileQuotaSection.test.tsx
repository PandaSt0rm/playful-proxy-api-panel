import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, userEvent, waitFor } from '@/test/utils';
import type { AuthFileItem } from '@/types';
import { useNotificationStore, useQuotaStore } from '@/stores';

// Mock the quota config module we own so quota fetching never touches the network.
// CODEX_CONFIG is the only config exercised by these tests; its build* helpers and
// renderQuotaItems are simple, deterministic stand-ins matching the real contract.
const { fetchQuota } = vi.hoisted(() => ({
  fetchQuota: vi.fn<() => Promise<unknown>>(),
}));

vi.mock('@/components/quota', () => {
  const config = {
    i18nPrefix: 'codex_quota',
    fetchQuota,
    buildLoadingState: () => ({ status: 'loading' }),
    buildSuccessState: (data: unknown) => ({ status: 'success', data }),
    buildErrorState: (message: string, status?: number) => ({
      status: 'error',
      error: message,
      errorStatus: status,
    }),
    renderQuotaItems: (quota: unknown) => (
      <div data-testid="rendered-quota">{JSON.stringify(quota)}</div>
    ),
  };
  return {
    ANTIGRAVITY_CONFIG: config,
    CLAUDE_CONFIG: config,
    CODEX_CONFIG: config,
    GEMINI_CLI_CONFIG: config,
    KIMI_CONFIG: config,
    ZAI_CONFIG: config,
  };
});

import { AuthFileQuotaSection } from './AuthFileQuotaSection';

const baseFile = (overrides: Partial<AuthFileItem> = {}): AuthFileItem => ({
  name: 'codex.json',
  type: 'codex',
  ...overrides,
});

const resetQuota = () => {
  useQuotaStore.setState({
    antigravityQuota: {},
    claudeQuota: {},
    codexQuota: {},
    geminiCliQuota: {},
    kimiQuota: {},
    zaiQuota: {},
  });
};

const resetNotifications = () => {
  useNotificationStore.setState({
    notifications: [],
    confirmation: { isOpen: false, isLoading: false, options: null },
  });
};

beforeEach(() => {
  fetchQuota.mockReset();
  resetQuota();
  resetNotifications();
});

describe('AuthFileQuotaSection status rendering', () => {
  it('renders the idle action button when there is no cached quota', () => {
    render(
      <AuthFileQuotaSection file={baseFile()} quotaType="codex" disableControls={false} />
    );

    expect(screen.getByRole('button', { name: 'Click here to refresh quota' })).toBeInTheDocument();
  });

  it('renders the loading message when the cached quota status is loading', () => {
    useQuotaStore.setState({ codexQuota: { 'codex.json': { status: 'loading' } } });

    render(
      <AuthFileQuotaSection file={baseFile()} quotaType="codex" disableControls={false} />
    );

    expect(screen.getByText('Loading quota...')).toBeInTheDocument();
  });

  it('renders the resolved error message when the cached quota status is error', () => {
    useQuotaStore.setState({
      codexQuota: { 'codex.json': { status: 'error', error: 'boom' } },
    });

    render(
      <AuthFileQuotaSection file={baseFile()} quotaType="codex" disableControls={false} />
    );

    expect(screen.getByText('Failed to load quota: boom')).toBeInTheDocument();
  });

  it('renders the upgrade-required error message for a 404 quota error status', () => {
    useQuotaStore.setState({
      codexQuota: { 'codex.json': { status: 'error', error: 'boom', errorStatus: 404 } },
    });

    render(
      <AuthFileQuotaSection file={baseFile()} quotaType="codex" disableControls={false} />
    );

    expect(
      screen.getByText('Failed to load quota: Please update the CPA version or check for updates')
    ).toBeInTheDocument();
  });

  it('delegates to renderQuotaItems when the cached quota has a non-idle, non-loading, non-error status', () => {
    useQuotaStore.setState({
      codexQuota: { 'codex.json': { status: 'success' } },
    });

    render(
      <AuthFileQuotaSection file={baseFile()} quotaType="codex" disableControls={false} />
    );

    expect(screen.getByTestId('rendered-quota')).toBeInTheDocument();
  });
});

describe('AuthFileQuotaSection idle button gating', () => {
  it('disables the idle refresh button when controls are disabled', () => {
    render(
      <AuthFileQuotaSection file={baseFile()} quotaType="codex" disableControls />
    );

    expect(screen.getByRole('button', { name: 'Click here to refresh quota' })).toBeDisabled();
  });

  it('disables the idle refresh button when the file is disabled', () => {
    render(
      <AuthFileQuotaSection
        file={baseFile({ disabled: true })}
        quotaType="codex"
        disableControls={false}
      />
    );

    expect(screen.getByRole('button', { name: 'Click here to refresh quota' })).toBeDisabled();
  });
});

describe('AuthFileQuotaSection refresh behaviour', () => {
  it('shows a success notification and the rendered quota after a successful refresh', async () => {
    const user = userEvent.setup();
    fetchQuota.mockResolvedValue({ remaining: 10 });
    render(
      <AuthFileQuotaSection file={baseFile()} quotaType="codex" disableControls={false} />
    );

    await user.click(screen.getByRole('button', { name: 'Click here to refresh quota' }));

    await waitFor(() => expect(screen.getByTestId('rendered-quota')).toBeInTheDocument());
    expect(useNotificationStore.getState().notifications).toEqual([
      expect.objectContaining({ message: 'Quota refreshed for "codex.json"', type: 'success' }),
    ]);
  });

  it('shows an error notification and the error message after a failed refresh', async () => {
    const user = userEvent.setup();
    fetchQuota.mockRejectedValue(new Error('quota down'));
    render(
      <AuthFileQuotaSection file={baseFile()} quotaType="codex" disableControls={false} />
    );

    await user.click(screen.getByRole('button', { name: 'Click here to refresh quota' }));

    await waitFor(() =>
      expect(screen.getByText('Failed to load quota: quota down')).toBeInTheDocument()
    );
    expect(useNotificationStore.getState().notifications).toEqual([
      expect.objectContaining({
        message: 'Failed to refresh quota for "codex.json": quota down',
        type: 'error',
      }),
    ]);
  });

  it('does not call fetchQuota when controls are disabled', async () => {
    render(
      <AuthFileQuotaSection file={baseFile()} quotaType="codex" disableControls />
    );

    expect(fetchQuota).not.toHaveBeenCalled();
  });
});
