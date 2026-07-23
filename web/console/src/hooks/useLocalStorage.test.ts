import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@/test/utils';

import { useLocalStorage } from './useLocalStorage';

describe('useLocalStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the initial value when no entry is stored', () => {
    const { result } = renderHook(() => useLocalStorage('missing', 'fallback'));

    expect(result.current[0]).toBe('fallback');
  });

  it('reads and parses an existing stored string value', () => {
    localStorage.setItem('greeting', JSON.stringify('hello'));

    const { result } = renderHook(() => useLocalStorage('greeting', 'fallback'));

    expect(result.current[0]).toBe('hello');
  });

  it('reads and parses an existing stored object value', () => {
    localStorage.setItem('profile', JSON.stringify({ name: 'Ada', age: 36 }));

    const { result } = renderHook(() => useLocalStorage('profile', { name: '', age: 0 }));

    expect(result.current[0]).toEqual({ name: 'Ada', age: 36 });
  });

  it('reads a stored numeric value of zero rather than treating it as missing', () => {
    localStorage.setItem('count', JSON.stringify(0));

    const { result } = renderHook(() => useLocalStorage('count', 99));

    expect(result.current[0]).toBe(0);
  });

  it('falls back to the initial value when the stored JSON is corrupted', () => {
    localStorage.setItem('broken', '{not valid json');

    const { result } = renderHook(() => useLocalStorage('broken', 'safe-default'));

    expect(result.current[0]).toBe('safe-default');
  });

  it('logs an error when the stored JSON is corrupted', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.setItem('broken', '{not valid json');

    renderHook(() => useLocalStorage('broken', 'safe-default'));

    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('updates the in-memory value when set with a direct value', () => {
    const { result } = renderHook(() => useLocalStorage('color', 'red'));

    act(() => {
      result.current[1]('blue');
    });

    expect(result.current[0]).toBe('blue');
  });

  it('persists the serialized value to localStorage when set', () => {
    const { result } = renderHook(() => useLocalStorage('color', 'red'));

    act(() => {
      result.current[1]('blue');
    });

    expect(localStorage.getItem('color')).toBe(JSON.stringify('blue'));
  });

  it('derives the next value from the current value when set with an updater function', () => {
    const { result } = renderHook(() => useLocalStorage('count', 5));

    act(() => {
      result.current[1]((current) => current + 3);
    });

    expect(result.current[0]).toBe(8);
  });

  it('persists the function-derived value to localStorage', () => {
    const { result } = renderHook(() => useLocalStorage('count', 5));

    act(() => {
      result.current[1]((current) => current + 3);
    });

    expect(localStorage.getItem('count')).toBe(JSON.stringify(8));
  });

  it('applies sequential updater functions cumulatively', () => {
    const { result } = renderHook(() => useLocalStorage('count', 0));

    act(() => {
      result.current[1]((current) => current + 1);
    });
    act(() => {
      result.current[1]((current) => current + 10);
    });

    expect(result.current[0]).toBe(11);
  });

  it('persists null as a stored value distinct from the absence of an entry', () => {
    const { result } = renderHook(() => useLocalStorage<string | null>('nullable', 'default'));

    act(() => {
      result.current[1](null);
    });

    expect(localStorage.getItem('nullable')).toBe(JSON.stringify(null));
  });

  it('keeps separate values for separate keys', () => {
    const { result: first } = renderHook(() => useLocalStorage('alpha', 'a'));
    const { result: second } = renderHook(() => useLocalStorage('beta', 'b'));

    act(() => {
      first.current[1]('changed');
    });

    expect(second.current[0]).toBe('b');
  });

  it('logs an error and keeps the in-memory value when persistence throws', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    const { result } = renderHook(() => useLocalStorage('color', 'red'));

    act(() => {
      result.current[1]('blue');
    });

    expect(result.current[0]).toBe('blue');
    setItemSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('logs the persistence error when localStorage.setItem throws', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    const { result } = renderHook(() => useLocalStorage('color', 'red'));

    act(() => {
      result.current[1]('blue');
    });

    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});
