import { describe, it, expect } from 'vitest';

import type { UpstreamConcurrencyConfig } from '@/types';
import {
  normalizeConcurrencyProviderKey,
  getProviderConcurrencyOverride,
  getEffectiveProviderConcurrency,
  concurrencyLimitToDraft,
  parseConcurrencyLimitDraft,
} from './upstreamConcurrency';

describe('normalizeConcurrencyProviderKey', () => {
  it('trims and lowercases the provider name', () => {
    const result = normalizeConcurrencyProviderKey('  OpenAI  ');

    expect(result).toBe('openai');
  });

  it('returns an empty string for null', () => {
    const result = normalizeConcurrencyProviderKey(null);

    expect(result).toBe('');
  });

  it('returns an empty string for undefined', () => {
    const result = normalizeConcurrencyProviderKey(undefined);

    expect(result).toBe('');
  });
});

describe('getProviderConcurrencyOverride', () => {
  it('returns undefined when config is undefined', () => {
    const result = getProviderConcurrencyOverride(undefined, 'openai');

    expect(result).toBeUndefined();
  });

  it('returns undefined when the provider key is empty', () => {
    const config: UpstreamConcurrencyConfig = { providers: { openai: 5 } };

    const result = getProviderConcurrencyOverride(config, '');

    expect(result).toBeUndefined();
  });

  it('returns undefined when there are no providers', () => {
    const config: UpstreamConcurrencyConfig = { default: 3 };

    const result = getProviderConcurrencyOverride(config, 'openai');

    expect(result).toBeUndefined();
  });

  it('returns a direct exact-key match', () => {
    const config: UpstreamConcurrencyConfig = { providers: { openai: 8 } };

    const result = getProviderConcurrencyOverride(config, 'openai');

    expect(result).toBe(8);
  });

  it('returns a value of 0 from a direct match', () => {
    const config: UpstreamConcurrencyConfig = { providers: { openai: 0 } };

    const result = getProviderConcurrencyOverride(config, 'openai');

    expect(result).toBe(0);
  });

  it('matches a provider key case-insensitively after trimming', () => {
    const config: UpstreamConcurrencyConfig = { providers: { OpenAI: 4 } };

    const result = getProviderConcurrencyOverride(config, '  openai  ');

    expect(result).toBe(4);
  });

  it('returns undefined when no provider matches', () => {
    const config: UpstreamConcurrencyConfig = { providers: { gemini: 2 } };

    const result = getProviderConcurrencyOverride(config, 'openai');

    expect(result).toBeUndefined();
  });
});

describe('getEffectiveProviderConcurrency', () => {
  it('reports the provider source with its positive limit', () => {
    const config: UpstreamConcurrencyConfig = { providers: { openai: 6 }, default: 10 };

    const result = getEffectiveProviderConcurrency(config, 'openai');

    expect(result).toEqual({ source: 'provider', limit: 6 });
  });

  it('reports a provider override of 0 as a provider source with limit 0', () => {
    const config: UpstreamConcurrencyConfig = { providers: { openai: 0 }, default: 10 };

    const result = getEffectiveProviderConcurrency(config, 'openai');

    expect(result).toEqual({ source: 'provider', limit: 0 });
  });

  it('falls back to the positive default when no provider override exists', () => {
    const config: UpstreamConcurrencyConfig = { providers: { gemini: 3 }, default: 12 };

    const result = getEffectiveProviderConcurrency(config, 'openai');

    expect(result).toEqual({ source: 'default', limit: 12 });
  });

  it('reports unlimited when the default is 0 and there is no override', () => {
    const config: UpstreamConcurrencyConfig = { default: 0 };

    const result = getEffectiveProviderConcurrency(config, 'openai');

    expect(result).toEqual({ source: 'unlimited' });
  });

  it('reports unlimited when neither override nor default is set', () => {
    const result = getEffectiveProviderConcurrency(undefined, 'openai');

    expect(result).toEqual({ source: 'unlimited' });
  });

  it('prefers a provider override of 0 over a positive default', () => {
    const config: UpstreamConcurrencyConfig = { providers: { openai: 0 }, default: 99 };

    const result = getEffectiveProviderConcurrency(config, 'openai');

    expect(result.source).toBe('provider');
    expect(result.limit).toBe(0);
  });
});

describe('concurrencyLimitToDraft', () => {
  it('returns an empty string for undefined', () => {
    const result = concurrencyLimitToDraft(undefined);

    expect(result).toBe('');
  });

  it('stringifies a positive number', () => {
    const result = concurrencyLimitToDraft(5);

    expect(result).toBe('5');
  });

  it('stringifies zero', () => {
    const result = concurrencyLimitToDraft(0);

    expect(result).toBe('0');
  });
});

describe('parseConcurrencyLimitDraft', () => {
  it('returns null for an empty string', () => {
    const result = parseConcurrencyLimitDraft('');

    expect(result).toBe(null);
  });

  it('returns null for a whitespace-only string', () => {
    const result = parseConcurrencyLimitDraft('   ');

    expect(result).toBe(null);
  });

  it('parses a positive integer', () => {
    const result = parseConcurrencyLimitDraft('7');

    expect(result).toBe(7);
  });

  it('parses zero', () => {
    const result = parseConcurrencyLimitDraft('0');

    expect(result).toBe(0);
  });

  it('trims surrounding whitespace before parsing', () => {
    const result = parseConcurrencyLimitDraft('  42  ');

    expect(result).toBe(42);
  });

  it('returns NaN for a non-integer decimal value', () => {
    const result = parseConcurrencyLimitDraft('3.5');

    expect(result).toBeNaN();
  });

  it('returns NaN for a negative value (leading minus is not a digit)', () => {
    const result = parseConcurrencyLimitDraft('-4');

    expect(result).toBeNaN();
  });

  it('returns NaN for a non-numeric value', () => {
    const result = parseConcurrencyLimitDraft('abc');

    expect(result).toBeNaN();
  });
});
