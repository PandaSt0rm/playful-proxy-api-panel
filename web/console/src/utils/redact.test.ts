import { describe, it, expect } from 'vitest';
import {
  isSecretName,
  maskCredential,
  maskSecret,
  redactDeep,
  redactHeaderEntries,
  redactSecretText,
} from './redact';

const MASK = '••••';

// Realistic credential shapes. Every one is long enough to be partially masked, so the
// tests assert that the prefix survives (operators tell keys apart by it) and the body
// does not.
const OPENAI_KEY = 'sk-proj-abcdefghijklmnopqrstuvwxyz0123456789';
const GOOGLE_KEY = 'AIzaSyD1234567890abcdefghijklmnopqrstu';
const XAI_KEY = 'xai-abcdefghijklmnopqrstuvwxyz';
const GROQ_KEY = 'gsk_abcdefghijklmnopqrstuvwxyz';
const JWT =
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NSJ9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

describe('maskSecret', () => {
  it('returns the original value when there is nothing to mask', () => {
    expect(maskSecret('')).toBe('');
    expect(maskSecret('   ')).toBe('   ');
  });

  it('replaces short values outright, because a partial mask would reveal more than it hides', () => {
    expect(maskSecret('abc')).toBe(MASK);
    expect(maskSecret('nineteen-chars-xyz')).toBe(MASK);
  });

  it('keeps a prefix and suffix on long values so two credentials stay distinguishable', () => {
    expect(maskSecret(OPENAI_KEY)).toBe(`sk-proj-${MASK}6789`);
  });

  it('masks the body of the credential', () => {
    const masked = maskSecret(OPENAI_KEY);
    expect(masked).not.toContain('abcdefghijklmnopqrstuvwxyz');
    expect(masked.length).toBeLessThan(OPENAI_KEY.length);
  });

  it('trims surrounding whitespace before masking', () => {
    expect(maskSecret(`  ${OPENAI_KEY}  `)).toBe(`sk-proj-${MASK}6789`);
  });
});

describe('maskCredential', () => {
  it('preserves a leading auth scheme, which is diagnostic, while masking the token', () => {
    expect(maskCredential(`Bearer ${OPENAI_KEY}`)).toBe(`Bearer sk-proj-${MASK}6789`);
    expect(maskCredential(`Basic ${OPENAI_KEY}`)).toBe(`Basic sk-proj-${MASK}6789`);
    expect(maskCredential(`token ${OPENAI_KEY}`)).toBe(`token sk-proj-${MASK}6789`);
  });

  it('masks the whole value when there is no scheme', () => {
    expect(maskCredential(OPENAI_KEY)).toBe(`sk-proj-${MASK}6789`);
  });
});

describe('redactSecretText', () => {
  it('masks a credential on a trace header line while keeping the header readable', () => {
    const line = `> authorization: Bearer ${OPENAI_KEY}`;
    expect(redactSecretText(line)).toBe(`> authorization: Bearer sk-proj-${MASK}6789`);
  });

  it('masks every secret-named header, not just authorization', () => {
    const trace = [
      `> x-api-key: ${OPENAI_KEY}`,
      `> x-goog-api-key: ${GOOGLE_KEY}`,
      `> cookie: session=abcdefghijklmnopqrstuvwxyz`,
    ].join('\n');
    const redacted = redactSecretText(trace);
    expect(redacted).not.toContain(OPENAI_KEY);
    expect(redacted).not.toContain(GOOGLE_KEY);
    expect(redacted).not.toContain('session=abcdefghijklmnopqrstuvwxyz');
  });

  it('does not mask an already-masked bearer token a second time', () => {
    // The header-line pass runs first; without the guard the bearer pass would chew the
    // result down to an unreadable stub.
    const redacted = redactSecretText(`> authorization: Bearer ${OPENAI_KEY}`);
    expect(redacted).toContain('sk-proj-');
    expect(redactSecretText(redacted)).toBe(redacted);
  });

  it('masks a bare bearer token outside a header line', () => {
    const redacted = redactSecretText('retry with Bearer abcdefghijklmnopqrstuvwxyz now');
    expect(redacted).toBe(`retry with Bearer abcdefgh${MASK}wxyz now`);
  });

  it.each([
    ['OpenAI-style', OPENAI_KEY],
    ['Google', GOOGLE_KEY],
    ['xAI', XAI_KEY],
    ['Groq', GROQ_KEY],
    ['JWT access token', JWT],
  ])('masks a bare %s credential embedded in a body', (_label, secret) => {
    const redacted = redactSecretText(`{"error":"invalid key ${secret}"}`);
    expect(redacted).not.toContain(secret);
    expect(redacted).toContain(MASK);
  });

  it('leaves text without credentials untouched', () => {
    const body = '{"model":"gpt-4o","object":"chat.completion","usage":{"total_tokens":18}}';
    expect(redactSecretText(body)).toBe(body);
  });

  it('does not mask model ids or request ids that merely look opaque', () => {
    const body = '< x-request-id: req_01HQ8ZK3M4N5P6Q7R8S9T0V1W2';
    expect(redactSecretText(body)).toBe(body);
  });
});

describe('isSecretName', () => {
  it('recognises credential header names', () => {
    expect(isSecretName('authorization')).toBe(true);
    expect(isSecretName('  X-Api-Key  ')).toBe(true);
    expect(isSecretName('set-cookie')).toBe(true);
  });

  it('recognises credential-shaped object keys', () => {
    expect(isSecretName('access_token')).toBe(true);
    expect(isSecretName('client-secret')).toBe(true);
    expect(isSecretName('api_keys')).toBe(true);
    expect(isSecretName('password')).toBe(true);
  });

  it('does not fire on unrelated names that merely contain a keyword', () => {
    expect(isSecretName('model')).toBe(false);
    expect(isSecretName('monkey')).toBe(false);
    expect(isSecretName('tokenizer')).toBe(false);
  });
});

describe('redactHeaderEntries', () => {
  it('masks credential headers whole and scans the rest', () => {
    expect(
      redactHeaderEntries([
        ['authorization', `Bearer ${OPENAI_KEY}`],
        ['content-type', 'application/json'],
        // Not a credential header, but a key can still leak through a custom one.
        ['x-debug-note', `saw ${GOOGLE_KEY} in the upstream log`],
      ])
    ).toEqual([
      ['authorization', `Bearer sk-proj-${MASK}6789`],
      ['content-type', 'application/json'],
      ['x-debug-note', `saw AIzaSyD1${MASK}rstu in the upstream log`],
    ]);
  });

  it('masks a custom header whose name ends in -key, prefix and all', () => {
    expect(redactHeaderEntries([['x-custom-forwarded-key', `key=${GOOGLE_KEY}`]])).toEqual([
      ['x-custom-forwarded-key', `key=AIza${MASK}rstu`],
    ]);
  });

  it('returns an empty list unchanged', () => {
    expect(redactHeaderEntries([])).toEqual([]);
  });
});

describe('redactDeep', () => {
  it('masks values under a credential-named key even when they match no known prefix', () => {
    expect(redactDeep({ api_key: 'self-hosted-gateway-credential-value' })).toEqual({
      api_key: `self-hos${MASK}alue`,
    });
  });

  it('scans strings under ordinary keys without masking them wholesale', () => {
    expect(redactDeep({ model: 'gpt-4o', message: `bad key ${OPENAI_KEY}` })).toEqual({
      model: 'gpt-4o',
      message: `bad key sk-proj-${MASK}6789`,
    });
  });

  it('recurses through arrays and nested objects', () => {
    expect(
      redactDeep({
        keys: [OPENAI_KEY, GOOGLE_KEY],
        nested: { detail: { authorization: `Bearer ${OPENAI_KEY}` } },
      })
    ).toEqual({
      keys: [`sk-proj-${MASK}6789`, `AIzaSyD1${MASK}rstu`],
      nested: { detail: { authorization: `Bearer sk-proj-${MASK}6789` } },
    });
  });

  it('passes non-string scalars through untouched', () => {
    expect(redactDeep(null)).toBeNull();
    expect(redactDeep(42)).toBe(42);
    expect(redactDeep(true)).toBe(true);
    expect(redactDeep(undefined)).toBeUndefined();
  });

  it('masks a bare string argument', () => {
    expect(redactDeep(OPENAI_KEY)).toBe(`sk-proj-${MASK}6789`);
    expect(redactDeep(OPENAI_KEY, 'api_key')).toBe(`sk-proj-${MASK}6789`);
  });
});
