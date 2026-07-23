import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithRouter, screen, userEvent, waitFor } from '@/test/utils';
import { BudgetsPage } from './BudgetsPage';
import { aiproxyApi } from '@/services/api/aiproxy';

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
