/**
 * Per-tool sync status indicator with text label and color-coded dot.
 */

import { useTranslation } from 'react-i18next';
import styles from './sync.module.scss';

export type SyncStatus = 'synced' | 'outdated' | 'never-synced' | 'error';

interface SyncStatusIndicatorProps {
  status: SyncStatus;
  lastSync?: string;
  errorDetail?: string;
}

const STATUS_CLASS_MAP: Record<SyncStatus, string> = {
  synced: styles.statusSynced,
  outdated: styles.statusOutdated,
  'never-synced': styles.statusNeverSynced,
  error: styles.statusError,
};

export function SyncStatusIndicator({ status, lastSync, errorDetail }: SyncStatusIndicatorProps) {
  const { t } = useTranslation();

  const labelKey = `sync_profiles.status.${status}` as const;
  const label = t(labelKey, { defaultValue: status });

  return (
    <span className={`${styles.statusIndicator} ${STATUS_CLASS_MAP[status]}`}>
      <span className={styles.statusDot} aria-hidden="true" />
      <span>{label}</span>
      {lastSync && (
        <span className={styles.statusTimestamp} aria-label={t('sync_profiles.last_sync_label', { defaultValue: 'Last synced' })}>
          {lastSync}
        </span>
      )}
      {status === 'error' && errorDetail && (
        <span className={styles.statusTimestamp} title={errorDetail} aria-label={errorDetail}>
          ({errorDetail})
        </span>
      )}
    </span>
  );
}
