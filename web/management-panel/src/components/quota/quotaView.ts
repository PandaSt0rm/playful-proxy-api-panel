/**
 * Pure view transforms for the quota dashboard: search, health filtering,
 * sorting, and grouping by provider. Kept free of React so they are unit-testable.
 */

import { QUOTA_CONFIGS, type QuotaType } from './quotaConfigs';
import type { QuotaHealth } from './quotaSummary';
import type { QuotaCredentialView } from './useQuotaDashboard';

export type QuotaSortKey = 'health' | 'name';
export type QuotaHealthFilter = 'all' | 'ok' | 'warn' | 'critical' | 'error';

export interface QuotaViewState {
  search: string;
  sort: QuotaSortKey;
  /** Providers currently shown. */
  providers: ReadonlySet<QuotaType>;
  healthFilter: QuotaHealthFilter;
}

export interface QuotaProviderGroupView {
  type: QuotaType;
  i18nPrefix: string;
  credentials: QuotaCredentialView[];
}

/** Provider order + i18n prefix, derived from the config registry. */
export const QUOTA_PROVIDER_ORDER: ReadonlyArray<{ type: QuotaType; i18nPrefix: string }> =
  QUOTA_CONFIGS.map((config) => ({ type: config.type, i18nPrefix: config.i18nPrefix }));

export const ALL_QUOTA_PROVIDERS: ReadonlySet<QuotaType> = new Set(
  QUOTA_PROVIDER_ORDER.map((entry) => entry.type)
);

const HEALTH_SEVERITY: Record<QuotaHealth, number> = {
  error: 0,
  critical: 1,
  warn: 2,
  ok: 3,
  unknown: 4,
};

function matchesSearch(view: QuotaCredentialView, query: string): boolean {
  if (!query) return true;
  const haystack = [view.name, view.type, ...view.summary.meters.map((meter) => meter.label)]
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
}

function matchesHealthFilter(view: QuotaCredentialView, filter: QuotaHealthFilter): boolean {
  return filter === 'all' || view.health === filter;
}

function compareCredentials(
  a: QuotaCredentialView,
  b: QuotaCredentialView,
  sort: QuotaSortKey
): number {
  if (sort === 'name') {
    return a.name.localeCompare(b.name);
  }
  // Health: most-constrained first (error → critical → warn → ok → unknown),
  // tie-broken by lowest remaining, then name.
  const severityDelta = HEALTH_SEVERITY[a.health] - HEALTH_SEVERITY[b.health];
  if (severityDelta !== 0) return severityDelta;
  const remainingA = a.worstRemaining ?? Number.POSITIVE_INFINITY;
  const remainingB = b.worstRemaining ?? Number.POSITIVE_INFINITY;
  if (remainingA !== remainingB) return remainingA - remainingB;
  return a.name.localeCompare(b.name);
}

/**
 * Apply search/provider/health filters and sort, then group by provider in
 * registry order. Empty groups are dropped.
 */
export function buildProviderGroups(
  views: QuotaCredentialView[],
  state: QuotaViewState
): QuotaProviderGroupView[] {
  const query = state.search.trim().toLowerCase();
  const filtered = views.filter(
    (view) =>
      state.providers.has(view.type) &&
      matchesHealthFilter(view, state.healthFilter) &&
      matchesSearch(view, query)
  );

  const byType = new Map<QuotaType, QuotaCredentialView[]>();
  for (const view of filtered) {
    const bucket = byType.get(view.type);
    if (bucket) bucket.push(view);
    else byType.set(view.type, [view]);
  }

  const groups: QuotaProviderGroupView[] = [];
  for (const { type, i18nPrefix } of QUOTA_PROVIDER_ORDER) {
    const credentials = byType.get(type);
    if (!credentials || credentials.length === 0) continue;
    credentials.sort((a, b) => compareCredentials(a, b, state.sort));
    groups.push({ type, i18nPrefix, credentials });
  }
  return groups;
}
