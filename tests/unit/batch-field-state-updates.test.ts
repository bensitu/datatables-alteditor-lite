import { describe, expect, it } from 'vitest';

import {
  createBatchFieldState,
  restoreBatchFieldValue,
  setBatchFieldValue,
} from '../../src/form/batch-field-state-updates.js';

describe('batch field state updates', () => {
  it('preserves a common baseline until its value changes', () => {
    const baseline = createBatchFieldState(['Tokyo', 'Tokyo']);
    const overridden = setBatchFieldValue(baseline, 'Osaka');
    const changedBack = setBatchFieldValue(overridden, 'Tokyo');

    expect(baseline).toEqual({
      baseline: { status: 'common', value: 'Tokyo' },
      current: { status: 'common', value: 'Tokyo' },
    });
    expect(overridden.current).toEqual({ status: 'overridden', value: 'Osaka' });
    expect(changedBack.current).toEqual({ status: 'common', value: 'Tokyo' });
  });

  it('requires an explicit value before a mixed field becomes overridden', () => {
    const baseline = createBatchFieldState(['Tokyo', 'Osaka']);

    expect(baseline.current).toEqual({ status: 'mixed' });
    expect(setBatchFieldValue(baseline, 'Seoul').current).toEqual({
      status: 'overridden',
      value: 'Seoul',
    });
  });

  it('restores the original common or mixed relationship', () => {
    const uniformState = createBatchFieldState(['Tokyo', 'Tokyo']);
    const mixed = createBatchFieldState(['Tokyo', 'Osaka']);

    expect(
      restoreBatchFieldValue(setBatchFieldValue(uniformState, 'Seoul')).current,
    ).toBe(uniformState.baseline);
    expect(restoreBatchFieldValue(setBatchFieldValue(mixed, 'Seoul')).current).toBe(
      mixed.baseline,
    );
  });

  it('uses caller-provided equality for structural values', () => {
    const isEqual = (left: readonly string[], right: readonly string[]): boolean =>
      left.length === right.length &&
      left.every((value, index) => value === right[index]);
    const matchingState = createBatchFieldState([['one'], ['one']], isEqual);
    const mixed = createBatchFieldState([['one'], ['two']], isEqual);

    expect(matchingState.baseline).toEqual({ status: 'common', value: ['one'] });
    expect(mixed.baseline).toEqual({ status: 'mixed' });
    expect(setBatchFieldValue(matchingState, ['one'], isEqual).current).toBe(
      matchingState.baseline,
    );
    expect(setBatchFieldValue(matchingState, ['two'], isEqual).current).toEqual({
      status: 'overridden',
      value: ['two'],
    });
  });
});
