/**
 * Compact, provider-agnostic quota meter: a labelled remaining-% bar with
 * optional reset and amount detail. Reuses the shared QuotaProgressBar so the
 * colour bands match the rest of the quota UI.
 *
 * The value is REMAINING quota, so it is shown as "N% left" (and announced as
 * "remaining") to avoid being misread as usage/progress.
 */

import { useTranslation } from 'react-i18next';
import { QuotaProgressBar } from './QuotaProgressBar';
import {
  QUOTA_CRITICAL_REMAINING,
  QUOTA_WARN_REMAINING,
  type NormalizedMeter,
  type QuotaHealth,
} from './quotaSummary';
import styles from './QuotaDashboard.module.scss';

interface QuotaMeterProps {
  meter: NormalizedMeter;
}

export function QuotaMeter({ meter }: QuotaMeterProps) {
  const { t } = useTranslation();
  const known = meter.remainingPercent !== null;
  const percent = known ? Math.round(meter.remainingPercent as number) : null;
  const percentLabel = percent === null ? '--' : t('quota_management.percent_remaining', { percent });
  const ariaLabel =
    percent === null
      ? t('quota_management.meter_unknown_aria', { label: meter.label })
      : t('quota_management.meter_remaining_aria', { label: meter.label, percent });

  return (
    <div className={styles.meter}>
      <div className={styles.meterHeader}>
        <span className={styles.meterLabel} title={meter.label}>
          {meter.label}
        </span>
        <span className={styles.meterPercent}>{percentLabel}</span>
      </div>
      <QuotaProgressBar
        percent={meter.remainingPercent}
        highThreshold={QUOTA_WARN_REMAINING}
        mediumThreshold={QUOTA_CRITICAL_REMAINING}
        ariaLabel={ariaLabel}
      />
      {(meter.amountLabel || meter.resetLabel) && (
        <div className={styles.meterMeta}>
          {meter.amountLabel && <span className={styles.meterAmount}>{meter.amountLabel}</span>}
          {meter.resetLabel && <span className={styles.meterReset}>{meter.resetLabel}</span>}
        </div>
      )}
    </div>
  );
}

interface QuotaHealthDotProps {
  health: QuotaHealth;
  /** Accessible health label, surfaced to assistive tech (colour is not the only signal). */
  label?: string;
}

export function QuotaHealthDot({ health, label }: QuotaHealthDotProps) {
  return (
    <span
      className={`${styles.healthDot} ${styles[`health_${health}`]}`}
      role="img"
      aria-label={label}
      title={label}
    />
  );
}
