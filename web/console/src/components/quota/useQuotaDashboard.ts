/**
 * Quota dashboard orchestration.
 *
 * Flattens every provider credential into one list, loads their quotas through a
 * bounded concurrency pool (so a global refresh never floods provider APIs), and
 * exposes reactive per-credential views plus refresh/auto-refresh controls.
 *
 * Refreshing is stale-while-revalidate: a fetch never discards the last good
 * data. Instead each in-flight credential is tracked in `refreshingKeys` so the
 * UI can show a spinner while keeping prior meters visible. Mutations go through
 * `useQuotaStore.getState()` (imperative) so the action callbacks stay stable;
 * rendering subscribes to the store separately.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AuthFileItem } from '@/types';
import { useNotificationStore, useQuotaStore } from '@/stores';
import { getStatusFromError } from '@/utils/quota';
import type { QuotaStatusState } from './QuotaProgressBar';
import { QUOTA_CONFIGS, type QuotaConfigUnknown, type QuotaType } from './quotaConfigs';
import {
  deriveHealth,
  worstRemaining,
  EMPTY_QUOTA_SUMMARY,
  type QuotaHealth,
  type QuotaSummary,
} from './quotaSummary';

/** Maximum concurrent provider requests during a bulk load. */
const QUOTA_FETCH_CONCURRENCY = 6;

/** Auto-refresh interval choices, in milliseconds. */
export const AUTO_REFRESH_INTERVALS_MS = [60_000, 300_000, 900_000] as const;
export const DEFAULT_AUTO_REFRESH_MS = 300_000;

type LoadStatus = 'idle' | 'loading' | 'success' | 'error';

type AnyQuotaSetter = (
  updater:
    | Record<string, QuotaStatusState>
    | ((prev: Record<string, QuotaStatusState>) => Record<string, QuotaStatusState>)
) => void;

interface QuotaCredential {
  key: string; // `${type}:${name}`
  name: string;
  type: QuotaType;
  i18nPrefix: string;
  file: AuthFileItem;
  config: QuotaConfigUnknown;
}

export interface QuotaCredentialView extends QuotaCredential {
  status: LoadStatus;
  /** True while a fetch for this credential is in flight (prior data stays shown). */
  refreshing: boolean;
  health: QuotaHealth;
  summary: QuotaSummary;
  worstRemaining: number | null;
  error?: string;
  errorStatus?: number;
  updatedAt?: number;
}

export interface QuotaProgress {
  active: boolean;
  done: number;
  total: number;
}

export interface QuotaOverview {
  total: number;
  ok: number;
  warn: number;
  critical: number;
  error: number;
  loading: number;
}

interface LoadOptions {
  notify: 'none' | 'summary';
}

/** Run `worker` over `items` with at most `limit` in flight at once. */
async function runPool<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  if (items.length === 0) return;
  let cursor = 0;
  const runnerCount = Math.min(limit, items.length);
  const runners = Array.from({ length: runnerCount }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index]);
    }
  });
  await Promise.all(runners);
}

function writeCredentialState(credential: QuotaCredential, next: QuotaStatusState): void {
  const setter = useQuotaStore.getState()[
    credential.config.storeSetter
  ] as unknown as AnyQuotaSetter;
  setter((prev) => ({ ...prev, [credential.name]: next }));
}

export function useQuotaDashboard(files: AuthFileItem[], filesLoading: boolean, disabled: boolean) {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const store = useQuotaStore();

  const [progress, setProgress] = useState<QuotaProgress>({ active: false, done: 0, total: 0 });
  const [refreshingKeys, setRefreshingKeys] = useState<ReadonlySet<string>>(() => new Set());
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false);
  const [autoRefreshMs, setAutoRefreshMs] = useState<number>(DEFAULT_AUTO_REFRESH_MS);

  // Source of truth for the in-flight guard (synchronous); refreshingKeys mirrors it for rendering.
  const inFlightRef = useRef<Set<string>>(new Set());

  const credentials = useMemo<QuotaCredential[]>(() => {
    const result: QuotaCredential[] = [];
    for (const config of QUOTA_CONFIGS) {
      for (const file of files) {
        if (!config.filterFn(file)) continue;
        result.push({
          key: `${config.type}:${file.name}`,
          name: file.name,
          type: config.type,
          i18nPrefix: config.i18nPrefix,
          file,
          config,
        });
      }
    }
    return result;
  }, [files]);

  const credentialsRef = useRef(credentials);
  credentialsRef.current = credentials;

  const credentialViews = useMemo<QuotaCredentialView[]>(() => {
    return credentials.map((credential) => {
      const state = credential.config.storeSelector(store)[credential.name];
      const status: LoadStatus = state?.status ?? 'idle';
      const summary =
        state && status === 'success'
          ? credential.config.getSummary(state, t)
          : EMPTY_QUOTA_SUMMARY;
      return {
        ...credential,
        status,
        refreshing: refreshingKeys.has(credential.key),
        summary,
        health: deriveHealth(status, summary.meters),
        worstRemaining: worstRemaining(summary.meters),
        error: state?.error,
        errorStatus: state?.errorStatus,
        updatedAt: store.quotaUpdatedAt[credential.key],
      };
    });
  }, [credentials, store, t, refreshingKeys]);

  const overview = useMemo<QuotaOverview>(() => {
    const counts: QuotaOverview = { total: 0, ok: 0, warn: 0, critical: 0, error: 0, loading: 0 };
    for (const view of credentialViews) {
      counts.total += 1;
      if (view.refreshing) counts.loading += 1;
      if (view.health === 'ok') counts.ok += 1;
      else if (view.health === 'warn') counts.warn += 1;
      else if (view.health === 'critical') counts.critical += 1;
      else if (view.health === 'error') counts.error += 1;
    }
    return counts;
  }, [credentialViews]);

  const lastUpdatedAt = useMemo<number | null>(() => {
    let latest: number | null = null;
    for (const view of credentialViews) {
      if (view.updatedAt === undefined) continue;
      latest = latest === null ? view.updatedAt : Math.max(latest, view.updatedAt);
    }
    return latest;
  }, [credentialViews]);

  const markInFlight = useCallback((key: string, active: boolean) => {
    if (active) inFlightRef.current.add(key);
    else inFlightRef.current.delete(key);
    setRefreshingKeys(new Set(inFlightRef.current));
  }, []);

  // Fetch one credential without discarding its current data; returns null if it
  // was already in flight (deduped).
  const fetchOne = useCallback(
    async (credential: QuotaCredential): Promise<LoadStatus | null> => {
      if (inFlightRef.current.has(credential.key)) return null;
      markInFlight(credential.key, true);
      let result: LoadStatus;
      try {
        const data = await credential.config.fetchQuota(credential.file, t);
        writeCredentialState(credential, credential.config.buildSuccessState(data));
        result = 'success';
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : t('common.unknown_error');
        const status = getStatusFromError(err);
        writeCredentialState(credential, credential.config.buildErrorState(message, status));
        result = 'error';
      } finally {
        useQuotaStore
          .getState()
          .setQuotaUpdatedAt((prev) => ({ ...prev, [credential.key]: Date.now() }));
        markInFlight(credential.key, false);
      }
      return result;
    },
    [markInFlight, t]
  );

  const loadCredentials = useCallback(
    async (targets: QuotaCredential[], options: LoadOptions): Promise<void> => {
      if (disabled) return;
      const pending = targets.filter((credential) => !inFlightRef.current.has(credential.key));
      if (pending.length === 0) return;

      let done = 0;
      let failures = 0;
      setProgress({ active: true, done: 0, total: pending.length });
      try {
        await runPool(pending, QUOTA_FETCH_CONCURRENCY, async (credential) => {
          const status = await fetchOne(credential);
          if (status === 'error') failures += 1;
          done += 1;
          setProgress((prev) => ({ ...prev, done }));
        });
      } finally {
        setProgress((prev) => ({ ...prev, active: inFlightRef.current.size > 0 }));
      }

      if (options.notify === 'summary') {
        const total = pending.length;
        if (failures === 0) {
          showNotification(t('quota_management.refresh_done', { count: total }), 'success');
        } else {
          showNotification(
            t('quota_management.refresh_done_partial', { failed: failures, count: total }),
            'error'
          );
        }
      }
    },
    [disabled, fetchOne, showNotification, t]
  );

  const refreshAll = useCallback(async (): Promise<void> => {
    await loadCredentials(credentialsRef.current, { notify: 'summary' });
  }, [loadCredentials]);

  const refreshOne = useCallback(
    async (key: string): Promise<void> => {
      if (disabled || inFlightRef.current.has(key)) return;
      const credential = credentialsRef.current.find((item) => item.key === key);
      if (!credential) return;
      const status = await fetchOne(credential);
      if (status === 'success') {
        showNotification(
          t('auth_files.quota_refresh_success', { name: credential.name }),
          'success'
        );
      } else if (status === 'error') {
        const errored = credential.config.storeSelector(useQuotaStore.getState())[credential.name];
        showNotification(
          t('auth_files.quota_refresh_failed', {
            name: credential.name,
            message: errored?.error ?? t('common.unknown_error'),
          }),
          'error'
        );
      }
    },
    [disabled, fetchOne, showNotification, t]
  );

  // Auto-load credentials that have never been fetched, once files are ready.
  useEffect(() => {
    if (filesLoading || disabled || credentials.length === 0) return;
    const idle = credentials.filter((credential) => {
      if (inFlightRef.current.has(credential.key)) return false;
      const state = credential.config.storeSelector(useQuotaStore.getState())[credential.name];
      return (state?.status ?? 'idle') === 'idle';
    });
    if (idle.length === 0) return;
    void loadCredentials(idle, { notify: 'none' });
  }, [filesLoading, disabled, credentials, loadCredentials]);

  // Opt-in periodic refresh of all credentials. Off by default.
  useEffect(() => {
    if (!autoRefreshEnabled || disabled) return;
    const id = setInterval(() => {
      void loadCredentials(credentialsRef.current, { notify: 'none' });
    }, autoRefreshMs);
    return () => clearInterval(id);
  }, [autoRefreshEnabled, autoRefreshMs, disabled, loadCredentials]);

  return {
    credentialViews,
    overview,
    progress,
    lastUpdatedAt,
    refreshAll,
    refreshOne,
    autoRefresh: {
      enabled: autoRefreshEnabled,
      setEnabled: setAutoRefreshEnabled,
      intervalMs: autoRefreshMs,
      setIntervalMs: setAutoRefreshMs,
    },
  };
}
