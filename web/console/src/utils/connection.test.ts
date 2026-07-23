import { describe, it, expect, afterEach, vi } from 'vitest';

import { MANAGEMENT_API_PREFIX } from '@/utils/constants';
import {
  normalizeApiBase,
  computeApiUrl,
  detectApiBaseFromLocation,
  isLocalhost,
} from './connection';

describe('normalizeApiBase', () => {
  it('returns an empty string for an empty input', () => {
    const result = normalizeApiBase('');

    expect(result).toBe('');
  });

  it('returns an empty string for a whitespace-only input', () => {
    const result = normalizeApiBase('   ');

    expect(result).toBe('');
  });

  it('prepends http:// when no protocol is present', () => {
    const result = normalizeApiBase('example.com:8317');

    expect(result).toBe('http://example.com:8317');
  });

  it('preserves an existing https protocol', () => {
    const result = normalizeApiBase('https://example.com');

    expect(result).toBe('https://example.com');
  });

  it('strips a trailing /v0/management segment', () => {
    const result = normalizeApiBase('https://example.com/v0/management');

    expect(result).toBe('https://example.com');
  });

  it('strips a trailing /v0/management/ segment with slash', () => {
    const result = normalizeApiBase('https://example.com/v0/management/');

    expect(result).toBe('https://example.com');
  });

  it('strips trailing slashes', () => {
    const result = normalizeApiBase('https://example.com///');

    expect(result).toBe('https://example.com');
  });

  it('trims surrounding whitespace before normalizing', () => {
    const result = normalizeApiBase('   example.com   ');

    expect(result).toBe('http://example.com');
  });

  it('matches the management suffix case-insensitively', () => {
    const result = normalizeApiBase('https://example.com/V0/MANAGEMENT');

    expect(result).toBe('https://example.com');
  });
});

describe('computeApiUrl', () => {
  it('returns an empty string when the base normalizes to empty', () => {
    const result = computeApiUrl('');

    expect(result).toBe('');
  });

  it('appends the management API prefix to a normalized base', () => {
    const result = computeApiUrl('example.com');

    expect(result).toBe(`http://example.com${MANAGEMENT_API_PREFIX}`);
  });

  it('normalizes a base that already includes the management suffix before appending', () => {
    const result = computeApiUrl('https://example.com/v0/management');

    expect(result).toBe(`https://example.com${MANAGEMENT_API_PREFIX}`);
  });
});

describe('detectApiBaseFromLocation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds the base from the current window location with a port', () => {
    vi.stubGlobal('window', {
      location: { protocol: 'https:', hostname: 'panel.example.com', port: '8443' },
    });

    const result = detectApiBaseFromLocation();

    expect(result).toBe('https://panel.example.com:8443');
  });

  it('omits the colon-port when no port is present', () => {
    vi.stubGlobal('window', {
      location: { protocol: 'http:', hostname: 'panel.example.com', port: '' },
    });

    const result = detectApiBaseFromLocation();

    expect(result).toBe('http://panel.example.com');
  });

  it('falls back to the default localhost base when location access throws', () => {
    vi.stubGlobal('window', {
      get location() {
        throw new Error('location unavailable');
      },
    });

    const result = detectApiBaseFromLocation();

    expect(result).toBe('http://localhost:8317');
  });
});

describe('isLocalhost', () => {
  it('returns true for localhost', () => {
    const result = isLocalhost('localhost');

    expect(result).toBe(true);
  });

  it('returns true for the loopback IPv4 address', () => {
    const result = isLocalhost('127.0.0.1');

    expect(result).toBe(true);
  });

  it('returns true for the loopback IPv6 address', () => {
    const result = isLocalhost('[::1]');

    expect(result).toBe(true);
  });

  it('matches case-insensitively', () => {
    const result = isLocalhost('LOCALHOST');

    expect(result).toBe(true);
  });

  it('returns false for a remote hostname', () => {
    const result = isLocalhost('example.com');

    expect(result).toBe(false);
  });

  it('returns false for an empty hostname', () => {
    const result = isLocalhost('');

    expect(result).toBe(false);
  });
});
