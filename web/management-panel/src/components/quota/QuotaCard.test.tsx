/**
 * Behaviour tests for QuotaCard and its exported QuotaProgressBar.
 *
 * CSS-module class names resolve to "_<name>_<hash>" strings in this harness, so
 * fill-variant assertions match on the readable substring (e.g. quotaBarFillHigh)
 * rather than the unstable hash. The progress bar's load-bearing observable is
 * its computed width and which fill variant it picks; both are derived by hand
 * from the spec. The card's behaviour is the message/branch it shows per status
 * and how it wires the refresh affordances.
 */

import { describe, it, expect, vi } from 'vitest';
import type { TFunction } from 'i18next';
import { render, screen, userEvent } from '@/test/utils';
import { QuotaCard, QuotaProgressBar } from './QuotaCard';
import type { QuotaStatusState, QuotaRenderHelpers } from './QuotaCard';
import type { AuthFileItem } from '@/types';

const baseItem: AuthFileItem = { name: 'cred-a.json', type: 'claude' };

// A trivial renderer so success-state output is observable and we can assert the
// reset hint / percent that a real config would surface through the helpers.
const renderItems = (
  quota: QuotaStatusState,
  t: TFunction,
  helpers: QuotaRenderHelpers
) =>
  helpers.QuotaProgressBar({ percent: 42, highThreshold: 70, mediumThreshold: 30 });

const renderCard = (overrides: Partial<Parameters<typeof QuotaCard>[0]> = {}) =>
  render(
    <QuotaCard
      item={baseItem}
      resolvedTheme="light"
      i18nPrefix="claude_quota"
      cardClassName="claude-card"
      defaultType="claude"
      renderQuotaItems={renderItems}
      {...overrides}
    />
  );

describe('QuotaProgressBar width', () => {
  it.each([
    { percent: 0, expectedWidth: '0%' },
    { percent: 25.4, expectedWidth: '25%' },
    { percent: 25.5, expectedWidth: '26%' },
    { percent: 100, expectedWidth: '100%' },
  ])('renders width $expectedWidth for percent $percent', ({ percent, expectedWidth }) => {
    const { container } = render(
      <QuotaProgressBar percent={percent} highThreshold={70} mediumThreshold={30} />
    );

    const fill = container.querySelector('[style]') as HTMLElement;

    expect(fill.style.width).toBe(expectedWidth);
  });

  it('clamps a percent above 100 down to a 100% width', () => {
    const { container } = render(
      <QuotaProgressBar percent={150} highThreshold={70} mediumThreshold={30} />
    );

    const fill = container.querySelector('[style]') as HTMLElement;

    expect(fill.style.width).toBe('100%');
  });

  it('clamps a negative percent up to a 0% width', () => {
    const { container } = render(
      <QuotaProgressBar percent={-40} highThreshold={70} mediumThreshold={30} />
    );

    const fill = container.querySelector('[style]') as HTMLElement;

    expect(fill.style.width).toBe('0%');
  });

  it('renders a 0% width when percent is null', () => {
    const { container } = render(
      <QuotaProgressBar percent={null} highThreshold={70} mediumThreshold={30} />
    );

    const fill = container.querySelector('[style]') as HTMLElement;

    expect(fill.style.width).toBe('0%');
  });
});

describe('QuotaProgressBar fill variant', () => {
  it('uses the high fill variant at or above the high threshold', () => {
    const { container } = render(
      <QuotaProgressBar percent={70} highThreshold={70} mediumThreshold={30} />
    );

    const fill = container.querySelector('[style]') as HTMLElement;

    expect(fill.className).toContain('quotaBarFillHigh');
  });

  it('uses the medium fill variant between the medium and high thresholds', () => {
    const { container } = render(
      <QuotaProgressBar percent={50} highThreshold={70} mediumThreshold={30} />
    );

    const fill = container.querySelector('[style]') as HTMLElement;

    expect(fill.className).toContain('quotaBarFillMedium');
  });

  it('uses the low fill variant below the medium threshold', () => {
    const { container } = render(
      <QuotaProgressBar percent={10} highThreshold={70} mediumThreshold={30} />
    );

    const fill = container.querySelector('[style]') as HTMLElement;

    expect(fill.className).toContain('quotaBarFillLow');
  });

  it('uses the medium fill variant for an unknown (null) percent', () => {
    const { container } = render(
      <QuotaProgressBar percent={null} highThreshold={70} mediumThreshold={30} />
    );

    const fill = container.querySelector('[style]') as HTMLElement;

    expect(fill.className).toContain('quotaBarFillMedium');
  });
});

describe('QuotaCard type badge', () => {
  it('shows the translated type label for a known type', () => {
    renderCard({ item: { name: 'a.json', type: 'codex' } });

    expect(screen.getByText('Codex')).toBeInTheDocument();
  });

  it('capitalizes an unrecognized type with no filter translation', () => {
    renderCard({ item: { name: 'a.json', type: 'banana' }, defaultType: 'banana' });

    expect(screen.getByText('Banana')).toBeInTheDocument();
  });

  it('special-cases iflow to the iFlow label', () => {
    renderCard({ item: { name: 'a.json', type: 'iflow' }, defaultType: 'iflow' });

    // filter_iflow exists ("iFlow"); the explicit lowercase branch is the
    // documented fallback, but the translated value is what renders.
    expect(screen.getByText('iFlow')).toBeInTheDocument();
  });

  it('falls back to the provider when type is absent', () => {
    renderCard({ item: { name: 'a.json', provider: 'kimi' }, defaultType: 'unknown' });

    expect(screen.getByText('Kimi')).toBeInTheDocument();
  });

  it('falls back to the default type when both type and provider are absent', () => {
    renderCard({ item: { name: 'a.json' }, defaultType: 'codex' });

    expect(screen.getByText('Codex')).toBeInTheDocument();
  });

  it('applies the light theme badge color for a known type', () => {
    renderCard({ item: { name: 'a.json', type: 'claude' }, resolvedTheme: 'light' });

    // claude light bg is #fbece4 -> rgb(251, 236, 228).
    const badge = screen.getByText('Claude');
    expect(badge).toHaveStyle({ backgroundColor: 'rgb(251, 236, 228)' });
  });

  it('applies the dark theme badge color for a known type', () => {
    renderCard({ item: { name: 'a.json', type: 'claude' }, resolvedTheme: 'dark' });

    // claude dark bg is #5e2c14 -> rgb(94, 44, 20).
    const badge = screen.getByText('Claude');
    expect(badge).toHaveStyle({ backgroundColor: 'rgb(94, 44, 20)' });
  });

  it('renders the credential file name', () => {
    renderCard({ item: { name: 'my-cred.json', type: 'claude' } });

    expect(screen.getByText('my-cred.json')).toBeInTheDocument();
  });
});

describe('QuotaCard status branches', () => {
  it('shows the loading message while quota is loading', () => {
    renderCard({ quota: { status: 'loading' } });

    expect(screen.getByText('Loading quota...')).toBeInTheDocument();
  });

  it('shows the success content rendered by renderQuotaItems', () => {
    const { container } = renderCard({ quota: { status: 'success' } });

    const fill = container.querySelector('[style*="width"]') as HTMLElement;
    expect(fill.style.width).toBe('42%');
  });

  it('shows the idle hint as static text when no refresh handler is provided', () => {
    renderCard({ quota: { status: 'idle' }, cardIdleMessageKey: 'quota_management.card_idle_hint' });

    expect(
      screen.getByText('Use the top "Refresh all credentials" button to fetch the latest quota data.')
    ).toBeInTheDocument();
  });

  it('shows the idle prompt as a clickable button when a refresh handler is provided', () => {
    renderCard({ quota: { status: 'idle' }, onRefresh: vi.fn(), canRefresh: true });

    expect(
      screen.getByRole('button', { name: 'Click here to refresh quota' })
    ).toBeInTheDocument();
  });

  it('shows the formatted error message with the provided error text', () => {
    renderCard({ quota: { status: 'error', error: 'boom' } });

    expect(screen.getByText('Failed to load quota: boom')).toBeInTheDocument();
  });

  it('maps a 404 error status to the update-required message', () => {
    renderCard({ quota: { status: 'error', error: 'ignored', errorStatus: 404 } });

    expect(
      screen.getByText('Failed to load quota: Please update the CPA version or check for updates')
    ).toBeInTheDocument();
  });

  it('maps a 403 error status to the check-credential message', () => {
    renderCard({ quota: { status: 'error', error: 'ignored', errorStatus: 403 } });

    expect(
      screen.getByText('Failed to load quota: Please check the credential status')
    ).toBeInTheDocument();
  });

  it('uses the unknown-error fallback when an error carries no message', () => {
    renderCard({ quota: { status: 'error' } });

    expect(screen.getByText('Failed to load quota: Unknown error')).toBeInTheDocument();
  });

  it('treats an undefined quota as idle and shows the per-section idle prompt', () => {
    // Without onRefresh or cardIdleMessageKey, idleMessageKey falls to
    // `${i18nPrefix}.idle` (claude_quota.idle).
    renderCard({ quota: undefined });

    expect(screen.getByText('Click here to refresh quota')).toBeInTheDocument();
  });
});

describe('QuotaCard refresh affordances', () => {
  it('renders no refresh button when onRefresh is omitted', () => {
    renderCard({ quota: { status: 'idle' } });

    expect(
      screen.queryByRole('button', { name: 'Refresh this account' })
    ).not.toBeInTheDocument();
  });

  it('invokes onRefresh when the header refresh button is clicked', async () => {
    const onRefresh = vi.fn();
    renderCard({ quota: { status: 'success' }, onRefresh, canRefresh: true });

    await userEvent.click(screen.getByRole('button', { name: 'Refresh this account' }));

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('disables the header refresh button when canRefresh is false', () => {
    renderCard({ quota: { status: 'success' }, onRefresh: vi.fn(), canRefresh: false });

    expect(screen.getByRole('button', { name: 'Refresh this account' })).toBeDisabled();
  });

  it('disables the header refresh button while quota is loading', () => {
    renderCard({ quota: { status: 'loading' }, onRefresh: vi.fn(), canRefresh: true });

    expect(screen.getByRole('button', { name: 'Refresh this account' })).toBeDisabled();
  });

  it('invokes onRefresh when the idle prompt button is clicked', async () => {
    const onRefresh = vi.fn();
    renderCard({ quota: { status: 'idle' }, onRefresh, canRefresh: true });

    await userEvent.click(screen.getByRole('button', { name: 'Click here to refresh quota' }));

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('disables the idle prompt button when canRefresh is false', () => {
    renderCard({ quota: { status: 'idle' }, onRefresh: vi.fn(), canRefresh: false });

    expect(
      screen.getByRole('button', { name: 'Click here to refresh quota' })
    ).toBeDisabled();
  });
});
