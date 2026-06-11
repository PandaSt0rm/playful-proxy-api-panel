import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { useNotificationStore } from '@/stores';
import { copyToClipboard } from '@/utils/clipboard';
import styles from './ProviderTestResultBox.module.scss';

export type ProviderTestResultEntry = {
  id: string;
  status: 'success' | 'error';
  /** Optional row label, e.g. "Key #1" when results are listed per API key. */
  label?: string;
  /** Short human-readable outcome, e.g. the upstream error message. */
  message?: string;
  /** Compact request metadata, e.g. "HTTP 200 · 532 ms · gpt-4o". */
  meta?: string;
  /** Full response body. `undefined` means no HTTP response was received. */
  detail?: string;
};

type ProviderTestResultBoxProps = {
  title: string;
  entries: ProviderTestResultEntry[];
  className?: string;
};

function ResultStatusIcon({ status }: { status: ProviderTestResultEntry['status'] }) {
  if (status === 'success') {
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="8" fill="var(--success-color, #22c55e)" />
        <path
          d="M4.5 8L7 10.5L11.5 6"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="8" fill="var(--danger-color, #c65746)" />
      <path
        d="M5 5L11 11M11 5L5 11"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Selectable, copyable display of provider connectivity test results.
 * Replaces hover-only tooltips so full upstream responses stay readable.
 */
export function ProviderTestResultBox({ title, entries, className }: ProviderTestResultBoxProps) {
  const { t } = useTranslation();
  const { showNotification } = useNotificationStore();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  if (!entries.length) return null;

  const handleCopy = async (entry: ProviderTestResultEntry) => {
    const text = [entry.label, entry.meta, entry.message, entry.detail]
      .filter((part) => part && part.trim())
      .join('\n');
    const copied = await copyToClipboard(text);
    showNotification(
      copied ? t('ai_providers.test_results_copy_success') : t('ai_providers.test_results_copy_failed'),
      copied ? 'success' : 'error'
    );
  };

  return (
    <div className={className ? `${styles.panel} ${className}` : styles.panel}>
      <div className={styles.title}>{title}</div>
      {entries.map((entry) => {
        const hasDetail = entry.detail !== undefined;
        const isCollapsed = collapsed[entry.id] ?? false;
        return (
          <div key={entry.id} className={styles.entry}>
            <div className={styles.entryHeader}>
              <ResultStatusIcon status={entry.status} />
              {entry.label && <span className={styles.entryLabel}>{entry.label}</span>}
              {entry.meta && <span className={styles.entryMeta}>{entry.meta}</span>}
              <div className={styles.entryActions}>
                <Button variant="ghost" size="sm" onClick={() => void handleCopy(entry)}>
                  {t('common.copy')}
                </Button>
                {hasDetail && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setCollapsed((prev) => ({ ...prev, [entry.id]: !isCollapsed }))
                    }
                  >
                    {isCollapsed ? t('common.expand') : t('common.collapse')}
                  </Button>
                )}
              </div>
            </div>
            {entry.message && (
              <div
                className={`${styles.entryMessage} ${
                  entry.status === 'success' ? styles.success : styles.error
                }`}
              >
                {entry.message}
              </div>
            )}
            {hasDetail && !isCollapsed && (
              <pre className={styles.entryDetail}>
                {entry.detail || t('ai_providers.test_results_empty_body')}
              </pre>
            )}
          </div>
        );
      })}
    </div>
  );
}
