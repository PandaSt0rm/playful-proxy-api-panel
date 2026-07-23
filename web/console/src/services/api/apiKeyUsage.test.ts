import { describe, it, expect, vi, beforeEach } from 'vitest';

import { apiKeyUsageApi } from './apiKeyUsage';
import { apiClient } from './client';
import type { ApiKeyUsageResponse } from '@/utils/recentRequests';

vi.mock('./client', () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

const mockedGet = vi.mocked(apiClient.get);

beforeEach(() => {
  mockedGet.mockReset();
});

describe('apiKeyUsageApi.getUsage', () => {
  it('reads the /api-key-usage endpoint with a 15 second timeout', async () => {
    mockedGet.mockResolvedValue({} as ApiKeyUsageResponse);

    await apiKeyUsageApi.getUsage();

    expect(mockedGet).toHaveBeenCalledWith('/api-key-usage', { timeout: 15000 });
  });

  it('returns the response payload unchanged', async () => {
    const payload = { entries: [{ key: 'k1', count: 3 }] } as unknown as ApiKeyUsageResponse;
    mockedGet.mockResolvedValue(payload);

    const result = await apiKeyUsageApi.getUsage();

    expect(result).toBe(payload);
  });

  it('propagates errors raised by the client', async () => {
    mockedGet.mockRejectedValue(new Error('timeout'));

    await expect(apiKeyUsageApi.getUsage()).rejects.toThrow('timeout');
  });
});
