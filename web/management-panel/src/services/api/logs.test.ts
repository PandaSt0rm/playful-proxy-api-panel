import { describe, it, expect, vi, beforeEach } from 'vitest';

import { logsApi } from './logs';
import { apiClient } from './client';
import { LOGS_TIMEOUT_MS } from '@/utils/constants';

vi.mock('./client', () => ({
  apiClient: {
    get: vi.fn(),
    delete: vi.fn(),
    getRaw: vi.fn(),
  },
}));

const mockedGet = vi.mocked(apiClient.get);
const mockedDelete = vi.mocked(apiClient.delete);
const mockedGetRaw = vi.mocked(apiClient.getRaw);

beforeEach(() => {
  mockedGet.mockReset();
  mockedDelete.mockReset();
  mockedGetRaw.mockReset();
});

describe('logsApi.fetchLogs', () => {
  it('requests /logs with empty params and logs timeout when called with no argument', async () => {
    mockedGet.mockResolvedValue({ lines: [], 'line-count': 0, 'latest-timestamp': 0 });

    await logsApi.fetchLogs();

    expect(mockedGet).toHaveBeenCalledWith('/logs', { params: {}, timeout: LOGS_TIMEOUT_MS });
  });

  it('forwards the after cursor as a query param', async () => {
    mockedGet.mockResolvedValue({ lines: [], 'line-count': 0, 'latest-timestamp': 0 });

    await logsApi.fetchLogs({ after: 1234 });

    expect(mockedGet).toHaveBeenCalledWith('/logs', { params: { after: 1234 }, timeout: LOGS_TIMEOUT_MS });
  });

  it('returns the response body unchanged', async () => {
    const body = { lines: ['a', 'b'], 'line-count': 2, 'latest-timestamp': 99 };
    mockedGet.mockResolvedValue(body);

    const result = await logsApi.fetchLogs();

    expect(result).toBe(body);
  });

  it('propagates errors from the client', async () => {
    const failure = new Error('network down');
    mockedGet.mockRejectedValue(failure);

    await expect(logsApi.fetchLogs()).rejects.toThrow('network down');
  });
});

describe('logsApi.fetchStorage', () => {
  it('requests /logs/storage with the logs timeout', async () => {
    mockedGet.mockResolvedValue({});

    await logsApi.fetchStorage();

    expect(mockedGet).toHaveBeenCalledWith('/logs/storage', { timeout: LOGS_TIMEOUT_MS });
  });

  it('returns the storage body unchanged', async () => {
    const body = { 'log-directory': '/logs', 'total-size': 10, 'total-files': 2 };
    mockedGet.mockResolvedValue(body);

    const result = await logsApi.fetchStorage();

    expect(result).toBe(body);
  });
});

describe('logsApi.clearLogs', () => {
  it('defaults the target to application when called with no argument', async () => {
    mockedDelete.mockResolvedValue(undefined);

    await logsApi.clearLogs();

    expect(mockedDelete).toHaveBeenCalledWith('/logs', { params: { target: 'application' } });
  });

  it('forwards an explicit all target', async () => {
    mockedDelete.mockResolvedValue(undefined);

    await logsApi.clearLogs('all');

    expect(mockedDelete).toHaveBeenCalledWith('/logs', { params: { target: 'all' } });
  });

  it('forwards an explicit error-request target', async () => {
    mockedDelete.mockResolvedValue(undefined);

    await logsApi.clearLogs('error-request');

    expect(mockedDelete).toHaveBeenCalledWith('/logs', { params: { target: 'error-request' } });
  });
});

describe('logsApi.fetchErrorLogs', () => {
  it('requests /request-error-logs with the logs timeout', async () => {
    mockedGet.mockResolvedValue({ files: [] });

    await logsApi.fetchErrorLogs();

    expect(mockedGet).toHaveBeenCalledWith('/request-error-logs', { timeout: LOGS_TIMEOUT_MS });
  });

  it('returns the error-logs body unchanged', async () => {
    const body = { files: [{ name: 'err.log', size: 5, modified: 3 }] };
    mockedGet.mockResolvedValue(body);

    const result = await logsApi.fetchErrorLogs();

    expect(result).toBe(body);
  });
});

describe('logsApi.downloadErrorLog', () => {
  it('requests the raw blob endpoint with the URL-encoded filename', async () => {
    mockedGetRaw.mockResolvedValue({ data: new Blob() });

    await logsApi.downloadErrorLog('my log.json');

    expect(mockedGetRaw).toHaveBeenCalledWith('/request-error-logs/my%20log.json', {
      responseType: 'blob',
      timeout: LOGS_TIMEOUT_MS,
    });
  });

  it('encodes slashes in the filename to avoid path traversal', async () => {
    mockedGetRaw.mockResolvedValue({ data: new Blob() });

    await logsApi.downloadErrorLog('a/b');

    expect(mockedGetRaw).toHaveBeenCalledWith('/request-error-logs/a%2Fb', {
      responseType: 'blob',
      timeout: LOGS_TIMEOUT_MS,
    });
  });

  it('returns the raw axios response from the client', async () => {
    const raw = { data: new Blob(['x']) };
    mockedGetRaw.mockResolvedValue(raw);

    const result = await logsApi.downloadErrorLog('err.log');

    expect(result).toBe(raw);
  });
});

describe('logsApi.downloadRequestLogById', () => {
  it('requests the raw blob endpoint with the URL-encoded id', async () => {
    mockedGetRaw.mockResolvedValue({ data: new Blob() });

    await logsApi.downloadRequestLogById('id with space');

    expect(mockedGetRaw).toHaveBeenCalledWith('/request-log-by-id/id%20with%20space', {
      responseType: 'blob',
      timeout: LOGS_TIMEOUT_MS,
    });
  });

  it('propagates errors from the client', async () => {
    mockedGetRaw.mockRejectedValue(new Error('not found'));

    await expect(logsApi.downloadRequestLogById('missing')).rejects.toThrow('not found');
  });
});
