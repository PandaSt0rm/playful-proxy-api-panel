import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  normalizeArrayResponse,
  debounce,
  throttle,
  escapeHtml,
  generateId,
  deepClone,
  sleep,
} from './helpers';

describe('normalizeArrayResponse', () => {
  it('returns an empty array for null', () => {
    const result = normalizeArrayResponse(null);

    expect(result).toEqual([]);
  });

  it('returns an empty array for undefined', () => {
    const result = normalizeArrayResponse(undefined);

    expect(result).toEqual([]);
  });

  it('returns an array input unchanged', () => {
    const input = [1, 2, 3];

    const result = normalizeArrayResponse(input);

    expect(result).toBe(input);
  });

  it('wraps a single object value in an array', () => {
    const result = normalizeArrayResponse({ id: 1 });

    expect(result).toEqual([{ id: 1 }]);
  });

  it('returns an empty array for the falsy value 0', () => {
    const result = normalizeArrayResponse(0 as unknown as number);

    expect(result).toEqual([]);
  });

  it('returns an empty array for an empty string', () => {
    const result = normalizeArrayResponse('' as unknown as string);

    expect(result).toEqual([]);
  });
});

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not invoke the function before the delay elapses', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    vi.advanceTimersByTime(99);

    expect(fn).not.toHaveBeenCalled();
  });

  it('invokes the function once after the delay elapses', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    vi.advanceTimersByTime(100);

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('collapses rapid successive calls into a single invocation', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    vi.advanceTimersByTime(50);
    debounced();
    vi.advanceTimersByTime(50);
    debounced();
    vi.advanceTimersByTime(100);

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('invokes the function with the arguments of the most recent call', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced('first');
    debounced('second');
    vi.advanceTimersByTime(100);

    expect(fn).toHaveBeenCalledWith('second');
  });

  it('preserves the caller as the this binding', () => {
    const received: { value?: unknown } = {};
    function record(this: { value: number }) {
      received.value = this.value;
    }
    const debounced = debounce(record, 100);
    const context = { value: 7, debounced };

    context.debounced();
    vi.advanceTimersByTime(100);

    expect(received.value).toBe(7);
  });
});

describe('throttle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('invokes the function immediately on the first call', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled();

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('ignores calls made during the throttle window', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled();
    throttled();
    throttled();

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('allows another invocation after the throttle window expires', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled();
    vi.advanceTimersByTime(100);
    throttled();

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('forwards the arguments of the leading call', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled('leading');

    expect(fn).toHaveBeenCalledWith('leading');
  });
});

describe('escapeHtml', () => {
  it('escapes angle brackets to entity references', () => {
    const result = escapeHtml('<div>');

    expect(result).toBe('&lt;div&gt;');
  });

  it('escapes a script tag so it cannot execute', () => {
    const result = escapeHtml('<script>alert(1)</script>');

    expect(result).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('returns plain text unchanged', () => {
    const result = escapeHtml('hello world');

    expect(result).toBe('hello world');
  });

  it('returns an empty string for empty input', () => {
    const result = escapeHtml('');

    expect(result).toBe('');
  });
});

describe('generateId', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('prefixes the id with the current timestamp', () => {
    const timestamp = Date.now();

    const result = generateId();

    expect(result.startsWith(`${timestamp}-`)).toBe(true);
  });

  it('appends a fixed-length base36 suffix derived from Math.random', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const result = generateId();

    const suffix = result.split('-')[1];
    expect(suffix).toBe((0.5).toString(36).substr(2, 9));
  });
});

describe('deepClone', () => {
  it('returns a primitive unchanged', () => {
    const result = deepClone(42);

    expect(result).toBe(42);
  });

  it('returns null unchanged', () => {
    const result = deepClone(null);

    expect(result).toBe(null);
  });

  it('returns a structurally equal clone of a nested object', () => {
    const input = { a: 1, b: { c: [2, 3] } };

    const result = deepClone(input);

    expect(result).toEqual(input);
  });

  it('returns a different reference for the top-level object', () => {
    const input = { a: 1 };

    const result = deepClone(input);

    expect(result).not.toBe(input);
  });

  it('clones nested objects so mutating the clone does not affect the original', () => {
    const input = { nested: { value: 1 } };

    const result = deepClone(input);
    result.nested.value = 999;

    expect(input.nested.value).toBe(1);
  });

  it('clones nested arrays into independent references', () => {
    const input = { list: [1, 2] };

    const result = deepClone(input);

    expect(result.list).not.toBe(input.list);
    expect(result.list).toEqual([1, 2]);
  });

  it('clones a Date into an equal but distinct instance', () => {
    const input = new Date('2026-03-04T05:06:07.000Z');

    const result = deepClone(input);

    expect(result).not.toBe(input);
    expect(result.getTime()).toBe(input.getTime());
  });

  it('clones a top-level array', () => {
    const input = [1, { x: 2 }];

    const result = deepClone(input);

    expect(result).toEqual([1, { x: 2 }]);
    expect(result).not.toBe(input);
  });

  it('only copies own enumerable properties', () => {
    const proto = { inherited: 'nope' };
    const input = Object.create(proto) as { own: number };
    input.own = 5;

    const result = deepClone(input);

    expect(result).toEqual({ own: 5 });
    expect(Object.prototype.hasOwnProperty.call(result, 'inherited')).toBe(false);
  });
});

describe('sleep', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves only after the specified delay elapses', async () => {
    const onResolve = vi.fn();
    sleep(100).then(onResolve);

    await vi.advanceTimersByTimeAsync(99);
    expect(onResolve).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(onResolve).toHaveBeenCalledTimes(1);
  });
});
