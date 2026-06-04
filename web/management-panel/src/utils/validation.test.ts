import { describe, it, expect } from 'vitest';

import {
  isValidUrl,
  isValidApiBase,
  isValidApiKey,
  isValidApiKeyCharset,
  isValidJson,
  isValidEmail,
} from '@/utils/validation';

describe('isValidUrl', () => {
  it('accepts a standard https URL', () => {
    expect(isValidUrl('https://example.com')).toBe(true);
  });

  it('accepts an http URL with a path and query', () => {
    expect(isValidUrl('http://example.com/path?q=1')).toBe(true);
  });

  it('accepts a non-http scheme such as ftp', () => {
    expect(isValidUrl('ftp://files.example.com')).toBe(true);
  });

  it('rejects a bare hostname without a scheme', () => {
    expect(isValidUrl('example.com')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isValidUrl('')).toBe(false);
  });

  it('rejects plain text', () => {
    expect(isValidUrl('not a url')).toBe(false);
  });
});

describe('isValidApiBase', () => {
  it('accepts an https base URL', () => {
    expect(isValidApiBase('https://api.example.com')).toBe(true);
  });

  it('accepts an http base URL', () => {
    expect(isValidApiBase('http://localhost:8080/v1')).toBe(true);
  });

  it('matches the protocol case-insensitively', () => {
    expect(isValidApiBase('HTTPS://api.example.com')).toBe(true);
  });

  it('rejects an empty string', () => {
    expect(isValidApiBase('')).toBe(false);
  });

  it('rejects a URL with no host after the protocol', () => {
    expect(isValidApiBase('http://')).toBe(false);
  });

  it('rejects a non-http scheme such as ftp', () => {
    expect(isValidApiBase('ftp://files.example.com')).toBe(false);
  });

  it('rejects a scheme-less host', () => {
    expect(isValidApiBase('api.example.com')).toBe(false);
  });
});

describe('isValidApiKey', () => {
  it('accepts a key of at least eight characters with no whitespace', () => {
    expect(isValidApiKey('abcd1234')).toBe(true);
  });

  it('rejects a key shorter than eight characters', () => {
    expect(isValidApiKey('abc1234')).toBe(false);
  });

  it('rejects an empty key', () => {
    expect(isValidApiKey('')).toBe(false);
  });

  it('rejects a key containing a space', () => {
    expect(isValidApiKey('abcd 1234')).toBe(false);
  });

  it('rejects a key containing a tab', () => {
    expect(isValidApiKey('abcd\t1234')).toBe(false);
  });

  it('rejects a key containing a newline', () => {
    expect(isValidApiKey('abcd1234\n')).toBe(false);
  });

  it('accepts a key of exactly eight non-whitespace characters', () => {
    expect(isValidApiKey('12345678')).toBe(true);
  });
});

describe('isValidApiKeyCharset', () => {
  it('accepts only visible ASCII characters', () => {
    expect(isValidApiKeyCharset('sk-Abc_123!~')).toBe(true);
  });

  it('rejects an empty key', () => {
    expect(isValidApiKeyCharset('')).toBe(false);
  });

  it('rejects a key containing a space', () => {
    expect(isValidApiKeyCharset('abc 123')).toBe(false);
  });

  it('rejects a key containing a non-ASCII character', () => {
    expect(isValidApiKeyCharset('abc密钥')).toBe(false);
  });

  it('rejects a key containing a control character', () => {
    expect(isValidApiKeyCharset('abc\x01def')).toBe(false);
  });

  it('rejects a key containing a DEL character', () => {
    expect(isValidApiKeyCharset('abc\x7Fdef')).toBe(false);
  });
});

describe('isValidJson', () => {
  it('accepts a JSON object string', () => {
    expect(isValidJson('{"a":1}')).toBe(true);
  });

  it('accepts a JSON array string', () => {
    expect(isValidJson('[1,2,3]')).toBe(true);
  });

  it('accepts a bare JSON number', () => {
    expect(isValidJson('42')).toBe(true);
  });

  it('accepts a quoted JSON string', () => {
    expect(isValidJson('"hello"')).toBe(true);
  });

  it('accepts the literal null', () => {
    expect(isValidJson('null')).toBe(true);
  });

  it('rejects an empty string', () => {
    expect(isValidJson('')).toBe(false);
  });

  it('rejects malformed JSON with a trailing comma', () => {
    expect(isValidJson('{"a":1,}')).toBe(false);
  });

  it('rejects an unquoted bareword', () => {
    expect(isValidJson('hello')).toBe(false);
  });
});

describe('isValidEmail', () => {
  it('accepts a standard email address', () => {
    expect(isValidEmail('user@example.com')).toBe(true);
  });

  it('accepts an address with a subdomain', () => {
    expect(isValidEmail('user@mail.example.co.uk')).toBe(true);
  });

  it('rejects an address without an @ symbol', () => {
    expect(isValidEmail('userexample.com')).toBe(false);
  });

  it('rejects an address without a domain dot', () => {
    expect(isValidEmail('user@example')).toBe(false);
  });

  it('rejects an address with no local part', () => {
    expect(isValidEmail('@example.com')).toBe(false);
  });

  it('rejects an address containing a space', () => {
    expect(isValidEmail('user name@example.com')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isValidEmail('')).toBe(false);
  });

  it('rejects an address with two @ symbols', () => {
    expect(isValidEmail('user@@example.com')).toBe(false);
  });
});
