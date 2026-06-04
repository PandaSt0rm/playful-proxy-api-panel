import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderWithRouter, screen, waitFor, userEvent } from '@/test/utils';
import type { LogsQuery, LogsResponse, LogStorageResponse } from '@/services/api/logs';
import { useAuthStore, useConfigStore, useNotificationStore } from '@/stores';
import { LogsPage } from './LogsPage';

// Mock the typed API boundary the page owns. Every method is a spy so tests can
// assert request parameters and drive responses deterministically.
const fetchLogs = vi.fn<(params?: LogsQuery) => Promise<LogsResponse>>();
const fetchStorage = vi.fn<() => Promise<LogStorageResponse>>();
const clearLogs = vi.fn();
const fetchErrorLogs = vi.fn();
const downloadErrorLog = vi.fn();
const downloadRequestLogById = vi.fn();

vi.mock('@/services/api/logs', () => ({
  logsApi: {
    fetchLogs: (params?: LogsQuery) => fetchLogs(params),
    fetchStorage: () => fetchStorage(),
    clearLogs: (target: unknown) => clearLogs(target),
    fetchErrorLogs: () => fetchErrorLogs(),
    downloadErrorLog: (name: string) => downloadErrorLog(name),
    downloadRequestLogById: (id: string) => downloadRequestLogById(id),
  },
}));

const emptyStorage: LogStorageResponse = {
  'log-directory': '/var/log/app',
  'total-size': 0,
  'total-files': 0,
  application: { size: 0, files: 0 },
  request: { size: 0, files: 0 },
  'error-request': { size: 0, files: 0 },
  temporary: { size: 0, files: 0 },
};

const logsResponse = (overrides: Partial<LogsResponse> = {}): LogsResponse => ({
  lines: [],
  'line-count': 0,
  'latest-timestamp': 0,
  ...overrides,
});

const setConnected = () => {
  useAuthStore.setState({ connectionStatus: 'connected' });
};

beforeEach(() => {
  fetchLogs.mockReset();
  fetchStorage.mockReset();
  clearLogs.mockReset();
  fetchErrorLogs.mockReset();
  downloadErrorLog.mockReset();
  downloadRequestLogById.mockReset();

  fetchLogs.mockResolvedValue(logsResponse());
  fetchStorage.mockResolvedValue(emptyStorage);
  fetchErrorLogs.mockResolvedValue({ files: [] });

  localStorage.clear();
  useConfigStore.setState({ config: null });
  useAuthStore.setState({ connectionStatus: 'disconnected' });
  useNotificationStore.setState({
    notifications: [],
    confirmation: { isOpen: false, isLoading: false, options: null },
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('LogsPage initial loading', () => {
  it('requests the full log set without an after parameter on first connect', async () => {
    setConnected();

    renderWithRouter(<LogsPage />);

    await waitFor(() => expect(fetchLogs).toHaveBeenCalledTimes(1));
    expect(fetchLogs).toHaveBeenCalledWith({});
  });

  it('does not fetch logs while the connection status is disconnected', () => {
    renderWithRouter(<LogsPage />);

    expect(fetchLogs).not.toHaveBeenCalled();
  });

  it('renders the parsed message text of a returned log line', async () => {
    setConnected();
    fetchLogs.mockResolvedValue(
      logsResponse({ lines: ['2025-01-02 03:04:05 info server booted ok'] })
    );

    renderWithRouter(<LogsPage />);

    expect(await screen.findByText('server booted ok')).toBeInTheDocument();
  });

  it('renders the empty state when no log lines are returned', async () => {
    setConnected();

    renderWithRouter(<LogsPage />);

    expect(await screen.findByText('No Logs Available')).toBeInTheDocument();
  });
});

describe('LogsPage search filtering', () => {
  it('hides log lines that do not match the search query', async () => {
    const user = userEvent.setup();
    setConnected();
    fetchLogs.mockResolvedValue(
      logsResponse({ lines: ['info alpha first line', 'info beta second line'] })
    );
    renderWithRouter(<LogsPage />);
    await screen.findByText('alpha first line');

    await user.type(screen.getByPlaceholderText('Search logs by content or keyword'), 'beta');

    await waitFor(() => expect(screen.queryByText('alpha first line')).not.toBeInTheDocument());
  });

  it('keeps log lines that match the search query', async () => {
    const user = userEvent.setup();
    setConnected();
    fetchLogs.mockResolvedValue(
      logsResponse({ lines: ['info alpha first line', 'info beta second line'] })
    );
    renderWithRouter(<LogsPage />);
    await screen.findByText('alpha first line');

    await user.type(screen.getByPlaceholderText('Search logs by content or keyword'), 'beta');

    expect(await screen.findByText('beta second line')).toBeInTheDocument();
  });

  it('shows the search-empty state when no lines match the query', async () => {
    const user = userEvent.setup();
    setConnected();
    fetchLogs.mockResolvedValue(logsResponse({ lines: ['info only line here'] }));
    renderWithRouter(<LogsPage />);
    await screen.findByText('only line here');

    await user.type(
      screen.getByPlaceholderText('Search logs by content or keyword'),
      'nomatchxyz'
    );

    expect(await screen.findByText('No matching logs found')).toBeInTheDocument();
  });
});

describe('LogsPage hide-management-logs filter', () => {
  it('hides lines containing the management API prefix by default', async () => {
    setConnected();
    fetchLogs.mockResolvedValue(
      logsResponse({
        lines: ['info request to /v0/management/config', 'info plain user request line'],
      })
    );

    renderWithRouter(<LogsPage />);

    await screen.findByText('plain user request line');
    expect(screen.queryByText(/management\/config/)).not.toBeInTheDocument();
  });

  it('shows management lines after the hide toggle is switched off', async () => {
    const user = userEvent.setup();
    setConnected();
    fetchLogs.mockResolvedValue(
      logsResponse({
        lines: ['info request to /v0/management/config', 'info plain user request line'],
      })
    );
    renderWithRouter(<LogsPage />);
    await screen.findByText('plain user request line');

    await user.click(screen.getByRole('checkbox', { name: /Hide.*logs/i }));

    expect(await screen.findByText(/management\/config/)).toBeInTheDocument();
  });
});

describe('LogsPage structured method filter', () => {
  it('keeps only lines matching the selected HTTP method filter', async () => {
    const user = userEvent.setup();
    setConnected();
    fetchLogs.mockResolvedValue(
      logsResponse({
        lines: ['info GET /v1/models loaded', 'info POST /v1/chat created'],
      })
    );
    renderWithRouter(<LogsPage />);
    await screen.findByText('/v1/models');

    await user.click(screen.getByRole('button', { name: /^GET \(1\)$/ }));

    await waitFor(() => expect(screen.queryByText('/v1/chat')).not.toBeInTheDocument());
  });
});

describe('LogsPage raw / structured toggle', () => {
  it('renders parsed log rows by default rather than raw preformatted text', async () => {
    setConnected();
    fetchLogs.mockResolvedValue(logsResponse({ lines: ['info structured row content'] }));

    renderWithRouter(<LogsPage />);

    expect(await screen.findByText('structured row content')).toBeInTheDocument();
  });

  it('renders the original raw text inside a preformatted block when raw logs are enabled', async () => {
    const user = userEvent.setup();
    setConnected();
    fetchLogs.mockResolvedValue(logsResponse({ lines: ['2025-01-02 03:04:05 info raw line body'] }));
    renderWithRouter(<LogsPage />);
    await screen.findByText('raw line body');

    await user.click(screen.getByRole('checkbox', { name: /Show Raw Logs/i }));

    expect(
      await screen.findByText('2025-01-02 03:04:05 info raw line body')
    ).toBeInTheDocument();
  });
});

describe('LogsPage auto refresh polling', () => {
  it('does not poll for incremental logs while auto refresh is off', async () => {
    vi.useFakeTimers();
    setConnected();
    fetchLogs.mockResolvedValue(logsResponse({ lines: ['info initial'] }));
    renderWithRouter(<LogsPage />);
    await vi.waitFor(() => expect(fetchLogs).toHaveBeenCalledTimes(1));

    await vi.advanceTimersByTimeAsync(8000);

    expect(fetchLogs).toHaveBeenCalledTimes(1);
  });

  it('passes the latest timestamp as the after parameter on the first incremental poll', async () => {
    vi.useFakeTimers();
    setConnected();
    localStorage.setItem('logsPage.autoRefresh', 'true');
    fetchLogs.mockResolvedValue(
      logsResponse({ lines: ['info initial'], 'latest-timestamp': 1700000000 })
    );
    renderWithRouter(<LogsPage />);
    await vi.waitFor(() => expect(fetchLogs).toHaveBeenCalledTimes(1));

    await vi.advanceTimersByTimeAsync(8000);

    expect(fetchLogs).toHaveBeenLastCalledWith({ after: 1700000000 });
  });

  it('omits the after parameter on incremental polls when no positive latest timestamp was seen', async () => {
    vi.useFakeTimers();
    setConnected();
    localStorage.setItem('logsPage.autoRefresh', 'true');
    fetchLogs.mockResolvedValue(logsResponse({ lines: ['info initial'], 'latest-timestamp': 0 }));
    renderWithRouter(<LogsPage />);
    await vi.waitFor(() => expect(fetchLogs).toHaveBeenCalledTimes(1));

    await vi.advanceTimersByTimeAsync(8000);

    expect(fetchLogs).toHaveBeenLastCalledWith({});
  });
});

describe('LogsPage error handling', () => {
  it('shows the load error message when the full log fetch rejects', async () => {
    setConnected();
    fetchLogs.mockRejectedValue(new Error('boom upstream'));

    renderWithRouter(<LogsPage />);

    expect(await screen.findByText('boom upstream')).toBeInTheDocument();
  });

  it('falls back to the generic load error text when the rejection has no message', async () => {
    setConnected();
    fetchLogs.mockRejectedValue({});

    renderWithRouter(<LogsPage />);

    expect(await screen.findByText('Failed to load logs')).toBeInTheDocument();
  });
});

describe('LogsPage error logs tab', () => {
  it('lists error log files returned by the error logs endpoint', async () => {
    const user = userEvent.setup();
    setConnected();
    fetchErrorLogs.mockResolvedValue({ files: [{ name: 'error-2025.log', size: 2048 }] });
    renderWithRouter(<LogsPage />);
    await waitFor(() => expect(fetchLogs).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: 'Error Request Logs' }));

    expect(await screen.findByText('error-2025.log')).toBeInTheDocument();
  });

  it('shows the empty error logs hint when no files are returned', async () => {
    const user = userEvent.setup();
    setConnected();
    fetchErrorLogs.mockResolvedValue({ files: [] });
    renderWithRouter(<LogsPage />);
    await waitFor(() => expect(fetchLogs).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: 'Error Request Logs' }));

    expect(await screen.findByText('No error request log files found')).toBeInTheDocument();
  });
});
