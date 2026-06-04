import { describe, it, expect, vi, beforeEach } from 'vitest';

import { apiCallApi, getApiCallErrorMessage, type ApiCallResult } from './apiCall';
import { apiClient } from './client';

vi.mock('./client', () => ({
  apiClient: {
    post: vi.fn(),
  },
}));

const mockedPost = vi.mocked(apiClient.post);

const makeResult = (overrides: Partial<ApiCallResult> = {}): ApiCallResult => ({
  statusCode: 200,
  header: {},
  bodyText: '',
  body: null,
  ...overrides,
});

describe('getApiCallErrorMessage', () => {
  it('combines status code with nested error.message', () => {
    const result = makeResult({ statusCode: 401, body: { error: { message: 'unauthorized' } } });

    const message = getApiCallErrorMessage(result);

    expect(message).toBe('401 unauthorized');
  });

  it('combines status code with a string error field', () => {
    const result = makeResult({ statusCode: 500, body: { error: 'boom' } });

    const message = getApiCallErrorMessage(result);

    expect(message).toBe('500 boom');
  });

  it('falls back to body.message when error field is absent', () => {
    const result = makeResult({ statusCode: 422, body: { message: 'validation failed' } });

    const message = getApiCallErrorMessage(result);

    expect(message).toBe('422 validation failed');
  });

  it('uses a string body directly as the message', () => {
    const result = makeResult({ statusCode: 400, body: 'plain text error' });

    const message = getApiCallErrorMessage(result);

    expect(message).toBe('400 plain text error');
  });

  it('uses bodyText when body carries no usable message', () => {
    const result = makeResult({ statusCode: 503, body: null, bodyText: 'service unavailable' });

    const message = getApiCallErrorMessage(result);

    expect(message).toBe('503 service unavailable');
  });

  it('returns HTTP <status> when status is set but no message is available', () => {
    const result = makeResult({ statusCode: 404, body: null, bodyText: '' });

    const message = getApiCallErrorMessage(result);

    expect(message).toBe('HTTP 404');
  });

  it('returns the message alone when status code is zero', () => {
    const result = makeResult({ statusCode: 0, body: 'offline' });

    const message = getApiCallErrorMessage(result);

    expect(message).toBe('offline');
  });

  it('returns the default failure text when there is no status and no message', () => {
    const result = makeResult({ statusCode: 0, body: null, bodyText: '' });

    const message = getApiCallErrorMessage(result);

    expect(message).toBe('Request failed');
  });

  it('ignores a non-string nested error.message and falls back to bodyText', () => {
    const result = makeResult({
      statusCode: 500,
      body: { error: { message: 42 } },
      bodyText: 'raw text',
    });

    const message = getApiCallErrorMessage(result);

    expect(message).toBe('500 raw text');
  });
});

describe('apiCallApi.request', () => {
  beforeEach(() => {
    mockedPost.mockReset();
  });

  it('posts the payload to the /api-call endpoint', async () => {
    mockedPost.mockResolvedValue({ status_code: 200, body: '{}' });

    await apiCallApi.request({ method: 'GET', url: 'https://example.com/models' });

    expect(mockedPost).toHaveBeenCalledWith(
      '/api-call',
      { method: 'GET', url: 'https://example.com/models' },
      undefined
    );
  });

  it('forwards the optional axios config to the client', async () => {
    mockedPost.mockResolvedValue({ status_code: 200, body: '{}' });
    const config = { timeout: 1234 };

    await apiCallApi.request({ method: 'GET', url: 'https://example.com' }, config);

    expect(mockedPost).toHaveBeenCalledWith(
      '/api-call',
      { method: 'GET', url: 'https://example.com' },
      config
    );
  });

  it('reads the status from the snake_case status_code field', async () => {
    mockedPost.mockResolvedValue({ status_code: 204, body: '' });

    const result = await apiCallApi.request({ method: 'GET', url: 'u' });

    expect(result.statusCode).toBe(204);
  });

  it('reads the status from the camelCase statusCode field when status_code is absent', async () => {
    mockedPost.mockResolvedValue({ statusCode: 201, body: '' });

    const result = await apiCallApi.request({ method: 'GET', url: 'u' });

    expect(result.statusCode).toBe(201);
  });

  it('falls back to status 0 when neither status field is present', async () => {
    mockedPost.mockResolvedValue({ body: '' });

    const result = await apiCallApi.request({ method: 'GET', url: 'u' });

    expect(result.statusCode).toBe(0);
  });

  it('falls back to status 0 when the status value is not numeric', async () => {
    mockedPost.mockResolvedValue({ status_code: 'not-a-number', body: '' });

    const result = await apiCallApi.request({ method: 'GET', url: 'u' });

    expect(result.statusCode).toBe(0);
  });

  it('parses a JSON string body into a structured object', async () => {
    mockedPost.mockResolvedValue({ status_code: 200, body: '{"foo":"bar"}' });

    const result = await apiCallApi.request({ method: 'GET', url: 'u' });

    expect(result.body).toEqual({ foo: 'bar' });
  });

  it('preserves the raw text of a JSON string body', async () => {
    mockedPost.mockResolvedValue({ status_code: 200, body: '{"foo":"bar"}' });

    const result = await apiCallApi.request({ method: 'GET', url: 'u' });

    expect(result.bodyText).toBe('{"foo":"bar"}');
  });

  it('keeps an unparseable string body as the raw text and as the body', async () => {
    mockedPost.mockResolvedValue({ status_code: 200, body: 'not json {' });

    const result = await apiCallApi.request({ method: 'GET', url: 'u' });

    expect(result).toMatchObject({ bodyText: 'not json {', body: 'not json {' });
  });

  it('treats a whitespace-only string body as empty with a null body', async () => {
    mockedPost.mockResolvedValue({ status_code: 200, body: '   ' });

    const result = await apiCallApi.request({ method: 'GET', url: 'u' });

    expect(result).toMatchObject({ bodyText: '   ', body: null });
  });

  it('serializes a non-string object body to JSON text while keeping the object', async () => {
    mockedPost.mockResolvedValue({ status_code: 200, body: { a: 1 } });

    const result = await apiCallApi.request({ method: 'GET', url: 'u' });

    expect(result).toMatchObject({ bodyText: '{"a":1}', body: { a: 1 } });
  });

  it('returns an empty body text and null body when the body is missing', async () => {
    mockedPost.mockResolvedValue({ status_code: 200 });

    const result = await apiCallApi.request({ method: 'GET', url: 'u' });

    expect(result).toMatchObject({ bodyText: '', body: null });
  });

  it('normalizes Go-style array headers into string arrays', async () => {
    mockedPost.mockResolvedValue({
      status_code: 200,
      header: { 'Content-Type': ['application/json'], 'X-Count': [1, 2] },
      body: '',
    });

    const result = await apiCallApi.request({ method: 'GET', url: 'u' });

    expect(result.header).toEqual({
      'Content-Type': ['application/json'],
      'X-Count': ['1', '2'],
    });
  });

  it('wraps a flat string header value into a single-element array', async () => {
    mockedPost.mockResolvedValue({
      status_code: 200,
      header: { 'X-Trace': 'abc' },
      body: '',
    });

    const result = await apiCallApi.request({ method: 'GET', url: 'u' });

    expect(result.header).toEqual({ 'X-Trace': ['abc'] });
  });

  it('reads headers from the camelCase headers field when header is absent', async () => {
    mockedPost.mockResolvedValue({
      status_code: 200,
      headers: { 'X-From-Headers': 'value' },
      body: '',
    });

    const result = await apiCallApi.request({ method: 'GET', url: 'u' });

    expect(result.header).toEqual({ 'X-From-Headers': ['value'] });
  });

  it('drops null and undefined header values during normalization', async () => {
    mockedPost.mockResolvedValue({
      status_code: 200,
      header: { Keep: 'yes', DropNull: null, DropUndef: undefined },
      body: '',
    });

    const result = await apiCallApi.request({ method: 'GET', url: 'u' });

    expect(result.header).toEqual({ Keep: ['yes'] });
  });

  it('returns an empty header map when headers are absent entirely', async () => {
    mockedPost.mockResolvedValue({ status_code: 200, body: '' });

    const result = await apiCallApi.request({ method: 'GET', url: 'u' });

    expect(result.header).toEqual({});
  });
});
