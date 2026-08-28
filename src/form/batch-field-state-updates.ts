import { EditorConfigurationError } from '../core/alt-editor-lite-error.js';

import type { BatchFieldBaseline, BatchFieldState } from '../core/batch-field-state.js';
import type { FieldValueComparator } from '../fields/custom-field.js';

/** Creates a common or mixed baseline from record-aligned field values. */
export function createBatchFieldState<TValue>(
  values: readonly TValue[],
  isEqual: FieldValueComparator<TValue> = Object.is,
): Readonly<BatchFieldState<TValue>> {
  const firstValue = values[0];
  if (values.length < 2) {
    throw new EditorConfigurationError(
      'Batch field state requires values from at least two records.',
    );
  }
  const baseline: BatchFieldBaseline<TValue> = values.every((value) =>
    isEqual(value, firstValue as TValue),
  )
    ? { status: 'common', value: firstValue as TValue }
    : { status: 'mixed' };
  return Object.freeze({ baseline, current: baseline });
}

/** Applies one explicit common value while preserving the original baseline. */
export function setBatchFieldValue<TValue>(
  state: Readonly<BatchFieldState<TValue>>,
  value: TValue,
  isEqual: FieldValueComparator<TValue> = Object.is,
): Readonly<BatchFieldState<TValue>> {
  const current =
    state.baseline.status === 'common' && isEqual(state.baseline.value, value)
      ? state.baseline
      : ({ status: 'overridden', value } as const);
  return Object.freeze({ baseline: state.baseline, current });
}

/** Restores the common or mixed baseline captured when the form opened. */
export function restoreBatchFieldValue<TValue>(
  state: Readonly<BatchFieldState<TValue>>,
): Readonly<BatchFieldState<TValue>> {
  return Object.freeze({ baseline: state.baseline, current: state.baseline });
}
