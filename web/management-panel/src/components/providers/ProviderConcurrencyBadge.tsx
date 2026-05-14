import { useTranslation } from 'react-i18next';
import type { UpstreamConcurrencyConfig } from '@/types';
import { getEffectiveProviderConcurrency } from '@/utils/upstreamConcurrency';
import styles from '@/pages/AiProvidersPage.module.scss';

interface ProviderConcurrencyBadgeProps {
  providerKey: string;
  config?: UpstreamConcurrencyConfig;
}

export function ProviderConcurrencyBadge({ providerKey, config }: ProviderConcurrencyBadgeProps) {
  const { t } = useTranslation();
  const effective = getEffectiveProviderConcurrency(config, providerKey);
  const value =
    effective.source === 'unlimited'
      ? t('ai_providers.concurrency_unlimited', { defaultValue: 'Unlimited' })
      : effective.source === 'default'
        ? t('ai_providers.concurrency_default_value', {
            defaultValue: '{{limit}} (default)',
            limit: effective.limit,
          })
        : effective.limit === 0
          ? t('ai_providers.concurrency_unlimited_override', {
              defaultValue: 'Unlimited override',
            })
          : String(effective.limit);

  return (
    <div className={styles.fieldRow}>
      <span className={styles.fieldLabel}>
        {t('ai_providers.concurrency_label', { defaultValue: 'Concurrency' })}:
      </span>
      <span className={styles.fieldValue}>{value}</span>
    </div>
  );
}
