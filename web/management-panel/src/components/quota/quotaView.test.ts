import { describe, it, expect } from 'vitest';
import {
  ALL_QUOTA_PROVIDERS,
  buildProviderGroups,
  QUOTA_PROVIDER_ORDER,
  type QuotaViewState,
} from './quotaView';
import type { QuotaHealth, NormalizedMeter } from './quotaSummary';
import type { QuotaCredentialView } from './useQuotaDashboard';
import type { QuotaType } from './quotaConfigs';

function view(
  type: QuotaType,
  name: string,
  health: QuotaHealth,
  worst: number | null,
  meters: NormalizedMeter[] = []
): QuotaCredentialView {
  return {
    key: `${type}:${name}`,
    name,
    type,
    i18nPrefix: `${type}_quota`,
    status: health === 'error' ? 'error' : 'success',
    health,
    summary: { meters, extras: [] },
    worstRemaining: worst,
  } as QuotaCredentialView;
}

function state(overrides: Partial<QuotaViewState> = {}): QuotaViewState {
  return {
    search: '',
    sort: 'health',
    providers: new Set(ALL_QUOTA_PROVIDERS),
    healthFilter: 'all',
    ...overrides,
  };
}

describe('QUOTA_PROVIDER_ORDER', () => {
  it('starts with claude and includes all six providers', () => {
    expect(QUOTA_PROVIDER_ORDER[0].type).toBe('claude');
    expect(QUOTA_PROVIDER_ORDER).toHaveLength(6);
  });
});

describe('buildProviderGroups', () => {
  it('groups credentials by provider in registry order and drops empty groups', () => {
    const groups = buildProviderGroups(
      [view('codex', 'c1', 'ok', 90), view('claude', 'a1', 'ok', 80)],
      state()
    );
    expect(groups.map((g) => g.type)).toEqual(['claude', 'codex']);
    expect(groups[0].credentials).toHaveLength(1);
  });

  it('sorts by health (most constrained first) within a group', () => {
    const groups = buildProviderGroups(
      [
        view('claude', 'healthy', 'ok', 90),
        view('claude', 'broken', 'error', null),
        view('claude', 'low', 'critical', 12),
        view('claude', 'watch', 'warn', 50),
      ],
      state({ sort: 'health' })
    );
    expect(groups[0].credentials.map((c) => c.name)).toEqual(['broken', 'low', 'watch', 'healthy']);
  });

  it('breaks health ties by lowest remaining then name', () => {
    const groups = buildProviderGroups(
      [view('claude', 'b', 'critical', 20), view('claude', 'a', 'critical', 10)],
      state({ sort: 'health' })
    );
    expect(groups[0].credentials.map((c) => c.name)).toEqual(['a', 'b']);
  });

  it('sorts by name when requested', () => {
    const groups = buildProviderGroups(
      [view('claude', 'zeta', 'critical', 5), view('claude', 'alpha', 'ok', 99)],
      state({ sort: 'name' })
    );
    expect(groups[0].credentials.map((c) => c.name)).toEqual(['alpha', 'zeta']);
  });

  it('filters out providers that are toggled off', () => {
    const groups = buildProviderGroups(
      [view('claude', 'a1', 'ok', 80), view('codex', 'c1', 'ok', 90)],
      state({ providers: new Set<QuotaType>(['codex']) })
    );
    expect(groups.map((g) => g.type)).toEqual(['codex']);
  });

  it('applies the health filter', () => {
    const groups = buildProviderGroups(
      [view('claude', 'ok1', 'ok', 90), view('claude', 'crit1', 'critical', 8)],
      state({ healthFilter: 'critical' })
    );
    expect(groups[0].credentials.map((c) => c.name)).toEqual(['crit1']);
  });

  it('matches search against name and meter labels', () => {
    const byName = buildProviderGroups(
      [view('claude', 'production.json', 'ok', 90), view('claude', 'dev.json', 'ok', 90)],
      state({ search: 'prod' })
    );
    expect(byName[0].credentials.map((c) => c.name)).toEqual(['production.json']);

    const byMeter = buildProviderGroups(
      [
        view('claude', 'a.json', 'ok', 90, [{ id: '1', label: '7-day window', remainingPercent: 90 }]),
        view('claude', 'b.json', 'ok', 90, [{ id: '2', label: '5-hour window', remainingPercent: 90 }]),
      ],
      state({ search: '7-day' })
    );
    expect(byMeter[0].credentials.map((c) => c.name)).toEqual(['a.json']);
  });
});
