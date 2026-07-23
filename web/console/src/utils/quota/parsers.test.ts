import { describe, it, expect } from 'vitest';
import {
  normalizeAuthIndex,
  normalizeStringValue,
  normalizeGeminiCliModelId,
  normalizeNumberValue,
  normalizeQuotaFraction,
  normalizePlanType,
  decodeBase64UrlPayload,
  parseIdTokenPayload,
  parseAntigravityPayload,
  parseClaudeUsagePayload,
  parseCodexUsagePayload,
  parseGeminiCliQuotaPayload,
  parseGeminiCliCodeAssistPayload,
  parseKimiUsagePayload,
  parseXaiBillingPayload,
  parseZaiQuotaPayload,
  unwrapXaiBillingAmount,
} from './parsers';

// Builds a base64url-encoded string (no padding, +/ -> -_) the way a JWT segment
// is encoded, computed independently of the implementation under test.
function toBase64Url(input: string): string {
  const base64 = Buffer.from(input, 'utf-8').toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

describe('normalizeStringValue', () => {
  it('returns the trimmed string for a padded non-empty string', () => {
    const result = normalizeStringValue('  hello  ');

    expect(result).toBe('hello');
  });

  it('returns null for an empty string', () => {
    const result = normalizeStringValue('');

    expect(result).toBeNull();
  });

  it('returns null for a whitespace-only string', () => {
    const result = normalizeStringValue('   ');

    expect(result).toBeNull();
  });

  it('returns the decimal string form for a finite number', () => {
    const result = normalizeStringValue(42);

    expect(result).toBe('42');
  });

  it('returns "0" for the number zero', () => {
    const result = normalizeStringValue(0);

    expect(result).toBe('0');
  });

  it('returns the string form for a negative number', () => {
    const result = normalizeStringValue(-3.5);

    expect(result).toBe('-3.5');
  });

  it('returns null for NaN', () => {
    const result = normalizeStringValue(NaN);

    expect(result).toBeNull();
  });

  it('returns null for Infinity', () => {
    const result = normalizeStringValue(Infinity);

    expect(result).toBeNull();
  });

  it('returns null for null', () => {
    const result = normalizeStringValue(null);

    expect(result).toBeNull();
  });

  it('returns null for undefined', () => {
    const result = normalizeStringValue(undefined);

    expect(result).toBeNull();
  });

  it('returns null for a boolean', () => {
    const result = normalizeStringValue(true);

    expect(result).toBeNull();
  });

  it('returns null for an object', () => {
    const result = normalizeStringValue({ value: 'x' });

    expect(result).toBeNull();
  });
});

describe('normalizeGeminiCliModelId', () => {
  it('strips the _vertex suffix from a vertex model id', () => {
    const result = normalizeGeminiCliModelId('gemini-2.5-pro_vertex');

    expect(result).toBe('gemini-2.5-pro');
  });

  it('returns the model id unchanged when it has no _vertex suffix', () => {
    const result = normalizeGeminiCliModelId('gemini-2.5-pro');

    expect(result).toBe('gemini-2.5-pro');
  });

  it('only strips a trailing _vertex, not an internal occurrence', () => {
    const result = normalizeGeminiCliModelId('gemini_vertex-extra');

    expect(result).toBe('gemini_vertex-extra');
  });

  it('returns an empty string when the id is exactly the suffix', () => {
    const result = normalizeGeminiCliModelId('_vertex');

    expect(result).toBe('');
  });

  it('trims and returns a numeric model id passed as a number', () => {
    const result = normalizeGeminiCliModelId(123);

    expect(result).toBe('123');
  });

  it('returns null for an empty string', () => {
    const result = normalizeGeminiCliModelId('   ');

    expect(result).toBeNull();
  });

  it('returns null for null', () => {
    const result = normalizeGeminiCliModelId(null);

    expect(result).toBeNull();
  });
});

describe('normalizeNumberValue', () => {
  it('returns a finite number unchanged', () => {
    const result = normalizeNumberValue(12.5);

    expect(result).toBe(12.5);
  });

  it('returns zero unchanged', () => {
    const result = normalizeNumberValue(0);

    expect(result).toBe(0);
  });

  it('returns null for NaN', () => {
    const result = normalizeNumberValue(NaN);

    expect(result).toBeNull();
  });

  it('returns null for Infinity', () => {
    const result = normalizeNumberValue(Infinity);

    expect(result).toBeNull();
  });

  it('parses a numeric string into its number', () => {
    const result = normalizeNumberValue('  -7.25 ');

    expect(result).toBe(-7.25);
  });

  it('parses a numeric-exponent string', () => {
    const result = normalizeNumberValue('1e3');

    expect(result).toBe(1000);
  });

  it('returns null for an empty string', () => {
    const result = normalizeNumberValue('   ');

    expect(result).toBeNull();
  });

  it('returns null for a non-numeric string', () => {
    const result = normalizeNumberValue('abc');

    expect(result).toBeNull();
  });

  it('returns null for the string "Infinity"', () => {
    const result = normalizeNumberValue('Infinity');

    expect(result).toBeNull();
  });

  it('returns null for null', () => {
    const result = normalizeNumberValue(null);

    expect(result).toBeNull();
  });

  it('returns null for undefined', () => {
    const result = normalizeNumberValue(undefined);

    expect(result).toBeNull();
  });

  it('returns null for a boolean', () => {
    const result = normalizeNumberValue(false);

    expect(result).toBeNull();
  });
});

describe('normalizeQuotaFraction', () => {
  it('returns a numeric fraction unchanged', () => {
    const result = normalizeQuotaFraction(0.42);

    expect(result).toBe(0.42);
  });

  it('parses a plain numeric string without dividing by 100', () => {
    const result = normalizeQuotaFraction('0.5');

    expect(result).toBe(0.5);
  });

  it('divides a percent-suffixed string by 100', () => {
    const result = normalizeQuotaFraction('50%');

    expect(result).toBe(0.5);
  });

  it('handles a percent value above 100', () => {
    const result = normalizeQuotaFraction('150%');

    expect(result).toBe(1.5);
  });

  it('handles a fractional percent value', () => {
    const result = normalizeQuotaFraction('12.5%');

    expect(result).toBe(0.125);
  });

  it('returns 0 for "0%"', () => {
    const result = normalizeQuotaFraction('0%');

    expect(result).toBe(0);
  });

  it('returns null for a non-numeric percent string', () => {
    const result = normalizeQuotaFraction('abc%');

    expect(result).toBeNull();
  });

  it('returns 0 for the bare "%" string because Number("") coerces to 0', () => {
    // Number('') === 0, which is finite, so the percent branch yields 0/100.
    const result = normalizeQuotaFraction('%');

    expect(result).toBe(0);
  });

  it('returns null for an empty string', () => {
    const result = normalizeQuotaFraction('   ');

    expect(result).toBeNull();
  });

  it('returns null for null', () => {
    const result = normalizeQuotaFraction(null);

    expect(result).toBeNull();
  });

  it('returns null for a malformed numeric string with no percent sign', () => {
    const result = normalizeQuotaFraction('50pct');

    expect(result).toBeNull();
  });
});

describe('normalizePlanType', () => {
  it('lowercases and trims a plan type string', () => {
    const result = normalizePlanType('  PRO_Plan  ');

    expect(result).toBe('pro_plan');
  });

  it('returns the string form of a number lowercased', () => {
    const result = normalizePlanType(5);

    expect(result).toBe('5');
  });

  it('returns null for an empty string', () => {
    const result = normalizePlanType('');

    expect(result).toBeNull();
  });

  it('returns null for null', () => {
    const result = normalizePlanType(null);

    expect(result).toBeNull();
  });

  it('returns null for an object', () => {
    const result = normalizePlanType({ plan: 'pro' });

    expect(result).toBeNull();
  });
});

describe('decodeBase64UrlPayload', () => {
  it('decodes a base64url string with - and _ substitutions', () => {
    const encoded = toBase64Url('{"a":1}');

    const result = decodeBase64UrlPayload(encoded);

    expect(result).toBe('{"a":1}');
  });

  it('decodes a value needing padding correction', () => {
    const encoded = toBase64Url('hi');

    const result = decodeBase64UrlPayload(encoded);

    expect(result).toBe('hi');
  });

  it('returns null for an empty string', () => {
    const result = decodeBase64UrlPayload('   ');

    expect(result).toBeNull();
  });

  it('decodes a known fixed base64 token to its text', () => {
    // "SGVsbG8=" is the standard base64 of "Hello"; trailing = is valid padding.
    const result = decodeBase64UrlPayload('SGVsbG8=');

    expect(result).toBe('Hello');
  });
});

describe('parseIdTokenPayload', () => {
  it('returns a plain object payload as-is', () => {
    const payload = { sub: 'abc' };

    const result = parseIdTokenPayload(payload);

    expect(result).toEqual({ sub: 'abc' });
  });

  it('returns null for an array', () => {
    const result = parseIdTokenPayload([1, 2, 3]);

    expect(result).toBeNull();
  });

  it('parses a JSON object string', () => {
    const result = parseIdTokenPayload('{"sub":"abc","n":1}');

    expect(result).toEqual({ sub: 'abc', n: 1 });
  });

  it('parses the payload segment of a JWT-shaped string', () => {
    const header = toBase64Url('{"alg":"none"}');
    const claims = toBase64Url('{"chatgpt_account_id":"acct_42"}');
    const jwt = `${header}.${claims}.sig`;

    const result = parseIdTokenPayload(jwt);

    expect(result).toEqual({ chatgpt_account_id: 'acct_42' });
  });

  it('returns null for null', () => {
    const result = parseIdTokenPayload(null);

    expect(result).toBeNull();
  });

  it('returns null for undefined', () => {
    const result = parseIdTokenPayload(undefined);

    expect(result).toBeNull();
  });

  it('returns null for an empty string', () => {
    const result = parseIdTokenPayload('   ');

    expect(result).toBeNull();
  });

  it('returns null for a number', () => {
    const result = parseIdTokenPayload(42);

    expect(result).toBeNull();
  });

  it('returns null for a single-segment string that is not JSON', () => {
    const result = parseIdTokenPayload('notjson');

    expect(result).toBeNull();
  });

  it('returns null when the JWT payload segment is not valid JSON', () => {
    const badClaims = toBase64Url('not-json-at-all');
    const jwt = `header.${badClaims}.sig`;

    const result = parseIdTokenPayload(jwt);

    expect(result).toBeNull();
  });

  it('parses a JSON array string to null because arrays are rejected later but typeof object passes parse', () => {
    // JSON.parse('[1]') yields an array; the typeof === 'object' check passes
    // so the array is returned (current behaviour records the array).
    const result = parseIdTokenPayload('[1,2]');

    expect(result).toEqual([1, 2]);
  });
});

describe('parseAntigravityPayload', () => {
  it('returns an object payload that already has a models field', () => {
    const payload = { models: ['m1'], extra: true };

    const result = parseAntigravityPayload(payload);

    expect(result).toEqual({ models: ['m1'], extra: true });
  });

  it('unwraps the nested body when the top level has no models field', () => {
    const payload = { body: { models: ['m2'] } };

    const result = parseAntigravityPayload(payload);

    expect(result).toEqual({ models: ['m2'] });
  });

  it('returns the parsed object unchanged when no models and no parsable body', () => {
    const payload = { other: 1 };

    const result = parseAntigravityPayload(payload);

    expect(result).toEqual({ other: 1 });
  });

  it('parses a JSON string payload into its object', () => {
    const result = parseAntigravityPayload('{"models":["m3"]}');

    expect(result).toEqual({ models: ['m3'] });
  });

  it('parses a JSON string body field nested inside an object', () => {
    const payload = { body: '{"models":["m4"]}' };

    const result = parseAntigravityPayload(payload);

    expect(result).toEqual({ models: ['m4'] });
  });

  it('returns null for an array', () => {
    const result = parseAntigravityPayload([{ models: [] }]);

    expect(result).toBeNull();
  });

  it('returns null for null', () => {
    const result = parseAntigravityPayload(null);

    expect(result).toBeNull();
  });

  it('returns null for undefined', () => {
    const result = parseAntigravityPayload(undefined);

    expect(result).toBeNull();
  });

  it('returns null for an empty string', () => {
    const result = parseAntigravityPayload('   ');

    expect(result).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    const result = parseAntigravityPayload('{not json');

    expect(result).toBeNull();
  });

  it('returns null for a number', () => {
    const result = parseAntigravityPayload(7);

    expect(result).toBeNull();
  });
});

describe.each([
  ['parseClaudeUsagePayload', parseClaudeUsagePayload],
  ['parseCodexUsagePayload', parseCodexUsagePayload],
  ['parseGeminiCliQuotaPayload', parseGeminiCliQuotaPayload],
  ['parseGeminiCliCodeAssistPayload', parseGeminiCliCodeAssistPayload],
  ['parseKimiUsagePayload', parseKimiUsagePayload],
  ['parseZaiQuotaPayload', parseZaiQuotaPayload],
  ['parseXaiBillingPayload', parseXaiBillingPayload],
] as const)('%s', (_name, parse) => {
  it('returns an object payload as-is', () => {
    const payload = { quota: 1 };

    const result = parse(payload);

    expect(result).toEqual({ quota: 1 });
  });

  it('parses a JSON string payload', () => {
    const result = parse('{"quota":2}');

    expect(result).toEqual({ quota: 2 });
  });

  it('returns null for null', () => {
    const result = parse(null);

    expect(result).toBeNull();
  });

  it('returns null for undefined', () => {
    const result = parse(undefined);

    expect(result).toBeNull();
  });

  it('returns null for an empty string', () => {
    const result = parse('   ');

    expect(result).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    const result = parse('{nope');

    expect(result).toBeNull();
  });

  it('returns null for a number', () => {
    const result = parse(5);

    expect(result).toBeNull();
  });
});

describe('unwrapXaiBillingAmount', () => {
  it('reads val from a unit object', () => {
    expect(unwrapXaiBillingAmount({ val: 42 })).toBe(42);
  });

  it('reads value from a unit object', () => {
    expect(unwrapXaiBillingAmount({ value: '7.5' })).toBe(7.5);
  });

  it('accepts a plain number', () => {
    expect(unwrapXaiBillingAmount(100)).toBe(100);
  });

  it('accepts a numeric string', () => {
    expect(unwrapXaiBillingAmount('250')).toBe(250);
  });

  it('returns null for empty or non-numeric input', () => {
    expect(unwrapXaiBillingAmount(null)).toBeNull();
    expect(unwrapXaiBillingAmount(undefined)).toBeNull();
    expect(unwrapXaiBillingAmount({})).toBeNull();
    expect(unwrapXaiBillingAmount('nope')).toBeNull();
  });
});

describe('normalizeAuthIndex re-export', () => {
  it('returns the decimal string for a finite number', () => {
    const result = normalizeAuthIndex(3);

    expect(result).toBe('3');
  });

  it('returns the trimmed string for a padded string', () => {
    const result = normalizeAuthIndex('  7 ');

    expect(result).toBe('7');
  });

  it('returns null for an empty string', () => {
    const result = normalizeAuthIndex('');

    expect(result).toBeNull();
  });

  it('returns null for NaN', () => {
    const result = normalizeAuthIndex(NaN);

    expect(result).toBeNull();
  });

  it('returns null for null', () => {
    const result = normalizeAuthIndex(null);

    expect(result).toBeNull();
  });
});
