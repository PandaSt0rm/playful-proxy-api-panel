import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, userEvent } from '@/test/utils';
import { ProviderTestResultBox, type ProviderTestResultEntry } from './ProviderTestResultBox';

// --- Boundary mocks -------------------------------------------------------

const showNotification = vi.fn();
vi.mock('@/stores', () => ({
  useNotificationStore: () => ({ showNotification }),
}));

const copyToClipboard = vi.fn();
vi.mock('@/utils/clipboard', () => ({
  copyToClipboard: (...args: unknown[]) => copyToClipboard(...args),
}));

// --- Test harness ---------------------------------------------------------

const buildEntry = (overrides: Partial<ProviderTestResultEntry> = {}): ProviderTestResultEntry => ({
  id: 'entry-1',
  status: 'success',
  label: 'Key #1',
  message: 'Test succeeded. The model responded.',
  meta: 'HTTP 200 · 532 ms · gpt-4o',
  detail: '{\n  "choices": []\n}',
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ProviderTestResultBox', () => {
  it('renders nothing when there are no entries', () => {
    const { container } = render(<ProviderTestResultBox title="Test Results" entries={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders the title, label, meta, message, and full detail body', () => {
    render(<ProviderTestResultBox title="Test Results" entries={[buildEntry()]} />);

    expect(screen.getByText('Test Results')).toBeInTheDocument();
    expect(screen.getByText('Key #1')).toBeInTheDocument();
    expect(screen.getByText('HTTP 200 · 532 ms · gpt-4o')).toBeInTheDocument();
    expect(screen.getByText('Test succeeded. The model responded.')).toBeInTheDocument();
    expect(screen.getByText(/"choices": \[\]/)).toBeInTheDocument();
  });

  it('shows the empty-body placeholder when a response had no body', () => {
    render(<ProviderTestResultBox title="Test Results" entries={[buildEntry({ detail: '' })]} />);

    expect(screen.getByText('(empty response body)')).toBeInTheDocument();
  });

  it('omits the detail block and collapse toggle when no response was received', () => {
    render(
      <ProviderTestResultBox
        title="Test Results"
        entries={[buildEntry({ status: 'error', detail: undefined, meta: undefined })]}
      />
    );

    expect(screen.queryByRole('button', { name: 'Collapse' })).not.toBeInTheDocument();
    expect(screen.queryByText('(empty response body)')).not.toBeInTheDocument();
  });

  it('collapses and re-expands the detail body via the toggle', async () => {
    const user = userEvent.setup();
    render(<ProviderTestResultBox title="Test Results" entries={[buildEntry()]} />);

    await user.click(screen.getByRole('button', { name: 'Collapse' }));
    expect(screen.queryByText(/"choices": \[\]/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Expand' }));
    expect(screen.getByText(/"choices": \[\]/)).toBeInTheDocument();
  });

  it('copies label, meta, message, and detail and notifies on success', async () => {
    const user = userEvent.setup();
    copyToClipboard.mockResolvedValue(true);
    render(<ProviderTestResultBox title="Test Results" entries={[buildEntry()]} />);

    await user.click(screen.getByRole('button', { name: 'Copy' }));

    expect(copyToClipboard).toHaveBeenCalledWith(
      'Key #1\nHTTP 200 · 532 ms · gpt-4o\nTest succeeded. The model responded.\n{\n  "choices": []\n}'
    );
    expect(showNotification).toHaveBeenCalledWith('Test result copied to clipboard', 'success');
  });

  it('notifies with an error when copying fails', async () => {
    const user = userEvent.setup();
    copyToClipboard.mockResolvedValue(false);
    render(<ProviderTestResultBox title="Test Results" entries={[buildEntry()]} />);

    await user.click(screen.getByRole('button', { name: 'Copy' }));

    expect(showNotification).toHaveBeenCalledWith('Copy failed', 'error');
  });

  it('renders one entry per result with independent labels', () => {
    render(
      <ProviderTestResultBox
        title="Test Results"
        entries={[
          buildEntry({ id: 'k-0', label: 'Key #1' }),
          buildEntry({ id: 'k-1', label: 'Key #2', status: 'error', message: '400 Unknown Model' }),
        ]}
      />
    );

    expect(screen.getByText('Key #1')).toBeInTheDocument();
    expect(screen.getByText('Key #2')).toBeInTheDocument();
    expect(screen.getByText('400 Unknown Model')).toBeInTheDocument();
  });
});
