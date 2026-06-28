import { describe, it, expect, vi, beforeEach } from 'vitest';

import { oauthApi } from './oauth';
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

describe('oauthApi.startAuth', () => {
  it('requests the codex auth url with is_webui flag for a webui-supported provider', async () => {
    mockedGet.mockResolvedValue({ url: 'https://example/codex' });

    await oauthApi.startAuth('codex');

    expect(mockedGet).toHaveBeenCalledWith('/codex-auth-url', { params: { is_webui: true } });
  });

  it('omits params entirely for a provider that is not webui-supported', async () => {
    mockedGet.mockResolvedValue({ url: 'https://example/kimi' });

    await oauthApi.startAuth('kimi');

    expect(mockedGet).toHaveBeenCalledWith('/kimi-auth-url', { params: undefined });
  });

  it('returns the start response unchanged', async () => {
    const body = { url: 'https://example/xai', state: 'st-1' };
    mockedGet.mockResolvedValue(body);

    const result = await oauthApi.startAuth('xai');

    expect(result).toBe(body);
  });
});

describe('oauthApi.getAuthStatus', () => {
  it('requests the status endpoint with the state query param', async () => {
    mockedGet.mockResolvedValue({ status: 'wait' });

    await oauthApi.getAuthStatus('state-42');

    expect(mockedGet).toHaveBeenCalledWith('/get-auth-status', { params: { state: 'state-42' } });
  });

  it('returns the status body unchanged', async () => {
    const body = { status: 'error', error: 'denied' };
    mockedGet.mockResolvedValue(body);

    const result = await oauthApi.getAuthStatus('state-42');

    expect(result).toEqual({ status: 'error', error: 'denied' });
  });
});

describe('oauthApi.submitCallback', () => {
  it('uses the provider name directly in the callback payload', async () => {
    mockedPost.mockResolvedValue({ status: 'ok' });

    await oauthApi.submitCallback('codex', 'https://cb?code=2', 'st-3');

    expect(mockedPost).toHaveBeenCalledWith('/oauth-callback', {
      provider: 'codex',
      redirect_url: 'https://cb?code=2',
      state: 'st-3',
    });
  });

  it('sends undefined state when none is provided', async () => {
    mockedPost.mockResolvedValue({ status: 'ok' });

    await oauthApi.submitCallback('anthropic', 'https://cb?code=3');

    expect(mockedPost).toHaveBeenCalledWith('/oauth-callback', {
      provider: 'anthropic',
      redirect_url: 'https://cb?code=3',
      state: undefined,
    });
  });

  it('returns the callback response unchanged', async () => {
    const body = { status: 'ok' } as const;
    mockedPost.mockResolvedValue(body);

    const result = await oauthApi.submitCallback('xai', 'https://cb');

    expect(result).toBe(body);
  });
});
