import type { TFunction } from 'i18next';
import type { DebugRunUnit } from '@/features/providerDebug/types';

/**
 * Rail and trace labels compose from the registry rather than being stored on the trace,
 * so a translated label never has to be produced by the pure runner modules.
 */
export function unitLabel(t: TFunction, unit: DebugRunUnit): string {
  const base = t(unit.check.labelKey);
  if (unit.keyIndex === null) return base;
  return `${base} · ${t('provider_debug.key_label', { index: unit.keyIndex + 1 })}`;
}
