/**
 * One credential rendered as a dense, full-width row: a health dot + identity on
 * the left, plan/tier chips and per-credential refresh on the right, and the
 * provider's quota meters below.
 *
 * Refreshing is stale-while-revalidate: when a previously-loaded credential is
 * re-fetched its meters stay visible and only the refresh button spins, so a
 * global refresh never blanks the screen.
 */

import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Button } from '@/components/ui/Button';
import { IconChevronDown, IconChevronUp, IconRefreshCw } from '@/components/ui/icons';
import type { ResolvedTheme, ThemeColors } from '@/types';
import { TYPE_COLORS } from '@/utils/quota';
import { QuotaHealthDot, QuotaMeter } from './QuotaMeter';
import { RelativeTime } from './RelativeTime';
import { getProviderLabel } from './quotaLabels';
import type { QuotaCredentialView } from './useQuotaDashboard';
import styles from './QuotaDashboard.module.scss';

/** Meters shown before the "show more" toggle appears. */
const METER_PREVIEW_COUNT = 6;

interface QuotaCredentialRowProps {
  view: QuotaCredentialView;
  resolvedTheme: ResolvedTheme;
  disabled: boolean;
  onRefresh: (key: string) => void;
}

function QuotaCredentialRowImpl({ view, resolvedTheme, disabled, onRefresh }: QuotaCredentialRowProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const displayType = view.file.type || view.file.provider || view.type;
  const typeColorSet = TYPE_COLORS[displayType] || TYPE_COLORS.unknown;
  const typeColor: ThemeColors =
    resolvedTheme === 'dark' && typeColorSet.dark ? typeColorSet.dark : typeColorSet.light;

  const meters = view.summary.meters;
  const hasOverflow = meters.length > METER_PREVIEW_COUNT;
  const visibleMeters = expanded || !hasOverflow ? meters : meters.slice(0, METER_PREVIEW_COUNT);

  return (
    <div className={`${styles.row} ${styles[`rowHealth_${view.health}`]}`}>
      <div className={styles.rowMain}>
        <div className={styles.rowIdentity}>
          <QuotaHealthDot health={view.health} label={t(`quota_management.health_${view.health}`)} />
          <span
            className={styles.typeBadge}
            style={{
              backgroundColor: typeColor.bg,
              color: typeColor.text,
              ...(typeColor.border ? { border: typeColor.border } : {}),
            }}
          >
            {getProviderLabel(t, displayType)}
          </span>
          <span className={styles.rowName} title={view.name}>
            {view.name}
          </span>
          {view.summary.extras.map((extra) => (
            <span
              key={extra.id}
              className={`${styles.extraChip} ${extra.premium ? styles.extraChipPremium : ''}`}
            >
              <span className={styles.extraChipLabel}>{extra.label}</span>
              <span className={styles.extraChipValue}>{extra.value}</span>
            </span>
          ))}
        </div>
        <div className={styles.rowActions}>
          {view.updatedAt !== undefined && (
            <RelativeTime className={styles.rowUpdated} timestamp={view.updatedAt} />
          )}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className={styles.rowRefresh}
            onClick={() => onRefresh(view.key)}
            disabled={disabled || view.refreshing}
            loading={view.refreshing}
            title={t('quota_management.refresh_single_credential')}
            aria-label={t('quota_management.refresh_single_credential')}
          >
            {!view.refreshing && <IconRefreshCw size={14} />}
          </Button>
        </div>
      </div>

      <div className={styles.rowBody}>{renderBody()}</div>
    </div>
  );

  function renderBody() {
    // Stale-while-revalidate: keep showing the last good meters while refreshing.
    if (view.status === 'success') {
      if (meters.length === 0) {
        return (
          <div className={styles.rowMessage}>
            {t(view.summary.emptyMessageKey ?? `${view.i18nPrefix}.empty_windows`)}
          </div>
        );
      }
      return (
        <>
          <div className={styles.meterGrid}>
            {visibleMeters.map((meter) => (
              <QuotaMeter key={meter.id} meter={meter} />
            ))}
          </div>
          {hasOverflow && (
            <button
              type="button"
              className={styles.meterToggle}
              onClick={() => setExpanded((prev) => !prev)}
            >
              {expanded ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
              {expanded
                ? t('quota_management.show_fewer_meters')
                : t('quota_management.show_more_meters', { count: meters.length - METER_PREVIEW_COUNT })}
            </button>
          )}
        </>
      );
    }
    if (view.refreshing || view.status === 'loading') {
      return <div className={styles.rowMessage}>{t(`${view.i18nPrefix}.loading`)}</div>;
    }
    if (view.status === 'error') {
      return (
        <div className={styles.rowError}>
          {t(`${view.i18nPrefix}.load_failed`, {
            message: resolveQuotaErrorMessage(t, view.errorStatus, view.error),
          })}
        </div>
      );
    }
    return <div className={styles.rowMessage}>{t('quota_management.credential_pending')}</div>;
  }
}

export const QuotaCredentialRow = memo(QuotaCredentialRowImpl);

function resolveQuotaErrorMessage(t: TFunction, status: number | undefined, fallback?: string): string {
  if (status === 404) return t('common.quota_update_required');
  if (status === 403) return t('common.quota_check_credential');
  return fallback || t('common.unknown_error');
}
