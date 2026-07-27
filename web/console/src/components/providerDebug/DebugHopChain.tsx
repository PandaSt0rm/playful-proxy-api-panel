import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import type { DebugTrace } from '@/features/providerDebug/types';
import styles from './providerDebug.module.scss';

/**
 * The path a request actually took, with real per-hop timing.
 *
 * AIPROXY is a proxy, so "which leg was slow, and which leg failed" is the question its
 * console should answer at a glance. Nothing else here visualises that the router is a hop.
 */
export function DebugHopChain({ trace }: { trace: DebugTrace }) {
  const { t } = useTranslation();
  const { hops } = trace.timing;

  if (!hops.length) return null;

  return (
    <div className={styles.hopChain}>
      <span className={styles.hopNode}>{t('provider_debug.hop.you')}</span>
      {hops.map((hop) => (
        <Fragment key={hop.name}>
          <span className={styles.hopLink}>
            <span className={styles.hopLatency}>{hop.ms} ms</span>
          </span>
          <span className={styles.hopNode}>{hop.name}</span>
        </Fragment>
      ))}
    </div>
  );
}
