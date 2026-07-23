import { describe, it, expect, vi, beforeEach } from 'vitest';

import { versionApi } from './version';
import { apiClient } from './client';

vi.mock('./client', () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

const mockedGet = vi.mocked(apiClient.get);

beforeEach(() => {
  mockedGet.mockReset();
});

describe('versionApi.checkLatest', () => {
  it('reads the /latest-version endpoint', async () => {
    mockedGet.mockResolvedValue({});

    await versionApi.checkLatest();

    expect(mockedGet).toHaveBeenCalledWith('/latest-version');
  });

  it('returns the response payload unchanged', async () => {
    const payload = { version: 'v7.1.39', tag: 'latest' };
    mockedGet.mockResolvedValue(payload);

    const result = await versionApi.checkLatest();

    expect(result).toBe(payload);
  });

  it('propagates errors raised by the client', async () => {
    mockedGet.mockRejectedValue(new Error('no version'));

    await expect(versionApi.checkLatest()).rejects.toThrow('no version');
  });
});
