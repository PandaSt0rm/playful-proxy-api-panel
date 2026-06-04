import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { useConfigStore } from './useConfigStore';
import { configApi } from '@/services/api/config';
import type { Config } from '@/types';
import type { RawConfigSection } from '@/types/config';
import { CACHE_EXPIRY_MS } from '@/utils/constants';

vi.mock('@/services/api/config', () => ({
  configApi: {
    getConfig: vi.fn(),
  },
}));

const mockedGetConfig = vi.mocked(configApi.getConfig);

// A representative Config covering every typed section the store extracts.
const makeConfig = (overrides: Partial<Config> = {}): Config => ({
  debug: true,
  proxyUrl: 'http://proxy.local',
  requestRetry: 3,
  quotaExceeded: { switchProject: true },
  requestLog: false,
  loggingToFile: true,
  logsMaxTotalSizeMb: 256,
  errorLogsMaxFiles: 7,
  usageStatisticsEnabled: true,
  wsAuth: false,
  forceModelPrefix: true,
  routingStrategy: 'round-robin',
  maxRetryInterval: 42,
  upstreamConcurrency: { default: 5 },
  apiKeys: ['key-a', 'key-b'],
  ampcode: { enabled: true } as Config['ampcode'],
  geminiApiKeys: [{ apiKey: 'g-1' }] as Config['geminiApiKeys'],
  codexApiKeys: [{ apiKey: 'c-1' }] as Config['codexApiKeys'],
  claudeApiKeys: [{ apiKey: 'cl-1' }] as Config['claudeApiKeys'],
  vertexApiKeys: [{ apiKey: 'v-1' }] as Config['vertexApiKeys'],
  openaiCompatibility: [{ name: 'openai' }] as Config['openaiCompatibility'],
  oauthExcludedModels: { gemini: ['m1'] },
  syncProfiles: [{ id: 'p1' }] as Config['syncProfiles'],
  raw: { 'unmapped-section': { hello: 'world' } },
  ...overrides,
});

// Resolve all pending microtasks so awaited mock promises settle even when
// fake timers are installed.
const flushMicrotasks = () => Promise.resolve().then(() => Promise.resolve());

beforeEach(() => {
  mockedGetConfig.mockReset();
  // Reset the public store state.
  useConfigStore.setState({ config: null, cache: new Map(), loading: false, error: null });
  // clearCache() advances the module-level request token and nulls any in-flight
  // request left over from a previous test, isolating the supersession state.
  useConfigStore.getState().clearCache();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useConfigStore.fetchConfig — fetching and store updates', () => {
  it('returns the full normalized config from configApi.getConfig on a cold fetch', async () => {
    const config = makeConfig();
    mockedGetConfig.mockResolvedValue(config);

    const result = await useConfigStore.getState().fetchConfig();

    expect(result).toBe(config);
  });

  it('stores the fetched config in state', async () => {
    const config = makeConfig();
    mockedGetConfig.mockResolvedValue(config);

    await useConfigStore.getState().fetchConfig();

    expect(useConfigStore.getState().config).toBe(config);
  });

  it('clears loading after a successful fetch', async () => {
    mockedGetConfig.mockResolvedValue(makeConfig());

    await useConfigStore.getState().fetchConfig();

    expect(useConfigStore.getState().loading).toBe(false);
  });

  it('returns the extracted section value when a section is requested', async () => {
    const config = makeConfig({ requestRetry: 9 });
    mockedGetConfig.mockResolvedValue(config);

    const result = await useConfigStore.getState().fetchConfig('request-retry');

    expect(result).toBe(9);
  });

  it('resolves an unmapped section from the raw config bag', async () => {
    const config = makeConfig({ raw: { 'unmapped-section': { hello: 'world' } } });
    mockedGetConfig.mockResolvedValue(config);

    const result = await useConfigStore.getState().fetchConfig('unmapped-section' as RawConfigSection);

    expect(result).toEqual({ hello: 'world' });
  });
});

describe('useConfigStore.fetchConfig — caching', () => {
  it('serves a second full fetch from cache without a second API call', async () => {
    const config = makeConfig();
    mockedGetConfig.mockResolvedValue(config);
    await useConfigStore.getState().fetchConfig();

    await useConfigStore.getState().fetchConfig();

    expect(mockedGetConfig).toHaveBeenCalledTimes(1);
  });

  it('returns the cached full config object on a cache hit', async () => {
    const config = makeConfig();
    mockedGetConfig.mockResolvedValue(config);
    await useConfigStore.getState().fetchConfig();

    const result = await useConfigStore.getState().fetchConfig();

    expect(result).toBe(config);
  });

  it('forceRefresh bypasses a valid cache and re-calls the API', async () => {
    const first = makeConfig({ requestRetry: 1 });
    const second = makeConfig({ requestRetry: 2 });
    mockedGetConfig.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    await useConfigStore.getState().fetchConfig();

    const result = await useConfigStore.getState().fetchConfig(undefined, true);

    expect(result).toBe(second);
  });

  it('serves a section request from the section cache without a new API call', async () => {
    const config = makeConfig({ debug: true });
    mockedGetConfig.mockResolvedValue(config);
    await useConfigStore.getState().fetchConfig();

    const result = await useConfigStore.getState().fetchConfig('debug');

    expect(result).toBe(true);
  });

  it('does not call the API again when serving a section from the section cache', async () => {
    mockedGetConfig.mockResolvedValue(makeConfig());
    await useConfigStore.getState().fetchConfig();

    await useConfigStore.getState().fetchConfig('routing/strategy');

    expect(mockedGetConfig).toHaveBeenCalledTimes(1);
  });

  it('does not cache a section whose extracted value is undefined', async () => {
    // requestRetry omitted -> extractSectionValue returns undefined -> not seeded into cache.
    const config = makeConfig({ requestRetry: undefined });
    mockedGetConfig.mockResolvedValue(config);
    await useConfigStore.getState().fetchConfig();

    expect(useConfigStore.getState().cache.has('request-retry')).toBe(false);
  });

  it('reuses the full cache for an uncached section without issuing a new request', async () => {
    // Seed only the full cache, then delete the section entry so the
    // "section miss but full cache valid" branch is exercised.
    const config = makeConfig({ debug: true });
    mockedGetConfig.mockResolvedValue(config);
    await useConfigStore.getState().fetchConfig();
    const cache = new Map(useConfigStore.getState().cache);
    cache.delete('debug');
    useConfigStore.setState({ cache });

    const result = await useConfigStore.getState().fetchConfig('debug');

    expect(result).toBe(true);
  });

  it('does not call the API when extracting an uncached section from a valid full cache', async () => {
    mockedGetConfig.mockResolvedValue(makeConfig());
    await useConfigStore.getState().fetchConfig();
    const cache = new Map(useConfigStore.getState().cache);
    cache.delete('debug');
    useConfigStore.setState({ cache });

    await useConfigStore.getState().fetchConfig('debug');

    expect(mockedGetConfig).toHaveBeenCalledTimes(1);
  });
});

describe('useConfigStore.fetchConfig — cache expiry', () => {
  it('treats a cache entry as expired exactly at CACHE_EXPIRY_MS and re-fetches', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    mockedGetConfig.mockResolvedValue(makeConfig());
    await useConfigStore.getState().fetchConfig();

    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z').getTime() + CACHE_EXPIRY_MS);
    await useConfigStore.getState().fetchConfig();

    expect(mockedGetConfig).toHaveBeenCalledTimes(2);
  });

  it('serves from cache one millisecond before CACHE_EXPIRY_MS elapses', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    mockedGetConfig.mockResolvedValue(makeConfig());
    await useConfigStore.getState().fetchConfig();

    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z').getTime() + CACHE_EXPIRY_MS - 1);
    await useConfigStore.getState().fetchConfig();

    expect(mockedGetConfig).toHaveBeenCalledTimes(1);
  });
});

describe('useConfigStore.fetchConfig — request deduplication', () => {
  it('merges two concurrent full fetches into a single API call', async () => {
    let resolve!: (value: Config) => void;
    mockedGetConfig.mockReturnValue(new Promise<Config>((r) => { resolve = r; }));
    const config = makeConfig();

    const a = useConfigStore.getState().fetchConfig();
    const b = useConfigStore.getState().fetchConfig();
    resolve(config);
    await Promise.all([a, b]);

    expect(mockedGetConfig).toHaveBeenCalledTimes(1);
  });

  it('resolves both concurrent full fetches with the same config object', async () => {
    let resolve!: (value: Config) => void;
    mockedGetConfig.mockReturnValue(new Promise<Config>((r) => { resolve = r; }));
    const config = makeConfig();

    const a = useConfigStore.getState().fetchConfig();
    const b = useConfigStore.getState().fetchConfig();
    resolve(config);
    const [resultA, resultB] = await Promise.all([a, b]);

    expect([resultA, resultB]).toEqual([config, config]);
  });

  it('extracts the requested section from the deduplicated in-flight request', async () => {
    let resolve!: (value: Config) => void;
    mockedGetConfig.mockReturnValue(new Promise<Config>((r) => { resolve = r; }));
    const config = makeConfig({ maxRetryInterval: 99 });

    const full = useConfigStore.getState().fetchConfig();
    const section = useConfigStore.getState().fetchConfig('max-retry-interval');
    resolve(config);
    await full;
    const result = await section;

    expect(result).toBe(99);
  });
});

describe('useConfigStore.fetchConfig — supersession', () => {
  it('returns the in-flight result without writing it to state when the connection was reset mid-flight', async () => {
    let resolve!: (value: Config) => void;
    mockedGetConfig.mockReturnValue(new Promise<Config>((r) => { resolve = r; }));
    const config = makeConfig();

    const pending = useConfigStore.getState().fetchConfig();
    // Simulate a logout/connection switch that invalidates the in-flight request.
    useConfigStore.getState().clearCache();
    resolve(config);
    const result = await pending;

    expect(result).toBe(config);
  });

  it('does not store the superseded config so the cleared state stands', async () => {
    let resolve!: (value: Config) => void;
    mockedGetConfig.mockReturnValue(new Promise<Config>((r) => { resolve = r; }));

    const pending = useConfigStore.getState().fetchConfig();
    useConfigStore.getState().clearCache();
    resolve(makeConfig());
    await pending;

    expect(useConfigStore.getState().config).toBeNull();
  });
});

describe('useConfigStore.fetchConfig — error handling', () => {
  it('rejects with the original error from the API', async () => {
    const failure = new Error('boom');
    mockedGetConfig.mockRejectedValue(failure);

    await expect(useConfigStore.getState().fetchConfig()).rejects.toBe(failure);
  });

  it('records the Error message in state on failure', async () => {
    mockedGetConfig.mockRejectedValue(new Error('network down'));

    await expect(useConfigStore.getState().fetchConfig()).rejects.toThrow();

    expect(useConfigStore.getState().error).toBe('network down');
  });

  it('records a string rejection value as the error message', async () => {
    mockedGetConfig.mockRejectedValue('string failure');

    await expect(useConfigStore.getState().fetchConfig()).rejects.toBe('string failure');

    expect(useConfigStore.getState().error).toBe('string failure');
  });

  it('falls back to a default message for a non-Error, non-string rejection', async () => {
    mockedGetConfig.mockRejectedValue({ unexpected: true });

    await expect(useConfigStore.getState().fetchConfig()).rejects.toEqual({ unexpected: true });

    expect(useConfigStore.getState().error).toBe('Failed to fetch config');
  });

  it('clears loading after a failed fetch', async () => {
    mockedGetConfig.mockRejectedValue(new Error('boom'));

    await expect(useConfigStore.getState().fetchConfig()).rejects.toThrow();

    expect(useConfigStore.getState().loading).toBe(false);
  });
});

describe('useConfigStore.isCacheValid', () => {
  it('returns false when no entry exists for the key', () => {
    const result = useConfigStore.getState().isCacheValid();

    expect(result).toBe(false);
  });

  it('returns true for a fresh full-cache entry', async () => {
    mockedGetConfig.mockResolvedValue(makeConfig());
    await useConfigStore.getState().fetchConfig();

    const result = useConfigStore.getState().isCacheValid();

    expect(result).toBe(true);
  });

  it('returns true for a fresh section-cache entry', async () => {
    mockedGetConfig.mockResolvedValue(makeConfig());
    await useConfigStore.getState().fetchConfig();

    const result = useConfigStore.getState().isCacheValid('debug');

    expect(result).toBe(true);
  });

  it('returns false once the entry has aged past CACHE_EXPIRY_MS', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    mockedGetConfig.mockResolvedValue(makeConfig());
    await useConfigStore.getState().fetchConfig();

    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z').getTime() + CACHE_EXPIRY_MS);

    expect(useConfigStore.getState().isCacheValid()).toBe(false);
  });
});

describe('useConfigStore.clearCache', () => {
  it('clears the full config and empties the cache when called with no section', async () => {
    mockedGetConfig.mockResolvedValue(makeConfig());
    await useConfigStore.getState().fetchConfig();

    useConfigStore.getState().clearCache();

    expect(useConfigStore.getState().config).toBeNull();
  });

  it('empties the entire cache map when called with no section', async () => {
    mockedGetConfig.mockResolvedValue(makeConfig());
    await useConfigStore.getState().fetchConfig();

    useConfigStore.getState().clearCache();

    expect(useConfigStore.getState().cache.size).toBe(0);
  });

  it('forces a fresh API call after a full clear', async () => {
    mockedGetConfig.mockResolvedValue(makeConfig());
    await useConfigStore.getState().fetchConfig();
    useConfigStore.getState().clearCache();

    await useConfigStore.getState().fetchConfig();

    expect(mockedGetConfig).toHaveBeenCalledTimes(2);
  });

  it('removes the targeted section entry when called with a section', async () => {
    mockedGetConfig.mockResolvedValue(makeConfig());
    await useConfigStore.getState().fetchConfig();

    useConfigStore.getState().clearCache('debug');

    expect(useConfigStore.getState().cache.has('debug')).toBe(false);
  });

  it('also removes the full-config entry when clearing a single section', async () => {
    mockedGetConfig.mockResolvedValue(makeConfig());
    await useConfigStore.getState().fetchConfig();

    useConfigStore.getState().clearCache('debug');

    expect(useConfigStore.getState().cache.has('__full__')).toBe(false);
  });

  it('keeps the loaded config object when clearing a single section', async () => {
    const config = makeConfig();
    mockedGetConfig.mockResolvedValue(config);
    await useConfigStore.getState().fetchConfig();

    useConfigStore.getState().clearCache('debug');

    expect(useConfigStore.getState().config).toBe(config);
  });

  it('preserves other section cache entries when clearing a single section', async () => {
    mockedGetConfig.mockResolvedValue(makeConfig());
    await useConfigStore.getState().fetchConfig();

    useConfigStore.getState().clearCache('debug');

    expect(useConfigStore.getState().cache.has('proxy-url')).toBe(true);
  });
});

describe('useConfigStore.updateConfigValue', () => {
  it('writes the new value into the raw bag under the section key', () => {
    useConfigStore.getState().updateConfigValue('debug', false);

    expect(useConfigStore.getState().config?.raw?.debug).toBe(false);
  });

  it('updates the typed field for a known section', () => {
    useConfigStore.getState().updateConfigValue('request-retry', 11);

    expect(useConfigStore.getState().config?.requestRetry).toBe(11);
  });

  it('maps the routing/strategy section onto the routingStrategy field', () => {
    useConfigStore.getState().updateConfigValue('routing/strategy', 'least-load');

    expect(useConfigStore.getState().config?.routingStrategy).toBe('least-load');
  });

  it('maps the gemini-api-key section onto the geminiApiKeys field', () => {
    const keys = [{ apiKey: 'gem' }] as Config['geminiApiKeys'];

    useConfigStore.getState().updateConfigValue('gemini-api-key', keys);

    expect(useConfigStore.getState().config?.geminiApiKeys).toBe(keys);
  });

  it('preserves existing typed fields when updating a different section', () => {
    useConfigStore.setState({ config: { debug: true, raw: {} } });

    useConfigStore.getState().updateConfigValue('request-retry', 5);

    expect(useConfigStore.getState().config?.debug).toBe(true);
  });

  it('stores an unmapped section only in the raw bag', () => {
    useConfigStore.getState().updateConfigValue('unmapped-section' as RawConfigSection, { x: 1 });

    expect(useConfigStore.getState().config?.raw?.['unmapped-section']).toEqual({ x: 1 });
  });

  it('invalidates the section cache after an optimistic update', async () => {
    mockedGetConfig.mockResolvedValue(makeConfig());
    await useConfigStore.getState().fetchConfig();

    useConfigStore.getState().updateConfigValue('debug', false);

    expect(useConfigStore.getState().cache.has('debug')).toBe(false);
  });

  it('invalidates the full-config cache after an optimistic update', async () => {
    mockedGetConfig.mockResolvedValue(makeConfig());
    await useConfigStore.getState().fetchConfig();

    useConfigStore.getState().updateConfigValue('debug', false);

    expect(useConfigStore.getState().cache.has('__full__')).toBe(false);
  });

  it('lets a superseded in-flight fetch finish without overwriting the optimistic update', async () => {
    let resolve!: (value: Config) => void;
    mockedGetConfig.mockReturnValue(new Promise<Config>((r) => { resolve = r; }));
    const pending = useConfigStore.getState().fetchConfig();

    useConfigStore.getState().updateConfigValue('debug', false);
    resolve(makeConfig({ debug: true }));
    await pending;
    await flushMicrotasks();

    expect(useConfigStore.getState().config?.debug).toBe(false);
  });
});
