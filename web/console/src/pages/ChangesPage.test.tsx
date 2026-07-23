import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithRouter, screen, userEvent, waitFor } from '@/test/utils';
import { ChangesPage } from './ChangesPage';
import { aiproxyApi } from '@/services/api/aiproxy';

vi.mock('@/services/api/aiproxy', () => ({
  aiproxyApi: { revisions: vi.fn(), revision: vi.fn(), restore: vi.fn() },
}));

const revision = {
  id: 'rev-1',
  created_at: '2026-07-23T12:00:00Z',
  actor_ip: '127.0.0.1',
  management_path: '/config',
  action: 'update',
  before_sha256: 'before',
  after_sha256: 'after-hash',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(aiproxyApi.revisions).mockResolvedValue({
    revisions: [revision],
    current_sha256: 'current-hash',
  });
  vi.mocked(aiproxyApi.revision).mockResolvedValue({
    ...revision,
    diff: '- secret: [redacted]\n+ secret: [redacted]',
  });
  vi.mocked(aiproxyApi.restore).mockResolvedValue({});
});

describe('ChangesPage', () => {
  it('loads a revision into the desktop inspector and renders only the redacted diff', async () => {
    const user = userEvent.setup();
    renderWithRouter(<ChangesPage />);

    await user.click(await screen.findByRole('button', { name: /2026/ }));

    expect(await screen.findByLabelText('Configuration diff')).toHaveTextContent('[redacted]');
    expect(screen.getAllByText('after-hash')).not.toHaveLength(0);
  });

  it('restores with the current SHA precondition and reloads revisions', async () => {
    const user = userEvent.setup();
    renderWithRouter(<ChangesPage />);
    await user.click(await screen.findByRole('button', { name: /2026/ }));
    await user.click(await screen.findByRole('button', { name: 'Restore this revision' }));

    await user.click(screen.getByRole('button', { name: 'Restore' }));

    await waitFor(() => expect(aiproxyApi.restore).toHaveBeenCalledWith('rev-1', 'current-hash'));
    expect(aiproxyApi.revisions).toHaveBeenCalledTimes(2);
  });

  it('renders an intentional empty revision state', async () => {
    vi.mocked(aiproxyApi.revisions).mockResolvedValue({
      revisions: [],
      current_sha256: 'current-hash',
    });
    renderWithRouter(<ChangesPage />);

    expect(await screen.findByText('No recorded changes')).toBeInTheDocument();
  });
});
