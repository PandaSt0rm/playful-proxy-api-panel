import { describe, it, expect, vi, beforeEach } from 'vitest';

import { ampcodeApi } from './ampcode';
import { apiClient } from './client';
import type { AmpcodeModelMapping, AmpcodeUpstreamApiKeyMapping } from '@/types';

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

describe('ampcodeApi.getAmpcode', () => {
  it('reads the /ampcode endpoint', async () => {
    mockedGet.mockResolvedValue({});

    await ampcodeApi.getAmpcode();

    expect(mockedGet).toHaveBeenCalledWith('/ampcode');
  });

  it('normalizes a kebab-case payload into a camelCase config', async () => {
    mockedGet.mockResolvedValue({
      'upstream-url': 'https://amp.example',
      'upstream-api-key': 'secret',
      'force-model-mappings': true,
    });

    const result = await ampcodeApi.getAmpcode();

    expect(result.upstreamUrl).toBe('https://amp.example');
    expect(result.upstreamApiKey).toBe('secret');
    expect(result.forceModelMappings).toBe(true);
  });

  it('returns an empty object when the payload is not a record', async () => {
    mockedGet.mockResolvedValue(null);

    const result = await ampcodeApi.getAmpcode();

    expect(result).toEqual({});
  });

  it('propagates errors raised by the client', async () => {
    mockedGet.mockRejectedValue(new Error('boom'));

    await expect(ampcodeApi.getAmpcode()).rejects.toThrow('boom');
  });
});

describe('ampcodeApi upstream-url mutations', () => {
  it('updateUpstreamUrl puts the url inside a value envelope', async () => {
    mockedPut.mockResolvedValue(undefined);

    await ampcodeApi.updateUpstreamUrl('https://amp.example');

    expect(mockedPut).toHaveBeenCalledWith('/ampcode/upstream-url', {
      value: 'https://amp.example',
    });
  });

  it('clearUpstreamUrl deletes the upstream-url endpoint', async () => {
    mockedDelete.mockResolvedValue(undefined);

    await ampcodeApi.clearUpstreamUrl();

    expect(mockedDelete).toHaveBeenCalledWith('/ampcode/upstream-url');
  });
});

describe('ampcodeApi upstream-api-key mutations', () => {
  it('updateUpstreamApiKey puts the key inside a value envelope', async () => {
    mockedPut.mockResolvedValue(undefined);

    await ampcodeApi.updateUpstreamApiKey('k1');

    expect(mockedPut).toHaveBeenCalledWith('/ampcode/upstream-api-key', { value: 'k1' });
  });

  it('clearUpstreamApiKey deletes the upstream-api-key endpoint', async () => {
    mockedDelete.mockResolvedValue(undefined);

    await ampcodeApi.clearUpstreamApiKey();

    expect(mockedDelete).toHaveBeenCalledWith('/ampcode/upstream-api-key');
  });
});

describe('ampcodeApi.updateRestrictManagementToLocalhost', () => {
  it('puts the boolean inside a value envelope', async () => {
    mockedPut.mockResolvedValue(undefined);

    await ampcodeApi.updateRestrictManagementToLocalhost(true);

    expect(mockedPut).toHaveBeenCalledWith('/ampcode/restrict-management-to-localhost', {
      value: true,
    });
  });
});

describe('ampcodeApi.updateForceModelMappings', () => {
  it('puts the boolean inside a value envelope', async () => {
    mockedPut.mockResolvedValue(undefined);

    await ampcodeApi.updateForceModelMappings(false);

    expect(mockedPut).toHaveBeenCalledWith('/ampcode/force-model-mappings', { value: false });
  });
});

describe('ampcodeApi.getUpstreamApiKeys', () => {
  it('reads the upstream-api-keys endpoint', async () => {
    mockedGet.mockResolvedValue({ 'upstream-api-keys': [] });

    await ampcodeApi.getUpstreamApiKeys();

    expect(mockedGet).toHaveBeenCalledWith('/ampcode/upstream-api-keys');
  });

  it('extracts and normalizes the upstream-api-keys array', async () => {
    mockedGet.mockResolvedValue({
      'upstream-api-keys': [{ 'upstream-api-key': 'u1', 'api-keys': ['a', 'b'] }],
    });

    const result = await ampcodeApi.getUpstreamApiKeys();

    expect(result).toEqual([{ upstreamApiKey: 'u1', apiKeys: ['a', 'b'] }]);
  });

  it('falls back to the camelCase upstreamApiKeys key', async () => {
    mockedGet.mockResolvedValue({
      upstreamApiKeys: [{ 'upstream-api-key': 'u2', 'api-keys': ['x'] }],
    });

    const result = await ampcodeApi.getUpstreamApiKeys();

    expect(result).toEqual([{ upstreamApiKey: 'u2', apiKeys: ['x'] }]);
  });

  it('falls back to the items key', async () => {
    mockedGet.mockResolvedValue({
      items: [{ 'upstream-api-key': 'u3', 'api-keys': ['y'] }],
    });

    const result = await ampcodeApi.getUpstreamApiKeys();

    expect(result).toEqual([{ upstreamApiKey: 'u3', apiKeys: ['y'] }]);
  });

  it('reads a top-level array payload directly', async () => {
    mockedGet.mockResolvedValue([{ 'upstream-api-key': 'u4', 'api-keys': ['z'] }]);

    const result = await ampcodeApi.getUpstreamApiKeys();

    expect(result).toEqual([{ upstreamApiKey: 'u4', apiKeys: ['z'] }]);
  });

  it('returns an empty list when no recognizable list is present', async () => {
    mockedGet.mockResolvedValue({ unrelated: true });

    const result = await ampcodeApi.getUpstreamApiKeys();

    expect(result).toEqual([]);
  });
});

describe('ampcodeApi.saveUpstreamApiKeys', () => {
  it('serializes mappings into kebab-case inside a value envelope', async () => {
    mockedPut.mockResolvedValue(undefined);
    const mappings: AmpcodeUpstreamApiKeyMapping[] = [
      { upstreamApiKey: 'u1', apiKeys: ['a', 'b'] },
    ];

    await ampcodeApi.saveUpstreamApiKeys(mappings);

    expect(mockedPut).toHaveBeenCalledWith('/ampcode/upstream-api-keys', {
      value: [{ 'upstream-api-key': 'u1', 'api-keys': ['a', 'b'] }],
    });
  });
});

describe('ampcodeApi.patchUpstreamApiKeys', () => {
  it('serializes mappings into kebab-case inside a value envelope', async () => {
    mockedPatch.mockResolvedValue(undefined);
    const mappings: AmpcodeUpstreamApiKeyMapping[] = [{ upstreamApiKey: 'u2', apiKeys: ['c'] }];

    await ampcodeApi.patchUpstreamApiKeys(mappings);

    expect(mockedPatch).toHaveBeenCalledWith('/ampcode/upstream-api-keys', {
      value: [{ 'upstream-api-key': 'u2', 'api-keys': ['c'] }],
    });
  });
});

describe('ampcodeApi.deleteUpstreamApiKeys', () => {
  it('deletes with the keys inside a data/value envelope', async () => {
    mockedDelete.mockResolvedValue(undefined);

    await ampcodeApi.deleteUpstreamApiKeys(['u1', 'u2']);

    expect(mockedDelete).toHaveBeenCalledWith('/ampcode/upstream-api-keys', {
      data: { value: ['u1', 'u2'] },
    });
  });
});

describe('ampcodeApi.getModelMappings', () => {
  it('reads the model-mappings endpoint', async () => {
    mockedGet.mockResolvedValue({ 'model-mappings': [] });

    await ampcodeApi.getModelMappings();

    expect(mockedGet).toHaveBeenCalledWith('/ampcode/model-mappings');
  });

  it('extracts and normalizes the model-mappings array', async () => {
    mockedGet.mockResolvedValue({
      'model-mappings': [{ from: 'gpt-4', to: 'claude', regex: true }],
    });

    const result = await ampcodeApi.getModelMappings();

    expect(result).toEqual([{ from: 'gpt-4', to: 'claude', regex: true }]);
  });

  it('falls back to the camelCase modelMappings key', async () => {
    mockedGet.mockResolvedValue({ modelMappings: [{ from: 'a', to: 'b' }] });

    const result = await ampcodeApi.getModelMappings();

    expect(result).toEqual([{ from: 'a', to: 'b' }]);
  });

  it('drops mappings missing a from or to field', async () => {
    mockedGet.mockResolvedValue({
      'model-mappings': [{ from: '', to: 'b' }, { from: 'a', to: '' }, { from: 'c', to: 'd' }],
    });

    const result = await ampcodeApi.getModelMappings();

    expect(result).toEqual([{ from: 'c', to: 'd' }]);
  });

  it('returns an empty list when no recognizable list is present', async () => {
    mockedGet.mockResolvedValue({ unrelated: 1 });

    const result = await ampcodeApi.getModelMappings();

    expect(result).toEqual([]);
  });
});

describe('ampcodeApi.saveModelMappings', () => {
  it('puts the mappings inside a value envelope', async () => {
    mockedPut.mockResolvedValue(undefined);
    const mappings: AmpcodeModelMapping[] = [{ from: 'a', to: 'b' }];

    await ampcodeApi.saveModelMappings(mappings);

    expect(mockedPut).toHaveBeenCalledWith('/ampcode/model-mappings', { value: mappings });
  });
});

describe('ampcodeApi.patchModelMappings', () => {
  it('patches the mappings inside a value envelope', async () => {
    mockedPatch.mockResolvedValue(undefined);
    const mappings: AmpcodeModelMapping[] = [{ from: 'a', to: 'b' }];

    await ampcodeApi.patchModelMappings(mappings);

    expect(mockedPatch).toHaveBeenCalledWith('/ampcode/model-mappings', { value: mappings });
  });
});

describe('ampcodeApi.clearModelMappings', () => {
  it('deletes the model-mappings endpoint', async () => {
    mockedDelete.mockResolvedValue(undefined);

    await ampcodeApi.clearModelMappings();

    expect(mockedDelete).toHaveBeenCalledWith('/ampcode/model-mappings');
  });
});

describe('ampcodeApi.deleteModelMappings', () => {
  it('deletes with the from-list inside a data/value envelope', async () => {
    mockedDelete.mockResolvedValue(undefined);

    await ampcodeApi.deleteModelMappings(['gpt-4', 'gpt-3']);

    expect(mockedDelete).toHaveBeenCalledWith('/ampcode/model-mappings', {
      data: { value: ['gpt-4', 'gpt-3'] },
    });
  });
});
