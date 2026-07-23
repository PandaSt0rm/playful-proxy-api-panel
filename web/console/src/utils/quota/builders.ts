/**
 * Builder functions for constructing quota data structures.
 */

import type {
  AntigravityQuotaGroup,
  AntigravityQuotaGroupDefinition,
  AntigravityQuotaInfo,
  AntigravityModelsPayload,
  GeminiCliParsedBucket,
  GeminiCliQuotaBucketState,
  KimiUsagePayload,
  KimiUsageDetail,
  KimiLimitItem,
  KimiLimitWindow,
  KimiQuotaRow,
  XaiBillingPayload,
  XaiQuotaRow,
  ZaiQuotaLimit,
  ZaiQuotaPayload,
  ZaiQuotaRow,
} from '@/types';
import {
  ANTIGRAVITY_QUOTA_GROUPS,
  GEMINI_CLI_GROUP_LOOKUP,
  GEMINI_CLI_GROUP_ORDER,
} from './constants';
import {
  normalizeNumberValue,
  normalizeQuotaFraction,
  normalizeStringValue,
  unwrapXaiBillingAmount,
} from './parsers';
import { isIgnoredGeminiCliModel } from './validators';

export function pickEarlierResetTime(current?: string, next?: string): string | undefined {
  if (!current) return next;
  if (!next) return current;
  const currentTime = new Date(current).getTime();
  const nextTime = new Date(next).getTime();
  if (Number.isNaN(currentTime)) return next;
  if (Number.isNaN(nextTime)) return current;
  return currentTime <= nextTime ? current : next;
}

export function minNullableNumber(current: number | null, next: number | null): number | null {
  if (current === null) return next;
  if (next === null) return current;
  return Math.min(current, next);
}

export function buildGeminiCliQuotaBuckets(
  buckets: GeminiCliParsedBucket[]
): GeminiCliQuotaBucketState[] {
  if (buckets.length === 0) return [];

  type GeminiCliQuotaBucketGroup = {
    id: string;
    label: string;
    tokenType: string | null;
    modelIds: string[];
    preferredModelId?: string;
    preferredBucket?: GeminiCliParsedBucket;
    fallbackRemainingFraction: number | null;
    fallbackRemainingAmount: number | null;
    fallbackResetTime: string | undefined;
  };

  const grouped = new Map<string, GeminiCliQuotaBucketGroup>();

  buckets.forEach((bucket) => {
    if (isIgnoredGeminiCliModel(bucket.modelId)) return;
    const group = GEMINI_CLI_GROUP_LOOKUP.get(bucket.modelId);
    const groupId = group?.id ?? bucket.modelId;
    const label = group?.label ?? bucket.modelId;
    const tokenKey = bucket.tokenType ?? '';
    const mapKey = `${groupId}::${tokenKey}`;
    const existing = grouped.get(mapKey);

    if (!existing) {
      const preferredModelId = group?.preferredModelId;
      const preferredBucket =
        preferredModelId && bucket.modelId === preferredModelId ? bucket : undefined;
      grouped.set(mapKey, {
        id: `${groupId}${tokenKey ? `-${tokenKey}` : ''}`,
        label,
        tokenType: bucket.tokenType,
        modelIds: [bucket.modelId],
        preferredModelId,
        preferredBucket,
        fallbackRemainingFraction: bucket.remainingFraction,
        fallbackRemainingAmount: bucket.remainingAmount,
        fallbackResetTime: bucket.resetTime,
      });
      return;
    }

    existing.fallbackRemainingFraction = minNullableNumber(
      existing.fallbackRemainingFraction,
      bucket.remainingFraction
    );
    existing.fallbackRemainingAmount = minNullableNumber(
      existing.fallbackRemainingAmount,
      bucket.remainingAmount
    );
    existing.fallbackResetTime = pickEarlierResetTime(existing.fallbackResetTime, bucket.resetTime);
    existing.modelIds.push(bucket.modelId);

    if (existing.preferredModelId && bucket.modelId === existing.preferredModelId) {
      existing.preferredBucket = bucket;
    }
  });

  const toGroupOrder = (bucket: GeminiCliQuotaBucketGroup): number => {
    const tokenSuffix = bucket.tokenType ? `-${bucket.tokenType}` : '';
    const groupId = bucket.id.endsWith(tokenSuffix)
      ? bucket.id.slice(0, bucket.id.length - tokenSuffix.length)
      : bucket.id;
    return GEMINI_CLI_GROUP_ORDER.get(groupId) ?? Number.MAX_SAFE_INTEGER;
  };

  return Array.from(grouped.values())
    .sort((a, b) => {
      const orderDiff = toGroupOrder(a) - toGroupOrder(b);
      if (orderDiff !== 0) return orderDiff;
      const tokenTypeA = a.tokenType ?? '';
      const tokenTypeB = b.tokenType ?? '';
      return tokenTypeA.localeCompare(tokenTypeB);
    })
    .map((bucket) => {
      const uniqueModelIds = Array.from(new Set(bucket.modelIds));
      const preferred = bucket.preferredBucket;
      const remainingFraction = preferred
        ? preferred.remainingFraction
        : bucket.fallbackRemainingFraction;
      const remainingAmount = preferred
        ? preferred.remainingAmount
        : bucket.fallbackRemainingAmount;
      const resetTime = preferred ? preferred.resetTime : bucket.fallbackResetTime;
      return {
        id: bucket.id,
        label: bucket.label,
        remainingFraction,
        remainingAmount,
        resetTime,
        tokenType: bucket.tokenType,
        modelIds: uniqueModelIds,
      };
    });
}

export function getAntigravityQuotaInfo(entry?: AntigravityQuotaInfo): {
  remainingFraction: number | null;
  resetTime?: string;
  displayName?: string;
} {
  if (!entry) {
    return { remainingFraction: null };
  }
  const quotaInfo = entry.quotaInfo ?? entry.quota_info ?? {};
  const remainingValue =
    quotaInfo.remainingFraction ?? quotaInfo.remaining_fraction ?? quotaInfo.remaining;
  const remainingFraction = normalizeQuotaFraction(remainingValue);
  const resetValue = quotaInfo.resetTime ?? quotaInfo.reset_time;
  const resetTime = typeof resetValue === 'string' ? resetValue : undefined;
  const displayName = typeof entry.displayName === 'string' ? entry.displayName : undefined;

  return {
    remainingFraction,
    resetTime,
    displayName,
  };
}

export function findAntigravityModel(
  models: AntigravityModelsPayload,
  identifier: string
): { id: string; entry: AntigravityQuotaInfo } | null {
  const direct = models[identifier];
  if (direct) {
    return { id: identifier, entry: direct };
  }

  const match = Object.entries(models).find(([, entry]) => {
    const name = typeof entry?.displayName === 'string' ? entry.displayName : '';
    return name.toLowerCase() === identifier.toLowerCase();
  });
  if (match) {
    return { id: match[0], entry: match[1] };
  }

  return null;
}

export function buildAntigravityQuotaGroups(
  models: AntigravityModelsPayload
): AntigravityQuotaGroup[] {
  const groups: AntigravityQuotaGroup[] = [];
  const definitions = new Map(
    ANTIGRAVITY_QUOTA_GROUPS.map((definition) => [definition.id, definition] as const)
  );

  const buildGroup = (
    def: AntigravityQuotaGroupDefinition,
    overrideResetTime?: string
  ): AntigravityQuotaGroup | null => {
    const matches = def.identifiers
      .map((identifier) => findAntigravityModel(models, identifier))
      .filter((entry): entry is { id: string; entry: AntigravityQuotaInfo } => Boolean(entry));

    const quotaEntries = matches
      .map(({ id, entry }) => {
        const info = getAntigravityQuotaInfo(entry);
        const remainingFraction = info.remainingFraction ?? (info.resetTime ? 0 : null);
        if (remainingFraction === null) return null;
        return {
          id,
          remainingFraction,
          resetTime: info.resetTime,
          displayName: info.displayName,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

    if (quotaEntries.length === 0) return null;

    const remainingFraction = Math.min(...quotaEntries.map((entry) => entry.remainingFraction));
    const resetTime =
      overrideResetTime ?? quotaEntries.map((entry) => entry.resetTime).find(Boolean);
    const displayName = quotaEntries.map((entry) => entry.displayName).find(Boolean);
    const label = def.labelFromModel && displayName ? displayName : def.label;

    return {
      id: def.id,
      label,
      models: quotaEntries.map((entry) => entry.id),
      remainingFraction,
      resetTime,
    };
  };

  const appendGroup = (id: string, overrideResetTime?: string): AntigravityQuotaGroup | null => {
    const definition = definitions.get(id);
    if (!definition) return null;
    const group = buildGroup(definition, overrideResetTime);
    if (group) {
      groups.push(group);
    }
    return group;
  };

  appendGroup('claude-gpt');
  const gemini31ProGroup = appendGroup('gemini-3-1-pro-series');
  const geminiProGroup = appendGroup('gemini-3-pro');
  const geminiProResetTime = gemini31ProGroup?.resetTime ?? geminiProGroup?.resetTime;
  appendGroup('gemini-2-5-flash');
  appendGroup('gemini-2-5-flash-lite');
  appendGroup('gemini-2-5-cu');
  appendGroup('gemini-3-flash');
  appendGroup('gemini-image', geminiProResetTime);

  return groups;
}

function toInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.floor(value);
  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? Math.floor(parsed) : null;
  }
  return null;
}

type KimiRowLabel = Pick<KimiQuotaRow, 'label' | 'labelKey' | 'labelParams'>;

function kimiResetHint(data: Record<string, unknown>): string | undefined {
  const absoluteKeys = ['reset_at', 'resetAt', 'reset_time', 'resetTime'];
  for (const key of absoluteKeys) {
    const raw = data[key];
    if (typeof raw === 'string' && raw.trim()) {
      try {
        const truncated = raw.replace(/(\.\d{6})\d+/, '$1');
        const date = new Date(truncated);
        if (Number.isNaN(date.getTime())) continue;
        const now = Date.now();
        const delta = date.getTime() - now;
        if (delta <= 0) return undefined;
        const totalMinutes = Math.floor(delta / 60000);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
        if (hours > 0) return `${hours}h`;
        if (minutes > 0) return `${minutes}m`;
        return '<1m';
      } catch {
        continue;
      }
    }
  }

  const relativeKeys = ['reset_in', 'resetIn', 'ttl'];
  for (const key of relativeKeys) {
    const raw = toInt(data[key]);
    if (raw !== null && raw > 0) {
      const hours = Math.floor(raw / 3600);
      const minutes = Math.floor((raw % 3600) / 60);
      if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
      if (hours > 0) return `${hours}h`;
      if (minutes > 0) return `${minutes}m`;
      return '<1m';
    }
  }

  return undefined;
}

function kimiDurationToken(duration: number, rawTimeUnit: unknown): string {
  const unit = typeof rawTimeUnit === 'string' ? rawTimeUnit.trim().toUpperCase() : '';
  if (unit === 'MINUTES') {
    return duration % 60 === 0 ? `${duration / 60}h` : `${duration}m`;
  }
  if (unit === 'HOURS') return `${duration}h`;
  if (unit === 'DAYS') return `${duration}d`;
  return `${duration}s`;
}

function kimiLimitLabel(
  item: KimiLimitItem,
  detail: KimiUsageDetail | KimiLimitItem,
  window: KimiLimitWindow,
  index: number
): KimiRowLabel {
  for (const key of ['name', 'title', 'scope'] as const) {
    const val = (item as Record<string, unknown>)[key] ?? (detail as Record<string, unknown>)[key];
    if (typeof val === 'string' && val.trim()) return { label: val.trim() };
  }

  const duration =
    toInt(window.duration) ??
    toInt((item as Record<string, unknown>).duration) ??
    toInt((detail as Record<string, unknown>).duration);
  const timeUnit =
    (window as Record<string, unknown>).timeUnit ??
    (item as Record<string, unknown>).timeUnit ??
    (detail as Record<string, unknown>).timeUnit;

  if (duration !== null && duration > 0) {
    return {
      labelKey: 'kimi_quota.limit_window',
      labelParams: {
        duration: kimiDurationToken(duration, timeUnit),
      },
    };
  }

  return {
    labelKey: 'kimi_quota.limit_index',
    labelParams: {
      index: index + 1,
    },
  };
}

function toKimiUsageRow(
  data: Record<string, unknown>,
  fallbackLabel: KimiRowLabel
): (KimiRowLabel & { used: number; limit: number; resetHint?: string }) | null {
  const limit = toInt(data.limit);
  let used = toInt(data.used);
  if (used === null) {
    const remaining = toInt(data.remaining);
    if (remaining !== null && limit !== null) {
      used = limit - remaining;
    }
  }
  if (used === null && limit === null) return null;
  const explicitLabel =
    (typeof data.name === 'string' && data.name.trim()) ||
    (typeof data.title === 'string' && data.title.trim());
  const label = explicitLabel ? { label: explicitLabel } : fallbackLabel;
  return {
    ...label,
    used: used ?? 0,
    limit: limit ?? 0,
    resetHint: kimiResetHint(data),
  };
}

export function buildKimiQuotaRows(payload: KimiUsagePayload): KimiQuotaRow[] {
  const rows: KimiQuotaRow[] = [];

  const usage = payload.usage;
  if (usage && typeof usage === 'object') {
    const summary = toKimiUsageRow(usage as Record<string, unknown>, {
      labelKey: 'kimi_quota.weekly_limit',
    });
    if (summary) {
      rows.push({ id: 'summary', ...summary });
    }
  }

  const limits = payload.limits;
  if (Array.isArray(limits)) {
    limits.forEach((item, idx) => {
      const detail = (item.detail && typeof item.detail === 'object' ? item.detail : item) as
        KimiUsageDetail | KimiLimitItem;
      const window = (
        item.window && typeof item.window === 'object' ? item.window : {}
      ) as KimiLimitWindow;
      const fallbackLabel = kimiLimitLabel(item, detail, window, idx);
      const row = toKimiUsageRow(detail as Record<string, unknown>, fallbackLabel);
      if (row) {
        rows.push({ id: `limit-${idx}`, ...row });
      }
    });
  }

  return rows;
}

const ZAI_QUOTA_LABEL_KEYS: Record<string, string> = {
  TOKENS_LIMIT: 'zai_quota.tokens_5h',
  TIME_LIMIT: 'zai_quota.mcp_monthly',
};

function normalizeZaiPercent(value: unknown): number | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.endsWith('%')) {
      const parsed = Number(trimmed.slice(0, -1));
      return Number.isFinite(parsed) ? parsed : null;
    }
  }
  const normalized = normalizeNumberValue(value);
  if (normalized === null) return null;
  return normalized;
}

function zaiDurationHint(ms: number): string | undefined {
  if (!Number.isFinite(ms) || ms <= 0) return undefined;
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (days > 0 && hours > 0) return `${days}d ${hours}h`;
  if (days > 0) return `${days}d`;
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return '<1m';
}

function zaiResetHint(data: Record<string, unknown>): string | undefined {
  // Capture a single reference point so every delta below is measured against
  // the same instant (avoids sub-tick drift between targetMs and the subtraction).
  const now = Date.now();
  const absoluteKeys = [
    'nextResetTime',
    'next_reset_time',
    'resetTime',
    'reset_time',
    'resetAt',
    'reset_at',
  ];
  for (const key of absoluteKeys) {
    const value = normalizeNumberValue(data[key]);
    if (value !== null && value > 0) {
      const targetMs = value > 1e12 ? value : value > 1e9 ? value * 1000 : now + value * 1000;
      const hint = zaiDurationHint(targetMs - now);
      if (hint) return hint;
    }

    const raw = normalizeStringValue(data[key]);
    if (!raw) continue;
    const asNumber = normalizeNumberValue(raw);
    if (asNumber !== null && asNumber > 0) {
      const targetMs =
        asNumber > 1e12 ? asNumber : asNumber > 1e9 ? asNumber * 1000 : now + asNumber * 1000;
      const hint = zaiDurationHint(targetMs - now);
      if (hint) return hint;
      continue;
    }

    const parsed = new Date(raw).getTime();
    if (!Number.isNaN(parsed)) {
      const hint = zaiDurationHint(parsed - now);
      if (hint) return hint;
    }
  }

  for (const key of ['resetIn', 'reset_in', 'ttl']) {
    const value = normalizeNumberValue(data[key]);
    if (value !== null && value > 0) {
      return zaiDurationHint(value * 1000);
    }
  }

  return undefined;
}

function zaiFallbackLabel(type: string, index: number): Pick<ZaiQuotaRow, 'label' | 'labelKey'> {
  const labelKey = ZAI_QUOTA_LABEL_KEYS[type];
  if (labelKey) return { labelKey };

  const normalized = type
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
  return { label: normalized || `Limit #${index + 1}` };
}

function toZaiQuotaRow(item: ZaiQuotaLimit, index: number): ZaiQuotaRow | null {
  const record = item as Record<string, unknown>;
  const type = normalizeStringValue(item.type)?.toUpperCase() ?? `LIMIT_${index + 1}`;
  const apiUsedPercent = normalizeZaiPercent(item.percentage);
  const currentValue = normalizeNumberValue(
    item.currentValue ?? item.current_value ?? item.currentUsage ?? item.current_usage
  );
  const remainingValue = normalizeNumberValue(item.remaining);
  const limit = normalizeNumberValue(item.usage ?? item.total ?? item.limit ?? item.totol);
  const usageDerivedPercent =
    currentValue !== null && limit !== null && limit > 0 ? (currentValue / limit) * 100 : null;
  const remainingDerivedPercent =
    usageDerivedPercent === null && remainingValue !== null && limit !== null && limit > 0
      ? 100 - (remainingValue / limit) * 100
      : null;
  const normalizedUsedPercent = usageDerivedPercent ?? remainingDerivedPercent ?? apiUsedPercent;
  const remainingPercent =
    normalizedUsedPercent === null ? null : Math.max(0, Math.min(100, 100 - normalizedUsedPercent));

  if (normalizedUsedPercent === null && currentValue === null && limit === null) {
    return null;
  }

  return {
    id: type.toLowerCase().replace(/[^a-z0-9]+/g, '-') || `limit-${index}`,
    ...zaiFallbackLabel(type, index),
    usedPercent:
      normalizedUsedPercent === null ? null : Math.max(0, Math.min(100, normalizedUsedPercent)),
    remainingPercent,
    currentValue,
    limit,
    resetHint: zaiResetHint(record),
  };
}

export function buildZaiQuotaRows(payload: ZaiQuotaPayload): ZaiQuotaRow[] {
  const limits = Array.isArray(payload.limits)
    ? payload.limits
    : Array.isArray(payload.data?.limits)
      ? payload.data.limits
      : [];

  return limits
    .map((item, index) => toZaiQuotaRow(item, index))
    .filter((row): row is ZaiQuotaRow => row !== null);
}

/**
 * Parse billing period timestamps. Accepts ISO strings, unix seconds, or ms.
 */
function xaiBillingPeriodMs(value: unknown): number | null {
  if (value === undefined || value === null) return null;

  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    const ms = value > 1e12 ? value : value * 1000;
    return Number.isNaN(new Date(ms).getTime()) ? null : ms;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const asNumber = Number(trimmed);
    if (Number.isFinite(asNumber) && asNumber > 0 && /^\d+(\.\d+)?$/.test(trimmed)) {
      return xaiBillingPeriodMs(asNumber);
    }
    const parsed = new Date(trimmed).getTime();
    return Number.isNaN(parsed) ? null : parsed;
  }

  return null;
}

/**
 * Format a billing-period end into a short absolute hint for meters.
 */
function xaiBillingPeriodHint(value: unknown): string | undefined {
  const ms = xaiBillingPeriodMs(value);
  if (ms === null) return undefined;
  return new Date(ms).toLocaleString(undefined, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/**
 * Label the included-credit meter from the actual billing window.
 *
 * Grok consumer Settings → Usage is a *weekly* shared pool (docs.x.ai/grok/faq),
 * but the CLI billing surface (`cli-chat-proxy.../v1/billing`) exposes
 * `monthlyLimit` over `billingPeriodStart`/`billingPeriodEnd`. Live SuperGrok
 * Heavy accounts currently return a calendar-month window; if that window is
 * ~7 days we label weekly, ~1 month we label monthly, otherwise generic.
 */
export function resolveXaiCreditsLabelKey(periodStart: unknown, periodEnd: unknown): string {
  const startMs = xaiBillingPeriodMs(periodStart);
  const endMs = xaiBillingPeriodMs(periodEnd);
  if (startMs !== null && endMs !== null && endMs > startMs) {
    const days = (endMs - startMs) / 86_400_000;
    if (days >= 5 && days <= 9) return 'xai_quota.weekly_credits';
    if (days >= 25 && days <= 35) return 'xai_quota.monthly_credits';
  }
  // API field is still named monthlyLimit even when period metadata is missing.
  return 'xai_quota.included_credits';
}

/**
 * Build meter rows from Grok CLI billing payload.
 * Primary row: included credits (used / monthlyLimit field).
 * Optional second row when onDemandCap is present and > 0 (extra/on-demand).
 * Returns [] when neither used nor limit can be resolved (caller treats as empty_data).
 */
export function buildXaiQuotaRows(payload: XaiBillingPayload): XaiQuotaRow[] {
  const config = payload.config && typeof payload.config === 'object' ? payload.config : null;
  const source = (config ?? payload) as Record<string, unknown>;

  const used = unwrapXaiBillingAmount(source.used ?? (config ? undefined : payload.used));
  // Field name is monthlyLimit in the CLI billing schema; product UX may call
  // the consumer pool "weekly" — we only have this CLI meter via OAuth.
  const limit = unwrapXaiBillingAmount(
    source.monthlyLimit ??
      source.monthly_limit ??
      source.weeklyLimit ??
      source.weekly_limit ??
      source.limit ??
      (config ? undefined : (payload.monthlyLimit ?? payload.monthly_limit))
  );
  const onDemandCap = unwrapXaiBillingAmount(
    source.onDemandCap ??
      source.on_demand_cap ??
      (config ? undefined : (payload.onDemandCap ?? payload.on_demand_cap))
  );
  const periodStart =
    source.billingPeriodStart ??
    source.billing_period_start ??
    (config ? undefined : (payload.billingPeriodStart ?? payload.billing_period_start));
  const periodEnd =
    source.billingPeriodEnd ??
    source.billing_period_end ??
    (config ? undefined : (payload.billingPeriodEnd ?? payload.billing_period_end));
  const resetHint = xaiBillingPeriodHint(periodEnd);
  const creditsLabelKey = resolveXaiCreditsLabelKey(periodStart, periodEnd);

  const rows: XaiQuotaRow[] = [];

  // Require at least one of used/limit so empty configs don't look like success.
  if (used !== null || limit !== null) {
    rows.push({
      id: 'included-credits',
      labelKey: creditsLabelKey,
      used: used ?? 0,
      limit: limit ?? 0,
      resetHint,
    });
  }

  if (onDemandCap !== null && onDemandCap > 0) {
    rows.push({
      id: 'on-demand-cap',
      labelKey: 'xai_quota.on_demand_cap',
      used: 0,
      limit: onDemandCap,
      resetHint,
    });
  }

  return rows;
}

/** Extract optional plan/tier display from billing or settings-shaped payloads. */
export function resolveXaiPlanType(payload: XaiBillingPayload): string | null {
  const tier =
    normalizeStringValue(payload.subscription_tier_display) ??
    normalizeStringValue(payload.subscriptionTierDisplay);
  return tier;
}
