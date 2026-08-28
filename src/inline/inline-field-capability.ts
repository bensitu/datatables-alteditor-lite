import {
  resolveFieldCapabilities,
  supportsInlineFieldType,
} from '../fields/field-capabilities.js';

import type { FieldConfig } from '../fields/field-config.js';

/** Returns whether a field type has a safe single-value inline control. */
export function supportsInlineField<TFormValues extends object>(
  field: Readonly<FieldConfig<TFormValues>>,
): boolean {
  return supportsInlineFieldType(field);
}

/** Returns whether a configured field can be opened for inline editing. */
export function isInlineFieldEligible<TFormValues extends object>(
  field: Readonly<FieldConfig<TFormValues>>,
): boolean {
  return resolveFieldCapabilities(field).inline;
}
