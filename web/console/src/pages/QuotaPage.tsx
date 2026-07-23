/**
 * Quota management dashboard.
 *
 * Loads every credential's quota automatically and presents them as dense,
 * filterable, sortable rows grouped by provider — with one global refresh and an
 * opt-in auto-refresh, replacing the old per-card manual refresh workflow.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { useAuthStore, useThemeStore } from '@/stores';
import { authFilesApi, configFileApi, providersApi } from '@/services/api';
import { buildZaiQuotaAuthFilesFromOpenAIProviders } from '@/utils/zaiProvider';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useQuotaDashboard } from '@/components/quota/useQuotaDashboard';
import { QuotaDashboardHeader } from '@/components/quota/QuotaDashboardHeader';
import { QuotaProviderGroup } from '@/components/quota/QuotaProviderGroup';
import {
  ALL_QUOTA_PROVIDERS,
  buildProviderGroups,
  type QuotaHealthFilter,
  type QuotaSortKey,
  type QuotaViewState,
} from '@/components/quota/quotaView';
import type { QuotaType } from '@/components/quota/quotaConfigs';
import type { AuthFileItem, ResolvedTheme } from '@/types';
import { WorkspacePage } from '@/components/workspace/WorkspacePage';
import styles from './QuotaPage.module.scss';

const DEFAULT_VIEW_STATE: QuotaViewState = {
  search: '',
  sort: 'health',
  providers: new Set(ALL_QUOTA_PROVIDERS),
  healthFilter: 'all',
};

export function QuotaPage() {
  const { t } = useTranslation();
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const resolvedTheme: ResolvedTheme = useThemeStore((state) => state.resolvedTheme);

  const [files, setFiles] = useState<AuthFileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewState, setViewState] = useState<QuotaViewState>(() => ({
    ...DEFAULT_VIEW_STATE,
    providers: new Set(ALL_QUOTA_PROVIDERS),
  }));

  const disableControls = connectionStatus !== 'connected';

  const loadConfig = useCallback(async () => {
    try {
      await configFileApi.fetchConfigYaml();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : t('notification.refresh_failed');
      setError((prev) => prev || errorMessage);
    }
  }, [t]);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [authFilesResult, openAIProvidersResult] = await Promise.allSettled([
        authFilesApi.list(),
        providersApi.getOpenAIProviders(),
      ]);

      if (authFilesResult.status !== 'fulfilled') {
        throw authFilesResult.reason;
      }

      const authFiles = authFilesResult.value?.files || [];
      const zaiQuotaFiles =
        openAIProvidersResult.status === 'fulfilled'
          ? buildZaiQuotaAuthFilesFromOpenAIProviders(openAIProvidersResult.value || [])
          : [];
      setFiles([...authFiles, ...zaiQuotaFiles]);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : t('notification.refresh_failed');
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [t]);

  const handleHeaderRefresh = useCallback(async () => {
    await Promise.all([loadConfig(), loadFiles()]);
  }, [loadConfig, loadFiles]);

  useHeaderRefresh(handleHeaderRefresh);

  useEffect(() => {
    loadFiles();
    loadConfig();
  }, [loadFiles, loadConfig]);

  const dashboard = useQuotaDashboard(files, loading, disableControls);
  const { refreshAll, refreshOne } = dashboard;

  const availableProviders = useMemo<ReadonlySet<QuotaType>>(
    () => new Set(dashboard.credentialViews.map((view) => view.type)),
    [dashboard.credentialViews]
  );

  const groups = useMemo(
    () => buildProviderGroups(dashboard.credentialViews, viewState),
    [dashboard.credentialViews, viewState]
  );

  const onSearchChange = useCallback((search: string) => {
    setViewState((prev) => ({ ...prev, search }));
  }, []);

  const onSortChange = useCallback((sort: QuotaSortKey) => {
    setViewState((prev) => ({ ...prev, sort }));
  }, []);

  const onToggleProvider = useCallback((type: QuotaType) => {
    setViewState((prev) => {
      const providers = new Set(prev.providers);
      if (providers.has(type)) providers.delete(type);
      else providers.add(type);
      return { ...prev, providers };
    });
  }, []);

  const onHealthFilterChange = useCallback((healthFilter: QuotaHealthFilter) => {
    setViewState((prev) => ({
      ...prev,
      healthFilter:
        prev.healthFilter === healthFilter && healthFilter !== 'all' ? 'all' : healthFilter,
    }));
  }, []);

  const clearFilters = useCallback(() => {
    setViewState({ ...DEFAULT_VIEW_STATE, providers: new Set(ALL_QUOTA_PROVIDERS) });
  }, []);

  const handleRefreshOne = useCallback((key: string) => void refreshOne(key), [refreshOne]);
  const handleRefreshAll = useCallback(() => void refreshAll(), [refreshAll]);

  const hasCredentials = dashboard.credentialViews.length > 0;
  const emptyDescription = disableControls
    ? 'quota_management.empty_disconnected'
    : loading
      ? 'quota_management.empty_loading'
      : 'quota_management.empty_desc';

  return (
    <WorkspacePage
      title={t('quota_management.title')}
      description={t('quota_management.description')}
    >
      {error && <div className={styles.errorBox}>{error}</div>}

      <QuotaDashboardHeader
        overview={dashboard.overview}
        progress={dashboard.progress}
        lastUpdatedAt={dashboard.lastUpdatedAt}
        disabled={disableControls}
        onRefreshAll={handleRefreshAll}
        autoRefresh={dashboard.autoRefresh}
        availableProviders={availableProviders}
        viewState={viewState}
        onSearchChange={onSearchChange}
        onSortChange={onSortChange}
        onToggleProvider={onToggleProvider}
        onHealthFilterChange={onHealthFilterChange}
      />

      {!hasCredentials ? (
        <EmptyState title={t('quota_management.empty_title')} description={t(emptyDescription)} />
      ) : groups.length === 0 ? (
        <EmptyState
          title={t('quota_management.no_matches_title')}
          description={t('quota_management.no_matches_desc')}
          action={
            <Button variant="secondary" size="sm" onClick={clearFilters}>
              {t('quota_management.clear_filters')}
            </Button>
          }
        />
      ) : (
        <div className={styles.groups}>
          {groups.map((group) => (
            <QuotaProviderGroup
              key={group.type}
              group={group}
              resolvedTheme={resolvedTheme}
              disabled={disableControls}
              onRefresh={handleRefreshOne}
            />
          ))}
        </div>
      )}
    </WorkspacePage>
  );
}
