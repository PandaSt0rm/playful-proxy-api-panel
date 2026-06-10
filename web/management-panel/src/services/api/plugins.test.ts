import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pluginsApi } from './plugins';
import { apiClient } from './client';

vi.mock('./client', () => ({
  apiClient: {
    get: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
  },
}));

const mockedGet = vi.mocked(apiClient.get);
const mockedPatch = vi.mocked(apiClient.patch);
const mockedPut = vi.mocked(apiClient.put);

beforeEach(() => {
  mockedGet.mockReset();
  mockedPatch.mockReset();
  mockedPut.mockReset();
});

describe('pluginsApi.list', () => {
  it('requests /plugins and normalizes the response', async () => {
    mockedGet.mockResolvedValue({
      plugins_enabled: true,
      plugins_dir: 'plugins',
      plugins: [
        {
          id: 'example',
          path: 'plugins/example.so',
          configured: true,
          registered: true,
          enabled: true,
          effective_enabled: true,
          supports_oauth: true,
          logo: 'data:image/png;base64,xyz',
          config_fields: [
            { name: 'mode', type: 'enum', enum_values: ['safe', 'fast'], description: 'Mode' },
          ],
          menus: [{ path: '/v0/resource/plugins/example/', menu: 'Example', description: '' }],
          metadata: {
            name: 'Example',
            version: '1.0.0',
            author: 'Author',
            github_repository: 'https://github.com/example/example',
            logo: '',
            config_fields: [],
          },
        },
      ],
    });

    const result = await pluginsApi.list();

    expect(mockedGet).toHaveBeenCalledWith('/plugins');
    expect(result.plugins_enabled).toBe(true);
    expect(result.plugins_dir).toBe('plugins');
    expect(result.plugins).toHaveLength(1);
    expect(result.plugins[0].id).toBe('example');
    expect(result.plugins[0].config_fields[0].enum_values).toEqual(['safe', 'fast']);
    expect(result.plugins[0].metadata?.name).toBe('Example');
  });

  it('returns safe defaults for malformed payloads', async () => {
    mockedGet.mockResolvedValue(null);

    const result = await pluginsApi.list();

    expect(result.plugins_enabled).toBe(false);
    expect(result.plugins_dir).toBe('plugins');
    expect(result.plugins).toEqual([]);
  });

  it('drops entries without a string id', async () => {
    mockedGet.mockResolvedValue({
      plugins_enabled: false,
      plugins_dir: 'plugins',
      plugins: [{ id: '' }, { path: 'plugins/x.so' }, 'junk', { id: 'kept' }],
    });

    const result = await pluginsApi.list();

    expect(result.plugins).toHaveLength(1);
    expect(result.plugins[0].id).toBe('kept');
    expect(result.plugins[0].config_fields).toEqual([]);
    expect(result.plugins[0].menus).toEqual([]);
    expect(result.plugins[0].metadata).toBeNull();
  });
});

describe('pluginsApi.setEnabled', () => {
  it('patches /plugins/:id/enabled with the flag', async () => {
    mockedPatch.mockResolvedValue(undefined);

    await pluginsApi.setEnabled('example', false);

    expect(mockedPatch).toHaveBeenCalledWith('/plugins/example/enabled', { enabled: false });
  });

  it('escapes the plugin id in the URL', async () => {
    mockedPatch.mockResolvedValue(undefined);

    await pluginsApi.setEnabled('weird id', true);

    expect(mockedPatch).toHaveBeenCalledWith('/plugins/weird%20id/enabled', { enabled: true });
  });
});

describe('pluginsApi.putConfig', () => {
  it('puts the raw config object to /plugins/:id/config', async () => {
    mockedPut.mockResolvedValue(undefined);

    await pluginsApi.putConfig('example', { enabled: true, priority: 2, mode: 'safe' });

    expect(mockedPut).toHaveBeenCalledWith('/plugins/example/config', {
      enabled: true,
      priority: 2,
      mode: 'safe',
    });
  });
});
