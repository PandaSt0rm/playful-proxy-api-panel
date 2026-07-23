import type { UpstreamConcurrencyConfig } from '@/types';

export function normalizeConcurrencyProviderKey(provider: string | undefined | null): string {
  return String(provider ?? '')
    .trim()
    .toLowerCase();
}

export function getProviderConcurrencyOverride(
  config: UpstreamConcurrencyConfig | undefined,
  provider: string | undefined | null
): number | undefined {
  const key = normalizeConcurrencyProviderKey(provider);
  if (!key || !config?.providers) return undefined;
  const direct = config.providers[key];
  if (direct !== undefined) return direct;
  const match = Object.entries(config.providers).find(
    ([candidate]) => normalizeConcurrencyProviderKey(candidate) === key
  );
  return match ? match[1] : undefined;
}

export function getEffectiveProviderConcurrency(
  config: UpstreamConcurrencyConfig | undefined,
  provider: string | undefined | null
): { source: 'provider' | 'default' | 'unlimited'; limit?: number } {
  const providerLimit = getProviderConcurrencyOverride(config, provider);
  if (providerLimit !== undefined) {
    return providerLimit > 0
      ? { source: 'provider', limit: providerLimit }
      : { source: 'provider', limit: 0 };
  }
  const defaultLimit = config?.default;
  if (defaultLimit !== undefined && defaultLimit > 0) {
    return { source: 'default', limit: defaultLimit };
  }
  return { source: 'unlimited' };
}

export function concurrencyLimitToDraft(limit: number | undefined): string {
  return limit === undefined ? '' : String(limit);
}

export function parseConcurrencyLimitDraft(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) return Number.NaN;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}
