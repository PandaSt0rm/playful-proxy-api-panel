import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the typed api boundary so the store's fetch logic is exercised without
// real network calls.
vi.mock('@/services/api/models', () => ({
  modelsApi: { fetchModels: vi.fn() },
}));

import { modelsApi } from '@/services/api/models';
import { useModelsStore } from './useModelsStore';
import { CACHE_EXPIRY_MS } from '@/utils/constants';
import type { ModelInfo } from '@/utils/models';

const fetchModelsMock = vi.mocked(modelsApi.fetchModels);

const sampleModels: ModelInfo[] = [{ name: 'gpt-4' }, { name: 'claude-3' }];

describe('useModelsStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-03T00:00:00.000Z'));
    useModelsStore.setState({ models: [], loading: false, error: null, cache: null });
    fetchModelsMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('isCacheValid', () => {
    it('returns false when there is no cache', () => {
      const valid = useModelsStore.getState().isCacheValid('https://api.example.com', 'key');

      expect(valid).toBe(false);
    });

    it('returns false when the cached apiBase differs', () => {
      useModelsStore.setState({
        cache: {
          data: sampleModels,
          timestamp: Date.now(),
          apiBase: 'https://a.com',
          apiKey: 'key',
        },
      });

      const valid = useModelsStore.getState().isCacheValid('https://b.com', 'key');

      expect(valid).toBe(false);
    });

    it('returns false when the cached apiKey differs', () => {
      useModelsStore.setState({
        cache: {
          data: sampleModels,
          timestamp: Date.now(),
          apiBase: 'https://a.com',
          apiKey: 'key-1',
        },
      });

      const valid = useModelsStore.getState().isCacheValid('https://a.com', 'key-2');

      expect(valid).toBe(false);
    });

    it('treats a whitespace-only apiKey as equivalent to the empty cached key', () => {
      useModelsStore.setState({
        cache: { data: sampleModels, timestamp: Date.now(), apiBase: 'https://a.com', apiKey: '' },
      });

      const valid = useModelsStore.getState().isCacheValid('https://a.com', '   ');

      expect(valid).toBe(true);
    });

    it('returns true for a matching, fresh cache', () => {
      useModelsStore.setState({
        cache: {
          data: sampleModels,
          timestamp: Date.now(),
          apiBase: 'https://a.com',
          apiKey: 'key',
        },
      });

      const valid = useModelsStore.getState().isCacheValid('https://a.com', 'key');

      expect(valid).toBe(true);
    });

    it('returns true exactly one millisecond before expiry', () => {
      const timestamp = Date.now();
      useModelsStore.setState({
        cache: { data: sampleModels, timestamp, apiBase: 'https://a.com', apiKey: 'key' },
      });
      vi.setSystemTime(new Date(timestamp + CACHE_EXPIRY_MS - 1));

      const valid = useModelsStore.getState().isCacheValid('https://a.com', 'key');

      expect(valid).toBe(true);
    });

    it('returns false once the cache age reaches the expiry boundary', () => {
      const timestamp = Date.now();
      useModelsStore.setState({
        cache: { data: sampleModels, timestamp, apiBase: 'https://a.com', apiKey: 'key' },
      });
      vi.setSystemTime(new Date(timestamp + CACHE_EXPIRY_MS));

      const valid = useModelsStore.getState().isCacheValid('https://a.com', 'key');

      expect(valid).toBe(false);
    });
  });

  describe('fetchModels (cache miss)', () => {
    it('returns the freshly fetched list', async () => {
      fetchModelsMock.mockResolvedValue(sampleModels);

      const result = await useModelsStore.getState().fetchModels('https://a.com', 'key');

      expect(result).toEqual(sampleModels);
    });

    it('stores the fetched list in models and clears loading', async () => {
      fetchModelsMock.mockResolvedValue(sampleModels);

      await useModelsStore.getState().fetchModels('https://a.com', 'key');

      const { models, loading } = useModelsStore.getState();
      expect(models).toEqual(sampleModels);
      expect(loading).toBe(false);
    });

    it('caches the fetched list with the current timestamp and scoped key', async () => {
      fetchModelsMock.mockResolvedValue(sampleModels);

      await useModelsStore.getState().fetchModels('https://a.com', '  key  ');

      const { cache } = useModelsStore.getState();
      expect(cache).toEqual({
        data: sampleModels,
        timestamp: Date.now(),
        apiBase: 'https://a.com',
        apiKey: 'key',
      });
    });

    it('passes an undefined apiKey to the api when the key is blank', async () => {
      fetchModelsMock.mockResolvedValue(sampleModels);

      await useModelsStore.getState().fetchModels('https://a.com', '   ');

      expect(fetchModelsMock).toHaveBeenCalledWith('https://a.com', undefined);
    });

    it('passes the trimmed apiKey to the api when a key is provided', async () => {
      fetchModelsMock.mockResolvedValue(sampleModels);

      await useModelsStore.getState().fetchModels('https://a.com', '  secret  ');

      expect(fetchModelsMock).toHaveBeenCalledWith('https://a.com', 'secret');
    });
  });

  describe('fetchModels (cache hit)', () => {
    it('returns the cached data without calling the api', async () => {
      const cached: ModelInfo[] = [{ name: 'cached-model' }];
      useModelsStore.setState({
        cache: { data: cached, timestamp: Date.now(), apiBase: 'https://a.com', apiKey: 'key' },
      });

      const result = await useModelsStore.getState().fetchModels('https://a.com', 'key');

      expect(result).toEqual(cached);
      expect(fetchModelsMock).not.toHaveBeenCalled();
    });

    it('promotes the cached data into models on a cache hit', async () => {
      const cached: ModelInfo[] = [{ name: 'cached-model' }];
      useModelsStore.setState({
        cache: { data: cached, timestamp: Date.now(), apiBase: 'https://a.com', apiKey: 'key' },
      });

      await useModelsStore.getState().fetchModels('https://a.com', 'key');

      expect(useModelsStore.getState().models).toEqual(cached);
    });

    it('refetches from the api when forceRefresh is true even with a valid cache', async () => {
      const cached: ModelInfo[] = [{ name: 'cached-model' }];
      useModelsStore.setState({
        cache: { data: cached, timestamp: Date.now(), apiBase: 'https://a.com', apiKey: 'key' },
      });
      fetchModelsMock.mockResolvedValue(sampleModels);

      const result = await useModelsStore.getState().fetchModels('https://a.com', 'key', true);

      expect(fetchModelsMock).toHaveBeenCalledTimes(1);
      expect(result).toEqual(sampleModels);
    });

    it('refetches when the cache is stale', async () => {
      const timestamp = Date.now();
      useModelsStore.setState({
        cache: { data: [{ name: 'old' }], timestamp, apiBase: 'https://a.com', apiKey: 'key' },
      });
      vi.setSystemTime(new Date(timestamp + CACHE_EXPIRY_MS + 1));
      fetchModelsMock.mockResolvedValue(sampleModels);

      const result = await useModelsStore.getState().fetchModels('https://a.com', 'key');

      expect(fetchModelsMock).toHaveBeenCalledTimes(1);
      expect(result).toEqual(sampleModels);
    });
  });

  describe('fetchModels (error path)', () => {
    it('rejects with the original error', async () => {
      const failure = new Error('network down');
      fetchModelsMock.mockRejectedValue(failure);

      await expect(useModelsStore.getState().fetchModels('https://a.com', 'key')).rejects.toBe(
        failure
      );
    });

    it('records the Error message and clears loading and models', async () => {
      fetchModelsMock.mockRejectedValue(new Error('network down'));

      await expect(useModelsStore.getState().fetchModels('https://a.com', 'key')).rejects.toThrow();

      const { error, loading, models } = useModelsStore.getState();
      expect(error).toBe('network down');
      expect(loading).toBe(false);
      expect(models).toEqual([]);
    });

    it('records a string rejection verbatim', async () => {
      fetchModelsMock.mockRejectedValue('plain string failure');

      await expect(useModelsStore.getState().fetchModels('https://a.com', 'key')).rejects.toBe(
        'plain string failure'
      );

      expect(useModelsStore.getState().error).toBe('plain string failure');
    });

    it('falls back to a default message for a non-Error, non-string rejection', async () => {
      fetchModelsMock.mockRejectedValue({ code: 500 });

      await expect(useModelsStore.getState().fetchModels('https://a.com', 'key')).rejects.toEqual({
        code: 500,
      });

      expect(useModelsStore.getState().error).toBe('Failed to fetch models');
    });
  });

  describe('clearCache', () => {
    it('clears the cache and empties the model list', () => {
      useModelsStore.setState({
        models: sampleModels,
        cache: {
          data: sampleModels,
          timestamp: Date.now(),
          apiBase: 'https://a.com',
          apiKey: 'key',
        },
      });

      useModelsStore.getState().clearCache();

      const { cache, models } = useModelsStore.getState();
      expect(cache).toBeNull();
      expect(models).toEqual([]);
    });
  });
});
