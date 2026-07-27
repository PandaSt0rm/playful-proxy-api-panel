import { describe, it, expect } from 'vitest';
import {
  countBillableCalls,
  DEBUG_CHECKS,
  countTestableKeys,
  getDebugCheck,
  isTestableKey,
  planDebugRun,
} from './checks';
import type { DebugKey } from './types';

const key = (apiKey: string): DebugKey => ({ apiKey });

describe('DEBUG_CHECKS', () => {
  it('exposes every check with a unique id', () => {
    const ids = DEBUG_CHECKS.map((check) => check.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every check both i18n keys', () => {
    for (const check of DEBUG_CHECKS) {
      expect(check.labelKey).toBe(`provider_debug.checks.${check.id}.label`);
      expect(check.descriptionKey).toBe(`provider_debug.checks.${check.id}.description`);
    }
  });

  it('lists the free checks before any that spend money', () => {
    const firstBillable = DEBUG_CHECKS.findIndex((check) => check.billable);
    const lastFree = DEBUG_CHECKS.map((check) => check.billable).lastIndexOf(false);
    expect(firstBillable).toBeGreaterThan(lastFree);
  });

  it('marks exactly the token-spending checks as billable', () => {
    expect(DEBUG_CHECKS.filter((check) => check.billable).map((check) => check.id)).toEqual([
      'completion',
      'sse_format',
      'tools',
      'json_mode',
      'vision',
    ]);
  });
});

describe('countBillableCalls', () => {
  it('counts only the units that will be charged', () => {
    const units = planDebugRun(['reachability', 'auth', 'completion', 'tools'], [key('sk-a')]);
    expect(countBillableCalls(units)).toBe(2);
  });

  it('is zero for a run that cannot spend anything', () => {
    expect(countBillableCalls(planDebugRun(['reachability', 'catalog'], [key('sk-a')]))).toBe(0);
    expect(countBillableCalls([])).toBe(0);
  });

  it('counts every key when a billable check fans out', () => {
    // Guards the cost gate against under-reporting: a per-key billable check must count
    // once per key, not once per check.
    const perKeyBillable = DEBUG_CHECKS.filter((check) => check.billable && check.perKey);
    expect(perKeyBillable).toEqual([]);
  });
});

describe('getDebugCheck', () => {
  it('finds a registered check', () => {
    expect(getDebugCheck('auth')?.perKey).toBe(true);
    expect(getDebugCheck('catalog')?.perKey).toBe(false);
  });

  it('returns undefined for an unknown id', () => {
    expect(getDebugCheck('nope' as never)).toBeUndefined();
  });
});

describe('isTestableKey / countTestableKeys', () => {
  it('treats blank and whitespace-only keys as untestable', () => {
    expect(isTestableKey(key(''))).toBe(false);
    expect(isTestableKey(key('   '))).toBe(false);
    expect(isTestableKey(key('sk-live'))).toBe(true);
  });

  it('counts only testable keys', () => {
    expect(countTestableKeys([key('sk-a'), key(''), key('sk-b')])).toBe(2);
    expect(countTestableKeys([])).toBe(0);
  });
});

describe('planDebugRun', () => {
  it('emits one unit for a provider-wide check', () => {
    expect(planDebugRun(['reachability'], [key('sk-a')])).toEqual([
      { id: 'reachability', check: getDebugCheck('reachability'), keyIndex: null },
    ]);
  });

  it('fans a per-key check out across every testable key', () => {
    const units = planDebugRun(['auth'], [key('sk-a'), key('sk-b')]);
    expect(units.map((unit) => unit.id)).toEqual(['auth:0', 'auth:1']);
    expect(units.map((unit) => unit.keyIndex)).toEqual([0, 1]);
  });

  it('skips blank keys but keeps the surviving keys at their original index', () => {
    // The index has to stay aligned with the form row so the trace label and the row the
    // operator is looking at agree.
    const units = planDebugRun(['auth'], [key(''), key('sk-b')]);
    expect(units).toHaveLength(1);
    expect(units[0]).toMatchObject({ id: 'auth:1', keyIndex: 1 });
  });

  it('emits units in registry order regardless of selection order', () => {
    const units = planDebugRun(['catalog', 'auth', 'reachability'], [key('sk-a')]);
    expect(units.map((unit) => unit.check.id)).toEqual(['reachability', 'auth', 'catalog']);
  });

  it('ignores checks that were not selected', () => {
    const units = planDebugRun(['catalog'], [key('sk-a')]);
    expect(units.map((unit) => unit.check.id)).toEqual(['catalog']);
  });

  it('returns an empty plan when nothing is selected', () => {
    expect(planDebugRun([], [key('sk-a')])).toEqual([]);
  });

  it('yields no per-key units when the provider has no usable key', () => {
    expect(planDebugRun(['auth'], [key('')])).toEqual([]);
    expect(planDebugRun(['auth'], [])).toEqual([]);
  });

  it('still schedules provider-wide checks when no key is configured', () => {
    const units = planDebugRun(['reachability', 'auth'], []);
    expect(units.map((unit) => unit.check.id)).toEqual(['reachability']);
  });
});
