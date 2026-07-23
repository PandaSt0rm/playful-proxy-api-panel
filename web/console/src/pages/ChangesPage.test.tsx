import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderWithRouter, screen, userEvent, waitFor } from '@/test/utils';
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
  it('refreshes from the workspace action', async () => {
    const user = userEvent.setup();
    renderWithRouter(<ChangesPage />);
    await screen.findByRole('button', { name: /2026/ });
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(aiproxyApi.revisions).toHaveBeenCalledTimes(2));
  });

  it('cancels a pending restore without calling the API', async () => {
    const user = userEvent.setup();
    renderWithRouter(<ChangesPage />);
    await user.click(await screen.findByRole('button', { name: /2026/ }));
    await user.click(await screen.findByRole('button', { name: 'Restore this revision' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(aiproxyApi.restore).not.toHaveBeenCalled();
  });

  it('shows a load error and retries the revision request', async () => {
    const user = userEvent.setup();
    vi.mocked(aiproxyApi.revisions)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ revisions: [], current_sha256: 'new' });
    renderWithRouter(<ChangesPage />);
    expect(await screen.findByText('Configuration history is unavailable.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('No recorded changes')).toBeInTheDocument();
  });

  it.each([
    [{ status: 404 }, 'The selected revision no longer exists.'],
    [{ status: 'bad' }, 'This revision could not be loaded.'],
    [null, 'This revision could not be loaded.'],
  ])('maps revision inspection failure %# to its operator message', async (reason, expected) => {
    const user = userEvent.setup();
    vi.mocked(aiproxyApi.revision).mockRejectedValue(reason);
    renderWithRouter(<ChangesPage />);
    await user.click(await screen.findByRole('button', { name: /2026/ }));
    expect(await screen.findByText(expected)).toBeInTheDocument();
  });

  it.each([
    [404, 'The selected revision no longer exists.'],
    [409, 'Restore was not applied because the current configuration changed.'],
    [500, 'Restore was not applied. Refresh and compare again.'],
  ])(
    'maps restore status %s without dismissing the selected revision',
    async (status, expected) => {
      const user = userEvent.setup();
      vi.mocked(aiproxyApi.restore).mockRejectedValue({ status });
      renderWithRouter(<ChangesPage />);
      await user.click(await screen.findByRole('button', { name: /2026/ }));
      await user.click(await screen.findByRole('button', { name: 'Restore this revision' }));
      await user.click(screen.getByRole('button', { name: 'Restore' }));
      expect(await screen.findByText(expected)).toBeInTheDocument();
    }
  );

  it('filters revisions across indexed fields and restores the full list when cleared', async () => {
    const user = userEvent.setup();
    vi.mocked(aiproxyApi.revisions).mockResolvedValue({
      revisions: [
        revision,
        {
          ...revision,
          id: 'rev-2',
          action: 'delete',
          management_path: '/auth-files',
          actor_ip: '10.0.0.2',
          after_sha256: 'second',
        },
      ],
      current_sha256: 'current-hash',
    });
    renderWithRouter(<ChangesPage />);
    const filter = await screen.findByRole('textbox', { name: 'Filter revisions' });
    await user.type(filter, 'auth-files');
    expect(screen.getByText('/auth-files')).toBeInTheDocument();
    expect(screen.queryByText('/config')).not.toBeInTheDocument();
    await user.clear(filter);
    expect(screen.getByText('/config')).toBeInTheDocument();
  });

  it('uses the compact drawer and reacts to breakpoint changes', async () => {
    const user = userEvent.setup();
    let listener: (() => void) | undefined;
    const media = {
      matches: true,
      addEventListener: vi.fn((_name: string, next: () => void) => {
        listener = next;
      }),
      removeEventListener: vi.fn(),
    };
    vi.spyOn(window, 'matchMedia').mockReturnValue(media as never);
    const rendered = renderWithRouter(<ChangesPage />);
    await user.click(await screen.findByRole('button', { name: /2026/ }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /2026/ }));
    media.matches = false;
    act(() => listener?.());
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    rendered.unmount();
    expect(media.removeEventListener).toHaveBeenCalled();
  });
});
