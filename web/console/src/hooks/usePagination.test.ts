import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@/test/utils';

import { usePagination } from './usePagination';

const range = (count: number): number[] => Array.from({ length: count }, (_, i) => i + 1);

describe('usePagination', () => {
  it('starts on the first page', () => {
    const { result } = renderHook(() => usePagination(range(50), 10));

    expect(result.current.currentPage).toBe(1);
  });

  it('reports the total number of items', () => {
    const { result } = renderHook(() => usePagination(range(50), 10));

    expect(result.current.totalItems).toBe(50);
  });

  it('reports the configured page size', () => {
    const { result } = renderHook(() => usePagination(range(50), 10));

    expect(result.current.pageSize).toBe(10);
  });

  it('defaults the page size to 20 when not provided', () => {
    const { result } = renderHook(() => usePagination(range(50)));

    expect(result.current.pageSize).toBe(20);
  });

  it('computes total pages by rounding the item count up to the page size', () => {
    const { result } = renderHook(() => usePagination(range(45), 10));

    expect(result.current.totalPages).toBe(5);
  });

  it('computes a single total page when items divide evenly into one page', () => {
    const { result } = renderHook(() => usePagination(range(10), 10));

    expect(result.current.totalPages).toBe(1);
  });

  it('reports at least one total page for an empty item list', () => {
    const { result } = renderHook(() => usePagination<number>([], 10));

    expect(result.current.totalPages).toBe(1);
  });

  it('exposes the first page slice of items on the initial page', () => {
    const { result } = renderHook(() => usePagination(range(25), 10));

    expect(result.current.currentItems).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('returns an empty current-items slice for an empty item list', () => {
    const { result } = renderHook(() => usePagination<number>([], 10));

    expect(result.current.currentItems).toEqual([]);
  });

  it('exposes a partial final-page slice when the last page is not full', () => {
    const { result } = renderHook(() => usePagination(range(25), 10));

    act(() => {
      result.current.goToPage(3);
    });

    expect(result.current.currentItems).toEqual([21, 22, 23, 24, 25]);
  });

  it('navigates to an explicit valid page', () => {
    const { result } = renderHook(() => usePagination(range(50), 10));

    act(() => {
      result.current.goToPage(3);
    });

    expect(result.current.currentPage).toBe(3);
  });

  it('exposes the middle-page slice after navigating to a middle page', () => {
    const { result } = renderHook(() => usePagination(range(50), 10));

    act(() => {
      result.current.goToPage(2);
    });

    expect(result.current.currentItems).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
  });

  it('clamps goToPage to the first page when requesting a page below one', () => {
    const { result } = renderHook(() => usePagination(range(50), 10));

    act(() => {
      result.current.goToPage(0);
    });

    expect(result.current.currentPage).toBe(1);
  });

  it('clamps goToPage to the first page when requesting a negative page', () => {
    const { result } = renderHook(() => usePagination(range(50), 10));

    act(() => {
      result.current.goToPage(-5);
    });

    expect(result.current.currentPage).toBe(1);
  });

  it('clamps goToPage to the last page when requesting beyond the total', () => {
    const { result } = renderHook(() => usePagination(range(50), 10));

    act(() => {
      result.current.goToPage(99);
    });

    expect(result.current.currentPage).toBe(5);
  });

  it('advances one page when calling nextPage', () => {
    const { result } = renderHook(() => usePagination(range(50), 10));

    act(() => {
      result.current.nextPage();
    });

    expect(result.current.currentPage).toBe(2);
  });

  it('does not advance past the last page when calling nextPage repeatedly', () => {
    const { result } = renderHook(() => usePagination(range(20), 10));

    act(() => {
      result.current.nextPage();
    });
    act(() => {
      result.current.nextPage();
    });

    expect(result.current.currentPage).toBe(2);
  });

  it('returns to the previous page when calling prevPage', () => {
    const { result } = renderHook(() => usePagination(range(50), 10));

    act(() => {
      result.current.goToPage(3);
    });
    act(() => {
      result.current.prevPage();
    });

    expect(result.current.currentPage).toBe(2);
  });

  it('does not move below the first page when calling prevPage on page one', () => {
    const { result } = renderHook(() => usePagination(range(50), 10));

    act(() => {
      result.current.prevPage();
    });

    expect(result.current.currentPage).toBe(1);
  });

  it('updates the page size when calling setPageSize', () => {
    const { result } = renderHook(() => usePagination(range(50), 10));

    act(() => {
      result.current.setPageSize(25);
    });

    expect(result.current.pageSize).toBe(25);
  });

  it('recomputes total pages after the page size changes', () => {
    const { result } = renderHook(() => usePagination(range(50), 10));

    act(() => {
      result.current.setPageSize(25);
    });

    expect(result.current.totalPages).toBe(2);
  });

  it('resets to the first page when the page size changes', () => {
    const { result } = renderHook(() => usePagination(range(50), 10));

    act(() => {
      result.current.goToPage(4);
    });
    act(() => {
      result.current.setPageSize(25);
    });

    expect(result.current.currentPage).toBe(1);
  });

  it('exposes the new first-page slice after the page size changes', () => {
    const { result } = renderHook(() => usePagination(range(50), 10));

    act(() => {
      result.current.setPageSize(5);
    });

    expect(result.current.currentItems).toEqual([1, 2, 3, 4, 5]);
  });

  it('exposes a single full slice when the page size covers every item', () => {
    const { result } = renderHook(() => usePagination(range(3), 100));

    expect(result.current.currentItems).toEqual([1, 2, 3]);
  });

  it('recomputes the current slice when the underlying items change on the same page', () => {
    const { result, rerender } = renderHook(({ items }) => usePagination(items, 10), {
      initialProps: { items: range(50) },
    });

    rerender({ items: range(5) });

    expect(result.current.currentItems).toEqual([1, 2, 3, 4, 5]);
  });

  it('recomputes total pages when the underlying items shrink', () => {
    const { result, rerender } = renderHook(({ items }) => usePagination(items, 10), {
      initialProps: { items: range(50) },
    });

    rerender({ items: range(5) });

    expect(result.current.totalPages).toBe(1);
  });

  it('leaves currentPage stale and the slice empty when items shrink below the current page (documents current behavior)', () => {
    const { result, rerender } = renderHook(({ items }) => usePagination(items, 10), {
      initialProps: { items: range(50) },
    });

    act(() => {
      result.current.goToPage(5);
    });
    rerender({ items: range(5) });

    expect(result.current.currentItems).toEqual([]);
  });
});
