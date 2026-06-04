/**
 * Behaviour tests for QuotaSection.
 *
 * QuotaSection wires the real quota/theme/notification stores, useQuotaLoader,
 * useGridColumns, and the header-refresh trigger together. We mock only the
 * boundary we own — triggerHeaderRefresh — and drive the rest through the real
 * stores and a fake QuotaConfig (codex slice) whose fetchQuota is a controllable
 * mock. Observables under test: which cards render, the empty state, the count
 * badge, pagination, view-mode toggling/warnings, the refresh-all wiring, and
 * the per-card refresh that writes store state and emits a notification.
 *
 * In jsdom the grid container reports clientWidth 0, so useGridColumns settles
 * to 1 column and paged mode shows 3 cards per page (min(1*3, 25)); page counts
 * below are computed from that.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { TFunction } from 'i18next';
import { render, screen, userEvent, waitFor } from '@/test/utils';
import { QuotaSection } from './QuotaSection';
import type { QuotaConfig } from './quotaConfigs';
import { useQuotaStore, useNotificationStore, useThemeStore } from '@/stores';
import type { AuthFileItem, CodexQuotaState } from '@/types';

const triggerHeaderRefreshMock = vi.fn();

vi.mock('@/hooks/useHeaderRefresh', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useHeaderRefresh')>();
  return {
    ...actual,
    triggerHeaderRefresh: () => triggerHeaderRefreshMock(),
  };
});

interface FakeData {
  planType: string;
}

const fetchQuotaMock = vi.fn<(file: AuthFileItem, t: TFunction) => Promise<FakeData>>();

// Only codex-type files pass the filter, exercising QuotaSection's filterFn.
const makeConfig = (): QuotaConfig<CodexQuotaState, FakeData> => ({
  type: 'codex',
  i18nPrefix: 'codex_quota',
  cardIdleMessageKey: 'quota_management.card_idle_hint',
  filterFn: (file) => file.type === 'codex',
  fetchQuota: fetchQuotaMock,
  storeSelector: (state) => state.codexQuota,
  storeSetter: 'setCodexQuota',
  buildLoadingState: () => ({ status: 'loading', windows: [] }),
  buildSuccessState: (data) => ({ status: 'success', windows: [], planType: data.planType }),
  buildErrorState: (message, status) => ({
    status: 'error',
    windows: [],
    error: message,
    errorStatus: status,
  }),
  cardClassName: 'codex-card',
  controlsClassName: '',
  controlClassName: '',
  gridClassName: 'codex-grid',
  renderQuotaItems: () => null,
});

const codexFile = (name: string, extra: Partial<AuthFileItem> = {}): AuthFileItem => ({
  name,
  type: 'codex',
  ...extra,
});

const renderSection = (
  files: AuthFileItem[],
  opts: { loading?: boolean; disabled?: boolean } = {}
) =>
  render(
    <QuotaSection
      config={makeConfig()}
      files={files}
      loading={opts.loading ?? false}
      disabled={opts.disabled ?? false}
    />
  );

const statusErr = (message: string, status: number): Error & { status: number } =>
  Object.assign(new Error(message), { status });

beforeEach(() => {
  triggerHeaderRefreshMock.mockReset();
  fetchQuotaMock.mockReset();
  useQuotaStore.setState({
    antigravityQuota: {},
    claudeQuota: {},
    codexQuota: {},
    geminiCliQuota: {},
    kimiQuota: {},
    zaiQuota: {},
  });
  useNotificationStore.setState({ notifications: [] });
  useThemeStore.setState({ resolvedTheme: 'light' });
});

describe('QuotaSection card rendering', () => {
  it('renders one card per file that passes the filter', () => {
    renderSection([codexFile('a.json'), codexFile('b.json')]);

    expect(screen.getByText('a.json')).toBeInTheDocument();
    expect(screen.getByText('b.json')).toBeInTheDocument();
  });

  it('excludes files that do not pass the filter', () => {
    renderSection([codexFile('a.json'), { name: 'gem.json', type: 'gemini-cli' }]);

    expect(screen.getByText('a.json')).toBeInTheDocument();
    expect(screen.queryByText('gem.json')).not.toBeInTheDocument();
  });

  it('shows the count badge with the number of filtered files', () => {
    renderSection([codexFile('a.json'), codexFile('b.json'), { name: 'x', type: 'gemini-cli' }]);

    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('renders the empty state when no file passes the filter', () => {
    renderSection([{ name: 'gem.json', type: 'gemini-cli' }]);

    expect(screen.getByText('No Codex Auth Files')).toBeInTheDocument();
  });

  it('renders the section title', () => {
    renderSection([codexFile('a.json')]);

    expect(screen.getByText('Codex Quota')).toBeInTheDocument();
  });
});

describe('QuotaSection pagination', () => {
  it('shows only the first page of cards when files exceed the page size', () => {
    renderSection([
      codexFile('a.json'),
      codexFile('b.json'),
      codexFile('c.json'),
      codexFile('d.json'),
    ]);

    expect(screen.getByText('a.json')).toBeInTheDocument();
    expect(screen.getByText('c.json')).toBeInTheDocument();
    expect(screen.queryByText('d.json')).not.toBeInTheDocument();
  });

  it('reveals the next page of cards when the next button is clicked', async () => {
    renderSection([
      codexFile('a.json'),
      codexFile('b.json'),
      codexFile('c.json'),
      codexFile('d.json'),
    ]);

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByText('d.json')).toBeInTheDocument();
    expect(screen.queryByText('a.json')).not.toBeInTheDocument();
  });

  it('disables the previous button on the first page', () => {
    renderSection([codexFile('a.json'), codexFile('b.json'), codexFile('c.json'), codexFile('d.json')]);

    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
  });

  it('does not render pagination when files fit on a single page', () => {
    renderSection([codexFile('a.json'), codexFile('b.json')]);

    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
  });

  it('shows the page info with current page, total pages, and file count', () => {
    renderSection([
      codexFile('a.json'),
      codexFile('b.json'),
      codexFile('c.json'),
      codexFile('d.json'),
    ]);

    // 4 files / 3 per page = 2 pages.
    expect(screen.getByText('Page 1 / 2 · 4 files')).toBeInTheDocument();
  });
});

describe('QuotaSection view mode', () => {
  it('switches to show-all mode and renders every card when under the threshold', async () => {
    renderSection([
      codexFile('a.json'),
      codexFile('b.json'),
      codexFile('c.json'),
      codexFile('d.json'),
    ]);

    await userEvent.click(screen.getByRole('button', { name: 'Show all' }));

    expect(screen.getByText('d.json')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
  });

  it('shows the too-many-files warning instead of all cards when over the threshold', async () => {
    const files = Array.from({ length: 31 }, (_, i) => codexFile(`f${i}.json`));
    renderSection(files);

    await userEvent.click(screen.getByRole('button', { name: 'Show all' }));

    expect(
      screen.getByText(
        'Too many credentials. Showing all may cause performance issues, please use paged view.'
      )
    ).toBeInTheDocument();
  });

  it('dismisses the too-many-files warning when confirm is clicked', async () => {
    const files = Array.from({ length: 31 }, (_, i) => codexFile(`f${i}.json`));
    renderSection(files);
    await userEvent.click(screen.getByRole('button', { name: 'Show all' }));

    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(
      screen.queryByText(
        'Too many credentials. Showing all may cause performance issues, please use paged view.'
      )
    ).not.toBeInTheDocument();
  });
});

describe('QuotaSection refresh-all wiring', () => {
  it('triggers a header refresh when the refresh-all button is clicked', async () => {
    renderSection([codexFile('a.json')]);

    await userEvent.click(screen.getByRole('button', { name: 'Refresh all credentials' }));

    expect(triggerHeaderRefreshMock).toHaveBeenCalledTimes(1);
  });

  it('disables the refresh-all button when the section is disabled', () => {
    renderSection([codexFile('a.json')], { disabled: true });

    expect(screen.getByRole('button', { name: 'Refresh all credentials' })).toBeDisabled();
  });

  it('disables the refresh-all button while files are loading', () => {
    renderSection([codexFile('a.json')], { loading: true });

    expect(screen.getByRole('button', { name: 'Refresh all credentials' })).toBeDisabled();
  });
});

describe('QuotaSection per-card refresh', () => {
  it('writes a success state to the quota store after a card refresh resolves', async () => {
    fetchQuotaMock.mockResolvedValue({ planType: 'pro' });
    renderSection([codexFile('a.json')]);

    await userEvent.click(screen.getByRole('button', { name: 'Refresh this account' }));

    await waitFor(() =>
      expect(useQuotaStore.getState().codexQuota['a.json']).toEqual({
        status: 'success',
        windows: [],
        planType: 'pro',
      })
    );
  });

  it('emits a success notification after a card refresh resolves', async () => {
    fetchQuotaMock.mockResolvedValue({ planType: 'pro' });
    renderSection([codexFile('a.json')]);

    await userEvent.click(screen.getByRole('button', { name: 'Refresh this account' }));

    await waitFor(() => {
      const notifications = useNotificationStore.getState().notifications;
      expect(notifications).toHaveLength(1);
    });
    const [notification] = useNotificationStore.getState().notifications;
    expect(notification.message).toBe('Quota refreshed for "a.json"');
    expect(notification.type).toBe('success');
  });

  it('writes an error state with the thrown message and status after a failed card refresh', async () => {
    fetchQuotaMock.mockRejectedValue(statusErr('forbidden', 403));
    renderSection([codexFile('a.json')]);

    await userEvent.click(screen.getByRole('button', { name: 'Refresh this account' }));

    await waitFor(() =>
      expect(useQuotaStore.getState().codexQuota['a.json']).toEqual({
        status: 'error',
        windows: [],
        error: 'forbidden',
        errorStatus: 403,
      })
    );
  });

  it('emits an error notification after a failed card refresh', async () => {
    fetchQuotaMock.mockRejectedValue(new Error('nope'));
    renderSection([codexFile('a.json')]);

    await userEvent.click(screen.getByRole('button', { name: 'Refresh this account' }));

    await waitFor(() => {
      const notifications = useNotificationStore.getState().notifications;
      expect(notifications).toHaveLength(1);
    });
    const [notification] = useNotificationStore.getState().notifications;
    expect(notification.message).toBe('Failed to refresh quota for "a.json": nope');
    expect(notification.type).toBe('error');
  });

  it('does not fetch quota for a card whose file is disabled', async () => {
    renderSection([codexFile('a.json', { disabled: true })]);

    // A disabled file's card refresh button is disabled, so the click is a no-op.
    const button = screen.getByRole('button', { name: 'Refresh this account' });
    expect(button).toBeDisabled();
    expect(fetchQuotaMock).not.toHaveBeenCalled();
  });

  it('does not fetch quota when the whole section is disabled', () => {
    renderSection([codexFile('a.json')], { disabled: true });

    expect(screen.getByRole('button', { name: 'Refresh this account' })).toBeDisabled();
  });
});

describe('QuotaSection store sync', () => {
  it('prunes cached quota entries for files that are no longer present', async () => {
    useQuotaStore.setState({
      codexQuota: {
        'a.json': { status: 'success', windows: [], planType: 'old' },
        'gone.json': { status: 'success', windows: [], planType: 'stale' },
      },
    });

    renderSection([codexFile('a.json')]);

    await waitFor(() =>
      expect(useQuotaStore.getState().codexQuota).toEqual({
        'a.json': { status: 'success', windows: [], planType: 'old' },
      })
    );
  });

  it('clears all cached quota entries when no file passes the filter', async () => {
    useQuotaStore.setState({
      codexQuota: {
        'a.json': { status: 'success', windows: [], planType: 'old' },
      },
    });

    renderSection([{ name: 'gem.json', type: 'gemini-cli' }]);

    await waitFor(() => expect(useQuotaStore.getState().codexQuota).toEqual({}));
  });
});
