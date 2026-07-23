import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AxiosError, type AxiosAdapter, type AxiosResponse } from 'axios';

import { apiClient } from './client';
import type { ApiError } from '@/types';
import { computeApiUrl } from '@/utils/connection';

/**
 * The interceptors live on a private axios instance inside the ApiClient
 * singleton. We drive them through observable behaviour only:
 *  - A custom adapter (passed per-request) receives the *final* request config
 *    produced by the request interceptor, so we can assert baseURL / URL
 *    normalization / Authorization injection.
 *  - The adapter resolves a synthetic AxiosResponse to drive the response
 *    interceptor (version-update event), or rejects with an AxiosError to drive
 *    handleError (normalization + 401 'unauthorized' event).
 */

const okResponse = (config: Parameters<AxiosAdapter>[0]): AxiosResponse => ({
  data: { ok: true },
  status: 200,
  statusText: 'OK',
  headers: {},
  config,
});

// Captures the config the request interceptor handed to the transport layer.
let capturedConfig: Parameters<AxiosAdapter>[0] | null = null;

const capturingAdapter: AxiosAdapter = (config) => {
  capturedConfig = config;
  return Promise.resolve(okResponse(config));
};

beforeEach(() => {
  capturedConfig = null;
  // Reset to a known config between tests since apiClient is a module singleton.
  apiClient.setConfig({ apiBase: 'http://example.test:8317', managementKey: '' });
});

describe('apiClient request interceptor: base URL computation', () => {
  it('sets baseURL to the management-prefixed URL computed from apiBase', async () => {
    apiClient.setConfig({ apiBase: 'http://api.host:9000', managementKey: '' });

    await apiClient.get('/config', { adapter: capturingAdapter });

    expect(capturedConfig?.baseURL).toBe('http://api.host:9000/v0/management');
  });

  it('matches computeApiUrl for an apiBase with a trailing management suffix', async () => {
    apiClient.setConfig({ apiBase: 'https://host.test/v0/management/', managementKey: '' });

    await apiClient.get('/config', { adapter: capturingAdapter });

    expect(capturedConfig?.baseURL).toBe(computeApiUrl('https://host.test/v0/management/'));
  });

  it('sets an empty baseURL when apiBase is empty', async () => {
    apiClient.setConfig({ apiBase: '', managementKey: '' });

    await apiClient.get('/config', { adapter: capturingAdapter });

    expect(capturedConfig?.baseURL).toBe('');
  });
});

describe('apiClient request interceptor: URL normalization', () => {
  it('rewrites the deprecated generative-language-api-key path to gemini-api-key', async () => {
    await apiClient.get('/generative-language-api-key/list', { adapter: capturingAdapter });

    expect(capturedConfig?.url).toBe('/gemini-api-key/list');
  });

  it('rewrites every occurrence of the deprecated path segment', async () => {
    await apiClient.get('/generative-language-api-key/generative-language-api-key', {
      adapter: capturingAdapter,
    });

    expect(capturedConfig?.url).toBe('/gemini-api-key/gemini-api-key');
  });

  it('leaves an unrelated URL unchanged', async () => {
    await apiClient.get('/api-key-usage', { adapter: capturingAdapter });

    expect(capturedConfig?.url).toBe('/api-key-usage');
  });
});

describe('apiClient request interceptor: Authorization header injection', () => {
  it('adds a Bearer Authorization header when a management key is set', async () => {
    apiClient.setConfig({ apiBase: 'http://api.host', managementKey: 'secret-key' });

    await apiClient.get('/config', { adapter: capturingAdapter });

    expect(capturedConfig?.headers.Authorization).toBe('Bearer secret-key');
  });

  it('omits the Authorization header when the management key is empty', async () => {
    apiClient.setConfig({ apiBase: 'http://api.host', managementKey: '' });

    await apiClient.get('/config', { adapter: capturingAdapter });

    expect(capturedConfig?.headers.Authorization).toBeUndefined();
  });
});

describe('apiClient request methods: returned data', () => {
  it('returns response.data from get', async () => {
    const adapter: AxiosAdapter = (config) =>
      Promise.resolve({ ...okResponse(config), data: { value: 42 } });

    const result = await apiClient.get<{ value: number }>('/config', { adapter });

    expect(result).toEqual({ value: 42 });
  });

  it('returns response.data from post', async () => {
    const adapter: AxiosAdapter = (config) =>
      Promise.resolve({ ...okResponse(config), data: { created: 'yes' } });

    const result = await apiClient.post<{ created: string }>('/config', { a: 1 }, { adapter });

    expect(result).toEqual({ created: 'yes' });
  });

  it('returns the full AxiosResponse from getRaw', async () => {
    const adapter: AxiosAdapter = (config) =>
      Promise.resolve({ ...okResponse(config), status: 204, data: 'raw-body' });

    const response = await apiClient.getRaw('/config', { adapter });

    expect(response.status).toBe(204);
  });

  it('sets multipart/form-data Content-Type for postForm', async () => {
    const formData = new FormData();
    formData.append('field', 'value');

    await apiClient.postForm('/upload', formData, { adapter: capturingAdapter });

    expect(capturedConfig?.headers['Content-Type']).toBe('multipart/form-data');
  });
});

describe('apiClient response interceptor: server-version-update event', () => {
  const versionAdapter =
    (headers: Record<string, string>): AxiosAdapter =>
    (config) =>
      Promise.resolve({ ...okResponse(config), headers });

  let detail: { version: string | null; buildDate: string | null } | null;
  const listener = (event: Event) => {
    detail = (event as CustomEvent).detail;
  };

  beforeEach(() => {
    detail = null;
    window.addEventListener('server-version-update', listener);
  });

  afterEach(() => {
    window.removeEventListener('server-version-update', listener);
  });

  it('dispatches version and buildDate parsed from x-cpa-* response headers', async () => {
    await apiClient.get('/config', {
      adapter: versionAdapter({ 'x-cpa-version': '7.1.39', 'x-cpa-build-date': '2026-06-04' }),
    });

    expect(detail).toEqual({ version: '7.1.39', buildDate: '2026-06-04' });
  });

  it('falls back to x-server-* header aliases', async () => {
    await apiClient.get('/config', {
      adapter: versionAdapter({ 'x-server-version': '1.2.3' }),
    });

    expect(detail).toEqual({ version: '1.2.3', buildDate: null });
  });

  it('does not dispatch an event when no version headers are present', async () => {
    await apiClient.get('/config', {
      adapter: versionAdapter({ 'content-type': 'application/json' }),
    });

    expect(detail).toBeNull();
  });
});

describe('apiClient error normalization', () => {
  const rejectingAdapter =
    (error: unknown): AxiosAdapter =>
    () =>
      Promise.reject(error);

  const axiosErrorWith = (
    overrides: { data?: unknown; status?: number; code?: string; message?: string } = {}
  ): AxiosError => {
    const err = new AxiosError(overrides.message ?? 'Network Error', overrides.code);
    if (overrides.data !== undefined || overrides.status !== undefined) {
      err.response = {
        data: overrides.data,
        status: overrides.status ?? 500,
        statusText: '',
        headers: {},
        config: {} as AxiosError['config'],
      };
    }
    return err;
  };

  it('uses a string error field from the response body as the message', async () => {
    const adapter = rejectingAdapter(
      axiosErrorWith({ data: { error: 'Bad provider' }, status: 400 })
    );

    await expect(apiClient.get('/config', { adapter })).rejects.toMatchObject({
      message: 'Bad provider',
    });
  });

  it('uses a nested error.message field as the message', async () => {
    const adapter = rejectingAdapter(
      axiosErrorWith({ data: { error: { message: 'Nested failure' } }, status: 422 })
    );

    await expect(apiClient.get('/config', { adapter })).rejects.toMatchObject({
      message: 'Nested failure',
    });
  });

  it('uses the top-level message field when no error field exists', async () => {
    const adapter = rejectingAdapter(
      axiosErrorWith({ data: { message: 'Top level message' }, status: 500 })
    );

    await expect(apiClient.get('/config', { adapter })).rejects.toMatchObject({
      message: 'Top level message',
    });
  });

  it('falls back to the axios error message when the body has no message fields', async () => {
    const adapter = rejectingAdapter(
      axiosErrorWith({ data: { unrelated: true }, status: 503, message: 'Service down' })
    );

    await expect(apiClient.get('/config', { adapter })).rejects.toMatchObject({
      message: 'Service down',
    });
  });

  it('names the normalized error ApiError and copies status, code and data', async () => {
    const adapter = rejectingAdapter(
      axiosErrorWith({ data: { error: 'Bad request' }, status: 400, code: 'ERR_BAD_REQUEST' })
    );

    const error = await apiClient.get('/config', { adapter }).catch((e: ApiError) => e);

    expect({ name: error.name, status: error.status, code: error.code, data: error.data }).toEqual({
      name: 'ApiError',
      status: 400,
      code: 'ERR_BAD_REQUEST',
      data: { error: 'Bad request' },
    });
  });

  it('normalizes a non-axios Error using its message', async () => {
    const adapter = rejectingAdapter(new Error('boom'));

    const error = await apiClient.get('/config', { adapter }).catch((e: ApiError) => e);

    expect({ name: error.name, message: error.message }).toEqual({
      name: 'ApiError',
      message: 'boom',
    });
  });

  it('normalizes a thrown string into an ApiError carrying that string', async () => {
    const adapter = rejectingAdapter('plain string failure');

    const error = await apiClient.get('/config', { adapter }).catch((e: ApiError) => e);

    expect({ name: error.name, message: error.message }).toEqual({
      name: 'ApiError',
      message: 'plain string failure',
    });
  });

  it('uses a generic message for a non-error, non-string rejection', async () => {
    const adapter = rejectingAdapter({ weird: true });

    await expect(apiClient.get('/config', { adapter })).rejects.toMatchObject({
      message: 'Unknown error occurred',
    });
  });
});

describe('apiClient 401 handling', () => {
  const rejectWith401: AxiosAdapter = () =>
    Promise.reject(
      Object.assign(new AxiosError('Unauthorized'), {
        response: {
          data: {},
          status: 401,
          statusText: '',
          headers: {},
          config: {} as AxiosError['config'],
        },
      })
    );

  it('dispatches a single unauthorized event on a 401 response', async () => {
    const handler = vi.fn();
    window.addEventListener('unauthorized', handler);

    await apiClient.get('/config', { adapter: rejectWith401 }).catch(() => undefined);

    expect(handler).toHaveBeenCalledTimes(1);
    window.removeEventListener('unauthorized', handler);
  });

  it('does not dispatch unauthorized on a non-401 error', async () => {
    const handler = vi.fn();
    window.addEventListener('unauthorized', handler);
    const adapter: AxiosAdapter = () =>
      Promise.reject(
        Object.assign(new AxiosError('Server Error'), {
          response: {
            data: {},
            status: 500,
            statusText: '',
            headers: {},
            config: {} as AxiosError['config'],
          },
        })
      );

    await apiClient.get('/config', { adapter }).catch(() => undefined);

    expect(handler).not.toHaveBeenCalled();
    window.removeEventListener('unauthorized', handler);
  });
});

describe('apiClient setConfig timeout', () => {
  it('applies the provided timeout to outgoing requests', async () => {
    apiClient.setConfig({ apiBase: 'http://api.host', managementKey: '', timeout: 1234 });

    await apiClient.get('/config', { adapter: capturingAdapter });

    expect(capturedConfig?.timeout).toBe(1234);
  });

  it('resets to the default request timeout when no timeout is provided', async () => {
    apiClient.setConfig({ apiBase: 'http://api.host', managementKey: '', timeout: 1234 });
    apiClient.setConfig({ apiBase: 'http://api.host', managementKey: '' });

    await apiClient.get('/config', { adapter: capturingAdapter });

    expect(capturedConfig?.timeout).toBe(30 * 1000);
  });
});
