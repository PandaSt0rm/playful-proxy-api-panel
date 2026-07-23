import { describe, it, expect, vi, beforeEach } from 'vitest';

import { configApi } from './config';
import { apiClient } from './client';
import { normalizeConfigResponse } from './transformers';

vi.mock('./client', () => ({
  apiClient: {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockedGet = vi.mocked(apiClient.get);
const mockedPut = vi.mocked(apiClient.put);
const mockedDelete = vi.mocked(apiClient.delete);

beforeEach(() => {
  mockedGet.mockReset();
  mockedPut.mockReset();
  mockedDelete.mockReset();
});

describe('configApi.getConfig', () => {
  it('returns the normalized config for the raw /config response', async () => {
    const raw = { debug: true, 'request-retry': 3 };
    mockedGet.mockResolvedValue(raw);

    const config = await configApi.getConfig();

    expect(config).toEqual(normalizeConfigResponse(raw));
  });

  it('requests the /config endpoint', async () => {
    mockedGet.mockResolvedValue({});

    await configApi.getConfig();

    expect(mockedGet).toHaveBeenCalledWith('/config');
  });
});

describe('configApi.getRawConfig', () => {
  it('returns the untransformed /config payload', async () => {
    const raw = { 'request-retry': '5' };
    mockedGet.mockResolvedValue(raw);

    const result = await configApi.getRawConfig();

    expect(result).toBe(raw);
  });
});

describe('configApi boolean toggle endpoints', () => {
  it('updateDebug puts the boolean value to /debug', async () => {
    mockedPut.mockResolvedValue(undefined);

    await configApi.updateDebug(true);

    expect(mockedPut).toHaveBeenCalledWith('/debug', { value: true });
  });

  it('updateRequestLog puts the boolean value to /request-log', async () => {
    mockedPut.mockResolvedValue(undefined);

    await configApi.updateRequestLog(false);

    expect(mockedPut).toHaveBeenCalledWith('/request-log', { value: false });
  });

  it('updateSwitchProject puts to the quota-exceeded switch-project endpoint', async () => {
    mockedPut.mockResolvedValue(undefined);

    await configApi.updateSwitchProject(true);

    expect(mockedPut).toHaveBeenCalledWith('/quota-exceeded/switch-project', { value: true });
  });

  it('updateSwitchPreviewModel puts to the quota-exceeded switch-preview-model endpoint', async () => {
    mockedPut.mockResolvedValue(undefined);

    await configApi.updateSwitchPreviewModel(false);

    expect(mockedPut).toHaveBeenCalledWith('/quota-exceeded/switch-preview-model', {
      value: false,
    });
  });
});

describe('configApi.updateProxyUrl / clearProxyUrl', () => {
  it('puts the proxy url value to /proxy-url', async () => {
    mockedPut.mockResolvedValue(undefined);

    await configApi.updateProxyUrl('http://proxy:8080');

    expect(mockedPut).toHaveBeenCalledWith('/proxy-url', { value: 'http://proxy:8080' });
  });

  it('deletes the /proxy-url endpoint when clearing', async () => {
    mockedDelete.mockResolvedValue(undefined);

    await configApi.clearProxyUrl();

    expect(mockedDelete).toHaveBeenCalledWith('/proxy-url');
  });
});

describe('configApi.getLogsMaxTotalSizeMb', () => {
  it('reads the kebab-case field', async () => {
    mockedGet.mockResolvedValue({ 'logs-max-total-size-mb': 512 });

    const value = await configApi.getLogsMaxTotalSizeMb();

    expect(value).toBe(512);
  });

  it('reads the camelCase field when the kebab-case key is absent', async () => {
    mockedGet.mockResolvedValue({ logsMaxTotalSizeMb: 256 });

    const value = await configApi.getLogsMaxTotalSizeMb();

    expect(value).toBe(256);
  });

  it('coerces a numeric string field to a number', async () => {
    mockedGet.mockResolvedValue({ 'logs-max-total-size-mb': '128' });

    const value = await configApi.getLogsMaxTotalSizeMb();

    expect(value).toBe(128);
  });

  it('returns 0 when the field is missing', async () => {
    mockedGet.mockResolvedValue({});

    const value = await configApi.getLogsMaxTotalSizeMb();

    expect(value).toBe(0);
  });

  it('returns 0 when the field is non-numeric', async () => {
    mockedGet.mockResolvedValue({ 'logs-max-total-size-mb': 'abc' });

    const value = await configApi.getLogsMaxTotalSizeMb();

    expect(value).toBe(0);
  });
});

describe('configApi.getErrorLogsMaxFiles', () => {
  it('reads the kebab-case field', async () => {
    mockedGet.mockResolvedValue({ 'error-logs-max-files': 7 });

    const value = await configApi.getErrorLogsMaxFiles();

    expect(value).toBe(7);
  });

  it('returns 0 for a NaN-producing value', async () => {
    mockedGet.mockResolvedValue({ 'error-logs-max-files': {} });

    const value = await configApi.getErrorLogsMaxFiles();

    expect(value).toBe(0);
  });
});

describe('configApi.getUsageStatisticsEnabled', () => {
  it('returns true for a truthy kebab-case flag', async () => {
    mockedGet.mockResolvedValue({ 'usage-statistics-enabled': true });

    const value = await configApi.getUsageStatisticsEnabled();

    expect(value).toBe(true);
  });

  it('returns false when the flag is missing', async () => {
    mockedGet.mockResolvedValue({});

    const value = await configApi.getUsageStatisticsEnabled();

    expect(value).toBe(false);
  });

  it('coerces a truthy non-empty string to true', async () => {
    mockedGet.mockResolvedValue({ 'usage-statistics-enabled': 'yes' });

    const value = await configApi.getUsageStatisticsEnabled();

    expect(value).toBe(true);
  });
});

describe('configApi.getForceModelPrefix', () => {
  it('returns true for a truthy flag', async () => {
    mockedGet.mockResolvedValue({ 'force-model-prefix': true });

    const value = await configApi.getForceModelPrefix();

    expect(value).toBe(true);
  });

  it('returns false when the flag is absent', async () => {
    mockedGet.mockResolvedValue({});

    const value = await configApi.getForceModelPrefix();

    expect(value).toBe(false);
  });
});

describe('configApi.getRoutingStrategy', () => {
  it('returns the strategy field when it is a string', async () => {
    mockedGet.mockResolvedValue({ strategy: 'weighted' });

    const value = await configApi.getRoutingStrategy();

    expect(value).toBe('weighted');
  });

  it('reads the kebab-case routing-strategy fallback', async () => {
    mockedGet.mockResolvedValue({ 'routing-strategy': 'least-busy' });

    const value = await configApi.getRoutingStrategy();

    expect(value).toBe('least-busy');
  });

  it('defaults to round-robin when no string strategy is present', async () => {
    mockedGet.mockResolvedValue({ strategy: 42 });

    const value = await configApi.getRoutingStrategy();

    expect(value).toBe('round-robin');
  });
});

describe('configApi.getMaxRetryInterval', () => {
  it('reads the kebab-case field', async () => {
    mockedGet.mockResolvedValue({ 'max-retry-interval': 30 });

    const value = await configApi.getMaxRetryInterval();

    expect(value).toBe(30);
  });

  it('returns 0 when the value cannot be parsed', async () => {
    mockedGet.mockResolvedValue({ 'max-retry-interval': 'soon' });

    const value = await configApi.getMaxRetryInterval();

    expect(value).toBe(0);
  });
});

describe('configApi.getUpstreamConcurrency', () => {
  it('extracts default, providers and queueTimeoutSeconds from the kebab-case block', async () => {
    mockedGet.mockResolvedValue({
      'upstream-concurrency': {
        default: 10,
        providers: { openai: 5, gemini: 3 },
        'queue-timeout-seconds': 60,
      },
    });

    const value = await configApi.getUpstreamConcurrency();

    expect(value).toEqual({
      default: 10,
      providers: { openai: 5, gemini: 3 },
      queueTimeoutSeconds: 60,
    });
  });

  it('reads the camelCase upstreamConcurrency wrapper', async () => {
    mockedGet.mockResolvedValue({
      upstreamConcurrency: { default: 4, queueTimeoutSeconds: 12 },
    });

    const value = await configApi.getUpstreamConcurrency();

    expect(value).toEqual({ default: 4, providers: undefined, queueTimeoutSeconds: 12 });
  });

  it('falls back to treating the whole payload as the concurrency block', async () => {
    mockedGet.mockResolvedValue({ default: 2 });

    const value = await configApi.getUpstreamConcurrency();

    expect(value).toEqual({ default: 2, providers: undefined, queueTimeoutSeconds: undefined });
  });

  it('coerces numeric-string provider limits and drops non-finite ones', async () => {
    mockedGet.mockResolvedValue({
      'upstream-concurrency': { providers: { good: '8', bad: 'oops' } },
    });

    const value = await configApi.getUpstreamConcurrency();

    expect(value.providers).toEqual({ good: 8 });
  });

  it('returns undefined providers when none parse to finite numbers', async () => {
    mockedGet.mockResolvedValue({
      'upstream-concurrency': { providers: { bad: 'oops' } },
    });

    const value = await configApi.getUpstreamConcurrency();

    expect(value.providers).toBeUndefined();
  });

  it('leaves default and queueTimeoutSeconds undefined when not finite', async () => {
    mockedGet.mockResolvedValue({
      'upstream-concurrency': { default: 'x', 'queue-timeout-seconds': 'y' },
    });

    const value = await configApi.getUpstreamConcurrency();

    expect(value).toEqual({
      default: undefined,
      providers: undefined,
      queueTimeoutSeconds: undefined,
    });
  });

  it('returns an empty object when the concurrency block is an array', async () => {
    mockedGet.mockResolvedValue({ 'upstream-concurrency': [1, 2, 3] });

    const value = await configApi.getUpstreamConcurrency();

    expect(value).toEqual({});
  });

  it('returns an empty object when the resolved block is null', async () => {
    mockedGet.mockResolvedValue({ 'upstream-concurrency': null });

    const value = await configApi.getUpstreamConcurrency();

    expect(value).toEqual({});
  });
});

describe('configApi.updateUpstreamConcurrency', () => {
  it('serializes a full config block with kebab-case queue key', async () => {
    mockedPut.mockResolvedValue(undefined);

    await configApi.updateUpstreamConcurrency({
      default: 6,
      providers: { openai: 2 },
      queueTimeoutSeconds: 45,
    });

    expect(mockedPut).toHaveBeenCalledWith('/upstream-concurrency', {
      default: 6,
      providers: { openai: 2 },
      'queue-timeout-seconds': 45,
    });
  });

  it('defaults missing fields to 0 and an empty providers object', async () => {
    mockedPut.mockResolvedValue(undefined);

    await configApi.updateUpstreamConcurrency({});

    expect(mockedPut).toHaveBeenCalledWith('/upstream-concurrency', {
      default: 0,
      providers: {},
      'queue-timeout-seconds': 0,
    });
  });
});

describe('configApi.updateUpstreamConcurrencyProvider', () => {
  it('puts the limit to a URL-encoded provider path', async () => {
    mockedPut.mockResolvedValue(undefined);

    await configApi.updateUpstreamConcurrencyProvider('open ai/x', 9);

    expect(mockedPut).toHaveBeenCalledWith('/upstream-concurrency/providers/open%20ai%2Fx', {
      limit: 9,
    });
  });
});

describe('configApi.deleteUpstreamConcurrencyProvider', () => {
  it('deletes a URL-encoded provider path', async () => {
    mockedDelete.mockResolvedValue(undefined);

    await configApi.deleteUpstreamConcurrencyProvider('a&b');

    expect(mockedDelete).toHaveBeenCalledWith('/upstream-concurrency/providers/a%26b');
  });
});
