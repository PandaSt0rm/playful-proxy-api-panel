import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AxiosResponse } from 'axios';

import { configFileApi } from './configFile';
import { apiClient } from './client';

vi.mock('./client', () => ({
  apiClient: {
    getRaw: vi.fn(),
    put: vi.fn(),
  },
}));

const mockedGetRaw = vi.mocked(apiClient.getRaw);
const mockedPut = vi.mocked(apiClient.put);

const asResponse = (data: unknown): AxiosResponse =>
  ({ data } as AxiosResponse);

beforeEach(() => {
  mockedGetRaw.mockReset();
  mockedPut.mockReset();
});

describe('configFileApi.fetchConfigYaml', () => {
  it('requests the config.yaml endpoint as text with yaml accept headers', async () => {
    mockedGetRaw.mockResolvedValue(asResponse('debug: true'));

    await configFileApi.fetchConfigYaml();

    expect(mockedGetRaw).toHaveBeenCalledWith('/config.yaml', {
      responseType: 'text',
      headers: { Accept: 'application/yaml, text/yaml, text/plain' },
    });
  });

  it('returns string response data unchanged', async () => {
    mockedGetRaw.mockResolvedValue(asResponse('debug: true\nport: 8317'));

    const result = await configFileApi.fetchConfigYaml();

    expect(result).toBe('debug: true\nport: 8317');
  });

  it('returns an empty string when data is undefined', async () => {
    mockedGetRaw.mockResolvedValue(asResponse(undefined));

    const result = await configFileApi.fetchConfigYaml();

    expect(result).toBe('');
  });

  it('returns an empty string when data is null', async () => {
    mockedGetRaw.mockResolvedValue(asResponse(null));

    const result = await configFileApi.fetchConfigYaml();

    expect(result).toBe('');
  });

  it('stringifies a non-string, non-null payload', async () => {
    mockedGetRaw.mockResolvedValue(asResponse({ debug: true }));

    const result = await configFileApi.fetchConfigYaml();

    expect(result).toBe('[object Object]');
  });

  it('propagates errors raised by the client', async () => {
    mockedGetRaw.mockRejectedValue(new Error('network down'));

    await expect(configFileApi.fetchConfigYaml()).rejects.toThrow('network down');
  });
});

describe('configFileApi.saveConfigYaml', () => {
  it('puts the raw content with yaml content-type headers', async () => {
    mockedPut.mockResolvedValue(undefined);

    await configFileApi.saveConfigYaml('debug: false');

    expect(mockedPut).toHaveBeenCalledWith('/config.yaml', 'debug: false', {
      headers: {
        'Content-Type': 'application/yaml',
        Accept: 'application/json, text/plain, */*',
      },
    });
  });

  it('resolves to undefined on success', async () => {
    mockedPut.mockResolvedValue({ ok: true });

    const result = await configFileApi.saveConfigYaml('x: 1');

    expect(result).toBeUndefined();
  });

  it('propagates errors raised by the client', async () => {
    mockedPut.mockRejectedValue(new Error('save failed'));

    await expect(configFileApi.saveConfigYaml('x: 1')).rejects.toThrow('save failed');
  });
});
