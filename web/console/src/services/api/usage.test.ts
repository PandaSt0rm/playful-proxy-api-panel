import { describe, it, expect, vi, beforeEach } from 'vitest';

import { usageApi } from './usage';
import { apiClient } from './client';
import type { UsageExportPayload, UsageModelPrice, UsageAPIKeyAlias } from '@/types';

vi.mock('./client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    getRaw: vi.fn(),
  },
}));

const mockedGet = vi.mocked(apiClient.get);
const mockedPost = vi.mocked(apiClient.post);
const mockedPut = vi.mocked(apiClient.put);
const mockedDelete = vi.mocked(apiClient.delete);
const mockedGetRaw = vi.mocked(apiClient.getRaw);

const USAGE_TIMEOUT_MS = 20 * 1000;

beforeEach(() => {
  mockedGet.mockReset();
  mockedPost.mockReset();
  mockedPut.mockReset();
  mockedDelete.mockReset();
  mockedGetRaw.mockReset();
});

describe('usageApi.getStatistics', () => {
  it('requests /usage with the usage timeout and undefined params by default', async () => {
    mockedGet.mockResolvedValue({});

    await usageApi.getStatistics();

    expect(mockedGet).toHaveBeenCalledWith('/usage', {
      timeout: USAGE_TIMEOUT_MS,
      params: undefined,
    });
  });

  it('forwards provided params', async () => {
    mockedGet.mockResolvedValue({});

    await usageApi.getStatistics({ range: '7d', limit: 10 });

    expect(mockedGet).toHaveBeenCalledWith('/usage', {
      timeout: USAGE_TIMEOUT_MS,
      params: { range: '7d', limit: 10 },
    });
  });

  it('returns the statistics body unchanged', async () => {
    const body = { total: 42 };
    mockedGet.mockResolvedValue(body);

    const result = await usageApi.getStatistics();

    expect(result).toBe(body);
  });
});

describe('usageApi.getEvents', () => {
  it('requests /usage/events with params and timeout', async () => {
    mockedGet.mockResolvedValue({});

    await usageApi.getEvents({ cursor: 5 });

    expect(mockedGet).toHaveBeenCalledWith('/usage/events', {
      timeout: USAGE_TIMEOUT_MS,
      params: { cursor: 5 },
    });
  });
});

describe('usageApi.getSummary', () => {
  it('requests /usage/summary with params and timeout', async () => {
    mockedGet.mockResolvedValue({});

    await usageApi.getSummary();

    expect(mockedGet).toHaveBeenCalledWith('/usage/summary', {
      timeout: USAGE_TIMEOUT_MS,
      params: undefined,
    });
  });
});

describe('usageApi.getStatus', () => {
  it('requests /usage/status with the usage timeout', async () => {
    mockedGet.mockResolvedValue({});

    await usageApi.getStatus();

    expect(mockedGet).toHaveBeenCalledWith('/usage/status', { timeout: USAGE_TIMEOUT_MS });
  });
});

describe('usageApi.pruneEvents', () => {
  it('posts to /usage/prune with no body and the usage timeout', async () => {
    mockedPost.mockResolvedValue({});

    await usageApi.pruneEvents();

    expect(mockedPost).toHaveBeenCalledWith('/usage/prune', undefined, {
      timeout: USAGE_TIMEOUT_MS,
    });
  });
});

describe('usageApi.exportStatistics', () => {
  it('requests /usage/export with the usage timeout', async () => {
    mockedGet.mockResolvedValue({});

    await usageApi.exportStatistics();

    expect(mockedGet).toHaveBeenCalledWith('/usage/export', { timeout: USAGE_TIMEOUT_MS });
  });
});

describe('usageApi.importStatistics', () => {
  it('posts the payload to /usage/import with the usage timeout', async () => {
    mockedPost.mockResolvedValue({});
    const payload = { version: 1, events: [] } as unknown as UsageExportPayload;

    await usageApi.importStatistics(payload);

    expect(mockedPost).toHaveBeenCalledWith('/usage/import', payload, {
      timeout: USAGE_TIMEOUT_MS,
    });
  });
});

describe('usageApi.importEvents', () => {
  it('posts ndjson content with the x-ndjson content type header', async () => {
    mockedPost.mockResolvedValue({});

    await usageApi.importEvents('{"a":1}\n{"a":2}');

    expect(mockedPost).toHaveBeenCalledWith('/usage/import', '{"a":1}\n{"a":2}', {
      timeout: USAGE_TIMEOUT_MS,
      headers: { 'Content-Type': 'application/x-ndjson' },
    });
  });
});

describe('usageApi.exportEvents', () => {
  it('requests the raw blob export with jsonl format and no extra params', async () => {
    mockedGetRaw.mockResolvedValue({ data: new Blob() });

    await usageApi.exportEvents();

    expect(mockedGetRaw).toHaveBeenCalledWith('/usage/export', {
      timeout: USAGE_TIMEOUT_MS,
      responseType: 'blob',
      params: { format: 'jsonl' },
    });
  });

  it('merges provided params and forces format to jsonl', async () => {
    mockedGetRaw.mockResolvedValue({ data: new Blob() });

    await usageApi.exportEvents({ range: '30d' });

    expect(mockedGetRaw).toHaveBeenCalledWith('/usage/export', {
      timeout: USAGE_TIMEOUT_MS,
      responseType: 'blob',
      params: { range: '30d', format: 'jsonl' },
    });
  });

  it('overrides a caller-supplied format with jsonl', async () => {
    mockedGetRaw.mockResolvedValue({ data: new Blob() });

    await usageApi.exportEvents({ format: 'csv' });

    expect(mockedGetRaw).toHaveBeenCalledWith('/usage/export', {
      timeout: USAGE_TIMEOUT_MS,
      responseType: 'blob',
      params: { format: 'jsonl' },
    });
  });
});

describe('usageApi.getModelPrices', () => {
  it('requests /usage/model-prices with the usage timeout', async () => {
    mockedGet.mockResolvedValue({});

    await usageApi.getModelPrices();

    expect(mockedGet).toHaveBeenCalledWith('/usage/model-prices', { timeout: USAGE_TIMEOUT_MS });
  });
});

describe('usageApi.saveModelPrices', () => {
  it('puts the prices wrapped under a prices key', async () => {
    mockedPut.mockResolvedValue({ saved: 0 });
    const prices = [{ model: 'gpt-4', input: 1, output: 2 }] as unknown as UsageModelPrice[];

    await usageApi.saveModelPrices(prices);

    expect(mockedPut).toHaveBeenCalledWith(
      '/usage/model-prices',
      { prices },
      { timeout: USAGE_TIMEOUT_MS }
    );
  });

  it('returns the saved count from the client', async () => {
    mockedPut.mockResolvedValue({ saved: 3 });

    const result = await usageApi.saveModelPrices([]);

    expect(result).toEqual({ saved: 3 });
  });
});

describe('usageApi.syncModelPrices', () => {
  it('posts to /usage/model-prices/sync with no body and the usage timeout', async () => {
    mockedPost.mockResolvedValue({ saved: 0, source: 's', url: 'u' });

    await usageApi.syncModelPrices();

    expect(mockedPost).toHaveBeenCalledWith('/usage/model-prices/sync', undefined, {
      timeout: USAGE_TIMEOUT_MS,
    });
  });
});

describe('usageApi.getAPIKeyAliases', () => {
  it('requests /usage/api-key-aliases with the usage timeout', async () => {
    mockedGet.mockResolvedValue({});

    await usageApi.getAPIKeyAliases();

    expect(mockedGet).toHaveBeenCalledWith('/usage/api-key-aliases', { timeout: USAGE_TIMEOUT_MS });
  });
});

describe('usageApi.saveAPIKeyAlias', () => {
  it('puts the alias object directly with the usage timeout', async () => {
    mockedPut.mockResolvedValue({ saved: 1 });
    const alias = { hash: 'abc', alias: 'mykey' } as unknown as UsageAPIKeyAlias;

    await usageApi.saveAPIKeyAlias(alias);

    expect(mockedPut).toHaveBeenCalledWith('/usage/api-key-aliases', alias, {
      timeout: USAGE_TIMEOUT_MS,
    });
  });
});

describe('usageApi.deleteAPIKeyAlias', () => {
  it('deletes the URL-encoded hash path with the usage timeout', async () => {
    mockedDelete.mockResolvedValue({ deleted: true });

    await usageApi.deleteAPIKeyAlias('a/b c');

    expect(mockedDelete).toHaveBeenCalledWith('/usage/api-key-aliases/a%2Fb%20c', {
      timeout: USAGE_TIMEOUT_MS,
    });
  });

  it('returns the deleted flag from the client', async () => {
    mockedDelete.mockResolvedValue({ deleted: false });

    const result = await usageApi.deleteAPIKeyAlias('abc');

    expect(result).toEqual({ deleted: false });
  });
});
