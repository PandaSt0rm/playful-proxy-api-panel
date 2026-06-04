import { describe, it, expect, vi, afterEach } from 'vitest';
import i18n from '@/i18n';
import type { CodexUsageWindow } from '@/types';
import {
  formatQuotaResetTime,
  formatUnixSeconds,
  formatCodexResetLabel,
  createStatusError,
  getStatusFromError,
  formatKimiResetHint,
  formatZaiResetHint,
} from './formatters';

afterEach(() => {
  vi.useRealTimers();
});

describe('formatQuotaResetTime', () => {
  it('returns the dash sentinel for undefined input', () => {
    const result = formatQuotaResetTime(undefined);

    expect(result).toBe('-');
  });

  it('returns the dash sentinel for an empty string', () => {
    const result = formatQuotaResetTime('');

    expect(result).toBe('-');
  });

  it('returns the dash sentinel for an unparseable date string', () => {
    const result = formatQuotaResetTime('not-a-date');

    expect(result).toBe('-');
  });

  it('returns a non-dash formatted value for a valid ISO date', () => {
    const result = formatQuotaResetTime('2024-03-15T10:30:00Z');

    expect(result).not.toBe('-');
  });

  it('produces identical output for the same valid timestamp', () => {
    const first = formatQuotaResetTime('2024-03-15T10:30:00Z');
    const second = formatQuotaResetTime('2024-03-15T10:30:00Z');

    expect(first).toBe(second);
  });
});

describe('formatUnixSeconds', () => {
  it('returns the dash sentinel for null', () => {
    const result = formatUnixSeconds(null);

    expect(result).toBe('-');
  });

  it('returns the dash sentinel for zero', () => {
    const result = formatUnixSeconds(0);

    expect(result).toBe('-');
  });

  it('returns a non-dash formatted value for a positive epoch seconds value', () => {
    const result = formatUnixSeconds(1_710_499_800);

    expect(result).not.toBe('-');
  });

  it('produces identical output for the same epoch value', () => {
    const first = formatUnixSeconds(1_710_499_800);
    const second = formatUnixSeconds(1_710_499_800);

    expect(first).toBe(second);
  });
});

describe('formatCodexResetLabel', () => {
  it('returns the dash sentinel for null', () => {
    const result = formatCodexResetLabel(null);

    expect(result).toBe('-');
  });

  it('returns the dash sentinel for undefined', () => {
    const result = formatCodexResetLabel(undefined);

    expect(result).toBe('-');
  });

  it('formats reset_at as absolute epoch seconds', () => {
    const window: CodexUsageWindow = { reset_at: 1_710_499_800 };

    const result = formatCodexResetLabel(window);

    expect(result).toBe(formatUnixSeconds(1_710_499_800));
  });

  it('reads the camelCase resetAt fallback when snake_case is absent', () => {
    const window: CodexUsageWindow = { resetAt: 1_710_499_800 };

    const result = formatCodexResetLabel(window);

    expect(result).toBe(formatUnixSeconds(1_710_499_800));
  });

  it('parses a numeric-string reset_at', () => {
    const window: CodexUsageWindow = { reset_at: '1710499800' };

    const result = formatCodexResetLabel(window);

    expect(result).toBe(formatUnixSeconds(1_710_499_800));
  });

  it('computes the target time from reset_after_seconds relative to now', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-03-15T10:00:00Z'));
    const nowSeconds = Math.floor(Date.now() / 1000);
    const window: CodexUsageWindow = { reset_after_seconds: 3600 };

    const result = formatCodexResetLabel(window);

    expect(result).toBe(formatUnixSeconds(Math.floor(nowSeconds + 3600)));
  });

  it('falls back to resetAfterSeconds camelCase when snake_case is absent', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-03-15T10:00:00Z'));
    const nowSeconds = Math.floor(Date.now() / 1000);
    const window: CodexUsageWindow = { resetAfterSeconds: 120 };

    const result = formatCodexResetLabel(window);

    expect(result).toBe(formatUnixSeconds(Math.floor(nowSeconds + 120)));
  });

  it('prefers reset_at over reset_after_seconds when both are present', () => {
    const window: CodexUsageWindow = { reset_at: 1_710_499_800, reset_after_seconds: 3600 };

    const result = formatCodexResetLabel(window);

    expect(result).toBe(formatUnixSeconds(1_710_499_800));
  });

  it('returns the dash sentinel when reset_at is zero and no reset_after_seconds', () => {
    const window: CodexUsageWindow = { reset_at: 0 };

    const result = formatCodexResetLabel(window);

    expect(result).toBe('-');
  });

  it('returns the dash sentinel when reset_at is negative and no other field', () => {
    const window: CodexUsageWindow = { reset_at: -5 };

    const result = formatCodexResetLabel(window);

    expect(result).toBe('-');
  });

  it('returns the dash sentinel for an empty window object', () => {
    const result = formatCodexResetLabel({});

    expect(result).toBe('-');
  });

  it('ignores a zero reset_after_seconds and returns the dash sentinel', () => {
    const window: CodexUsageWindow = { reset_after_seconds: 0 };

    const result = formatCodexResetLabel(window);

    expect(result).toBe('-');
  });
});

describe('createStatusError', () => {
  it('creates an Error carrying the given message', () => {
    const error = createStatusError('boom', 404);

    expect(error.message).toBe('boom');
  });

  it('attaches the numeric status when provided', () => {
    const error = createStatusError('boom', 500);

    expect(error.status).toBe(500);
  });

  it('leaves status undefined when not provided', () => {
    const error = createStatusError('boom');

    expect(error.status).toBeUndefined();
  });

  it('is an instance of Error', () => {
    const error = createStatusError('boom');

    expect(error).toBeInstanceOf(Error);
  });

  it('attaches a zero status when explicitly passed', () => {
    const error = createStatusError('boom', 0);

    expect(error.status).toBe(0);
  });
});

describe('getStatusFromError', () => {
  it('returns the numeric status from an error-like object', () => {
    const result = getStatusFromError({ status: 403 });

    expect(result).toBe(403);
  });

  it('returns zero when the status is the finite number zero', () => {
    const result = getStatusFromError({ status: 0 });

    expect(result).toBe(0);
  });

  it('coerces a numeric-string status to a positive number', () => {
    const result = getStatusFromError({ status: '404' });

    expect(result).toBe(404);
  });

  it('returns undefined for a zero-valued numeric string because coercion requires > 0', () => {
    const result = getStatusFromError({ status: '0' });

    expect(result).toBeUndefined();
  });

  it('returns undefined for a non-numeric string status', () => {
    const result = getStatusFromError({ status: 'oops' });

    expect(result).toBeUndefined();
  });

  it('returns undefined when status is missing', () => {
    const result = getStatusFromError({ message: 'x' });

    expect(result).toBeUndefined();
  });

  it('returns undefined for null', () => {
    const result = getStatusFromError(null);

    expect(result).toBeUndefined();
  });

  it('returns undefined for a string error', () => {
    const result = getStatusFromError('boom');

    expect(result).toBeUndefined();
  });

  it('returns undefined when status is an Infinity number', () => {
    const result = getStatusFromError({ status: Infinity });

    expect(result).toBeUndefined();
  });

  it('returns undefined when status coerces to a negative number', () => {
    const result = getStatusFromError({ status: '-5' });

    expect(result).toBeUndefined();
  });
});

describe('formatKimiResetHint', () => {
  it('returns the localized hint string when a hint is given', () => {
    const result = formatKimiResetHint(i18n.t, '5 minutes');

    expect(result).toBe('resets in 5 minutes');
  });

  it('returns an empty string when the hint is undefined', () => {
    const result = formatKimiResetHint(i18n.t, undefined);

    expect(result).toBe('');
  });

  it('returns an empty string for an empty hint', () => {
    const result = formatKimiResetHint(i18n.t, '');

    expect(result).toBe('');
  });
});

describe('formatZaiResetHint', () => {
  it('returns the localized hint string when a hint is given', () => {
    const result = formatZaiResetHint(i18n.t, '2 hours');

    expect(result).toBe('resets in 2 hours');
  });

  it('returns an empty string when the hint is undefined', () => {
    const result = formatZaiResetHint(i18n.t, undefined);

    expect(result).toBe('');
  });

  it('returns an empty string for an empty hint', () => {
    const result = formatZaiResetHint(i18n.t, '');

    expect(result).toBe('');
  });
});
