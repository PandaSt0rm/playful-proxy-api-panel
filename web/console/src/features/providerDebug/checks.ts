/**
 * The check registry and run planner.
 *
 * Checks are a flat, ordered list rather than a class hierarchy or a per-family adapter
 * layer: there are a handful of them, they share one result shape, and the rail renders
 * them in registry order so the sequence an operator sees is stable across runs.
 */

import type { DebugCheck, DebugKey, DebugRunUnit, RegistryCheckId } from './types';

/**
 * Registry order is display order. Cheap, non-billable checks come first so a run
 * surfaces configuration mistakes before it spends anything.
 */
export const DEBUG_CHECKS: readonly DebugCheck[] = [
  {
    id: 'reachability',
    labelKey: 'provider_debug.checks.reachability.label',
    descriptionKey: 'provider_debug.checks.reachability.description',
    billable: false,
    perKey: false,
  },
  {
    id: 'auth',
    labelKey: 'provider_debug.checks.auth.label',
    descriptionKey: 'provider_debug.checks.auth.description',
    billable: false,
    perKey: true,
  },
  {
    id: 'catalog',
    labelKey: 'provider_debug.checks.catalog.label',
    descriptionKey: 'provider_debug.checks.catalog.description',
    billable: false,
    perKey: false,
  },
  // Everything below spends provider tokens, so it sits behind the run cost confirmation.
  // These exercise one model with one key; the matrix is what fans out across both.
  {
    id: 'completion',
    labelKey: 'provider_debug.checks.completion.label',
    descriptionKey: 'provider_debug.checks.completion.description',
    billable: true,
    perKey: false,
  },
  {
    id: 'sse_format',
    labelKey: 'provider_debug.checks.sse_format.label',
    descriptionKey: 'provider_debug.checks.sse_format.description',
    billable: true,
    perKey: false,
  },
  {
    id: 'tools',
    labelKey: 'provider_debug.checks.tools.label',
    descriptionKey: 'provider_debug.checks.tools.description',
    billable: true,
    perKey: false,
  },
  {
    id: 'json_mode',
    labelKey: 'provider_debug.checks.json_mode.label',
    descriptionKey: 'provider_debug.checks.json_mode.description',
    billable: true,
    perKey: false,
  },
  {
    id: 'vision',
    labelKey: 'provider_debug.checks.vision.label',
    descriptionKey: 'provider_debug.checks.vision.description',
    billable: true,
    perKey: false,
  },
];

export function getDebugCheck(id: RegistryCheckId): DebugCheck | undefined {
  return DEBUG_CHECKS.find((check) => check.id === id);
}

/** A key with no secret cannot be authenticated against, so it is not worth scheduling. */
export function isTestableKey(key: DebugKey): boolean {
  return key.apiKey.trim().length > 0;
}

export function countTestableKeys(keys: readonly DebugKey[]): number {
  return keys.filter(isTestableKey).length;
}

/**
 * Expands the selected checks into the concrete units a run will execute: per-key checks
 * fan out across every testable key, provider-wide checks yield exactly one unit.
 *
 * Units are emitted in registry order, not selection order, so two runs with the same
 * checks always produce the same rail.
 */
/**
 * How many billable upstream calls a plan will make. Shown in the confirmation before a
 * run: a cost gate without a number is not a gate, it is a shrug.
 */
export function countBillableCalls(units: readonly DebugRunUnit[]): number {
  return units.filter((unit) => unit.check.billable).length;
}

export function planDebugRun(
  selected: readonly RegistryCheckId[],
  keys: readonly DebugKey[]
): DebugRunUnit[] {
  const selectedIds = new Set(selected);
  const units: DebugRunUnit[] = [];

  for (const check of DEBUG_CHECKS) {
    if (!selectedIds.has(check.id)) continue;

    if (!check.perKey) {
      units.push({ id: check.id, check, keyIndex: null });
      continue;
    }

    keys.forEach((key, keyIndex) => {
      if (!isTestableKey(key)) return;
      units.push({ id: `${check.id}:${keyIndex}`, check, keyIndex });
    });
  }

  return units;
}
