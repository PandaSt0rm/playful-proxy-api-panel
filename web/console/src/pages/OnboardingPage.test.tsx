import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderWithRouter, screen, userEvent, waitFor } from '@/test/utils';
import { OnboardingPage } from './OnboardingPage';
import { aiproxyApi } from '@/services/api/aiproxy';

vi.mock('@/services/api/aiproxy', () => ({ aiproxyApi: { readiness: vi.fn() } }));

beforeEach(() => vi.clearAllMocks());

describe('OnboardingPage', () => {
  it('renders attention checks in failure, warning, then collapsed-pass order', async () => {
    vi.mocked(aiproxyApi.readiness).mockResolvedValue({
      status: 'attention',
      checks: [
        { id: 'pass', required: true, status: 'pass', summary: 'Healthy', action_path: '' },
        {
          id: 'warn',
          required: false,
          status: 'warn',
          summary: 'Review configuration',
          action_path: '/config',
        },
        {
          id: 'fail',
          required: true,
          status: 'fail',
          summary: 'API key missing',
          action_path: '/config',
        },
      ],
    });

    renderWithRouter(<OnboardingPage />);

    const list = await screen.findByRole('heading', { name: 'Operator checks' });
    const rows = list.closest('section')?.querySelectorAll('li');
    expect(rows?.[0]).toHaveTextContent('API key missing');
    expect(rows?.[1]).toHaveTextContent('Review configuration');
    expect(screen.getByText('1 checks passed').closest('details')).not.toHaveAttribute('open');
  });

  it('shows an explicit retry after readiness fails', async () => {
    vi.mocked(aiproxyApi.readiness).mockRejectedValue(new Error('offline'));
    const user = userEvent.setup();
    renderWithRouter(<OnboardingPage />);

    await user.click(await screen.findByRole('button', { name: 'Retry' }));

    expect(aiproxyApi.readiness).toHaveBeenCalledTimes(2);
  });
  it('renders the ready state and redirects after the completion delay', async () => {
    vi.useFakeTimers();
    vi.mocked(aiproxyApi.readiness).mockResolvedValue({ status: 'ready', checks: [] });
    renderWithRouter(<OnboardingPage />, { route: '/readiness' });
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText('Ready')).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });
    vi.useRealTimers();
  });

  it('renders a blocked optional failure without an action link or passed section', async () => {
    vi.mocked(aiproxyApi.readiness).mockResolvedValue({
      status: 'blocked',
      checks: [
        {
          id: 'optional',
          required: false,
          status: 'fail',
          summary: 'Optional failed',
          action_path: '',
        },
      ],
    });
    renderWithRouter(<OnboardingPage />);
    expect(await screen.findByText('Blocked')).toBeInTheDocument();
    expect(screen.getByText('Optional failed')).toBeInTheDocument();
    expect(screen.queryByText(/checks passed/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open' })).not.toBeInTheDocument();
  });

  it('refreshes readiness from the workspace action', async () => {
    const user = userEvent.setup();
    vi.mocked(aiproxyApi.readiness).mockResolvedValue({ status: 'attention', checks: [] });
    renderWithRouter(<OnboardingPage />);
    await screen.findByText('Attention');
    await user.click(screen.getByRole('button', { name: 'Refresh checks' }));
    await waitFor(() => expect(aiproxyApi.readiness).toHaveBeenCalledTimes(2));
  });
});
