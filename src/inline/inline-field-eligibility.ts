import { resolveFieldCapabilities } from '../fields/field-capabilities.js';

import type { FieldConfig } from '../fields/field-config.js';

/** Returns whether a configured field can be opened for inline editing. */
export function isInlineFieldEligible<TFormValues extends object>(
  field: Readonly<FieldConfig<TFormValues>>,
): boolean {
  return resolveFieldCapabilities(field).inline;
}
