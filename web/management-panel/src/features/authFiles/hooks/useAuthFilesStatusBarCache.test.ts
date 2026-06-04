import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { AuthFileItem } from '@/types';
import { useAuthFilesStatusBarCache } from './useAuthFilesStatusBarCache';

const BLOCK_COUNT = 20;
const BLOCK_DURATION_MS = 10 * 60 * 1000;
const FIXED_NOW = 1_700_000_000_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

const fileWith = (overrides: Partial<AuthFileItem>): AuthFileItem => ({
  name: 'file.json',
  ...overrides,
});

describe('useAuthFilesStatusBarCache', () => {
  it('returns an empty cache when there are no files', () => {
    const { result } = renderHook(() => useAuthFilesStatusBarCache([]));

    expect(result.current.size).toBe(0);
  });

  it('skips files whose auth index is missing', () => {
    const files = [fileWith({ name: 'no-index.json' })];

    const { result } = renderHook(() => useAuthFilesStatusBarCache(files));

    expect(result.current.size).toBe(0);
  });

  it('keys the cache by the snake_case auth_index field', () => {
    const files = [fileWith({ name: 'a.json', auth_index: '7' })];

    const { result } = renderHook(() => useAuthFilesStatusBarCache(files));

    expect(result.current.has('7')).toBe(true);
  });

  it('normalizes a numeric auth_index into its string key', () => {
    const files = [fileWith({ name: 'a.json', auth_index: 12 })];

    const { result } = renderHook(() => useAuthFilesStatusBarCache(files));

    expect(result.current.has('12')).toBe(true);
  });

  it('falls back to the camelCase authIndex when auth_index is absent', () => {
    const files = [fileWith({ name: 'a.json', authIndex: 'cam-1' })];

    const { result } = renderHook(() => useAuthFilesStatusBarCache(files));

    expect(result.current.has('cam-1')).toBe(true);
  });

  it('computes success and failure totals from the snake_case recent_requests buckets', () => {
    const files = [
      fileWith({
        name: 'a.json',
        auth_index: '1',
        recent_requests: [
          { success: 3, failed: 1 },
          { success: 2, failed: 0 },
        ],
      }),
    ];

    const { result } = renderHook(() => useAuthFilesStatusBarCache(files));

    const data = result.current.get('1');
    expect(data?.totalSuccess).toBe(5);
    expect(data?.totalFailure).toBe(1);
  });

  it('reports a 100 percent success rate when there are no recent requests', () => {
    const files = [fileWith({ name: 'a.json', auth_index: '1' })];

    const { result } = renderHook(() => useAuthFilesStatusBarCache(files));

    expect(result.current.get('1')?.successRate).toBe(100);
  });

  it('left-pads the blocks with idle entries so there are exactly twenty blocks', () => {
    const files = [
      fileWith({ name: 'a.json', auth_index: '1', recent_requests: [{ success: 1, failed: 0 }] }),
    ];

    const { result } = renderHook(() => useAuthFilesStatusBarCache(files));

    const blocks = result.current.get('1')?.blocks ?? [];
    expect(blocks).toHaveLength(BLOCK_COUNT);
    expect(blocks[BLOCK_COUNT - 1]).toBe('success');
  });

  it('anchors the final block end time to the frozen current time', () => {
    const files = [
      fileWith({ name: 'a.json', auth_index: '1', recent_requests: [{ success: 1, failed: 0 }] }),
    ];

    const { result } = renderHook(() => useAuthFilesStatusBarCache(files));

    const details = result.current.get('1')?.blockDetails ?? [];
    const expectedFirstStart = FIXED_NOW - BLOCK_COUNT * BLOCK_DURATION_MS;
    expect(details[0]?.startTime).toBe(expectedFirstStart);
    expect(details[BLOCK_COUNT - 1]?.endTime).toBe(FIXED_NOW);
  });

  it('builds one cache entry per file with a distinct auth index', () => {
    const files = [
      fileWith({ name: 'a.json', auth_index: '1' }),
      fileWith({ name: 'b.json', auth_index: '2' }),
    ];

    const { result } = renderHook(() => useAuthFilesStatusBarCache(files));

    expect(result.current.size).toBe(2);
  });

  it('returns the same cached Map reference when the files array identity is unchanged', () => {
    const files = [fileWith({ name: 'a.json', auth_index: '1' })];

    const { result, rerender } = renderHook(
      ({ items }) => useAuthFilesStatusBarCache(items),
      { initialProps: { items: files } }
    );
    const firstCache = result.current;

    rerender({ items: files });

    expect(result.current).toBe(firstCache);
  });
});
