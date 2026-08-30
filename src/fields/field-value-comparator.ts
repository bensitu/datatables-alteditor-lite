import type { FieldValueComparator } from './custom-field.js';
import type { FieldConfig } from './field-config.js';

/** Resolves field-specific equality while retaining identity semantics by default. */
export function resolveFieldValueComparator<TFormValues extends object>(
  field: Readonly<FieldConfig<TFormValues>>,
): FieldValueComparator<unknown> {
  if (field.type === 'custom' && field.definition.isEqual !== undefined) {
    return field.definition.isEqual;
  }
  return Object.is;
}
