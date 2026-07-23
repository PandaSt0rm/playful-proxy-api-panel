/**
 * Shared quota progress bar + the small types the quota config registry anchors.
 * Extracted from the former QuotaCard so the live bar survives without the dead
 * card component.
 *
 * The bar renders an accessible progressbar; `percent` is whatever the caller
 * passes (the dashboard passes remaining %), described via `ariaLabel`.
 */

import type { ReactElement } from 'react';
import styles from '@/pages/QuotaPage.module.scss';

type QuotaStatus = 'idle' | 'loading' | 'success' | 'error';

export interface QuotaStatusState {
  status: QuotaStatus;
  error?: string;
  errorStatus?: number;
}

export interface QuotaProgressBarProps {
  percent: number | null;
  highThreshold: number;
  mediumThreshold: number;
  /** Accessible description of what the bar represents (e.g. "5h window: 38% remaining"). */
  ariaLabel?: string;
}

export function QuotaProgressBar({
  percent,
  highThreshold,
  mediumThreshold,
  ariaLabel,
}: QuotaProgressBarProps) {
  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
  const normalized = percent === null ? null : clamp(percent, 0, 100);
  const fillClass =
    normalized === null
      ? styles.quotaBarFillMedium
      : normalized >= highThreshold
        ? styles.quotaBarFillHigh
        : normalized >= mediumThreshold
          ? styles.quotaBarFillMedium
          : styles.quotaBarFillLow;
  const widthPercent = Math.round(normalized ?? 0);

  return (
    <div
      className={styles.quotaBar}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={widthPercent}
      aria-label={ariaLabel}
      aria-valuetext={ariaLabel}
    >
      <div
        className={`${styles.quotaBarFill} ${fillClass}`}
        style={{ width: `${widthPercent}%` }}
      />
    </div>
  );
}

export interface QuotaRenderHelpers {
  styles: typeof styles;
  QuotaProgressBar: (props: QuotaProgressBarProps) => ReactElement;
}
