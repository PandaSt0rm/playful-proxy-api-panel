/**
 * Model × key matrix planning.
 *
 * Every cell is a real, billable completion, so the plan is capped before it is offered.
 * The uncapped shape of this feature is a money grenade: eight keys against twelve models
 * is ninety-six paid requests behind one click, and the management `/api-call` proxy has no
 * billing gate of its own.
 *
 * The cap truncates rather than refuses, but the number dropped is returned so the UI can
 * say so — a silent truncation reads as full coverage, which is worse than no matrix.
 */

import { isTestableKey } from './checks';
import type { DebugKey, DebugMatrixPlan } from './types';

/** Cells run per matrix pass unless the operator raises it deliberately. */
export const DEFAULT_MATRIX_CELL_CAP = 12;

/** Hard ceiling. Above this the run stops being a debug probe and becomes a bill. */
export const MAX_MATRIX_CELL_CAP = 60;

export function clampMatrixCap(requested: number): number {
  if (!Number.isFinite(requested)) return DEFAULT_MATRIX_CELL_CAP;
  return Math.min(MAX_MATRIX_CELL_CAP, Math.max(1, Math.floor(requested)));
}

/**
 * Expands models × testable keys into cells, in model-major order so a truncated plan
 * still covers every key for the models it does reach, rather than every model for one key.
 */
export function planMatrix(
  models: readonly string[],
  keys: readonly DebugKey[],
  cap: number = DEFAULT_MATRIX_CELL_CAP
): DebugMatrixPlan {
  const cleanModels = [...new Set(models.map((model) => model.trim()).filter(Boolean))];
  const keyIndexes = keys.reduce<number[]>((indexes, key, index) => {
    if (isTestableKey(key)) indexes.push(index);
    return indexes;
  }, []);

  const limit = clampMatrixCap(cap);
  const cells = [];
  for (const model of cleanModels) {
    for (const keyIndex of keyIndexes) {
      cells.push({ id: `matrix:${keyIndex}:${model}`, keyIndex, model });
    }
  }

  return {
    cells: cells.slice(0, limit),
    dropped: Math.max(0, cells.length - limit),
    models: cleanModels,
    keyIndexes,
  };
}
