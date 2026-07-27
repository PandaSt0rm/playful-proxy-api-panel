import { useTranslation } from 'react-i18next';
import type { DebugMatrixPlan, DebugUnitState } from '@/features/providerDebug/types';
import styles from './providerDebug.module.scss';

/**
 * Every configured model against every key, one real completion per cell.
 *
 * A grid rather than a list because the question it answers is two-dimensional: "is this
 * model broken, or is this key broken?" reads off a row or a column at a glance, and reads
 * off neither in a flat sequence.
 */
export function DebugMatrixView({
  plan,
  states,
  activeId,
  onSelect,
}: {
  plan: DebugMatrixPlan;
  states: Record<string, DebugUnitState>;
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation();

  if (!plan.models.length || !plan.keyIndexes.length) {
    return <p className={styles.empty}>{t('provider_debug.matrix_empty')}</p>;
  }

  const planned = new Set(plan.cells.map((cell) => cell.id));

  return (
    <div className={styles.matrixViewport}>
      <table className={styles.matrix}>
        <thead>
          <tr>
            <th scope="col" className={styles.matrixCorner}>
              {t('provider_debug.matrix_model_heading')}
            </th>
            {plan.keyIndexes.map((keyIndex) => (
              <th key={keyIndex} scope="col" className={styles.matrixKeyHeading}>
                {t('provider_debug.key_label', { index: keyIndex + 1 })}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {plan.models.map((model) => (
            <tr key={model}>
              <th scope="row" className={styles.matrixModel} title={model}>
                {model}
              </th>
              {plan.keyIndexes.map((keyIndex) => {
                const id = `matrix:${keyIndex}:${model}`;
                const state = states[id];
                const settled = state?.status === 'settled' ? state.trace : null;
                const status = settled ? settled.status : (state?.status ?? 'pending');
                // Cells beyond the cap were never scheduled. Saying so beats an ambiguous
                // blank that reads as "passed".
                const included = planned.has(id);

                return (
                  <td key={keyIndex} className={styles.matrixCell}>
                    <button
                      type="button"
                      className={styles.matrixButton}
                      data-status={included ? status : 'excluded'}
                      aria-current={id === activeId}
                      disabled={!settled}
                      onClick={() => onSelect(id)}
                      title={
                        included
                          ? `${model} · ${t('provider_debug.key_label', { index: keyIndex + 1 })}`
                          : t('provider_debug.matrix_excluded')
                      }
                    >
                      <span className={styles.railMarker} data-status={status} aria-hidden="true" />
                      <span className={styles.matrixTiming}>
                        {settled
                          ? `${settled.timing.totalMs} ms`
                          : included
                            ? t(`provider_debug.status.${status}`)
                            : '—'}
                      </span>
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
