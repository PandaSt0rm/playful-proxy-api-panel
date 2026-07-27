import { useTranslation } from 'react-i18next';
import type { DebugRunUnit, DebugUnitState } from '@/features/providerDebug/types';
import { unitLabel } from './labels';
import styles from './providerDebug.module.scss';

/**
 * The run as a scannable sequence: one row per unit, status on the left and latency in a
 * right-aligned tabular-numeral column so the timings line up into a single readable
 * stripe. A card grid would lose exactly that.
 */
export function DebugCheckRail({
  units,
  states,
  activeId,
  onSelect,
}: {
  units: readonly DebugRunUnit[];
  states: Record<string, DebugUnitState>;
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <ul className={styles.rail}>
      {units.map((unit) => {
        const state = states[unit.id] ?? { status: 'pending' as const };
        const settled = state.status === 'settled' ? state.trace : null;
        const status = settled ? settled.status : state.status;

        return (
          <li key={unit.id}>
            <button
              type="button"
              className={styles.railRow}
              data-status={status}
              aria-current={unit.id === activeId}
              disabled={!settled}
              onClick={() => onSelect(unit.id)}
            >
              <span className={styles.railMarker} data-status={status} aria-hidden="true" />
              <span className={styles.railLabel}>{unitLabel(t, unit)}</span>
              <span className={styles.railTiming}>
                {settled ? `${settled.timing.totalMs} ms` : t(`provider_debug.status.${status}`)}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
