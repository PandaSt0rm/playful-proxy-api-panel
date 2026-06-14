/**
 * Sticky dashboard controls: global refresh (with live progress), opt-in
 * auto-refresh, freshness clock, search, provider filters, sort, and an overview
 * strip whose counts double as health filters.
 */

import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { IconRefreshCw, IconSearch } from '@/components/ui/icons';
import { getProviderLabel } from './quotaLabels';
import { RelativeTime } from './RelativeTime';
import { AUTO_REFRESH_INTERVALS_MS, type QuotaOverview, type QuotaProgress } from './useQuotaDashboard';
import { QUOTA_PROVIDER_ORDER, type QuotaHealthFilter, type QuotaSortKey, type QuotaViewState } from './quotaView';
import type { QuotaType } from './quotaConfigs';
import styles from './QuotaDashboard.module.scss';

interface QuotaDashboardHeaderProps {
  overview: QuotaOverview;
  progress: QuotaProgress;
  lastUpdatedAt: number | null;
  disabled: boolean;
  onRefreshAll: () => void;
  autoRefresh: {
    enabled: boolean;
    setEnabled: (value: boolean) => void;
    intervalMs: number;
    setIntervalMs: (value: number) => void;
  };
  availableProviders: ReadonlySet<QuotaType>;
  viewState: QuotaViewState;
  onSearchChange: (value: string) => void;
  onSortChange: (value: QuotaSortKey) => void;
  onToggleProvider: (type: QuotaType) => void;
  onHealthFilterChange: (value: QuotaHealthFilter) => void;
}

const HEALTH_FILTERS: ReadonlyArray<{ key: QuotaHealthFilter; countKey: keyof QuotaOverview }> = [
  { key: 'all', countKey: 'total' },
  { key: 'ok', countKey: 'ok' },
  { key: 'warn', countKey: 'warn' },
  { key: 'critical', countKey: 'critical' },
  { key: 'error', countKey: 'error' },
];

export function QuotaDashboardHeader({
  overview,
  progress,
  lastUpdatedAt,
  disabled,
  onRefreshAll,
  autoRefresh,
  availableProviders,
  viewState,
  onSearchChange,
  onSortChange,
  onToggleProvider,
  onHealthFilterChange,
}: QuotaDashboardHeaderProps) {
  const { t } = useTranslation();
  const busy = progress.active;

  const intervalOptions = AUTO_REFRESH_INTERVALS_MS.map((ms) => ({
    value: String(ms),
    label: t('quota_management.interval_option', { count: ms / 60_000 }),
  }));
  const sortOptions: ReadonlyArray<{ value: QuotaSortKey; label: string }> = [
    { value: 'health', label: t('quota_management.sort_health') },
    { value: 'name', label: t('quota_management.sort_name') },
  ];

  const filterLabel = (key: QuotaHealthFilter) =>
    key === 'all' ? t('quota_management.filter_all') : t(`quota_management.health_${key}`);

  return (
    <div className={styles.header}>
      <div className={styles.controlsRow}>
        <Button
          variant="primary"
          size="sm"
          className={styles.refreshAll}
          onClick={onRefreshAll}
          disabled={disabled || busy}
          loading={busy}
        >
          {!busy && <IconRefreshCw size={16} />}
          {busy
            ? t('quota_management.loading_progress', { done: progress.done, total: progress.total })
            : t('quota_management.refresh_all')}
        </Button>

        <ToggleSwitch
          checked={autoRefresh.enabled}
          onChange={autoRefresh.setEnabled}
          label={t('quota_management.auto_refresh')}
        />
        {autoRefresh.enabled && (
          <Select
            value={String(autoRefresh.intervalMs)}
            options={intervalOptions}
            onChange={(value) => autoRefresh.setIntervalMs(Number(value))}
          />
        )}

        <span className={styles.spacer} />

        <span className={styles.updated} role="status" aria-live="polite">
          {busy
            ? t('quota_management.loading_progress', { done: progress.done, total: progress.total })
            : lastUpdatedAt === null
              ? t('quota_management.never_updated')
              : (
                <RelativeTime
                  timestamp={lastUpdatedAt}
                  render={(relative) => t('quota_management.updated_label', { relative })}
                />
              )}
        </span>
      </div>

      <div className={styles.controlsRow}>
        <Input
          type="search"
          className={styles.search}
          placeholder={t('quota_management.search_placeholder')}
          value={viewState.search}
          onChange={(event) => onSearchChange(event.target.value)}
          rightElement={<IconSearch size={16} aria-hidden="true" />}
          aria-label={t('quota_management.search_placeholder')}
        />
        <Select
          value={viewState.sort}
          options={sortOptions}
          onChange={(value) => onSortChange(value as QuotaSortKey)}
        />
        <div className={styles.providerChips} role="group" aria-label={t('quota_management.provider_filters_label')}>
          {QUOTA_PROVIDER_ORDER.filter((entry) => availableProviders.has(entry.type)).map((entry) => {
            const active = viewState.providers.has(entry.type);
            return (
              <button
                key={entry.type}
                type="button"
                className={`${styles.providerChip} ${active ? styles.providerChipActive : ''}`}
                aria-pressed={active}
                onClick={() => onToggleProvider(entry.type)}
              >
                {getProviderLabel(t, entry.type)}
              </button>
            );
          })}
        </div>
      </div>

      <div className={styles.overview} role="group" aria-label={t('quota_management.health_filters_label')}>
        {HEALTH_FILTERS.map(({ key, countKey }) => {
          const active = viewState.healthFilter === key;
          return (
            <button
              key={key}
              type="button"
              className={`${styles.overviewChip} ${styles[`overview_${key}`]} ${
                active ? styles.overviewChipActive : ''
              }`}
              aria-pressed={active}
              aria-label={t('quota_management.filter_health_aria', {
                label: filterLabel(key),
                count: overview[countKey],
              })}
              onClick={() => onHealthFilterChange(key)}
            >
              <span className={styles.overviewCount}>{overview[countKey]}</span>
              <span className={styles.overviewLabel}>{filterLabel(key)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
