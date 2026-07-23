import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  pickEarlierResetTime,
  minNullableNumber,
  buildGeminiCliQuotaBuckets,
  getAntigravityQuotaInfo,
  findAntigravityModel,
  buildAntigravityQuotaGroups,
  buildKimiQuotaRows,
  buildXaiQuotaRows,
  buildZaiQuotaRows,
  resolveXaiCreditsLabelKey,
  resolveXaiPlanType,
} from './builders';
import type {
  AntigravityModelsPayload,
  AntigravityQuotaInfo,
  GeminiCliParsedBucket,
  KimiUsagePayload,
  ZaiQuotaPayload,
} from '@/types';

// A fixed wall-clock instant used as the reference point for every relative
// time-math assertion. 2026-06-02T00:00:00.000Z chosen to match the project's
// "today"; any fixed value works as long as deltas are computed against it.
const FIXED_NOW = new Date('2026-06-02T00:00:00.000Z').getTime();

describe('pickEarlierResetTime', () => {
  it('returns next when current is undefined', () => {
    const result = pickEarlierResetTime(undefined, '2026-06-02T01:00:00Z');

    expect(result).toBe('2026-06-02T01:00:00Z');
  });

  it('returns next when current is an empty string', () => {
    const result = pickEarlierResetTime('', '2026-06-02T01:00:00Z');

    expect(result).toBe('2026-06-02T01:00:00Z');
  });

  it('returns current when next is undefined', () => {
    const result = pickEarlierResetTime('2026-06-02T01:00:00Z', undefined);

    expect(result).toBe('2026-06-02T01:00:00Z');
  });

  it('returns current when next is an empty string', () => {
    const result = pickEarlierResetTime('2026-06-02T01:00:00Z', '');

    expect(result).toBe('2026-06-02T01:00:00Z');
  });

  it('returns undefined when both are undefined', () => {
    const result = pickEarlierResetTime(undefined, undefined);

    expect(result).toBeUndefined();
  });

  it('returns the earlier of two valid timestamps when current is earlier', () => {
    const result = pickEarlierResetTime('2026-06-02T01:00:00Z', '2026-06-02T05:00:00Z');

    expect(result).toBe('2026-06-02T01:00:00Z');
  });

  it('returns the earlier of two valid timestamps when next is earlier', () => {
    const result = pickEarlierResetTime('2026-06-02T09:00:00Z', '2026-06-02T05:00:00Z');

    expect(result).toBe('2026-06-02T05:00:00Z');
  });

  it('returns current when the two timestamps are equal', () => {
    const result = pickEarlierResetTime('2026-06-02T05:00:00Z', '2026-06-02T05:00:00Z');

    expect(result).toBe('2026-06-02T05:00:00Z');
  });

  it('returns next when current is an unparseable date', () => {
    const result = pickEarlierResetTime('not-a-date', '2026-06-02T05:00:00Z');

    expect(result).toBe('2026-06-02T05:00:00Z');
  });

  it('returns current when next is an unparseable date', () => {
    const result = pickEarlierResetTime('2026-06-02T05:00:00Z', 'not-a-date');

    expect(result).toBe('2026-06-02T05:00:00Z');
  });
});

describe('minNullableNumber', () => {
  it('returns next when current is null', () => {
    expect(minNullableNumber(null, 7)).toBe(7);
  });

  it('returns current when next is null', () => {
    expect(minNullableNumber(3, null)).toBe(3);
  });

  it('returns null when both are null', () => {
    expect(minNullableNumber(null, null)).toBeNull();
  });

  it('returns the smaller value when both are numbers', () => {
    expect(minNullableNumber(3, 7)).toBe(3);
  });

  it('returns the smaller value regardless of argument order', () => {
    expect(minNullableNumber(7, 3)).toBe(3);
  });

  it('treats zero as a real value rather than null', () => {
    expect(minNullableNumber(0, 5)).toBe(0);
  });

  it('returns the smaller of two negative numbers', () => {
    expect(minNullableNumber(-2, -5)).toBe(-5);
  });
});

describe('buildGeminiCliQuotaBuckets', () => {
  const bucket = (overrides: Partial<GeminiCliParsedBucket>): GeminiCliParsedBucket => ({
    modelId: 'gemini-2.5-flash',
    tokenType: null,
    remainingFraction: 0.5,
    remainingAmount: 100,
    resetTime: undefined,
    ...overrides,
  });

  it('returns an empty array for no buckets', () => {
    expect(buildGeminiCliQuotaBuckets([])).toEqual([]);
  });

  it('drops buckets for ignored gemini-2.0-flash models', () => {
    const result = buildGeminiCliQuotaBuckets([bucket({ modelId: 'gemini-2.0-flash' })]);

    expect(result).toEqual([]);
  });

  it('drops ignored models matched by prefix with a suffix', () => {
    const result = buildGeminiCliQuotaBuckets([bucket({ modelId: 'gemini-2.0-flash-exp' })]);

    expect(result).toEqual([]);
  });

  it('uses the group id and label for a known grouped model', () => {
    const result = buildGeminiCliQuotaBuckets([
      bucket({ modelId: 'gemini-2.5-flash-lite', remainingFraction: 0.25, remainingAmount: 40 }),
    ]);

    expect(result).toEqual([
      {
        id: 'gemini-flash-lite-series',
        label: 'Gemini Flash Lite Series',
        remainingFraction: 0.25,
        remainingAmount: 40,
        resetTime: undefined,
        tokenType: null,
        modelIds: ['gemini-2.5-flash-lite'],
      },
    ]);
  });

  it('falls back to the model id as both id and label for an unknown model', () => {
    const result = buildGeminiCliQuotaBuckets([
      bucket({ modelId: 'totally-unknown-model', remainingFraction: 0.9, remainingAmount: 9 }),
    ]);

    expect(result).toEqual([
      {
        id: 'totally-unknown-model',
        label: 'totally-unknown-model',
        remainingFraction: 0.9,
        remainingAmount: 9,
        resetTime: undefined,
        tokenType: null,
        modelIds: ['totally-unknown-model'],
      },
    ]);
  });

  it('appends the token type to the id when a token type is present', () => {
    const result = buildGeminiCliQuotaBuckets([
      bucket({ modelId: 'gemini-2.5-flash-lite', tokenType: 'input' }),
    ]);

    expect(result[0].id).toBe('gemini-flash-lite-series-input');
  });

  it('keeps the group label even when a token type is present', () => {
    const result = buildGeminiCliQuotaBuckets([
      bucket({ modelId: 'gemini-2.5-flash-lite', tokenType: 'input' }),
    ]);

    expect(result[0].label).toBe('Gemini Flash Lite Series');
  });

  it('merges two non-preferred models of the same group using the minimum remaining fraction', () => {
    // Neither model is the pro-series preferred model (gemini-3.1-pro-preview),
    // so the merged fallback minimum is observable.
    const result = buildGeminiCliQuotaBuckets([
      bucket({ modelId: 'gemini-3-pro-preview', remainingFraction: 0.8, remainingAmount: 80 }),
      bucket({ modelId: 'gemini-2.5-pro', remainingFraction: 0.3, remainingAmount: 30 }),
    ]);

    expect(result[0].remainingFraction).toBe(0.3);
  });

  it('merges two non-preferred models of the same group using the minimum remaining amount', () => {
    const result = buildGeminiCliQuotaBuckets([
      bucket({ modelId: 'gemini-3-pro-preview', remainingFraction: 0.8, remainingAmount: 80 }),
      bucket({ modelId: 'gemini-2.5-pro', remainingFraction: 0.3, remainingAmount: 30 }),
    ]);

    expect(result[0].remainingAmount).toBe(30);
  });

  it('collects every model id of a merged group', () => {
    const result = buildGeminiCliQuotaBuckets([
      bucket({ modelId: 'gemini-3-flash-preview' }),
      bucket({ modelId: 'gemini-2.5-flash' }),
    ]);

    expect(result[0].modelIds).toEqual(['gemini-3-flash-preview', 'gemini-2.5-flash']);
  });

  it('deduplicates repeated model ids in a merged group', () => {
    const result = buildGeminiCliQuotaBuckets([
      bucket({ modelId: 'gemini-2.5-flash', remainingFraction: 0.4 }),
      bucket({ modelId: 'gemini-2.5-flash', remainingFraction: 0.6 }),
    ]);

    expect(result[0].modelIds).toEqual(['gemini-2.5-flash']);
  });

  it('picks the earliest reset time when merging non-preferred models of a group', () => {
    const result = buildGeminiCliQuotaBuckets([
      bucket({ modelId: 'gemini-3-pro-preview', resetTime: '2026-06-02T09:00:00Z' }),
      bucket({ modelId: 'gemini-2.5-pro', resetTime: '2026-06-02T03:00:00Z' }),
    ]);

    expect(result[0].resetTime).toBe('2026-06-02T03:00:00Z');
  });

  it('uses the preferred model fields instead of the merged minimum when present', () => {
    const result = buildGeminiCliQuotaBuckets([
      // Non-preferred member has the smaller fraction, but the preferred model wins.
      bucket({ modelId: 'gemini-2.5-flash', remainingFraction: 0.1, remainingAmount: 10 }),
      bucket({
        modelId: 'gemini-3-flash-preview',
        remainingFraction: 0.7,
        remainingAmount: 70,
        resetTime: '2026-06-02T08:00:00Z',
      }),
    ]);

    expect(result[0]).toMatchObject({
      remainingFraction: 0.7,
      remainingAmount: 70,
      resetTime: '2026-06-02T08:00:00Z',
    });
  });

  it('treats different token types of the same model as separate buckets', () => {
    const result = buildGeminiCliQuotaBuckets([
      bucket({ modelId: 'gemini-2.5-flash-lite', tokenType: 'input', remainingFraction: 0.4 }),
      bucket({ modelId: 'gemini-2.5-flash-lite', tokenType: 'output', remainingFraction: 0.6 }),
    ]);

    expect(result.map((b) => b.id)).toEqual([
      'gemini-flash-lite-series-input',
      'gemini-flash-lite-series-output',
    ]);
  });

  it('orders groups by their defined group order', () => {
    const result = buildGeminiCliQuotaBuckets([
      bucket({ modelId: 'gemini-2.5-pro' }),
      bucket({ modelId: 'gemini-2.5-flash-lite' }),
      bucket({ modelId: 'gemini-3-flash-preview' }),
    ]);

    expect(result.map((b) => b.id)).toEqual([
      'gemini-flash-lite-series',
      'gemini-flash-series',
      'gemini-pro-series',
    ]);
  });

  it('sorts buckets of the same group order by token type alphabetically', () => {
    const result = buildGeminiCliQuotaBuckets([
      bucket({ modelId: 'gemini-2.5-flash-lite', tokenType: 'output' }),
      bucket({ modelId: 'gemini-2.5-flash-lite', tokenType: 'input' }),
    ]);

    expect(result.map((b) => b.tokenType)).toEqual(['input', 'output']);
  });

  it('preserves a null remaining fraction when both merged members are null', () => {
    const result = buildGeminiCliQuotaBuckets([
      bucket({ modelId: 'gemini-3-flash-preview', remainingFraction: null }),
      bucket({ modelId: 'gemini-2.5-flash', remainingFraction: null }),
    ]);

    expect(result[0].remainingFraction).toBeNull();
  });
});

describe('getAntigravityQuotaInfo', () => {
  it('returns a null fraction with no other fields when entry is undefined', () => {
    expect(getAntigravityQuotaInfo(undefined)).toEqual({ remainingFraction: null });
  });

  it('reads remainingFraction from the camelCase quotaInfo container', () => {
    const entry: AntigravityQuotaInfo = { quotaInfo: { remainingFraction: 0.42 } };

    expect(getAntigravityQuotaInfo(entry).remainingFraction).toBe(0.42);
  });

  it('reads remainingFraction from the snake_case quota_info container', () => {
    const entry: AntigravityQuotaInfo = { quota_info: { remainingFraction: 0.6 } };

    expect(getAntigravityQuotaInfo(entry).remainingFraction).toBe(0.6);
  });

  it('falls back to the snake_case remaining_fraction key', () => {
    const entry: AntigravityQuotaInfo = { quotaInfo: { remaining_fraction: 0.33 } };

    expect(getAntigravityQuotaInfo(entry).remainingFraction).toBe(0.33);
  });

  it('falls back to the bare remaining key', () => {
    const entry: AntigravityQuotaInfo = { quotaInfo: { remaining: 0.15 } };

    expect(getAntigravityQuotaInfo(entry).remainingFraction).toBe(0.15);
  });

  it('parses a percent string fraction into a 0-1 value', () => {
    const entry: AntigravityQuotaInfo = { quotaInfo: { remainingFraction: '50%' } };

    expect(getAntigravityQuotaInfo(entry).remainingFraction).toBe(0.5);
  });

  it('returns a null fraction when the quota container is empty', () => {
    const entry: AntigravityQuotaInfo = { quotaInfo: {} };

    expect(getAntigravityQuotaInfo(entry).remainingFraction).toBeNull();
  });

  it('reads the camelCase resetTime', () => {
    const entry: AntigravityQuotaInfo = { quotaInfo: { resetTime: '2026-06-02T10:00:00Z' } };

    expect(getAntigravityQuotaInfo(entry).resetTime).toBe('2026-06-02T10:00:00Z');
  });

  it('reads the snake_case reset_time', () => {
    const entry: AntigravityQuotaInfo = { quotaInfo: { reset_time: '2026-06-02T11:00:00Z' } };

    expect(getAntigravityQuotaInfo(entry).resetTime).toBe('2026-06-02T11:00:00Z');
  });

  it('leaves resetTime undefined when the reset value is not a string', () => {
    const entry = { quotaInfo: { resetTime: 1234 } } as unknown as AntigravityQuotaInfo;

    expect(getAntigravityQuotaInfo(entry).resetTime).toBeUndefined();
  });

  it('reads the displayName when it is a string', () => {
    const entry: AntigravityQuotaInfo = { displayName: 'Gemini Pro', quotaInfo: {} };

    expect(getAntigravityQuotaInfo(entry).displayName).toBe('Gemini Pro');
  });

  it('leaves displayName undefined when it is not a string', () => {
    const entry = { displayName: 99, quotaInfo: {} } as unknown as AntigravityQuotaInfo;

    expect(getAntigravityQuotaInfo(entry).displayName).toBeUndefined();
  });
});

describe('findAntigravityModel', () => {
  it('returns a direct match by identifier key', () => {
    const models: AntigravityModelsPayload = {
      'model-a': { displayName: 'A' },
      'model-b': { displayName: 'B' },
    };

    expect(findAntigravityModel(models, 'model-a')).toEqual({
      id: 'model-a',
      entry: { displayName: 'A' },
    });
  });

  it('falls back to a case-insensitive displayName match', () => {
    const models: AntigravityModelsPayload = {
      'model-x': { displayName: 'Claude Sonnet' },
    };

    expect(findAntigravityModel(models, 'claude sonnet')).toEqual({
      id: 'model-x',
      entry: { displayName: 'Claude Sonnet' },
    });
  });

  it('returns null when no key or displayName matches', () => {
    const models: AntigravityModelsPayload = {
      'model-x': { displayName: 'Claude Sonnet' },
    };

    expect(findAntigravityModel(models, 'gpt-4')).toBeNull();
  });

  it('returns null for an empty models payload', () => {
    expect(findAntigravityModel({}, 'anything')).toBeNull();
  });

  it('prefers a direct key match over a displayName match for the same identifier', () => {
    const models: AntigravityModelsPayload = {
      direct: { displayName: 'other' },
      another: { displayName: 'direct' },
    };

    expect(findAntigravityModel(models, 'direct')).toEqual({
      id: 'direct',
      entry: { displayName: 'other' },
    });
  });
});

describe('buildAntigravityQuotaGroups', () => {
  it('returns an empty array for an empty models payload', () => {
    expect(buildAntigravityQuotaGroups({})).toEqual([]);
  });

  it('builds the claude-gpt group from a single matching identifier', () => {
    const models: AntigravityModelsPayload = {
      'claude-sonnet-4-6': { quotaInfo: { remainingFraction: 0.5 } },
    };

    const groups = buildAntigravityQuotaGroups(models);

    expect(groups).toEqual([
      {
        id: 'claude-gpt',
        label: 'Claude/GPT',
        models: ['claude-sonnet-4-6'],
        remainingFraction: 0.5,
        resetTime: undefined,
      },
    ]);
  });

  it('uses the minimum remaining fraction across matched identifiers in a group', () => {
    const models: AntigravityModelsPayload = {
      'claude-sonnet-4-6': { quotaInfo: { remainingFraction: 0.8 } },
      'gpt-oss-120b-medium': { quotaInfo: { remainingFraction: 0.2 } },
    };

    const groups = buildAntigravityQuotaGroups(models);

    expect(groups[0].remainingFraction).toBe(0.2);
  });

  it('treats a model with a reset time but no fraction as zero remaining', () => {
    const models: AntigravityModelsPayload = {
      'claude-sonnet-4-6': { quotaInfo: { resetTime: '2026-06-02T10:00:00Z' } },
    };

    const groups = buildAntigravityQuotaGroups(models);

    expect(groups[0].remainingFraction).toBe(0);
  });

  it('drops a model that has neither a fraction nor a reset time', () => {
    const models: AntigravityModelsPayload = {
      'claude-sonnet-4-6': { quotaInfo: {} },
    };

    expect(buildAntigravityQuotaGroups(models)).toEqual([]);
  });

  it('uses the first available reset time among matched entries', () => {
    const models: AntigravityModelsPayload = {
      'gemini-3-pro-high': { quotaInfo: { remainingFraction: 0.5 } },
      'gemini-3-pro-low': {
        quotaInfo: { remainingFraction: 0.4, resetTime: '2026-06-02T07:00:00Z' },
      },
    };

    const groups = buildAntigravityQuotaGroups(models);

    expect(groups[0].resetTime).toBe('2026-06-02T07:00:00Z');
  });

  it('uses the model display name as the group label when labelFromModel is set', () => {
    const models: AntigravityModelsPayload = {
      'gemini-3.1-flash-image': {
        displayName: 'Imagen Flash',
        quotaInfo: { remainingFraction: 0.5 },
      },
    };

    const group = buildAntigravityQuotaGroups(models).find((g) => g.id === 'gemini-image');

    expect(group?.label).toBe('Imagen Flash');
  });

  it('falls back to the static label for a labelFromModel group with no display name', () => {
    const models: AntigravityModelsPayload = {
      'gemini-3.1-flash-image': { quotaInfo: { remainingFraction: 0.5 } },
    };

    const group = buildAntigravityQuotaGroups(models).find((g) => g.id === 'gemini-image');

    expect(group?.label).toBe('gemini-3.1-flash-image');
  });

  it('propagates the gemini 3.1 pro reset time onto the gemini-image group', () => {
    const models: AntigravityModelsPayload = {
      'gemini-3.1-pro-high': {
        quotaInfo: { remainingFraction: 0.5, resetTime: '2026-06-02T12:00:00Z' },
      },
      'gemini-3.1-flash-image': {
        quotaInfo: { remainingFraction: 0.5, resetTime: '2026-06-02T20:00:00Z' },
      },
    };

    const group = buildAntigravityQuotaGroups(models).find((g) => g.id === 'gemini-image');

    expect(group?.resetTime).toBe('2026-06-02T12:00:00Z');
  });

  it('propagates the gemini-3-pro reset time onto gemini-image when the 3.1 group is absent', () => {
    const models: AntigravityModelsPayload = {
      'gemini-3-pro-high': {
        quotaInfo: { remainingFraction: 0.5, resetTime: '2026-06-02T14:00:00Z' },
      },
      'gemini-3.1-flash-image': {
        quotaInfo: { remainingFraction: 0.5, resetTime: '2026-06-02T20:00:00Z' },
      },
    };

    const group = buildAntigravityQuotaGroups(models).find((g) => g.id === 'gemini-image');

    expect(group?.resetTime).toBe('2026-06-02T14:00:00Z');
  });

  it("uses the gemini-image group's own reset time when no pro reset override exists", () => {
    const models: AntigravityModelsPayload = {
      'gemini-3.1-flash-image': {
        quotaInfo: { remainingFraction: 0.5, resetTime: '2026-06-02T20:00:00Z' },
      },
    };

    const group = buildAntigravityQuotaGroups(models).find((g) => g.id === 'gemini-image');

    expect(group?.resetTime).toBe('2026-06-02T20:00:00Z');
  });

  it('emits groups in the canonical claude-then-gemini ordering', () => {
    const models: AntigravityModelsPayload = {
      'gemini-3-flash': { quotaInfo: { remainingFraction: 0.5 } },
      'claude-sonnet-4-6': { quotaInfo: { remainingFraction: 0.5 } },
      'gemini-2.5-flash': { quotaInfo: { remainingFraction: 0.5 } },
    };

    const ids = buildAntigravityQuotaGroups(models).map((g) => g.id);

    expect(ids).toEqual(['claude-gpt', 'gemini-2-5-flash', 'gemini-3-flash']);
  });
});

describe('buildKimiQuotaRows', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns an empty array when there is no usage and no limits', () => {
    expect(buildKimiQuotaRows({})).toEqual([]);
  });

  it('builds a summary row from the usage object with the weekly fallback label', () => {
    const payload: KimiUsagePayload = { usage: { used: 30, limit: 100 } };

    const rows = buildKimiQuotaRows(payload);

    expect(rows).toEqual([
      {
        id: 'summary',
        labelKey: 'kimi_quota.weekly_limit',
        used: 30,
        limit: 100,
        resetHint: undefined,
      },
    ]);
  });

  it('derives used from limit minus remaining when used is absent', () => {
    const payload: KimiUsagePayload = { usage: { remaining: 20, limit: 100 } };

    const rows = buildKimiQuotaRows(payload);

    expect(rows[0].used).toBe(80);
  });

  it('defaults a missing used value to zero when only the limit is present', () => {
    const payload: KimiUsagePayload = { usage: { limit: 100 } };

    const rows = buildKimiQuotaRows(payload);

    expect(rows[0].used).toBe(0);
  });

  it('skips the summary row when usage has neither used nor limit', () => {
    const payload: KimiUsagePayload = { usage: { name: 'orphan' } };

    expect(buildKimiQuotaRows(payload)).toEqual([]);
  });

  it('prefers an explicit name label over the fallback label', () => {
    const payload: KimiUsagePayload = { usage: { used: 10, limit: 100, name: 'Custom Window' } };

    const rows = buildKimiQuotaRows(payload);

    expect(rows[0]).toMatchObject({ label: 'Custom Window' });
  });

  it('labels a limit window from its duration in minutes converted to hours', () => {
    const payload: KimiUsagePayload = {
      limits: [{ window: { duration: 120, timeUnit: 'MINUTES' }, detail: { used: 5, limit: 50 } }],
    };

    const rows = buildKimiQuotaRows(payload);

    expect(rows[0]).toMatchObject({
      id: 'limit-0',
      labelKey: 'kimi_quota.limit_window',
      labelParams: { duration: '2h' },
    });
  });

  it('keeps minutes for a non-hour-aligned MINUTES duration', () => {
    const payload: KimiUsagePayload = {
      limits: [{ window: { duration: 90, timeUnit: 'MINUTES' }, detail: { used: 5, limit: 50 } }],
    };

    const rows = buildKimiQuotaRows(payload);

    expect(rows[0]).toMatchObject({ labelParams: { duration: '90m' } });
  });

  it('formats a DAYS duration token with a day suffix', () => {
    const payload: KimiUsagePayload = {
      limits: [{ window: { duration: 7, timeUnit: 'DAYS' }, detail: { used: 5, limit: 50 } }],
    };

    const rows = buildKimiQuotaRows(payload);

    expect(rows[0]).toMatchObject({ labelParams: { duration: '7d' } });
  });

  it('falls back to a seconds token for an unrecognized time unit', () => {
    const payload: KimiUsagePayload = {
      limits: [{ window: { duration: 45, timeUnit: 'WEEKS' }, detail: { used: 5, limit: 50 } }],
    };

    const rows = buildKimiQuotaRows(payload);

    expect(rows[0]).toMatchObject({ labelParams: { duration: '45s' } });
  });

  it('falls back to a 1-based limit index label when no duration is available', () => {
    const payload: KimiUsagePayload = {
      limits: [{ detail: { used: 5, limit: 50 } }],
    };

    const rows = buildKimiQuotaRows(payload);

    expect(rows[0]).toMatchObject({
      labelKey: 'kimi_quota.limit_index',
      labelParams: { index: 1 },
    });
  });

  it('uses the limit item itself as the detail when no nested detail object exists', () => {
    const payload: KimiUsagePayload = {
      limits: [{ used: 12, limit: 80 }],
    };

    const rows = buildKimiQuotaRows(payload);

    expect(rows[0]).toMatchObject({ id: 'limit-0', used: 12, limit: 80 });
  });

  it('prefers an explicit name on the limit detail over the window label', () => {
    const payload: KimiUsagePayload = {
      limits: [
        {
          name: 'Daily Cap',
          window: { duration: 60, timeUnit: 'MINUTES' },
          detail: { used: 5, limit: 50 },
        },
      ],
    };

    const rows = buildKimiQuotaRows(payload);

    expect(rows[0]).toMatchObject({ label: 'Daily Cap' });
  });

  it('appends both a summary row and a limit row in order', () => {
    const payload: KimiUsagePayload = {
      usage: { used: 30, limit: 100 },
      limits: [{ detail: { used: 5, limit: 50 } }],
    };

    const rows = buildKimiQuotaRows(payload);

    expect(rows.map((r) => r.id)).toEqual(['summary', 'limit-0']);
  });

  it('computes an hours-and-minutes reset hint from an absolute reset_at timestamp', () => {
    // 2h 30m after FIXED_NOW (2026-06-02T00:00:00Z) -> 2026-06-02T02:30:00Z.
    const payload: KimiUsagePayload = {
      usage: { used: 30, limit: 100, reset_at: '2026-06-02T02:30:00.000Z' },
    };

    const rows = buildKimiQuotaRows(payload);

    expect(rows[0].resetHint).toBe('2h 30m');
  });

  it('omits the minutes segment when an absolute reset is a whole number of hours away', () => {
    const payload: KimiUsagePayload = {
      usage: { used: 30, limit: 100, reset_at: '2026-06-02T03:00:00.000Z' },
    };

    const rows = buildKimiQuotaRows(payload);

    expect(rows[0].resetHint).toBe('3h');
  });

  it('reports only minutes when an absolute reset is under an hour away', () => {
    const payload: KimiUsagePayload = {
      usage: { used: 30, limit: 100, reset_at: '2026-06-02T00:45:00.000Z' },
    };

    const rows = buildKimiQuotaRows(payload);

    expect(rows[0].resetHint).toBe('45m');
  });

  it('reports the under-one-minute marker when an absolute reset is seconds away', () => {
    const payload: KimiUsagePayload = {
      usage: { used: 30, limit: 100, reset_at: '2026-06-02T00:00:30.000Z' },
    };

    const rows = buildKimiQuotaRows(payload);

    expect(rows[0].resetHint).toBe('<1m');
  });

  it('omits the reset hint for an absolute reset time in the past', () => {
    const payload: KimiUsagePayload = {
      usage: { used: 30, limit: 100, reset_at: '2026-06-01T23:00:00.000Z' },
    };

    const rows = buildKimiQuotaRows(payload);

    expect(rows[0].resetHint).toBeUndefined();
  });

  it('computes a reset hint from a relative reset_in in seconds', () => {
    // 3661 seconds = 1h 1m.
    const payload: KimiUsagePayload = {
      usage: { used: 30, limit: 100, reset_in: 3661 },
    };

    const rows = buildKimiQuotaRows(payload);

    expect(rows[0].resetHint).toBe('1h 1m');
  });

  it('reports only hours from a relative reset_in with no leftover minutes', () => {
    const payload: KimiUsagePayload = {
      usage: { used: 30, limit: 100, reset_in: 7200 },
    };

    const rows = buildKimiQuotaRows(payload);

    expect(rows[0].resetHint).toBe('2h');
  });

  it('reports the under-one-minute marker for a tiny positive relative reset', () => {
    const payload: KimiUsagePayload = {
      usage: { used: 30, limit: 100, ttl: 30 },
    };

    const rows = buildKimiQuotaRows(payload);

    expect(rows[0].resetHint).toBe('<1m');
  });

  it('truncates fractional microseconds before parsing an absolute reset timestamp', () => {
    // 1h 0m after now, expressed with an over-long fractional second.
    const payload: KimiUsagePayload = {
      usage: { used: 30, limit: 100, reset_at: '2026-06-02T01:00:00.123456789Z' },
    };

    const rows = buildKimiQuotaRows(payload);

    expect(rows[0].resetHint).toBe('1h');
  });
});

describe('buildZaiQuotaRows', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns an empty array when there are no limits', () => {
    expect(buildZaiQuotaRows({})).toEqual([]);
  });

  it('reads limits from the nested data container when the top-level array is absent', () => {
    const payload: ZaiQuotaPayload = {
      data: { limits: [{ type: 'TOKENS_LIMIT', percentage: 40 }] },
    };

    const rows = buildZaiQuotaRows(payload);

    expect(rows.map((r) => r.id)).toEqual(['tokens-limit']);
  });

  it('drops a row whose used percent, current value, and limit are all unparseable', () => {
    const payload: ZaiQuotaPayload = { limits: [{ type: 'TOKENS_LIMIT' }] };

    expect(buildZaiQuotaRows(payload)).toEqual([]);
  });

  it('derives the used percent from current value over limit', () => {
    // 25 / 100 * 100 = 25.
    const payload: ZaiQuotaPayload = {
      limits: [{ type: 'TOKENS_LIMIT', currentValue: 25, usage: 100 }],
    };

    const rows = buildZaiQuotaRows(payload);

    expect(rows[0].usedPercent).toBe(25);
  });

  it('derives the remaining percent from current value over limit', () => {
    // 100 - 25 = 75.
    const payload: ZaiQuotaPayload = {
      limits: [{ type: 'TOKENS_LIMIT', currentValue: 25, usage: 100 }],
    };

    const rows = buildZaiQuotaRows(payload);

    expect(rows[0].remainingPercent).toBe(75);
  });

  it('derives used percent from the remaining field when current value is absent', () => {
    // 100 - (30 / 120 * 100) = 75.
    const payload: ZaiQuotaPayload = {
      limits: [{ type: 'TOKENS_LIMIT', remaining: 30, limit: 120 }],
    };

    const rows = buildZaiQuotaRows(payload);

    expect(rows[0].usedPercent).toBe(75);
  });

  it('falls back to the API-provided percentage when no values are derivable', () => {
    const payload: ZaiQuotaPayload = {
      limits: [{ type: 'TOKENS_LIMIT', percentage: 60 }],
    };

    const rows = buildZaiQuotaRows(payload);

    expect(rows[0].usedPercent).toBe(60);
  });

  it('parses a percent-suffixed string percentage', () => {
    const payload: ZaiQuotaPayload = {
      limits: [{ type: 'TOKENS_LIMIT', percentage: '42%' }],
    };

    const rows = buildZaiQuotaRows(payload);

    expect(rows[0].usedPercent).toBe(42);
  });

  it('clamps a used percent above 100 down to 100', () => {
    // 200 / 100 * 100 = 200, clamped to 100.
    const payload: ZaiQuotaPayload = {
      limits: [{ type: 'TOKENS_LIMIT', currentValue: 200, usage: 100 }],
    };

    const rows = buildZaiQuotaRows(payload);

    expect(rows[0].usedPercent).toBe(100);
  });

  it('clamps the remaining percent to zero when used exceeds the limit', () => {
    const payload: ZaiQuotaPayload = {
      limits: [{ type: 'TOKENS_LIMIT', currentValue: 200, usage: 100 }],
    };

    const rows = buildZaiQuotaRows(payload);

    expect(rows[0].remainingPercent).toBe(0);
  });

  it('clamps a negative API percentage up to zero', () => {
    const payload: ZaiQuotaPayload = {
      limits: [{ type: 'TOKENS_LIMIT', percentage: -10 }],
    };

    const rows = buildZaiQuotaRows(payload);

    expect(rows[0].usedPercent).toBe(0);
  });

  it('falls back to the misspelled "totol" limit field when no other limit key exists', () => {
    // 10 / 40 * 100 = 25.
    const payload: ZaiQuotaPayload = {
      limits: [{ type: 'TOKENS_LIMIT', currentValue: 10, totol: 40 }],
    };

    const rows = buildZaiQuotaRows(payload);

    expect(rows[0].usedPercent).toBe(25);
  });

  it('treats a zero limit as non-derivable and falls back to the API percentage', () => {
    const payload: ZaiQuotaPayload = {
      limits: [{ type: 'TOKENS_LIMIT', currentValue: 10, usage: 0, percentage: 33 }],
    };

    const rows = buildZaiQuotaRows(payload);

    expect(rows[0].usedPercent).toBe(33);
  });

  it('maps the TOKENS_LIMIT type to its label key', () => {
    const payload: ZaiQuotaPayload = {
      limits: [{ type: 'TOKENS_LIMIT', percentage: 10 }],
    };

    const rows = buildZaiQuotaRows(payload);

    expect(rows[0]).toMatchObject({ labelKey: 'zai_quota.tokens_5h' });
  });

  it('maps the TIME_LIMIT type to its label key', () => {
    const payload: ZaiQuotaPayload = {
      limits: [{ type: 'TIME_LIMIT', percentage: 10 }],
    };

    const rows = buildZaiQuotaRows(payload);

    expect(rows[0]).toMatchObject({ labelKey: 'zai_quota.mcp_monthly' });
  });

  it('humanizes an unknown type into a title-cased label', () => {
    const payload: ZaiQuotaPayload = {
      limits: [{ type: 'custom_daily_limit', percentage: 10 }],
    };

    const rows = buildZaiQuotaRows(payload);

    expect(rows[0]).toMatchObject({ label: 'Custom Daily Limit' });
  });

  it('derives the row id by slugifying the type', () => {
    const payload: ZaiQuotaPayload = {
      limits: [{ type: 'Custom Daily Limit', percentage: 10 }],
    };

    const rows = buildZaiQuotaRows(payload);

    expect(rows[0].id).toBe('custom-daily-limit');
  });

  it('synthesizes a LIMIT_n type when the item has no type', () => {
    const payload: ZaiQuotaPayload = {
      limits: [{ percentage: 10 }],
    };

    const rows = buildZaiQuotaRows(payload);

    expect(rows[0].id).toBe('limit-1');
  });

  it('exposes the parsed current value and limit on the row', () => {
    const payload: ZaiQuotaPayload = {
      limits: [{ type: 'TOKENS_LIMIT', currentValue: 25, usage: 100 }],
    };

    const rows = buildZaiQuotaRows(payload);

    expect(rows[0]).toMatchObject({ currentValue: 25, limit: 100 });
  });

  it('computes a days-and-hours reset hint from an absolute millisecond timestamp', () => {
    // 1d 2h after FIXED_NOW = 26 hours = 93_600_000 ms.
    const targetMs = FIXED_NOW + (26 * 3600 + 0 * 60) * 1000;
    const payload: ZaiQuotaPayload = {
      limits: [{ type: 'TOKENS_LIMIT', percentage: 10, nextResetTime: targetMs }],
    };

    const rows = buildZaiQuotaRows(payload);

    expect(rows[0].resetHint).toBe('1d 2h');
  });

  it('treats a value above 1e9 but below 1e12 as a second-precision epoch', () => {
    // FIXED_NOW in seconds + 2 hours.
    const epochSeconds = Math.floor(FIXED_NOW / 1000) + 2 * 3600;
    const payload: ZaiQuotaPayload = {
      limits: [{ type: 'TOKENS_LIMIT', percentage: 10, resetTime: epochSeconds }],
    };

    const rows = buildZaiQuotaRows(payload);

    expect(rows[0].resetHint).toBe('2h');
  });

  it('treats a small absolute value as a relative offset in seconds', () => {
    // 3600 < 1e9, so interpreted as now + 3600s = 1h.
    const payload: ZaiQuotaPayload = {
      limits: [{ type: 'TOKENS_LIMIT', percentage: 10, resetTime: 3600 }],
    };

    const rows = buildZaiQuotaRows(payload);

    expect(rows[0].resetHint).toBe('1h');
  });

  it('parses an absolute ISO reset timestamp string into a duration hint', () => {
    // 5 hours after FIXED_NOW.
    const payload: ZaiQuotaPayload = {
      limits: [{ type: 'TOKENS_LIMIT', percentage: 10, resetTime: '2026-06-02T05:00:00.000Z' }],
    };

    const rows = buildZaiQuotaRows(payload);

    expect(rows[0].resetHint).toBe('5h');
  });

  it('computes a reset hint from a relative resetIn in seconds', () => {
    // 90 minutes = 1h 30m.
    const payload: ZaiQuotaPayload = {
      limits: [{ type: 'TOKENS_LIMIT', percentage: 10, resetIn: 5400 }],
    };

    const rows = buildZaiQuotaRows(payload);

    expect(rows[0].resetHint).toBe('1h 30m');
  });

  it('reports the days-only hint when the absolute reset is a whole number of days away', () => {
    // Exactly 2 days after FIXED_NOW.
    const targetMs = FIXED_NOW + 2 * 86400 * 1000;
    const payload: ZaiQuotaPayload = {
      limits: [{ type: 'TOKENS_LIMIT', percentage: 10, nextResetTime: targetMs }],
    };

    const rows = buildZaiQuotaRows(payload);

    expect(rows[0].resetHint).toBe('2d');
  });

  it('omits the reset hint when no reset key resolves to a positive future duration', () => {
    const payload: ZaiQuotaPayload = {
      limits: [{ type: 'TOKENS_LIMIT', percentage: 10, resetIn: 0 }],
    };

    const rows = buildZaiQuotaRows(payload);

    expect(rows[0].resetHint).toBeUndefined();
  });

  it('builds one row per limit and filters out the unparseable entries', () => {
    const payload: ZaiQuotaPayload = {
      limits: [
        { type: 'TOKENS_LIMIT', percentage: 10 },
        { type: 'EMPTY_LIMIT' },
        { type: 'TIME_LIMIT', percentage: 20 },
      ],
    };

    const rows = buildZaiQuotaRows(payload);

    expect(rows.map((r) => r.id)).toEqual(['tokens-limit', 'time-limit']);
  });
});

describe('buildXaiQuotaRows', () => {
  it('returns empty rows for an empty payload', () => {
    expect(buildXaiQuotaRows({})).toEqual([]);
  });

  it('builds an included-credits row from config.used / config.monthlyLimit unit objects', () => {
    const rows = buildXaiQuotaRows({
      config: {
        used: { val: 120 },
        monthlyLimit: { val: 1000 },
        billingPeriodStart: '2030-03-01T00:00:00.000Z',
        billingPeriodEnd: '2030-04-01T00:00:00.000Z',
      },
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'included-credits',
      labelKey: 'xai_quota.monthly_credits',
      used: 120,
      limit: 1000,
    });
    expect(rows[0].resetHint).toBeTruthy();
  });

  it('labels a ~7 day window as weekly credits', () => {
    const rows = buildXaiQuotaRows({
      config: {
        used: { val: 10 },
        monthlyLimit: { val: 100 },
        billingPeriodStart: '2030-03-01T00:00:00.000Z',
        billingPeriodEnd: '2030-03-08T00:00:00.000Z',
      },
    });

    expect(rows[0].labelKey).toBe('xai_quota.weekly_credits');
  });

  it('accepts snake_case monthly_limit and plain number amounts', () => {
    const rows = buildXaiQuotaRows({
      config: {
        used: 50,
        monthly_limit: 200,
      },
    });

    expect(rows[0]).toMatchObject({
      used: 50,
      limit: 200,
      labelKey: 'xai_quota.included_credits',
    });
  });

  it('adds an on-demand cap row when onDemandCap is positive', () => {
    const rows = buildXaiQuotaRows({
      config: {
        used: { val: 10 },
        monthlyLimit: { val: 100 },
        onDemandCap: { val: 500 },
      },
    });

    expect(rows.map((r) => r.id)).toEqual(['included-credits', 'on-demand-cap']);
    expect(rows[1]).toMatchObject({
      labelKey: 'xai_quota.on_demand_cap',
      used: 0,
      limit: 500,
    });
  });

  it('skips on-demand when cap is zero or missing', () => {
    const rows = buildXaiQuotaRows({
      config: {
        used: { val: 1 },
        monthlyLimit: { val: 10 },
        onDemandCap: { val: 0 },
      },
    });

    expect(rows).toHaveLength(1);
  });

  it('falls back to top-level used/limit when config is absent', () => {
    const rows = buildXaiQuotaRows({
      used: { val: 3 },
      monthlyLimit: { val: 30 },
    });

    expect(rows[0]).toMatchObject({ used: 3, limit: 30 });
  });

  it('returns empty when config has no usable used/limit fields', () => {
    expect(buildXaiQuotaRows({ config: { onDemandCap: { val: 0 } } })).toEqual([]);
  });
});

describe('resolveXaiCreditsLabelKey', () => {
  it('returns weekly for a 7-day window', () => {
    expect(resolveXaiCreditsLabelKey('2030-01-01T00:00:00Z', '2030-01-08T00:00:00Z')).toBe(
      'xai_quota.weekly_credits'
    );
  });

  it('returns monthly for a calendar-month window', () => {
    expect(resolveXaiCreditsLabelKey('2030-07-01T00:00:00Z', '2030-08-01T00:00:00Z')).toBe(
      'xai_quota.monthly_credits'
    );
  });

  it('returns included when period metadata is missing', () => {
    expect(resolveXaiCreditsLabelKey(undefined, undefined)).toBe('xai_quota.included_credits');
  });
});

describe('resolveXaiPlanType', () => {
  it('reads subscription_tier_display', () => {
    expect(resolveXaiPlanType({ subscription_tier_display: 'SuperGrok' })).toBe('SuperGrok');
  });

  it('returns null when absent', () => {
    expect(resolveXaiPlanType({})).toBeNull();
  });
});
