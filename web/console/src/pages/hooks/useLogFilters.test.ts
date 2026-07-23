import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useLogFilters } from './useLogFilters';
import type { ParsedLogLine } from './logTypes';

// Build a minimal ParsedLogLine for count/option computation; only the fields
// the hook reads (method, statusCode, path) need to be meaningful.
const line = (overrides: Partial<ParsedLogLine>): ParsedLogLine => ({
  raw: overrides.raw ?? 'raw',
  message: '',
  ...overrides,
});

beforeEach(() => {
  localStorage.clear();
});

describe('useLogFilters method counts', () => {
  it('counts each HTTP method occurrence across parsed lines', () => {
    const parsedLines = [
      line({ method: 'GET' }),
      line({ method: 'GET' }),
      line({ method: 'POST' }),
    ];

    const { result } = renderHook(() => useLogFilters({ parsedLines }));

    expect(result.current.methodCounts).toEqual({ GET: 2, POST: 1 });
  });

  it('omits lines without a method from the method counts', () => {
    const parsedLines = [line({ method: 'GET' }), line({})];

    const { result } = renderHook(() => useLogFilters({ parsedLines }));

    expect(result.current.methodCounts).toEqual({ GET: 1 });
  });
});

describe('useLogFilters status counts', () => {
  it('groups status codes into their hundreds bucket', () => {
    const parsedLines = [
      line({ statusCode: 200 }),
      line({ statusCode: 204 }),
      line({ statusCode: 404 }),
      line({ statusCode: 500 }),
    ];

    const { result } = renderHook(() => useLogFilters({ parsedLines }));

    expect(result.current.statusCounts).toEqual({ '2xx': 2, '4xx': 1, '5xx': 1 });
  });

  it('ignores lines without a resolvable status group', () => {
    const parsedLines = [line({ statusCode: 200 }), line({ statusCode: undefined })];

    const { result } = renderHook(() => useLogFilters({ parsedLines }));

    expect(result.current.statusCounts).toEqual({ '2xx': 1 });
  });
});

describe('useLogFilters path options', () => {
  it('sorts path options by descending count', () => {
    const parsedLines = [
      line({ path: '/a' }),
      line({ path: '/b' }),
      line({ path: '/b' }),
      line({ path: '/b' }),
    ];

    const { result } = renderHook(() => useLogFilters({ parsedLines }));

    expect(result.current.pathOptions).toEqual([
      { path: '/b', count: 3 },
      { path: '/a', count: 1 },
    ]);
  });

  it('breaks count ties by ascending path name', () => {
    const parsedLines = [line({ path: '/zebra' }), line({ path: '/apple' })];

    const { result } = renderHook(() => useLogFilters({ parsedLines }));

    expect(result.current.pathOptions).toEqual([
      { path: '/apple', count: 1 },
      { path: '/zebra', count: 1 },
    ]);
  });

  it('limits path options to the top twelve distinct paths', () => {
    const parsedLines = Array.from({ length: 15 }, (_, index) => line({ path: `/p${index}` }));

    const { result } = renderHook(() => useLogFilters({ parsedLines }));

    expect(result.current.pathOptions).toHaveLength(12);
  });

  it('returns an empty path option list when no lines carry a path', () => {
    const parsedLines = [line({ method: 'GET' })];

    const { result } = renderHook(() => useLogFilters({ parsedLines }));

    expect(result.current.pathOptions).toEqual([]);
  });
});

describe('useLogFilters method filter toggling', () => {
  it('adds a method to the active filters when toggled on', () => {
    const { result } = renderHook(() => useLogFilters({ parsedLines: [] }));

    act(() => {
      result.current.toggleMethodFilter('GET');
    });

    expect(result.current.methodFilters).toEqual(['GET']);
  });

  it('removes a method from the active filters when toggled twice', () => {
    const { result } = renderHook(() => useLogFilters({ parsedLines: [] }));

    act(() => {
      result.current.toggleMethodFilter('GET');
    });
    act(() => {
      result.current.toggleMethodFilter('GET');
    });

    expect(result.current.methodFilters).toEqual([]);
  });

  it('exposes the active method filters as a Set', () => {
    const { result } = renderHook(() => useLogFilters({ parsedLines: [] }));

    act(() => {
      result.current.toggleMethodFilter('POST');
    });

    expect(result.current.methodFilterSet.has('POST')).toBe(true);
  });
});

describe('useLogFilters status filter toggling', () => {
  it('adds a status group to the active filters when toggled on', () => {
    const { result } = renderHook(() => useLogFilters({ parsedLines: [] }));

    act(() => {
      result.current.toggleStatusFilter('5xx');
    });

    expect(result.current.statusFilters).toEqual(['5xx']);
  });

  it('removes a status group from the active filters when toggled twice', () => {
    const { result } = renderHook(() => useLogFilters({ parsedLines: [] }));

    act(() => {
      result.current.toggleStatusFilter('4xx');
    });
    act(() => {
      result.current.toggleStatusFilter('4xx');
    });

    expect(result.current.statusFilters).toEqual([]);
  });
});

describe('useLogFilters path filter toggling', () => {
  it('adds a path to the active filters when toggled on', () => {
    const { result } = renderHook(() => useLogFilters({ parsedLines: [] }));

    act(() => {
      result.current.togglePathFilter('/v1/models');
    });

    expect(result.current.pathFilters).toEqual(['/v1/models']);
  });
});

describe('useLogFilters hasStructuredFilters', () => {
  it('reports false when no filters are active', () => {
    const { result } = renderHook(() => useLogFilters({ parsedLines: [] }));

    expect(result.current.hasStructuredFilters).toBe(false);
  });

  it('reports true once a method filter is active', () => {
    const { result } = renderHook(() => useLogFilters({ parsedLines: [] }));

    act(() => {
      result.current.toggleMethodFilter('GET');
    });

    expect(result.current.hasStructuredFilters).toBe(true);
  });
});

describe('useLogFilters clearStructuredFilters', () => {
  it('clears every active filter dimension at once', () => {
    const { result } = renderHook(() => useLogFilters({ parsedLines: [] }));

    act(() => {
      result.current.toggleMethodFilter('GET');
      result.current.toggleStatusFilter('2xx');
      result.current.togglePathFilter('/x');
    });
    act(() => {
      result.current.clearStructuredFilters();
    });

    expect({
      methodFilters: result.current.methodFilters,
      statusFilters: result.current.statusFilters,
      pathFilters: result.current.pathFilters,
    }).toEqual({ methodFilters: [], statusFilters: [], pathFilters: [] });
  });
});

describe('useLogFilters persistence', () => {
  it('persists the active method filters to localStorage', () => {
    const { result } = renderHook(() => useLogFilters({ parsedLines: [] }));

    act(() => {
      result.current.toggleMethodFilter('DELETE');
    });

    expect(localStorage.getItem('logsPage.methodFilters')).toBe(JSON.stringify(['DELETE']));
  });

  it('initializes method filters from previously persisted localStorage state', () => {
    localStorage.setItem('logsPage.methodFilters', JSON.stringify(['PUT']));

    const { result } = renderHook(() => useLogFilters({ parsedLines: [] }));

    expect(result.current.methodFilters).toEqual(['PUT']);
  });
});

describe('useLogFilters path pruning effect', () => {
  it('drops persisted path filters that are no longer valid path options', () => {
    localStorage.setItem('logsPage.pathFilters', JSON.stringify(['/gone', '/here']));
    const parsedLines = [line({ path: '/here' })];

    const { result } = renderHook(() => useLogFilters({ parsedLines }));

    expect(result.current.pathFilters).toEqual(['/here']);
  });

  it('keeps persisted path filters that match current options unchanged', () => {
    localStorage.setItem('logsPage.pathFilters', JSON.stringify(['/here']));
    const parsedLines = [line({ path: '/here' })];

    const { result } = renderHook(() => useLogFilters({ parsedLines }));

    expect(result.current.pathFilters).toEqual(['/here']);
  });

  it('does not prune path filters while there are no parsed lines', () => {
    localStorage.setItem('logsPage.pathFilters', JSON.stringify(['/gone']));

    const { result } = renderHook(() => useLogFilters({ parsedLines: [] }));

    expect(result.current.pathFilters).toEqual(['/gone']);
  });
});
