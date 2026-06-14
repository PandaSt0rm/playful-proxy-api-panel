/**
 * A provider section: a slim header (provider name + credential count) above its
 * dense credential rows. Far lighter than the previous per-section card with its
 * pagination and view-mode chrome.
 */

import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import type { ResolvedTheme } from '@/types';
import { QuotaCredentialRow } from './QuotaCredentialRow';
import type { QuotaProviderGroupView } from './quotaView';
import styles from './QuotaDashboard.module.scss';

interface QuotaProviderGroupProps {
  group: QuotaProviderGroupView;
  resolvedTheme: ResolvedTheme;
  disabled: boolean;
  onRefresh: (key: string) => void;
}

function QuotaProviderGroupImpl({ group, resolvedTheme, disabled, onRefresh }: QuotaProviderGroupProps) {
  const { t } = useTranslation();
  const attention = group.credentials.filter(
    (view) => view.health === 'critical' || view.health === 'error'
  ).length;

  return (
    <section className={styles.group}>
      <header className={styles.groupHeader}>
        <h2 className={styles.groupTitle}>{t(`${group.i18nPrefix}.title`)}</h2>
        <span className={styles.groupCount}>{group.credentials.length}</span>
        {attention > 0 && (
          <span className={styles.groupAttention}>
            {t('quota_management.group_attention', { count: attention })}
          </span>
        )}
      </header>
      <div className={styles.groupRows}>
        {group.credentials.map((view) => (
          <QuotaCredentialRow
            key={view.key}
            view={view}
            resolvedTheme={resolvedTheme}
            disabled={disabled}
            onRefresh={onRefresh}
          />
        ))}
      </div>
    </section>
  );
}

export const QuotaProviderGroup = memo(QuotaProviderGroupImpl);
