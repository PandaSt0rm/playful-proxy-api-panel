import { describe, it, expect, vi } from 'vitest';
import { render, screen, userEvent } from '@/test/utils';
import { QuotaCredentialRow } from './QuotaCredentialRow';
import type { QuotaCredentialView } from './useQuotaDashboard';

function view(overrides: Partial<QuotaCredentialView> = {}): QuotaCredentialView {
  return {
    key: 'claude:work.json',
    name: 'work.json',
    type: 'claude',
    i18nPrefix: 'claude_quota',
    file: { name: 'work.json', type: 'claude' },
    status: 'success',
    refreshing: false,
    health: 'ok',
    summary: { meters: [], extras: [] },
    worstRemaining: null,
    ...overrides,
  } as QuotaCredentialView;
}

function renderRow(v: QuotaCredentialView, onRefresh = vi.fn()) {
  render(<QuotaCredentialRow view={v} resolvedTheme="light" disabled={false} onRefresh={onRefresh} />);
  return onRefresh;
}

describe('QuotaCredentialRow', () => {
  it('renders the credential name, meters and extra chips on success', () => {
    renderRow(
      view({
        summary: {
          meters: [{ id: '5h', label: '5h window', remainingPercent: 62, resetLabel: 'resets soon' }],
          extras: [{ id: 'plan', label: 'Plan', value: 'Max' }],
        },
        worstRemaining: 62,
      })
    );

    expect(screen.getByText('work.json')).toBeInTheDocument();
    expect(screen.getByText('5h window')).toBeInTheDocument();
    expect(screen.getByText('62% left')).toBeInTheDocument();
    expect(screen.getByText('Max')).toBeInTheDocument();
  });

  it('interprets a 403 error as a credential check hint', () => {
    renderRow(view({ status: 'error', health: 'error', errorStatus: 403, error: 'Forbidden' }));
    expect(screen.getByText(/check the credential status/i)).toBeInTheDocument();
  });

  it('shows a pending message before the credential has loaded', () => {
    renderRow(view({ status: 'idle', health: 'unknown' }));
    expect(screen.getByText('Waiting to load…')).toBeInTheDocument();
  });

  it('keeps showing stale meters while refreshing (no blanking)', () => {
    renderRow(
      view({
        status: 'success',
        refreshing: true,
        summary: { meters: [{ id: '5h', label: '5h window', remainingPercent: 40 }], extras: [] },
        worstRemaining: 40,
      })
    );
    expect(screen.getByText('5h window')).toBeInTheDocument();
    expect(screen.getByText('40% left')).toBeInTheDocument();
  });

  it('invokes onRefresh with the credential key when the refresh button is clicked', async () => {
    const onRefresh = renderRow(view());
    await userEvent.click(screen.getByRole('button', { name: /refresh this account/i }));
    expect(onRefresh).toHaveBeenCalledWith('claude:work.json');
  });

  it('disables the refresh button while refreshing', () => {
    renderRow(view({ refreshing: true }));
    expect(screen.getByRole('button', { name: /refresh this account/i })).toBeDisabled();
  });

  it('resolves the dynamic health class (no "undefined" in className)', () => {
    const { container } = render(
      <QuotaCredentialRow
        view={view({ health: 'critical', worstRemaining: 5 })}
        resolvedTheme="light"
        disabled={false}
        onRefresh={vi.fn()}
      />
    );
    const row = container.firstElementChild as HTMLElement;
    expect(row.className).not.toContain('undefined');
    // The CSS-module local name is preserved within the generated class name.
    expect(row.className).toContain('rowHealth_critical');
  });
});
