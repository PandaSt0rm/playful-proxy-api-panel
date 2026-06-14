/**
 * Self-contained relative-time label ("2m ago"). Owns its own low-frequency
 * ticker so it can update in place without re-rendering the surrounding list.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { formatRelativeTime } from './quotaTime';

/** Coarse cadence — relative quota freshness does not need sub-15s precision. */
const RELATIVE_TICK_MS = 15_000;

interface RelativeTimeProps {
  timestamp: number;
  /** Optional wrapper around the relative string (e.g. "Updated {rel}"). */
  render?: (relative: string) => ReactNode;
  className?: string;
}

export function RelativeTime({ timestamp, render, className }: RelativeTimeProps) {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), RELATIVE_TICK_MS);
    return () => clearInterval(id);
  }, []);

  const relative = formatRelativeTime(t, timestamp, now);
  return <span className={className}>{render ? render(relative) : relative}</span>;
}
