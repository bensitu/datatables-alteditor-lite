import { describe, expect, it } from 'vitest';

import {
  createBatchFieldState,
  restoreBatchFieldValue,
  setBatchFieldValue,
} from '../../src/form/batch-field-state-controller.js';

describe('batch field state', () => {
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
});
