import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithRouter, screen, userEvent, waitFor } from '@/test/utils';
import { BudgetsPage } from './BudgetsPage';
import { aiproxyApi } from '@/services/api/aiproxy';
import { validateBudgetInput } from '@/features/budgets/validation';

vi.mock('@/services/api/aiproxy', () => ({
  aiproxyApi: {
    budgets: vi.fn(),
    budgetStatus: vi.fn(),
    createBudget: vi.fn(),
    updateBudget: vi.fn(),
    deleteBudget: vi.fn(),
  },
}));

const budget = {
  id: 'budget-1',
  name: 'Claude monthly',
  scope: 'provider' as const,
  match: 'claude',
  period: 'month' as const,
  limit_usd: 100,
  warning_percent: 80,
  enabled: true,
};
const status = {
  budget_id: 'budget-1',
  spent_usd: 90,
  limit_usd: 100,
  percentage: 90,
  period_start: '2026-07-01',
  period_end: '2026-08-01',
  status: 'warning' as const,
  unpriced_events: 2,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(aiproxyApi.budgets).mockResolvedValue({ budgets: [budget] });
  vi.mocked(aiproxyApi.budgetStatus).mockResolvedValue({ statuses: [status] });
  vi.mocked(aiproxyApi.createBudget).mockResolvedValue({ ...budget, id: 'new' });
  vi.mocked(aiproxyApi.updateBudget).mockResolvedValue(budget);
  vi.mocked(aiproxyApi.deleteBudget).mockResolvedValue({});
});

describe('BudgetsPage', () => {
  it('renders summary status, spend, scope, and unpriced events', async () => {
    renderWithRouter(<BudgetsPage />);

    expect(await screen.findByText('Claude monthly')).toBeInTheDocument();
    expect(screen.getAllByText('Warning')).not.toHaveLength(0);
    expect(screen.getByText('2 unpriced events')).toBeInTheDocument();
    expect(screen.getByText('Provider')).toBeInTheDocument();
  });

  it('shows one create action in the intentional empty state', async () => {
    vi.mocked(aiproxyApi.budgets).mockResolvedValue({ budgets: [] });
    vi.mocked(aiproxyApi.budgetStatus).mockResolvedValue({ statuses: [] });
    renderWithRouter(<BudgetsPage />);

    expect(await screen.findAllByRole('button', { name: 'Create budget' })).toHaveLength(1);
  });

  it('validates a new budget before submission', async () => {
    const user = userEvent.setup();
    vi.mocked(aiproxyApi.budgets).mockResolvedValue({ budgets: [] });
    vi.mocked(aiproxyApi.budgetStatus).mockResolvedValue({ statuses: [] });
    renderWithRouter(<BudgetsPage />);
    await user.click((await screen.findAllByRole('button', { name: 'Create budget' }))[0]);

    await user.clear(screen.getByRole('textbox', { name: 'Name' }));
    await user.click(screen.getByRole('button', { name: 'Save budget' }));

    expect(await screen.findByText('Enter a budget name.')).toBeInTheDocument();
    expect(aiproxyApi.createBudget).not.toHaveBeenCalled();
  });

  it('deletes only after explicit confirmation and reloads status', async () => {
    const user = userEvent.setup();
    renderWithRouter(<BudgetsPage />);
    await user.click(await screen.findByRole('button', { name: 'Delete' }));

    const deleteButtons = screen.getAllByRole('button', { name: 'Delete' });
    await user.click(deleteButtons[deleteButtons.length - 1]);

    await waitFor(() => expect(aiproxyApi.deleteBudget).toHaveBeenCalledWith('budget-1'));
    expect(aiproxyApi.budgets).toHaveBeenCalledTimes(2);
  });
});
it('renders match, limit, and warning validation feedback in sequence', async () => {
  const user = userEvent.setup();
  vi.mocked(aiproxyApi.budgets).mockResolvedValue({ budgets: [] });
  vi.mocked(aiproxyApi.budgetStatus).mockResolvedValue({ statuses: [] });
  renderWithRouter(<BudgetsPage />);
  await user.click(await screen.findByRole('button', { name: 'Create budget' }));
  await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Budget');
  await user.click(screen.getByRole('button', { name: 'Scope' }));
  await user.click(screen.getByRole('option', { name: 'Provider' }));
  await user.click(screen.getByRole('button', { name: 'Save budget' }));
  expect(await screen.findByText('Enter the exact scope match.')).toBeInTheDocument();
  await user.type(screen.getByRole('textbox', { name: 'Exact match' }), 'p');
  await user.clear(screen.getByRole('spinbutton', { name: 'Limit, USD' }));
  await user.click(screen.getByRole('button', { name: 'Save budget' }));
  expect(await screen.findByText('Limit must be greater than zero.')).toBeInTheDocument();
  await user.type(screen.getByRole('spinbutton', { name: 'Limit, USD' }), '1');
  await user.clear(screen.getByRole('spinbutton', { name: 'Warning percentage' }));
  await user.click(screen.getByRole('button', { name: 'Save budget' }));
  expect(
    await screen.findByText('Warning percentage must be between 1 and 100.')
  ).toBeInTheDocument();
});

it('validates every budget input boundary', () => {
  const valid = {
    name: 'Budget',
    scope: 'global' as const,
    match: '',
    period: 'month' as const,
    limit_usd: 10,
    warning_percent: 80,
    enabled: true,
  };
  expect(validateBudgetInput(valid)).toBe('');
  expect(validateBudgetInput({ ...valid, scope: 'provider', match: '' })).toBe('match');
  expect(validateBudgetInput({ ...valid, limit_usd: Number.NaN })).toBe('limit');
  expect(validateBudgetInput({ ...valid, limit_usd: 0 })).toBe('limit');
  expect(validateBudgetInput({ ...valid, warning_percent: Number.NaN })).toBe('warning');
  expect(validateBudgetInput({ ...valid, warning_percent: 0 })).toBe('warning');
  expect(validateBudgetInput({ ...valid, warning_percent: 101 })).toBe('warning');
});

it('renders every status tone, unknown status, period fallback, and summary count', async () => {
  vi.mocked(aiproxyApi.budgets).mockResolvedValue({
    budgets: [
      budget,
      { ...budget, id: 'ok', name: 'OK', scope: 'global', match: '', period: 'day' },
      { ...budget, id: 'over', name: 'Over', scope: 'model', match: 'm', period: 'week' },
      { ...budget, id: 'unknown', name: 'Unknown' },
    ],
  });
  vi.mocked(aiproxyApi.budgetStatus).mockResolvedValue({
    statuses: [
      status,
      { ...status, budget_id: 'ok', status: 'ok', percentage: 20, unpriced_events: 0 },
      {
        ...status,
        budget_id: 'over',
        status: 'exceeded',
        percentage: 150,
        unpriced_events: 1,
        period_end: '',
      },
    ],
  });
  renderWithRouter(<BudgetsPage />);
  expect(await screen.findByText('Over')).toBeInTheDocument();
  expect(screen.getAllByText('Active')).not.toHaveLength(0);
  expect(screen.getAllByText('Exceeded')).not.toHaveLength(0);
  expect(screen.getByText('Unavailable')).toBeInTheDocument();
  expect(screen.getAllByText('—')).not.toHaveLength(0);
});

it.each(['budgets', 'status'])(
  'keeps fulfilled budget data when the %s request fails',
  async (failure) => {
    if (failure === 'budgets')
      vi.mocked(aiproxyApi.budgets).mockRejectedValue(new Error('offline'));
    else vi.mocked(aiproxyApi.budgetStatus).mockRejectedValue(new Error('offline'));
    renderWithRouter(<BudgetsPage />);
    expect(await screen.findByText('Some budget state is unavailable.')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }));
    expect(aiproxyApi.budgets).toHaveBeenCalledTimes(2);
  }
);

it('creates a scoped budget with all editor controls', async () => {
  const user = userEvent.setup();
  vi.mocked(aiproxyApi.budgets).mockResolvedValue({ budgets: [] });
  vi.mocked(aiproxyApi.budgetStatus).mockResolvedValue({ statuses: [] });
  renderWithRouter(<BudgetsPage />);
  await user.click(await screen.findByRole('button', { name: 'Create budget' }));
  await user.type(screen.getByRole('textbox', { name: 'Name' }), 'New');
  await user.click(screen.getByRole('button', { name: 'Scope' }));
  await user.click(screen.getByRole('option', { name: 'Provider' }));
  await user.type(screen.getByRole('textbox', { name: 'Exact match' }), 'claude');
  await user.click(screen.getByRole('button', { name: 'Period' }));
  await user.click(screen.getByRole('option', { name: 'Day' }));
  await user.clear(screen.getByRole('spinbutton', { name: 'Limit, USD' }));
  await user.type(screen.getByRole('spinbutton', { name: 'Limit, USD' }), '25');
  await user.clear(screen.getByRole('spinbutton', { name: 'Warning percentage' }));
  await user.type(screen.getByRole('spinbutton', { name: 'Warning percentage' }), '75');
  await user.click(screen.getByRole('switch', { name: 'Enabled' }));
  await user.click(screen.getByRole('button', { name: 'Save budget' }));
  await waitFor(() =>
    expect(aiproxyApi.createBudget).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'New',
        scope: 'provider',
        match: 'claude',
        period: 'day',
        limit_usd: 25,
        warning_percent: 75,
        enabled: false,
      })
    )
  );
});

it('edits an existing budget and clears match when its scope becomes global', async () => {
  const user = userEvent.setup();
  renderWithRouter(<BudgetsPage />);
  await user.click(await screen.findByRole('button', { name: 'Edit' }));
  await user.click(screen.getByRole('button', { name: 'Scope' }));
  await user.click(screen.getByRole('option', { name: 'Global' }));
  await user.click(screen.getByRole('button', { name: 'Save budget' }));
  await waitFor(() =>
    expect(aiproxyApi.updateBudget).toHaveBeenCalledWith(
      'budget-1',
      expect.objectContaining({ match: '', scope: 'global' })
    )
  );
});

it('reports save, toggle, and delete failures and supports cancellation', async () => {
  const user = userEvent.setup();
  vi.mocked(aiproxyApi.updateBudget).mockRejectedValueOnce(new Error('save'));
  renderWithRouter(<BudgetsPage />);
  await user.click(await screen.findByRole('button', { name: 'Edit' }));
  await user.click(screen.getByRole('button', { name: 'Save budget' }));
  expect(
    await screen.findByText('Budget was not saved. Check its scope, limit, and uniqueness.')
  ).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Close' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

  vi.mocked(aiproxyApi.updateBudget).mockRejectedValueOnce(new Error('toggle'));
  await user.click(screen.getByRole('switch', { name: 'Enabled' }));
  expect(await screen.findByText('Budget status was not updated.')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Delete' }));
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(aiproxyApi.deleteBudget).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  vi.mocked(aiproxyApi.deleteBudget).mockRejectedValueOnce(new Error('delete'));
  await user.click(screen.getByRole('button', { name: 'Delete' }));
  const deletes = screen.getAllByRole('button', { name: 'Delete' });
  await user.click(deletes[deletes.length - 1]);
  expect(await screen.findByText('Budget was not deleted.')).toBeInTheDocument();
});

it('toggles an existing budget and refreshes from the workspace action', async () => {
  const user = userEvent.setup();
  renderWithRouter(<BudgetsPage />);
  await screen.findByText('Claude monthly');
  await user.click(screen.getByRole('switch', { name: 'Enabled' }));
  await waitFor(() =>
    expect(aiproxyApi.updateBudget).toHaveBeenCalledWith(
      'budget-1',
      expect.objectContaining({ enabled: false })
    )
  );
  await waitFor(() => expect(vi.mocked(aiproxyApi.budgets)).toHaveBeenCalledTimes(2));
  await user.click(screen.getByRole('button', { name: 'Refresh' }));
  await waitFor(() => expect(vi.mocked(aiproxyApi.budgets)).toHaveBeenCalledTimes(3));
});
