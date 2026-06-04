import { describe, it, expect, vi, beforeEach } from 'vitest';

import { syncApi } from './sync';
import { apiClient } from './client';
import type { SyncProfile } from '@/types';

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

describe('syncApi.getSyncProfiles', () => {
  it('requests /sync-profiles', async () => {
    mockedGet.mockResolvedValue({ 'sync-profiles': [] });

    await syncApi.getSyncProfiles();

    expect(mockedGet).toHaveBeenCalledWith('/sync-profiles');
  });

  it('extracts the array from the sync-profiles wrapper key', async () => {
    const profiles = [{ name: 'p1', targets: [] }];
    mockedGet.mockResolvedValue({ 'sync-profiles': profiles });

    const result = await syncApi.getSyncProfiles();

    expect(result).toEqual(profiles);
  });

  it('extracts the array from the syncProfiles camelCase key', async () => {
    const profiles = [{ name: 'p2', targets: [] }];
    mockedGet.mockResolvedValue({ syncProfiles: profiles });

    const result = await syncApi.getSyncProfiles();

    expect(result).toEqual(profiles);
  });

  it('extracts the array from the data key', async () => {
    const profiles = [{ name: 'p3', targets: [] }];
    mockedGet.mockResolvedValue({ data: profiles });

    const result = await syncApi.getSyncProfiles();

    expect(result).toEqual(profiles);
  });

  it('returns the response directly when it is already an array', async () => {
    const profiles = [{ name: 'p4', targets: [] }];
    mockedGet.mockResolvedValue(profiles);

    const result = await syncApi.getSyncProfiles();

    expect(result).toEqual(profiles);
  });

  it('returns an empty array for a null response', async () => {
    mockedGet.mockResolvedValue(null);

    const result = await syncApi.getSyncProfiles();

    expect(result).toEqual([]);
  });

  it('returns an empty array when no recognized key holds an array', async () => {
    mockedGet.mockResolvedValue({ unexpected: 'value' });

    const result = await syncApi.getSyncProfiles();

    expect(result).toEqual([]);
  });

  it('returns an empty array when the wrapper key is not an array', async () => {
    mockedGet.mockResolvedValue({ 'sync-profiles': 'not-an-array' });

    const result = await syncApi.getSyncProfiles();

    expect(result).toEqual([]);
  });
});

describe('syncApi.saveSyncProfiles', () => {
  it('serializes each profile and its targets under the sync-profiles key', async () => {
    mockedPut.mockResolvedValue({ status: 'ok' });
    const profiles: SyncProfile[] = [
      {
        name: 'main',
        targets: [
          { tool: 'claude-code', 'model-filter': '  gpt.*  ', 'api-key-index': 0, 'active-model': '  m1  ' },
        ],
      },
    ];

    await syncApi.saveSyncProfiles(profiles);

    expect(mockedPut).toHaveBeenCalledWith('/sync-profiles', {
      'sync-profiles': [
        {
          name: 'main',
          targets: [{ tool: 'claude-code', 'model-filter': 'gpt.*', 'api-key-index': 0, 'active-model': 'm1' }],
        },
      ],
    });
  });

  it('omits empty optional target fields after trimming', async () => {
    mockedPut.mockResolvedValue({ status: 'ok' });
    const profiles: SyncProfile[] = [
      { name: 'p', targets: [{ tool: 'hermes', 'model-filter': '   ', 'active-model': '' }] },
    ];

    await syncApi.saveSyncProfiles(profiles);

    expect(mockedPut).toHaveBeenCalledWith('/sync-profiles', {
      'sync-profiles': [{ name: 'p', targets: [{ tool: 'hermes' }] }],
    });
  });

  it('keeps api-key-index of zero since it is not undefined or null', async () => {
    mockedPut.mockResolvedValue({ status: 'ok' });
    const profiles: SyncProfile[] = [{ name: 'p', targets: [{ tool: 'hermes', 'api-key-index': 0 }] }];

    await syncApi.saveSyncProfiles(profiles);

    expect(mockedPut).toHaveBeenCalledWith('/sync-profiles', {
      'sync-profiles': [{ name: 'p', targets: [{ tool: 'hermes', 'api-key-index': 0 }] }],
    });
  });

  it('serializes a non-array targets value to an empty array', async () => {
    mockedPut.mockResolvedValue({ status: 'ok' });
    const profiles = [{ name: 'p', targets: undefined } as unknown as SyncProfile];

    await syncApi.saveSyncProfiles(profiles);

    expect(mockedPut).toHaveBeenCalledWith('/sync-profiles', {
      'sync-profiles': [{ name: 'p', targets: [] }],
    });
  });

  it('returns the status body from the client', async () => {
    mockedPut.mockResolvedValue({ status: 'ok' });

    const result = await syncApi.saveSyncProfiles([]);

    expect(result).toEqual({ status: 'ok' });
  });
});

describe('syncApi.updateSyncProfile', () => {
  it('serializes the full profile when a name is present', async () => {
    mockedPatch.mockResolvedValue({ status: 'ok' });

    await syncApi.updateSyncProfile(2, { name: 'renamed', targets: [{ tool: 'droid' }] });

    expect(mockedPatch).toHaveBeenCalledWith('/sync-profiles', {
      index: 2,
      value: { name: 'renamed', targets: [{ tool: 'droid' }] },
    });
  });

  it('serializes only targets when name is absent but targets are present', async () => {
    mockedPatch.mockResolvedValue({ status: 'ok' });

    await syncApi.updateSyncProfile(1, { targets: [{ tool: 'hermes', 'active-model': ' x ' }] });

    expect(mockedPatch).toHaveBeenCalledWith('/sync-profiles', {
      index: 1,
      value: { targets: [{ tool: 'hermes', 'active-model': 'x' }] },
    });
  });

  it('passes the raw partial value through when neither name nor targets are present', async () => {
    mockedPatch.mockResolvedValue({ status: 'ok' });
    const value = {} as Partial<SyncProfile>;

    await syncApi.updateSyncProfile(0, value);

    expect(mockedPatch).toHaveBeenCalledWith('/sync-profiles', { index: 0, value });
  });
});

describe('syncApi.updateSyncProfileByName', () => {
  it('serializes the full profile when name is provided', async () => {
    mockedPatch.mockResolvedValue({ status: 'ok' });

    await syncApi.updateSyncProfileByName('main', { name: 'main', targets: [{ tool: 'droid' }] });

    expect(mockedPatch).toHaveBeenCalledWith('/sync-profiles', {
      match: 'main',
      value: { name: 'main', targets: [{ tool: 'droid' }] },
    });
  });

  it('serializes the full profile shape when only targets are provided', async () => {
    mockedPatch.mockResolvedValue({ status: 'ok' });

    await syncApi.updateSyncProfileByName('main', { targets: [{ tool: 'hermes' }] });

    expect(mockedPatch).toHaveBeenCalledWith('/sync-profiles', {
      match: 'main',
      value: { name: undefined, targets: [{ tool: 'hermes' }] },
    });
  });

  it('passes the raw partial value through when neither name nor targets are present', async () => {
    mockedPatch.mockResolvedValue({ status: 'ok' });
    const value = {} as Partial<SyncProfile>;

    await syncApi.updateSyncProfileByName('main', value);

    expect(mockedPatch).toHaveBeenCalledWith('/sync-profiles', { match: 'main', value });
  });
});

describe('syncApi.deleteSyncProfile', () => {
  it('deletes by index using the index query param', async () => {
    mockedDelete.mockResolvedValue({ status: 'ok' });

    await syncApi.deleteSyncProfile(3);

    expect(mockedDelete).toHaveBeenCalledWith('/sync-profiles?index=3');
  });

  it('deletes by name using the URL-encoded name query param', async () => {
    mockedDelete.mockResolvedValue({ status: 'ok' });

    await syncApi.deleteSyncProfile('my profile');

    expect(mockedDelete).toHaveBeenCalledWith('/sync-profiles?name=my%20profile');
  });

  it('returns the status body from the client', async () => {
    mockedDelete.mockResolvedValue({ status: 'ok' });

    const result = await syncApi.deleteSyncProfile(0);

    expect(result).toEqual({ status: 'ok' });
  });
});

describe('syncApi.getSyncAvailableConfigs', () => {
  it('requests /sync/available-configs', async () => {
    mockedGet.mockResolvedValue({});

    await syncApi.getSyncAvailableConfigs();

    expect(mockedGet).toHaveBeenCalledWith('/sync/available-configs');
  });

  it('returns the aggregated configs response unchanged', async () => {
    const body = {
      base_url: 'https://srv',
      api_keys: [],
      providers: [],
      oauth_channels: [],
      all_models: [],
    };
    mockedGet.mockResolvedValue(body);

    const result = await syncApi.getSyncAvailableConfigs();

    expect(result).toBe(body);
  });
});
