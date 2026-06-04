import { describe, it, expect, vi, beforeEach } from 'vitest';

import axios from 'axios';
import { modelsApi } from './models';
import { apiCallApi } from './apiCall';
import type { ApiCallResult } from './apiCall';

// `models.ts` imports `axios` for `fetchModels` AND transitively imports the
// real `apiCall`/`client` modules. `client.ts` calls `axios.create` at module
// load, so the axios mock must supply both `get` and a `create` stub that
// returns a benign instance — otherwise importing the module under test throws.
vi.mock('axios', () => {
  const get = vi.fn();
  const instance = {
    defaults: { headers: {}, timeout: 0 },
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
    get: vi.fn(),
    post: vi.fn(),
    request: vi.fn(),
  };
  return {
    default: { get, create: vi.fn(() => instance), isAxiosError: vi.fn(() => false) },
  };
});

// Replace only the api-call boundary; keep the real `getApiCallErrorMessage`
// (a pure helper) so error-message assertions exercise production behaviour.
vi.mock('./apiCall', async () => {
  const actual = await vi.importActual<typeof import('./apiCall')>('./apiCall');
  return {
    ...actual,
    apiCallApi: { request: vi.fn() },
  };
});

const mockedAxiosGet = vi.mocked(axios.get);
const mockedRequest = vi.mocked(apiCallApi.request);

const okResult = (body: unknown): ApiCallResult => ({
  statusCode: 200,
  header: {},
  bodyText: typeof body === 'string' ? body : JSON.stringify(body),
  body: typeof body === 'string' ? null : body,
});

beforeEach(() => {
  mockedAxiosGet.mockReset();
  mockedRequest.mockReset();
});

describe('modelsApi.buildV1ModelsEndpoint', () => {
  it('appends /v1/models to a bare host', () => {
    expect(modelsApi.buildV1ModelsEndpoint('https://api.example.com')).toBe(
      'https://api.example.com/v1/models'
    );
  });

  it('appends /models when the base already ends in /v1', () => {
    expect(modelsApi.buildV1ModelsEndpoint('https://api.example.com/v1')).toBe(
      'https://api.example.com/v1/models'
    );
  });

  it('leaves an already complete /v1/models path unchanged', () => {
    expect(modelsApi.buildV1ModelsEndpoint('https://api.example.com/v1/models')).toBe(
      'https://api.example.com/v1/models'
    );
  });

  it('strips trailing slashes before composing the path', () => {
    expect(modelsApi.buildV1ModelsEndpoint('https://api.example.com///')).toBe(
      'https://api.example.com/v1/models'
    );
  });

  it('prepends http:// to a scheme-less host', () => {
    expect(modelsApi.buildV1ModelsEndpoint('api.example.com')).toBe(
      'http://api.example.com/v1/models'
    );
  });

  it('returns an empty string for a blank base url', () => {
    expect(modelsApi.buildV1ModelsEndpoint('   ')).toBe('');
  });
});

describe('modelsApi.buildClaudeModelsEndpoint', () => {
  it('defaults to the Anthropic host for a blank base url', () => {
    expect(modelsApi.buildClaudeModelsEndpoint('')).toBe('https://api.anthropic.com/v1/models');
  });

  it('appends /v1/models to a custom host', () => {
    expect(modelsApi.buildClaudeModelsEndpoint('https://proxy.local')).toBe(
      'https://proxy.local/v1/models'
    );
  });

  it('collapses an existing /v1/models suffix back to a single /v1/models', () => {
    expect(modelsApi.buildClaudeModelsEndpoint('https://proxy.local/v1/models')).toBe(
      'https://proxy.local/v1/models'
    );
  });

  it('drops a trailing /v1/messages path before composing the endpoint', () => {
    expect(modelsApi.buildClaudeModelsEndpoint('https://proxy.local/v1/messages')).toBe(
      'https://proxy.local/v1/models'
    );
  });
});

describe('modelsApi.buildGeminiModelsEndpoint', () => {
  it('defaults to the Google host for a blank base url', () => {
    expect(modelsApi.buildGeminiModelsEndpoint('')).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models'
    );
  });

  it('appends /v1beta/models to a custom host', () => {
    expect(modelsApi.buildGeminiModelsEndpoint('https://gemini.local')).toBe(
      'https://gemini.local/v1beta/models'
    );
  });

  it('drops an existing /v1beta path before composing the endpoint', () => {
    expect(modelsApi.buildGeminiModelsEndpoint('https://gemini.local/v1beta/models')).toBe(
      'https://gemini.local/v1beta/models'
    );
  });
});

describe('modelsApi.fetchModels', () => {
  it('throws for an invalid base url', async () => {
    await expect(modelsApi.fetchModels('')).rejects.toThrow('Invalid base url');
  });

  it('adds a bearer Authorization header when an api key is supplied', async () => {
    mockedAxiosGet.mockResolvedValue({ data: { data: [] } });

    await modelsApi.fetchModels('https://api.example.com', 'sk-123');

    expect(mockedAxiosGet).toHaveBeenCalledWith('https://api.example.com/v1/models', {
      headers: { Authorization: 'Bearer sk-123' },
    });
  });

  it('does not overwrite an existing Authorization header', async () => {
    mockedAxiosGet.mockResolvedValue({ data: { data: [] } });

    await modelsApi.fetchModels('https://api.example.com', 'sk-123', {
      Authorization: 'Bearer existing',
    });

    expect(mockedAxiosGet).toHaveBeenCalledWith('https://api.example.com/v1/models', {
      headers: { Authorization: 'Bearer existing' },
    });
  });

  it('passes undefined headers when there are none', async () => {
    mockedAxiosGet.mockResolvedValue({ data: { data: [] } });

    await modelsApi.fetchModels('https://api.example.com');

    expect(mockedAxiosGet).toHaveBeenCalledWith('https://api.example.com/v1/models', {
      headers: undefined,
    });
  });

  it('extracts and dedupes models from the data array', async () => {
    mockedAxiosGet.mockResolvedValue({
      data: { data: [{ id: 'gpt-4' }, { id: 'gpt-4' }, { id: 'gpt-3.5' }] },
    });

    const result = await modelsApi.fetchModels('https://api.example.com');

    expect(result).toEqual([{ name: 'gpt-4' }, { name: 'gpt-3.5' }]);
  });

  it('falls back to the models array when there is no data array', async () => {
    mockedAxiosGet.mockResolvedValue({ data: { models: [{ id: 'm1' }] } });

    const result = await modelsApi.fetchModels('https://api.example.com');

    expect(result).toEqual([{ name: 'm1' }]);
  });
});

describe('modelsApi.fetchV1ModelsViaApiCall', () => {
  it('throws for an invalid base url', async () => {
    await expect(modelsApi.fetchV1ModelsViaApiCall('')).rejects.toThrow('Invalid base url');
  });

  it('requests the v1 models endpoint with a bearer header and trimmed proxy', async () => {
    mockedRequest.mockResolvedValue(okResult({ data: [{ id: 'm1' }] }));

    await modelsApi.fetchV1ModelsViaApiCall('https://api.example.com', 'sk-1', {}, '  http://p  ');

    expect(mockedRequest).toHaveBeenCalledWith({
      method: 'GET',
      url: 'https://api.example.com/v1/models',
      header: { Authorization: 'Bearer sk-1' },
      proxyUrl: 'http://p',
    });
  });

  it('passes an undefined proxy when the proxy url is blank', async () => {
    mockedRequest.mockResolvedValue(okResult({ data: [] }));

    await modelsApi.fetchV1ModelsViaApiCall('https://api.example.com', undefined, {}, '   ');

    expect(mockedRequest).toHaveBeenCalledWith({
      method: 'GET',
      url: 'https://api.example.com/v1/models',
      header: undefined,
      proxyUrl: undefined,
    });
  });

  it('throws an error message for a non-2xx status code', async () => {
    mockedRequest.mockResolvedValue({
      statusCode: 403,
      header: {},
      bodyText: 'forbidden',
      body: { error: { message: 'no access' } },
    });

    await expect(modelsApi.fetchV1ModelsViaApiCall('https://api.example.com')).rejects.toThrow(
      '403 no access'
    );
  });

  it('normalizes and dedupes the parsed body', async () => {
    mockedRequest.mockResolvedValue(okResult({ data: [{ id: 'm1' }, { id: 'm1' }] }));

    const result = await modelsApi.fetchV1ModelsViaApiCall('https://api.example.com');

    expect(result).toEqual([{ name: 'm1' }]);
  });
});

describe('modelsApi.fetchModelsViaApiCall', () => {
  it('targets the /models endpoint (no v1 prefix)', async () => {
    mockedRequest.mockResolvedValue(okResult({ data: [] }));

    await modelsApi.fetchModelsViaApiCall('https://api.example.com');

    expect(mockedRequest).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://api.example.com/models' })
    );
  });

  it('throws an HTTP fallback message when no body detail exists', async () => {
    mockedRequest.mockResolvedValue({
      statusCode: 500,
      header: {},
      bodyText: '',
      body: null,
    });

    await expect(modelsApi.fetchModelsViaApiCall('https://api.example.com')).rejects.toThrow(
      'HTTP 500'
    );
  });
});

describe('modelsApi.fetchClaudeModelsViaApiCall', () => {
  it('sets x-api-key and anthropic-version headers from the api key', async () => {
    mockedRequest.mockResolvedValue(okResult({ data: [] }));

    await modelsApi.fetchClaudeModelsViaApiCall('https://api.anthropic.com', 'sk-ant');

    expect(mockedRequest).toHaveBeenCalledWith({
      method: 'GET',
      url: 'https://api.anthropic.com/v1/models',
      header: { 'x-api-key': 'sk-ant', 'anthropic-version': '2023-06-01' },
      proxyUrl: undefined,
    });
  });

  it('derives the x-api-key from an Authorization bearer header when no api key is given', async () => {
    mockedRequest.mockResolvedValue(okResult({ data: [] }));

    await modelsApi.fetchClaudeModelsViaApiCall('https://api.anthropic.com', '', {
      Authorization: 'Bearer derived-token',
    });

    expect(mockedRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        header: {
          Authorization: 'Bearer derived-token',
          'x-api-key': 'derived-token',
          'anthropic-version': '2023-06-01',
        },
      })
    );
  });

  it('does not override an existing anthropic-version header', async () => {
    mockedRequest.mockResolvedValue(okResult({ data: [] }));

    await modelsApi.fetchClaudeModelsViaApiCall('https://api.anthropic.com', 'sk-ant', {
      'anthropic-version': '2024-01-01',
    });

    expect(mockedRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        header: { 'anthropic-version': '2024-01-01', 'x-api-key': 'sk-ant' },
      })
    );
  });

  it('deduplicates concurrent identical requests into a single api-call', async () => {
    let resolveRequest: (value: ApiCallResult) => void = () => {};
    mockedRequest.mockReturnValue(
      new Promise<ApiCallResult>((resolve) => {
        resolveRequest = resolve;
      })
    );

    const first = modelsApi.fetchClaudeModelsViaApiCall('https://api.anthropic.com', 'sk-ant');
    const second = modelsApi.fetchClaudeModelsViaApiCall('https://api.anthropic.com', 'sk-ant');
    resolveRequest(okResult({ data: [{ id: 'claude-3' }] }));
    await Promise.all([first, second]);

    expect(mockedRequest).toHaveBeenCalledTimes(1);
  });

  it('issues a fresh request after the in-flight one settles', async () => {
    mockedRequest.mockResolvedValue(okResult({ data: [{ id: 'claude-3' }] }));

    await modelsApi.fetchClaudeModelsViaApiCall('https://api.anthropic.com', 'sk-ant');
    await modelsApi.fetchClaudeModelsViaApiCall('https://api.anthropic.com', 'sk-ant');

    expect(mockedRequest).toHaveBeenCalledTimes(2);
  });

  it('throws and clears the in-flight slot on a non-2xx status', async () => {
    mockedRequest.mockResolvedValue({
      statusCode: 401,
      header: {},
      bodyText: '',
      body: { error: 'bad key' },
    });

    await expect(
      modelsApi.fetchClaudeModelsViaApiCall('https://api.anthropic.com', 'sk-ant')
    ).rejects.toThrow('401 bad key');
  });
});

describe('modelsApi.fetchGeminiModelsViaApiCall', () => {
  it('sets the x-goog-api-key header from the api key', async () => {
    mockedRequest.mockResolvedValue(okResult({ models: [{ name: 'models/gemini-pro' }] }));

    await modelsApi.fetchGeminiModelsViaApiCall('https://gemini.local', 'g-key');

    expect(mockedRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://gemini.local/v1beta/models',
        header: { 'x-goog-api-key': 'g-key' },
      })
    );
  });

  it('strips the models/ resource prefix from returned names', async () => {
    mockedRequest.mockResolvedValue(okResult({ models: [{ name: 'models/gemini-pro' }] }));

    const result = await modelsApi.fetchGeminiModelsViaApiCall('https://gemini.local', 'g-key');

    expect(result).toEqual([{ name: 'gemini-pro' }]);
  });

  it('deduplicates model names case-insensitively across pages', async () => {
    mockedRequest
      .mockResolvedValueOnce(
        okResult({ models: [{ name: 'models/Gemini-Pro' }], nextPageToken: 'p2' })
      )
      .mockResolvedValueOnce(okResult({ models: [{ name: 'models/gemini-pro' }] }));

    const result = await modelsApi.fetchGeminiModelsViaApiCall('https://gemini.local', 'g-key');

    expect(result).toEqual([{ name: 'Gemini-Pro' }]);
  });

  it('passes the pageToken query param on the second page request', async () => {
    mockedRequest
      .mockResolvedValueOnce(okResult({ models: [{ name: 'models/a' }], nextPageToken: 'tok' }))
      .mockResolvedValueOnce(okResult({ models: [{ name: 'models/b' }] }));

    await modelsApi.fetchGeminiModelsViaApiCall('https://gemini.local', 'g-key');

    expect(mockedRequest).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ url: 'https://gemini.local/v1beta/models?pageToken=tok' })
    );
  });

  it('stops paging when no nextPageToken is returned', async () => {
    mockedRequest.mockResolvedValue(okResult({ models: [{ name: 'models/a' }] }));

    await modelsApi.fetchGeminiModelsViaApiCall('https://gemini.local', 'g-key');

    expect(mockedRequest).toHaveBeenCalledTimes(1);
  });

  it('throws on a non-2xx status during paging', async () => {
    mockedRequest.mockResolvedValue({
      statusCode: 400,
      header: {},
      bodyText: 'bad request',
      body: null,
    });

    await expect(
      modelsApi.fetchGeminiModelsViaApiCall('https://gemini.local', 'g-key')
    ).rejects.toThrow('400 bad request');
  });
});
