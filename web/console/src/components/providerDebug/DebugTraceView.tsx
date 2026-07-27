import { useTranslation } from 'react-i18next';
import { Badge } from '@/shared/ui';
import { Button } from '@/components/ui/Button';
import { useNotificationStore } from '@/stores';
import { copyToClipboard } from '@/utils/clipboard';
import {
  formatTraceText,
  requestLines,
  responseLines,
} from '@/features/providerDebug/traceFormat';
import type { DebugStatus, DebugTrace } from '@/features/providerDebug/types';
import { DebugHopChain } from './DebugHopChain';
import styles from './providerDebug.module.scss';

const STATUS_TONE: Record<DebugStatus, 'ok' | 'caution' | 'danger' | 'neutral'> = {
  pass: 'ok',
  warn: 'caution',
  fail: 'danger',
  skipped: 'neutral',
};

/**
 * The wire exchange, rendered in the `>` / `<` transcript form operators already read from
 * `curl -v`. The gutter characters are part of the text rather than CSS decoration, so a
 * selection copies as a usable transcript.
 */
export function DebugTraceView({ trace, label }: { trace: DebugTrace; label: string }) {
  const { t } = useTranslation();
  const { showNotification } = useNotificationStore();
  const message = t(trace.message.key, trace.message.params);

  const handleCopy = async () => {
    const copied = await copyToClipboard(formatTraceText(trace, { label, message }));
    showNotification(
      copied ? t('provider_debug.copy_success') : t('provider_debug.copy_failed'),
      copied ? 'success' : 'error'
    );
  };

  return (
    <div className={styles.trace}>
      <div className={styles.traceHeader}>
        <Badge tone={STATUS_TONE[trace.status]}>{t(`provider_debug.status.${trace.status}`)}</Badge>
        <span className={styles.traceLabel}>{label}</span>
        <Button variant="ghost" size="sm" onClick={() => void handleCopy()}>
          {t('provider_debug.copy_trace')}
        </Button>
      </div>

      <DebugHopChain trace={trace} />

      <p className={styles.traceMessage}>{message}</p>

      {trace.request && (
        <section className={styles.wireBlock}>
          <h4 className={styles.wireHeading}>{t('provider_debug.request_heading')}</h4>
          <pre className={styles.wire}>{requestLines(trace.request).join('\n')}</pre>
        </section>
      )}

      {trace.response && (
        <section className={styles.wireBlock}>
          <h4 className={styles.wireHeading}>{t('provider_debug.response_heading')}</h4>
          <pre className={`${styles.wire} ${styles.wireResponse}`}>
            {responseLines(trace.response).join('\n')}
          </pre>
        </section>
      )}
    </div>
  );
}
