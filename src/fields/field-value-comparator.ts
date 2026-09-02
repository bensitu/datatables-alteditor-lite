import type { FieldValueComparator } from './custom-field.js';
import type { FieldConfig } from './field-config.js';

/** Resolves field-specific equality while retaining identity semantics by default. */
export function resolveFieldValueComparator<TFormValues extends object>(
  field: Readonly<FieldConfig<TFormValues>>,
): FieldValueComparator<unknown> {
  if (field.type === 'custom' && field.definition.isEqual !== undefined) {
    return field.definition.isEqual;
  }
  if (field.type === 'file' && field.multiple === true) {
    return (left, right) =>
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value: unknown, index: number) => Object.is(value, right[index]));
  }
  return Object.is;
}
