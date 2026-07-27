import { describe, it, expect } from 'vitest';
import {
  DEFAULT_MATRIX_CELL_CAP,
  MAX_MATRIX_CELL_CAP,
  clampMatrixCap,
  planMatrix,
} from './matrix';
import type { DebugKey } from './types';

const key = (apiKey: string): DebugKey => ({ apiKey });

describe('clampMatrixCap', () => {
  it('keeps a sensible request untouched', () => {
    expect(clampMatrixCap(20)).toBe(20);
  });

  it('never lets a run exceed the hard ceiling', () => {
    expect(clampMatrixCap(5000)).toBe(MAX_MATRIX_CELL_CAP);
  });

  it('never drops below a single cell', () => {
    expect(clampMatrixCap(0)).toBe(1);
    expect(clampMatrixCap(-9)).toBe(1);
  });

  it('falls back to the default for a non-numeric request', () => {
    expect(clampMatrixCap(Number.NaN)).toBe(DEFAULT_MATRIX_CELL_CAP);
    expect(clampMatrixCap(Number.POSITIVE_INFINITY)).toBe(DEFAULT_MATRIX_CELL_CAP);
  });

  it('truncates a fractional request rather than rounding up into extra spend', () => {
    expect(clampMatrixCap(4.9)).toBe(4);
  });
});

describe('planMatrix', () => {
  it('produces one cell per model per testable key', () => {
    const plan = planMatrix(['a', 'b'], [key('sk-1'), key('sk-2')]);
    expect(plan.cells.map((cell) => cell.id)).toEqual([
      'matrix:0:a',
      'matrix:1:a',
      'matrix:0:b',
      'matrix:1:b',
    ]);
    expect(plan.dropped).toBe(0);
  });

  it('ignores blank keys and blank or duplicate models', () => {
    const plan = planMatrix(['a', ' a ', '', '  ', 'b'], [key('sk-1'), key('  ')]);
    expect(plan.models).toEqual(['a', 'b']);
    expect(plan.keyIndexes).toEqual([0]);
    expect(plan.cells).toHaveLength(2);
  });

  it('keeps key indexes aligned with the form rows they came from', () => {
    const plan = planMatrix(['a'], [key(''), key('sk-2')]);
    expect(plan.keyIndexes).toEqual([1]);
    expect(plan.cells[0]).toMatchObject({ keyIndex: 1, model: 'a' });
  });

  it('caps the plan and reports how many cells it dropped', () => {
    // Silent truncation would read as full coverage, which is worse than no matrix.
    const plan = planMatrix(['a', 'b', 'c'], [key('sk-1'), key('sk-2')], 4);
    expect(plan.cells).toHaveLength(4);
    expect(plan.dropped).toBe(2);
  });

  it('truncates model-major, so a capped run still covers every key it reaches', () => {
    const plan = planMatrix(['a', 'b'], [key('sk-1'), key('sk-2')], 2);
    expect(plan.cells.map((cell) => cell.model)).toEqual(['a', 'a']);
    expect(plan.cells.map((cell) => cell.keyIndex)).toEqual([0, 1]);
  });

  it('applies the default cap when none is given', () => {
    const models = Array.from({ length: 20 }, (_, index) => `model-${index}`);
    const plan = planMatrix(models, [key('sk-1')]);
    expect(plan.cells).toHaveLength(DEFAULT_MATRIX_CELL_CAP);
    expect(plan.dropped).toBe(20 - DEFAULT_MATRIX_CELL_CAP);
  });

  it('plans nothing when either axis is empty', () => {
    expect(planMatrix([], [key('sk-1')]).cells).toEqual([]);
    expect(planMatrix(['a'], []).cells).toEqual([]);
    expect(planMatrix(['a'], [key('')]).cells).toEqual([]);
  });
});
