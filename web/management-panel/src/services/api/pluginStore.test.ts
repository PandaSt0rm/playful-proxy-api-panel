import { describe, it, expect, vi, beforeEach } from 'vitest';

import { pluginStoreApi } from './pluginStore';
import { apiClient } from './client';

vi.mock('./client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

const mockedGet = vi.mocked(apiClient.get);
const mockedPost = vi.mocked(apiClient.post);

beforeEach(() => {
  mockedGet.mockReset();
  mockedPost.mockReset();
});

describe('pluginStoreApi.list', () => {
  it('parses install type and auth metadata from store entries', async () => {
    mockedGet.mockResolvedValue({
      plugins_enabled: true,
      plugins_dir: 'plugins',
      sources: [],
      source_errors: [],
      plugins: [
        {
          id: 'direct-plugin',
          install_type: 'direct',
          auth_required: true,
          auth_configured: false,
        },
      ],
    });

    const result = await pluginStoreApi.list();

    expect(result.plugins[0]).toMatchObject({
      id: 'direct-plugin',
      install_type: 'direct',
      auth_required: true,
      auth_configured: false,
    });
  });
});

describe('pluginStoreApi.install', () => {
  it('sends the selected source and displayed version when installing from the store', async () => {
    mockedPost.mockResolvedValue({ status: 'ok', id: 'example', install_type: 'github-release' });

    await pluginStoreApi.install('example', 'official', ' 1.2.0 ');

    expect(mockedPost).toHaveBeenCalledWith('/plugin-store/example/install?source=official', {
      version: '1.2.0',
    });
  });

  it('omits the request body when no version is selected', async () => {
    mockedPost.mockResolvedValue({ status: 'ok', id: 'example', install_type: 'direct' });

    await pluginStoreApi.install('example');

    expect(mockedPost).toHaveBeenCalledWith('/plugin-store/example/install', undefined);
  });
});
