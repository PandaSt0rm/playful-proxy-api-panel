import { describe, it, expect, vi, beforeEach } from 'vitest';

import { toolingTemplatesApi } from './toolingTemplates';
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

describe('toolingTemplatesApi.list', () => {
  it('requests /tooling-templates', async () => {
    mockedGet.mockResolvedValue({ templates: [] });

    await toolingTemplatesApi.list();

    expect(mockedGet).toHaveBeenCalledWith('/tooling-templates');
  });

  it('returns the templates array from the response wrapper', async () => {
    const templates = [{ id: 'claude-code', label: 'Claude' }];
    mockedGet.mockResolvedValue({ templates });

    const result = await toolingTemplatesApi.list();

    expect(result).toEqual(templates);
  });

  it('returns an empty array when templates is missing', async () => {
    mockedGet.mockResolvedValue({});

    const result = await toolingTemplatesApi.list();

    expect(result).toEqual([]);
  });

  it('returns an empty array when templates is not an array', async () => {
    mockedGet.mockResolvedValue({ templates: 'nope' });

    const result = await toolingTemplatesApi.list();

    expect(result).toEqual([]);
  });

  it('returns an empty list when the response is null', async () => {
    mockedGet.mockResolvedValue(null);

    const result = await toolingTemplatesApi.list();

    expect(result).toEqual([]);
  });
});

describe('toolingTemplatesApi.render', () => {
  const request = {
    base_url: 'https://srv',
    api_key: 'sk-1',
    api_key_mode: 'embed' as const,
    models: ['m1'],
    active_model: 'm1',
  };

  it('posts the request body to /tooling-templates/render', async () => {
    mockedPost.mockResolvedValue({ templates: [], manual_config: [] });

    await toolingTemplatesApi.render(request);

    expect(mockedPost).toHaveBeenCalledWith('/tooling-templates/render', request);
  });

  it('keeps rendered templates that have string id, content, and language', async () => {
    const valid = { id: 'claude-code', content: 'cfg', language: 'json' };
    mockedPost.mockResolvedValue({ templates: [valid], manual_config: [] });

    const result = await toolingTemplatesApi.render(request);

    expect(result.templates).toEqual([valid]);
  });

  it('drops a rendered template missing the content field', async () => {
    mockedPost.mockResolvedValue({
      templates: [
        { id: 'a', content: 'ok', language: 'json' },
        { id: 'b', language: 'json' },
      ],
      manual_config: [],
    });

    const result = await toolingTemplatesApi.render(request);

    expect(result.templates).toEqual([{ id: 'a', content: 'ok', language: 'json' }]);
  });

  it('drops a rendered template whose id is not a string', async () => {
    mockedPost.mockResolvedValue({
      templates: [{ id: 5, content: 'ok', language: 'json' }],
      manual_config: [],
    });

    const result = await toolingTemplatesApi.render(request);

    expect(result.templates).toEqual([]);
  });

  it('drops null entries from the templates array', async () => {
    mockedPost.mockResolvedValue({
      templates: [null, { id: 'a', content: 'ok', language: 'json' }],
      manual_config: [],
    });

    const result = await toolingTemplatesApi.render(request);

    expect(result.templates).toEqual([{ id: 'a', content: 'ok', language: 'json' }]);
  });

  it('returns an empty templates array when templates is not an array', async () => {
    mockedPost.mockResolvedValue({ templates: 'broken', manual_config: [] });

    const result = await toolingTemplatesApi.render(request);

    expect(result.templates).toEqual([]);
  });

  it('passes through manual_config when it is an array', async () => {
    const manual = [{ tool: 'x', steps: ['a'] }];
    mockedPost.mockResolvedValue({ templates: [], manual_config: manual });

    const result = await toolingTemplatesApi.render(request);

    expect(result.manual_config).toEqual(manual);
  });

  it('returns an empty manual_config when it is missing', async () => {
    mockedPost.mockResolvedValue({ templates: [] });

    const result = await toolingTemplatesApi.render(request);

    expect(result.manual_config).toEqual([]);
  });

  it('returns the empty render shape when the response is null', async () => {
    mockedPost.mockResolvedValue(null);

    const result = await toolingTemplatesApi.render(request);

    expect(result).toEqual({ templates: [], manual_config: [] });
  });
});
