import { describe, it, expect, vi, beforeEach } from 'vitest';

import { apiKeysApi } from './apiKeys';
import { apiClient } from './client';

vi.mock('./client', () => ({
  apiClient: {
    get: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockedGet = vi.mocked(apiClient.get);
const mockedPut = vi.mocked(apiClient.put);
const mockedPatch = vi.mocked(apiClient.patch);
const mockedDelete = vi.mocked(apiClient.delete);

beforeEach(() => {
  mockedGet.mockReset();
  mockedPut.mockReset();
  mockedPatch.mockReset();
  mockedDelete.mockReset();
});

describe('apiKeysApi.list', () => {
  it('reads the /api-keys endpoint', async () => {
    mockedGet.mockResolvedValue({ 'api-keys': [] });

    await apiKeysApi.list();

    expect(mockedGet).toHaveBeenCalledWith('/api-keys');
  });

  it('extracts the api-keys array from the kebab-case key', async () => {
    mockedGet.mockResolvedValue({ 'api-keys': ['k1', 'k2'] });

    const result = await apiKeysApi.list();

    expect(result).toEqual(['k1', 'k2']);
  });

  it('falls back to the camelCase apiKeys key', async () => {
    mockedGet.mockResolvedValue({ apiKeys: ['k3'] });

    const result = await apiKeysApi.list();

    expect(result).toEqual(['k3']);
  });

  it('coerces non-string entries to strings', async () => {
    mockedGet.mockResolvedValue({ 'api-keys': [1, true, null] });

    const result = await apiKeysApi.list();

    expect(result).toEqual(['1', 'true', 'null']);
  });

  it('returns an empty list when neither key holds an array', async () => {
    mockedGet.mockResolvedValue({ 'api-keys': 'not-an-array' });

    const result = await apiKeysApi.list();

    expect(result).toEqual([]);
  });

  it('returns an empty list for an empty payload', async () => {
    mockedGet.mockResolvedValue({});

    const result = await apiKeysApi.list();

    expect(result).toEqual([]);
  });
});

describe('apiKeysApi.replace', () => {
  it('puts the raw array of keys', async () => {
    mockedPut.mockResolvedValue(undefined);

    await apiKeysApi.replace(['a', 'b']);

    expect(mockedPut).toHaveBeenCalledWith('/api-keys', ['a', 'b']);
  });
});

describe('apiKeysApi.update', () => {
  it('patches an index/value pair', async () => {
    mockedPatch.mockResolvedValue(undefined);

    await apiKeysApi.update(2, 'new-key');

    expect(mockedPatch).toHaveBeenCalledWith('/api-keys', { index: 2, value: 'new-key' });
  });
});

describe('apiKeysApi.delete', () => {
  it('deletes with the index in the query string', async () => {
    mockedDelete.mockResolvedValue(undefined);

    await apiKeysApi.delete(4);

    expect(mockedDelete).toHaveBeenCalledWith('/api-keys?index=4');
  });
});
