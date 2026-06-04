import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  obfuscateData,
  deobfuscateData,
  isObfuscated,
  encryptData,
  decryptData,
  isEncrypted,
} from './encryption';

const ENC_PREFIX = 'enc::v1::';

describe('obfuscateData', () => {
  it('returns an empty string unchanged', () => {
    const result = obfuscateData('');

    expect(result).toBe('');
  });

  it('prefixes the output with the enc::v1:: marker', () => {
    const result = obfuscateData('hello');

    expect(result.startsWith(ENC_PREFIX)).toBe(true);
  });

  it('produces output that differs from the plaintext', () => {
    const result = obfuscateData('secret-token');

    expect(result).not.toBe('secret-token');
  });

  it('produces the same ciphertext for the same plaintext (deterministic key)', () => {
    const first = obfuscateData('repeatable');
    const second = obfuscateData('repeatable');

    expect(first).toBe(second);
  });
});

describe('deobfuscateData', () => {
  it('returns an empty string unchanged', () => {
    const result = deobfuscateData('');

    expect(result).toBe('');
  });

  it('returns a value without the enc prefix unchanged', () => {
    const result = deobfuscateData('plain-value');

    expect(result).toBe('plain-value');
  });

  it('returns the original value for a malformed (non-base64) payload after prefix', () => {
    const malformed = `${ENC_PREFIX}@@@not-base64@@@`;

    const result = deobfuscateData(malformed);

    expect(result).toBe(malformed);
  });
});

describe('obfuscate/deobfuscate roundtrip', () => {
  it.each([
    ['simple ascii', 'my-api-key-12345'],
    ['empty-ish punctuation', '!@#$%^&*()'],
    ['unicode', '密钥-ключ-🔑'],
    ['whitespace', '  spaced  value  '],
    ['long string', 'x'.repeat(1000)],
  ])('roundtrips %s back to the original value', (_label, value) => {
    const roundtripped = deobfuscateData(obfuscateData(value));

    expect(roundtripped).toBe(value);
  });
});

describe('isObfuscated', () => {
  it('returns true for a value with the enc prefix', () => {
    const result = isObfuscated(`${ENC_PREFIX}abc`);

    expect(result).toBe(true);
  });

  it('returns false for a plain value', () => {
    const result = isObfuscated('plain');

    expect(result).toBe(false);
  });

  it('returns false for an empty string', () => {
    const result = isObfuscated('');

    expect(result).toBe(false);
  });

  it('returns false when given undefined', () => {
    const result = isObfuscated(undefined as unknown as string);

    expect(result).toBe(false);
  });

  it('returns true for the output of obfuscateData', () => {
    const result = isObfuscated(obfuscateData('detect-me'));

    expect(result).toBe(true);
  });
});

describe('backward-compatible aliases', () => {
  it('exposes encryptData as the same function as obfuscateData', () => {
    expect(encryptData).toBe(obfuscateData);
  });

  it('exposes decryptData as the same function as deobfuscateData', () => {
    expect(decryptData).toBe(deobfuscateData);
  });

  it('exposes isEncrypted as the same function as isObfuscated', () => {
    expect(isEncrypted).toBe(isObfuscated);
  });
});

describe('obfuscateData fallback to plaintext on encode failure', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the original value when btoa throws', () => {
    vi.spyOn(globalThis, 'btoa').mockImplementation(() => {
      throw new Error('btoa unavailable');
    });

    const result = obfuscateData('value-when-btoa-broken');

    expect(result).toBe('value-when-btoa-broken');
  });
});
