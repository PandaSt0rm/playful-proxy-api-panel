import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the obfuscation boundary so storage behaviour can be asserted in
// isolation from the XOR/base64 implementation. The fake "obfuscation" is a
// reversible enc::v1:: prefix wrapper, mirroring the real module's contract:
// obfuscate(x) -> isObfuscated(out)===true, deobfuscate(out) -> x.
const ENC_PREFIX = 'enc::v1::';

vi.mock('@/utils/encryption', () => ({
  obfuscateData: vi.fn((value: string) => `${ENC_PREFIX}${value}`),
  deobfuscateData: vi.fn((payload: string) =>
    payload.startsWith(ENC_PREFIX) ? payload.slice(ENC_PREFIX.length) : payload
  ),
  isObfuscated: vi.fn((value: string) => value.startsWith(ENC_PREFIX)),
}));

import { obfuscatedStorage, secureStorage } from './secureStorage';
import { obfuscateData, deobfuscateData } from '@/utils/encryption';

beforeEach(() => {
  localStorage.clear();
});

describe('secureStorage export alias', () => {
  it('is the same singleton instance as obfuscatedStorage', () => {
    expect(secureStorage).toBe(obfuscatedStorage);
  });
});

describe('ObfuscatedStorageService.setItem', () => {
  it('stores an obfuscated JSON string by default', () => {
    obfuscatedStorage.setItem('token', 'abc');

    expect(localStorage.getItem('token')).toBe(`${ENC_PREFIX}"abc"`);
  });

  it('stores plain JSON when obfuscate is false', () => {
    obfuscatedStorage.setItem('token', 'abc', { obfuscate: false });

    expect(localStorage.getItem('token')).toBe('"abc"');
  });

  it('stores plain JSON when the legacy encrypt option is false', () => {
    obfuscatedStorage.setItem('token', 'abc', { encrypt: false });

    expect(localStorage.getItem('token')).toBe('"abc"');
  });

  it('serialises objects to JSON before obfuscating', () => {
    obfuscatedStorage.setItem('obj', { a: 1, b: 'two' }, { obfuscate: false });

    expect(localStorage.getItem('obj')).toBe('{"a":1,"b":"two"}');
  });

  it('removes the key instead of storing when the value is null', () => {
    localStorage.setItem('k', 'existing');

    obfuscatedStorage.setItem('k', null);

    expect(localStorage.getItem('k')).toBeNull();
  });

  it('removes the key instead of storing when the value is undefined', () => {
    localStorage.setItem('k', 'existing');

    obfuscatedStorage.setItem('k', undefined);

    expect(localStorage.getItem('k')).toBeNull();
  });

  it('prefers the obfuscate option over the legacy encrypt option', () => {
    obfuscatedStorage.setItem('token', 'abc', { obfuscate: false, encrypt: true });

    expect(localStorage.getItem('token')).toBe('"abc"');
  });
});

describe('ObfuscatedStorageService.getItem', () => {
  it('round-trips an obfuscated string value', () => {
    obfuscatedStorage.setItem('token', 'secret-value');

    const result = obfuscatedStorage.getItem<string>('token');

    expect(result).toBe('secret-value');
  });

  it('round-trips an obfuscated object value', () => {
    obfuscatedStorage.setItem('cfg', { enabled: true, count: 3 });

    const result = obfuscatedStorage.getItem<{ enabled: boolean; count: number }>('cfg');

    expect(result).toEqual({ enabled: true, count: 3 });
  });

  it('round-trips a plain (non-obfuscated) value', () => {
    obfuscatedStorage.setItem('plain', [1, 2, 3], { obfuscate: false });

    const result = obfuscatedStorage.getItem<number[]>('plain', { obfuscate: false });

    expect(result).toEqual([1, 2, 3]);
  });

  it('returns null when the key is absent', () => {
    const result = obfuscatedStorage.getItem('missing');

    expect(result).toBeNull();
  });

  it('returns a decrypted obfuscated non-JSON string as a raw string', () => {
    // Stored value is obfuscated but its plaintext is not valid JSON.
    localStorage.setItem('legacy', `${ENC_PREFIX}not-json`);

    const result = obfuscatedStorage.getItem<string>('legacy');

    expect(result).toBe('not-json');
  });

  it('returns a non-obfuscated non-JSON string as the raw stored value', () => {
    localStorage.setItem('legacy', 'bare-string');

    const result = obfuscatedStorage.getItem<string>('legacy', { obfuscate: false });

    expect(result).toBe('bare-string');
  });

  it('returns the raw stored value when obfuscation is expected but the value is plaintext non-JSON', () => {
    // obfuscate=true (default) but the raw value lacks the enc prefix and is
    // not JSON, so isObfuscated() is false and the raw string is returned.
    localStorage.setItem('legacy', 'bare-string');

    const result = obfuscatedStorage.getItem<string>('legacy');

    expect(result).toBe('bare-string');
  });

  it('returns null when the second deobfuscation throws on a corrupt obfuscated non-JSON value', () => {
    // getItem deobfuscates once for JSON.parse (which fails on non-JSON), then
    // re-deobfuscates inside the catch. Force the catch-path call to throw so
    // the final fallback returns null.
    vi.mocked(deobfuscateData)
      .mockReturnValueOnce('garbage')
      .mockImplementationOnce(() => {
        throw new Error('corrupt');
      });
    localStorage.setItem('corrupt', `${ENC_PREFIX}garbage`);

    const result = obfuscatedStorage.getItem('corrupt');

    expect(result).toBeNull();
  });
});

describe('ObfuscatedStorageService.removeItem', () => {
  it('removes an existing key', () => {
    localStorage.setItem('k', 'v');

    obfuscatedStorage.removeItem('k');

    expect(localStorage.getItem('k')).toBeNull();
  });
});

describe('ObfuscatedStorageService.clear', () => {
  it('removes all keys from storage', () => {
    localStorage.setItem('a', '1');
    localStorage.setItem('b', '2');

    obfuscatedStorage.clear();

    expect(localStorage.length).toBe(0);
  });
});

describe('ObfuscatedStorageService.hasItem', () => {
  it('returns true when the key exists', () => {
    localStorage.setItem('present', 'x');

    expect(obfuscatedStorage.hasItem('present')).toBe(true);
  });

  it('returns false when the key is absent', () => {
    expect(obfuscatedStorage.hasItem('absent')).toBe(false);
  });
});

describe('ObfuscatedStorageService.migratePlaintextKeys', () => {
  it('leaves an already-obfuscated value untouched', () => {
    const stored = `${ENC_PREFIX}"already"`;
    localStorage.setItem('k', stored);

    obfuscatedStorage.migratePlaintextKeys(['k']);

    expect(localStorage.getItem('k')).toBe(stored);
  });

  it('obfuscates a plaintext JSON value, preserving the parsed shape', () => {
    localStorage.setItem('k', '{"a":1}');

    obfuscatedStorage.migratePlaintextKeys(['k']);

    expect(localStorage.getItem('k')).toBe(`${ENC_PREFIX}{"a":1}`);
  });

  it('obfuscates a plaintext non-JSON value as a JSON string', () => {
    localStorage.setItem('k', 'raw-token');

    obfuscatedStorage.migratePlaintextKeys(['k']);

    expect(localStorage.getItem('k')).toBe(`${ENC_PREFIX}"raw-token"`);
  });

  it('skips keys that are absent from storage', () => {
    obfuscatedStorage.migratePlaintextKeys(['nonexistent']);

    expect(localStorage.getItem('nonexistent')).toBeNull();
  });

  it('skips keys whose stored value is an empty string', () => {
    localStorage.setItem('empty', '');

    obfuscatedStorage.migratePlaintextKeys(['empty']);

    expect(localStorage.getItem('empty')).toBe('');
  });

  it('migrates multiple keys in a single call', () => {
    localStorage.setItem('one', 'first');
    localStorage.setItem('two', '42');

    obfuscatedStorage.migratePlaintextKeys(['one', 'two']);

    expect(localStorage.getItem('one')).toBe(`${ENC_PREFIX}"first"`);
    expect(localStorage.getItem('two')).toBe(`${ENC_PREFIX}42`);
  });
});

describe('obfuscation boundary wiring', () => {
  it('passes the serialised value to obfuscateData on setItem', () => {
    obfuscatedStorage.setItem('k', 'hello');

    expect(vi.mocked(obfuscateData)).toHaveBeenCalledWith('"hello"');
  });
});
